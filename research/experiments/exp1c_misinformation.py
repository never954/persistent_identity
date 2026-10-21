"""Experiment 1c — Misinformation effect (Loftus, Miller & Burns 1978 design).

Question: after a witnessed event, does a misleading detail supplied later by
someone else ("the yield sign...") replace the original in a two-alternative
test — and does *timing* matter the way it does for people?

Design: event at t = 0; post-event information at t_m; 2AFC test at T.
  post-event info: control (none) · consistent (repeats the original =
  a rehearsal) · misleading (a rival detail, source = told:detective)
  timing cells: T in {30 min, 1 week} x misinformation {early: 6 min after
  the event, late: 6 min before the test}

Status: a DEMONSTRATION of the mechanism, not a calibration. Decay shape and
level come from Exp 1a; the source-decay multiplier kappa is an assumption,
so it is swept (1 = source fades as fast as content; 3 = three times faster).
The human figures for this paradigm are from secondary sources (75% correct
consistent vs 41% misleading) — the target is the qualitative pattern:
misinformation hurts most when it arrives late in a long retention interval.
"""

from __future__ import annotations

import numpy as np

from common import COLORS, LABELS, RESULTS, plot_style, write_json
from lcmem import Condition, MemoryAgent, ModelParams
from lcmem.datasets import human_reference

CELLS = {
    "30min_early": (0.5, 0.1),
    "30min_late": (0.5, 0.4),
    "1week_early": (168.0, 0.1),
    "1week_late": (168.0, 167.9),
}
POST = ("control", "consistent", "misleading")
CONDS = (Condition.B1_ACCURATE, Condition.B2_EXP_DECAY, Condition.OURS_NO_SOURCE, Condition.OURS)
KAPPAS = (1.0, 1.5, 2.0, 3.0)


def accuracy(cond: Condition, params: ModelParams, T: float, t_m: float, post: str) -> float:
    agent = MemoryAgent(cond, params)
    original = agent.encode("The car stopped at a STOP sign.", 0.0, slots={"sign": "stop"})
    rival = None
    if post == "consistent":
        agent.rehearse(original)
    elif post == "misleading":
        rival = agent.encode("The car stopped at a YIELD sign.", t_m, slots={"sign": "yield"}, source="told:detective")
    return agent.p_choose_original(original, rival, T)


def run(params: ModelParams) -> dict:
    table = {}
    for cell, (T, t_m) in CELLS.items():
        table[cell] = {}
        for cond in CONDS:
            acc = {post: accuracy(cond, params, T, t_m, post) for post in POST}
            acc["misinformation_effect"] = acc["control"] - acc["misleading"]
            table[cell][cond.value] = acc

    sweep = {}
    for kappa in KAPPAS:
        p = ModelParams.from_dict(params.to_dict())
        p.source.kappa = kappa
        sweep[str(kappa)] = {
            cell: {post: accuracy(Condition.OURS, p, T, t_m, post) for post in POST} for cell, (T, t_m) in CELLS.items()
        }
        for cell in CELLS:
            s = sweep[str(kappa)][cell]
            s["misinformation_effect"] = s["control"] - s["misleading"]

    ref = human_reference()["loftus_miller_burns_1978"]
    out = {
        "status": "demonstration (kappa is an assumption; human figures are secondary-source)",
        "kappa_default": params.source.kappa,
        "accuracy": table,
        "kappa_sweep_ours": sweep,
        "human_secondary": {"consistent": ref["correct_consistent"], "misleading": ref["correct_misleading"], "pattern": ref["timing_pattern"]},
    }
    write_json("exp1c_misinformation.json", out)
    _plot(table, sweep)
    return out


def _plot(table, sweep):
    plt = plot_style()
    fig, axes = plt.subplots(1, 2, figsize=(11, 4), gridspec_kw={"width_ratios": [1.6, 1]})
    ax = axes[0]
    cells = list(CELLS)
    w = 0.2
    x = np.arange(len(cells))
    for i, cond in enumerate((Condition.B1_ACCURATE, Condition.B2_EXP_DECAY, Condition.OURS_NO_SOURCE, Condition.OURS)):
        vals = [table[c][cond.value]["misleading"] for c in cells]
        color = COLORS.get(cond.value, "#C8A27A")
        ax.bar(x + (i - 1.5) * w, vals, w, color=color, label=LABELS[cond.value])
    ctrl = [table[c][Condition.OURS.value]["control"] for c in cells]
    ax.scatter(x + 1.5 * w, ctrl, marker="_", s=300, color="black", zorder=5, label="Ours, control (no misinformation)")
    ax.set_xticks(x)
    ax.set_xticklabels(["test 30 min\nmisinfo early", "test 30 min\nmisinfo late", "test 1 week\nmisinfo early", "test 1 week\nmisinfo late"], fontsize=8.5)
    ax.set_ylabel("P(choose the original detail)")
    ax.set_ylim(0, 1.05)
    ax.axhline(0.5, color="gray", lw=0.8, ls=":")
    ax.set_title("Accuracy after MISLEADING post-event information", fontsize=10)
    ax.legend(fontsize=7.5, loc="lower left")

    ax = axes[1]
    for c, ls in zip(cells, ("-", "--", "-.", ":")):
        ax.plot(KAPPAS, [sweep[str(k)][c]["misinformation_effect"] for k in KAPPAS], ls=ls, color=COLORS["ours"], marker="o", ms=3, label=c.replace("_", ", "))
    ax.set_xlabel("Source-decay multiplier κ (assumption)")
    ax.set_ylabel("Misinformation effect\n(control − misleading)")
    ax.set_title("Sensitivity of Ours to κ", fontsize=10)
    ax.legend(fontsize=7.5)
    fig.suptitle("Exp 1c — Misinformation: baselines are immune; Ours is hit hardest when misinformation is fresh and the original is old", fontsize=10)
    fig.tight_layout()
    fig.savefig(RESULTS / "exp1c_misinformation.png")
    plt.close(fig)


if __name__ == "__main__":
    import json

    print(json.dumps(run(ModelParams.load(RESULTS / "params_fitted.json")), indent=2))
