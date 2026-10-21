"""Unit tests for the memory model's defining properties."""

from __future__ import annotations

from pathlib import Path
import sys

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lcmem import Condition, MemoryAgent, ModelParams  # noqa: E402
from lcmem.decay import exp_access, power_access  # noqa: E402

HOURS = [0.1, 1, 9, 24, 168, 744]


def unit(*xs):
    v = np.array(xs, float)
    return v / np.linalg.norm(v)


def test_power_decay_is_monotone_and_bounded():
    p = power_access(np.array(HOURS), a=0.7, tau=0.3, d=0.2)
    assert np.all(np.diff(p) < 0) and np.all((p > 0) & (p <= 1))


def test_power_forgets_slower_than_exponential_at_long_delays():
    # Same accessibility at 1 h; the power law keeps a long tail.
    a, tau, d = 0.7, 0.3, 0.2
    p1 = power_access(1.0, a, tau, d)
    S = -1.0 / np.log(p1 / a)
    assert power_access(744, a, tau, d) > exp_access(744, a, S)


def test_gist_outlasts_verbatim_and_source_decays_fastest():
    agent = MemoryAgent(Condition.OURS, ModelParams())
    m = agent.encode("told detail", 0.0, source="told:detective")
    v0, s0 = agent.p_verbatim(m, 0.0), agent.p_source(m, 0.0)
    for h in HOURS:
        assert agent.p_gist(m, h) >= agent.p_verbatim(m, h)
        # The source tag starts strong but loses a larger *fraction* of itself.
        assert agent.p_source(m, h) / s0 < agent.p_verbatim(m, h) / v0


def test_memories_are_not_deleted_just_unreachable():
    agent = MemoryAgent(Condition.OURS, ModelParams())
    m = agent.encode("breakfast", 0.0)
    assert agent.p_verbatim(m, 10_000) < 0.2
    assert m in agent.memories


def test_core_identity_is_exempt():
    agent = MemoryAgent(Condition.OURS, ModelParams())
    core = agent.encode("I am Thomas Bell", 0.0, core=True, source="told:x")
    for h in HOURS:
        assert agent.p_verbatim(core, h) == agent.p_source(core, h) == 1.0


def test_baseline_b1_is_perfect():
    agent = MemoryAgent(Condition.B1_ACCURATE, ModelParams())
    m = agent.encode("stop sign", 0.0, vec=unit(1, 0, 0))
    assert agent.p_verbatim(m, 744) == 1.0
    assert agent.p_old("stop sign", 744) == 1.0
    assert agent.p_old("yield sign", 744) == 0.0


def test_rehearsal_strengthens():
    agent = MemoryAgent(Condition.OURS, ModelParams())
    m = agent.encode("x", 0.0)
    before = agent.p_verbatim(m, 24)
    agent.rehearse(m)
    assert agent.p_verbatim(m, 24) > before


def test_misinformation_hurts_ours_but_not_baselines():
    params = ModelParams()

    def acc(cond, misleading):
        ag = MemoryAgent(cond, params)
        o = ag.encode("stop", 0.0)
        r = ag.encode("yield", 167.9, source="told:detective") if misleading else None
        return ag.p_choose_original(o, r, 168.0)

    assert acc(Condition.OURS, True) < acc(Condition.OURS, False)
    assert acc(Condition.B2_EXP_DECAY, True) == pytest.approx(acc(Condition.B2_EXP_DECAY, False))
    assert acc(Condition.B1_ACCURATE, True) == 1.0


def test_familiarity_favours_a_semantic_hub():
    # Studied items all lean toward a hub direction; the never-studied hub
    # should feel more familiar than an unrelated probe (the DRM mechanism).
    agent = MemoryAgent(Condition.OURS, ModelParams())
    for i in range(1, 4):
        v = np.zeros(5)
        v[0], v[i] = 1.0, 0.8
        agent.encode(f"w{i}", 0.0, vec=unit(*v))
    hub, unrelated = unit(1, 0, 0, 0, 0), unit(0, 0, 0, 0, 1)
    assert agent.familiarity(hub, 0.5) > agent.familiarity(unrelated, 0.5) == 0.0
