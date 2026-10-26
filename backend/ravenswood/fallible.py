"""The fallible-memory layer: what a stored trace looks like when recalled *now*.

This is the research model (``research/lcmem``), not a copy of it. Each suspect
gets the Study 1 *fitted* power-law parameters, scaled by their authored dials:

    d_suspect     = d_fitted * (0.5 + 2.5 * decay)          (forgetting speed)
    kappa_suspect = 1 + 3.5 * source_amnesia                 (how much faster the
                                                              "who told me" tag fades)
    strength      = 0.4 + 0.18 * importance                  (salience, 1..10)

Recall is sampled with ONE fixed uniform draw per memory (hashed from the save
and memory ids): a trace is recalled in full while u < p_detail(t), as gist while
u < p_gist(t), and is unreachable after that. As p falls with time the memory
fades out at a definite moment and stays gone — it does not flicker between
questions — unless retelling (rehearsal) strengthens it again. The source tag
works the same way with its own draw, which is what turns a detail *told by the
detective* into one the suspect is sure they *saw* (a source-monitoring error).

``memory_mode="perfect"`` swaps in baseline B1 (Smallville-style: nothing fades,
every source is kept) — the "memory OFF" condition for the player study.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib

from lcmem import Condition, Memory, MemoryAgent, ModelParams

from .characters import Character
from .store import MemoryRecord


def params_for(char: Character, base: ModelParams) -> ModelParams:
    p = ModelParams.from_dict(base.to_dict())
    p.power.d = base.power.d * (0.5 + 2.5 * char.decay)
    p.source.kappa = 1.0 + 3.5 * char.source_amnesia
    return p


def strength(importance: float) -> float:
    return 0.4 + 0.18 * importance


def uniform(*parts: str) -> float:
    """A stable U(0,1) draw from identifiers (same inputs → same number)."""
    h = hashlib.blake2b("|".join(parts).encode(), digest_size=8).digest()
    return int.from_bytes(h, "big") / 2**64


@dataclass
class Recall:
    rec: MemoryRecord
    relevance: float
    score: float
    state: str            # "detail" | "gist" | "forgotten"
    source_known: bool
    p_detail: float
    p_gist: float
    p_source: float


class FallibleMemory:
    def __init__(self, char: Character, base: ModelParams, mode: str = "fallible"):
        self.char = char
        self.mode = mode
        cond = Condition.OURS if mode == "fallible" else Condition.B1_ACCURATE
        self.agent = MemoryAgent(cond, params_for(char, base))

    def _as_lcmem(self, rec: MemoryRecord) -> Memory:
        return Memory(
            id=rec.id, text=rec.text, t=rec.t_event, strength=strength(rec.importance),
            source=rec.source, core=rec.core, rehearsals=rec.rehearsals,
        )

    def p_choose_original(self, original: MemoryRecord, rival: MemoryRecord, now: float) -> float:
        """Exp. 1c's two-alternative choice: P(the suspect sides with their own memory
        over a rival suggestion). Luce choice on accessibility; a rival whose source
        is still known ("the detective said so") discounts itself."""
        return float(self.agent.p_choose_original(self._as_lcmem(original), self._as_lcmem(rival), now))

    def assess(self, rec: MemoryRecord, now: float, relevance: float, score: float, save_id: str) -> Recall:
        m = self._as_lcmem(rec)
        p_detail = self.agent.p_verbatim(m, now)
        p_gist = self.agent.p_gist(m, now)
        # Only details told by someone else carry a source tag that can be lost (a
        # planted suggestion, a piece of gossip); "the detective asked me…" names its
        # source in its own content.
        told = rec.kind in ("planted", "gossip")
        p_source = self.agent.p_source(m, now) if told else 1.0
        u = uniform(save_id, rec.id, "access")
        state = "detail" if u < p_detail else "gist" if u < p_gist else "forgotten"
        source_known = not told or uniform(save_id, rec.id, "source") < p_source
        return Recall(rec, relevance, score, state, source_known, p_detail, p_gist, p_source)
