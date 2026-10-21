"""Experiment 1d — Source monitoring: "did you see it, or were you told?"

Question: does a detail the agent was *told* (e.g. by the detective) come back
later as something it *witnessed* — while content outlives its source, as in
people (Johnson, Hashtroudi & Lindsay 1993)?

Measure, at Ebbinghaus's delays: P(content reachable), P(source reachable),
and P(misattributed) = P(content reachable AND source lost) -> reported as
"I saw it". B1/B2 keep perfect source tags, so their misattribution is 0.

Status: a DEMONSTRATION; kappa (how much faster the source tag decays) is an
assumption and is swept. Core identity memories are exempt by design and are
shown as a reference line (selective fallibility).
"""

from __future__ import annotations

import numpy as np

from common import COLORS, RESULTS, plot_style, write_json
from lcmem import Condition, MemoryAgent, ModelParams
from lcmem.datasets import human_reference

KAPPAS = (1.0, 1.5, 2.0, 3.0)


def curves(params: ModelParams, cond: Condition, hours) -> dict:
    agent = MemoryAgent(cond, params)
    told = agent.encode("The woman on the landing wore a red dress.", 0.0, source="told:detective")
    core = agent.encode("My name is Thomas Bell; I am the valet.", 0.0, core=True)
    return {
        "content": [agent.p_verbatim(told, h) for h in hours],
        "source": [agent.p_source(told, h) for h in hours],
        "misattributed": [agent.p_misattributed(told, h) for h in hours],
        # Source-amnesia index: among told-details still recalled, the share
        # recalled as witnessed (= 1 - P(source reachable)).
        "misattributed_given_recalled": [1.0 - agent.p_source(told, h) for h in hours],
        "core_identity": [agent.p_verbatim(core, h) for h in hours],
    }


def run(params: ModelParams) -> dict:
    hours = human_reference()["ebbinghaus_savings"]["hours"]
    out = {
        "status": "demonstration (kappa is an assumption)",
        "hours": hours,
        "B1_accurate": curves(params, Condition.B1_ACCURATE, hours),
        "B2_exp_decay": {"misattributed": [0.0] * len(hours), "misattributed_given_recalled": [0.0] * len(hours)},
        "ours_by_kappa": {},
    }
    for kappa in KAPPAS:
        p = ModelParams.from_dict(params.to_dict())
        p.source.kappa = kappa
        out["ours_by_kappa"][str(kappa)] = curves(p, Condition.OURS, hours)
    write_json("exp1d_source.json", out)
    _plot(out)
    return out


def _plot(out):
    plt = plot_style()
    h = np.array(out["hours"])
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 3.8))
    ax = axes[0]
    d = out["ours_by_kappa"]["2.0"]
    ax.plot(h, d["content"], color=COLORS["ours"], lw=2, label="Content reachable")
    ax.plot(h, d["source"], color=COLORS["ours"], lw=2, ls="--", label="Source tag reachable")
    ax.fill_between(h, d["source"], d["content"], where=np.array(d["content"]) > np.array(d["source"]), color=COLORS["ours"], alpha=0.12, label="Content without source")
    ax.plot(h, d["core_identity"], color=COLORS["human"], lw=1.5, ls=":", label="Core identity memory (exempt)")
    ax.set_title("Ours (κ = 2): content outlives its source", fontsize=10)
    ax = axes[1]
    for kappa, ls in zip(KAPPAS, (":", "-.", "-", "--")):
        ax.plot(h, out["ours_by_kappa"][str(kappa)]["misattributed_given_recalled"], color=COLORS["ours"], ls=ls, lw=1.8, label=f"Ours, κ = {kappa:g}")
    ax.plot(h, out["B2_exp_decay"]["misattributed_given_recalled"], color=COLORS["B2_exp_decay"], lw=1.5, label="B1 / B2 (perfect source)")
    ax.set_title("Of told details still recalled: share felt as WITNESSED", fontsize=10)
    for ax in axes:
        ax.set_xscale("log")
        ax.set_xticks([1 / 3, 1, 9, 24, 48, 144, 744])
        ax.set_xticklabels(["20m", "1h", "9h", "1d", "2d", "6d", "31d"])
        ax.set_xlabel("Delay since being told")
        ax.set_ylim(0, 1.05)
        ax.legend(fontsize=7.5)
    axes[0].set_ylabel("Probability")
    fig.suptitle("Exp 1d — Source monitoring: planted details become 'own' memories over time", fontsize=10)
    fig.tight_layout()
    fig.savefig(RESULTS / "exp1d_source.png")
    plt.close(fig)


if __name__ == "__main__":
    import json

    print(json.dumps(run(ModelParams.load(RESULTS / "params_fitted.json")), indent=2))
