"""The memory agent — one class, three conditions (plus ablations).

Conditions
----------
B1_ACCURATE   Smallville-style memory: every trace stays perfectly reachable
              and keeps its source. Recognition = exact match.
B2_EXP_DECAY  MemoryBank-style: exponential forgetting (traces drop out),
              but whatever is reachable is exact and correctly sourced.
OURS          Power-law loss of *access* (detail before gist), source tags
              that fade faster than content, and dual-process recognition
              (recollection OR global-matching familiarity).
OURS_NO_FAMILIARITY  ablation: recognition by recollection only.
OURS_NO_SOURCE       ablation: source tags never fade.

Every method returns *probabilities* (expected values), so experiments are
deterministic given the parameters; sampling is left to callers that need
discrete behaviour (e.g. the game).
"""

from __future__ import annotations

from enum import Enum
import itertools

import numpy as np

from .decay import exp_access, normal_cdf, power_access
from .memory import Memory
from .params import ModelParams


class Condition(str, Enum):
    B1_ACCURATE = "B1_accurate"
    B2_EXP_DECAY = "B2_exp_decay"
    OURS = "ours"
    OURS_NO_FAMILIARITY = "ours_no_familiarity"
    OURS_NO_SOURCE = "ours_no_source"

    @property
    def is_ours(self) -> bool:
        return self.value.startswith("ours")


class MemoryAgent:
    def __init__(self, condition: Condition, params: ModelParams, embedder=None):
        self.condition = Condition(condition)
        self.params = params
        self.embedder = embedder
        self.memories: list[Memory] = []
        self._ids = itertools.count()

    # ------------------------------------------------------------------ encoding
    def encode(
        self,
        text: str,
        t: float,
        *,
        strength: float = 1.0,
        source: str = "self",
        core: bool = False,
        slots: dict | None = None,
        vec: np.ndarray | None = None,
    ) -> Memory:
        if vec is None and self.embedder is not None:
            vec = self.embedder.embed_one(text)
        m = Memory(
            id=f"m{next(self._ids)}",
            text=text,
            t=t,
            slots=dict(slots or {}),
            strength=strength,
            source=source,
            core=core,
            vec=vec,
        )
        self.memories.append(m)
        return m

    def rehearse(self, m: Memory) -> None:
        """Reconsolidation: a retrieved-and-retold trace becomes more reachable."""
        m.rehearsals += 1

    # ------------------------------------------------------------- accessibility
    def _boost(self, m: Memory) -> float:
        return m.strength * (1.0 + self.params.power.rho * m.rehearsals)

    def p_verbatim(self, m: Memory, now: float) -> float:
        """Probability the trace's full detail can be reached at `now`."""
        if m.core or self.condition is Condition.B1_ACCURATE:
            return 1.0
        dt = now - m.t
        if self.condition is Condition.B2_EXP_DECAY:
            e = self.params.exp
            return float(exp_access(dt, e.a, e.S, boost=m.strength * (1 + m.rehearsals)))
        p = self.params.power
        return float(power_access(dt, p.a, p.tau, p.d, boost=self._boost(m)))

    def p_gist(self, m: Memory, now: float) -> float:
        """Probability at least the gist can be reached (>= p_verbatim)."""
        if not self.condition.is_ours or m.core:
            return self.p_verbatim(m, now)
        p = self.params.power
        dt = now - m.t
        return float(power_access(dt, p.a, p.tau, p.d * p.gist_ratio, boost=self._boost(m)))

    def p_source(self, m: Memory, now: float) -> float:
        """Probability the trace's source tag can still be reached."""
        if (
            m.core
            or not self.condition.is_ours
            or self.condition is Condition.OURS_NO_SOURCE
        ):
            return 1.0
        p, s = self.params.power, self.params.source
        return float(power_access(now - m.t, s.a, p.tau, p.d * s.kappa))

    # --------------------------------------------------------------- recognition
    def _exact(self, text: str) -> Memory | None:
        key = text.strip().lower()
        for m in self.memories:
            if m.text.strip().lower() == key:
                return m
        return None

    def familiarity(self, probe_vec: np.ndarray, now: float) -> float:
        """Global matching (MINERVA 2): sum_j g_j * max(0, cos) ** k."""
        if not self.memories:
            return 0.0
        k = self.params.recognition.k
        vecs = np.stack([m.vec for m in self.memories])
        sims = np.clip(vecs @ probe_vec, 0.0, None) ** k
        weights = np.array([self.p_gist(m, now) for m in self.memories])
        return float(weights @ sims)

    def p_recollect(self, text: str, now: float) -> float:
        m = self._exact(text)
        return self.p_verbatim(m, now) if m is not None else 0.0

    def p_old(self, text: str, now: float, probe_vec: np.ndarray | None = None) -> float:
        """Probability of calling a probe 'old' on a recognition test."""
        rec = self.p_recollect(text, now)
        if self.condition in (
            Condition.B1_ACCURATE,
            Condition.B2_EXP_DECAY,
            Condition.OURS_NO_FAMILIARITY,
        ):
            return rec
        if probe_vec is None:
            probe_vec = self.embedder.embed_one(text)
        r = self.params.recognition
        fam = normal_cdf((self.familiarity(probe_vec, now) - r.criterion) / r.noise)
        return float(1.0 - (1.0 - rec) * (1.0 - fam))

    # ------------------------------------------------- source & misinformation
    def p_misattributed(self, m: Memory, now: float) -> float:
        """P(a 'told' trace is reachable but recalled as witnessed)."""
        if m.witnessed:
            return 0.0
        return self.p_verbatim(m, now) * (1.0 - self.p_source(m, now))

    def p_choose_original(self, original: Memory, rival: Memory | None, now: float) -> float:
        """Two-alternative forced choice between an original detail and a rival.

        A reachable rival whose source is still known ("the detective said
        that") is discounted. An unsourced rival competes with the original in
        proportion to accessibility (Luce choice). Nothing reachable -> guess.
        """
        p_o = self.p_verbatim(original, now)
        if rival is None:
            return p_o + (1.0 - p_o) * 0.5
        p_r = self.p_verbatim(rival, now)
        usable = p_r * (1.0 - self.p_source(rival, now))
        share_o = p_o / (p_o + p_r) if (p_o + p_r) > 0 else 0.5
        return (
            p_o * (usable * share_o + (1.0 - usable))
            + (1.0 - p_o) * (1.0 - usable) * 0.5
        )
