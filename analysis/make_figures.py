"""Paper figures, drawn from analysis/results/*.json (nothing is typed in by hand).

    research/.venv/bin/python analysis/make_figures.py

Writes vector PDFs to paper/figures/. Colours: the validated categorical palette
(blue, orange, aqua; colour-blind separation checked), always with a second cue
(marker shape and a legend) so identity never depends on colour alone.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from common import wilson  # noqa: E402

RES = Path(__file__).resolve().parent / "results"
OUT = Path(__file__).resolve().parents[1] / "paper" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e6e5e1"
MODELS = [("qwen25_3b", "qwen2.5:3b"), ("llama32_3b", "llama3.2:3b")]

plt.rcParams.update({
    "font.family": "serif", "font.size": 8, "axes.titlesize": 8, "axes.labelsize": 8,
    "xtick.labelsize": 7, "ytick.labelsize": 7, "legend.fontsize": 7,
    "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True, "grid.color": GRID,
    "grid.linewidth": 0.6, "axes.axisbelow": True, "lines.linewidth": 1.6, "lines.markersize": 4.5,
})


def load(name: str):
    p = RES / name
    return json.loads(p.read_text()) if p.exists() else None


def errbar(ax, xs, ks, ns, color, marker, label, offset=0.0):
    ps = [k / n for k, n in zip(ks, ns)]
    lo = [p - wilson(k, n)[0] for p, k, n in zip(ps, ks, ns)]
    hi = [wilson(k, n)[1] - p for p, k, n in zip(ps, ks, ns)]
    xs = [x + offset for x in xs]
    ax.errorbar(xs, ps, yerr=[lo, hi], color=color, marker=marker, label=label, capsize=2, elinewidth=0.8)


# ---------------------------------------------------------------- Study 3
def fig_suggestion():
    conds = [("fallible", "our layer", BLUE, "o"), ("perfect", "perfect (B1)", ORANGE, "s"),
             ("prompt_only", "prompt only", AQUA, "^")]
    delays = [1, 24, 168]
    fig, axes = plt.subplots(2, 2, figsize=(3.45, 3.3), sharex=True, sharey=True)
    for row, (tag, mname) in enumerate(MODELS):
        res = load(f"study3_suggestion_{tag}.json")
        if not res:
            continue
        for col, (who, wname) in enumerate((("thomas", "Thomas (suggestibility 0.9)"), ("agnes", "Agnes (0.3)"))):
            ax = axes[row][col]
            for i, (c, lab, color, mk) in enumerate(conds):
                ks, ns = [], []
                for d in delays:
                    sel = [r for r in res["rows"] if r["witness"] == who and r["condition"] == c and r["delay_h"] == d]
                    ks.append(sum(r["label"] == "adopted" for r in sel))
                    ns.append(len(sel))
                errbar(ax, range(3), ks, ns, color, mk, lab, offset=(i - 1) * 0.08)
            ax.set_xticks(range(3), ["1 h", "1 day", "1 week"])
            ax.set_ylim(-0.03, 1.03)
            ax.set_title(f"{wname}\n{mname}" if row == 0 else mname, color=INK)
    for ax in axes[:, 0]:
        ax.set_ylabel("claims the suggestion\nas seen first-hand")
    handles, labels = axes[0][0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=3, frameon=False, bbox_to_anchor=(0.5, -0.01),
               columnspacing=1.0, handletextpad=0.4)
    fig.tight_layout(rect=(0, 0.06, 1, 1))
    fig.savefig(OUT / "study3_suggestion.pdf")
    plt.close(fig)


# ---------------------------------------------------------------- Study 2
GROUPS = [("Keeps a secret\n(3 probes)", {"lie_alibi", "lie_brandy", "denial_killer"}),
          ("Habit vs. the night", {"habit_tea"}),
          ("No invented detail", {"no_confabulation"}),
          ("Other 8 probes", {"recall_last", "order_first", "denial_innocent", "persona_music", "identity",
                              "premise_vance", "premise_julian", "unknown_term"}),
          ("All 13 probes", None)]


def fig_fidelity():
    variants = [("full", "decide, voice, check", BLUE, "o"), ("no_checks", "decide, voice (no check)", ORANGE, "s"),
                ("prompt_only", "prompt only", AQUA, "^")]
    fig, axes = plt.subplots(1, 2, figsize=(3.45, 2.5), sharey=True)
    for col, (tag, mname) in enumerate(MODELS):
        res = load(f"study2_fidelity_{tag}.json")
        ax = axes[col]
        if not res:
            continue
        for i, (v, lab, color, mk) in enumerate(variants):
            rows = res["variants"].get(v, [])
            ks, ns = [], []
            for _, probes in GROUPS:
                sel = [r for r in rows if probes is None or r["probe"] in probes]
                ks.append(sum(r["ok"] for r in sel))
                ns.append(len(sel))
            ps = [k / n for k, n in zip(ks, ns)]
            lo = [p - wilson(k, n)[0] for p, k, n in zip(ps, ks, ns)]
            hi = [wilson(k, n)[1] - p for p, k, n in zip(ps, ks, ns)]
            ys = [j + (i - 1) * 0.2 for j in range(len(GROUPS))]
            ax.errorbar(ps, ys, xerr=[lo, hi], color=color, marker=mk, linestyle="none", label=lab,
                        capsize=2, elinewidth=0.8)
        ax.set_yticks(range(len(GROUPS)), [g for g, _ in GROUPS])
        ax.set_xlim(0, 1.02)
        ax.set_title(mname, color=INK)
    axes[0].invert_yaxis()   # the y-axis is shared: invert it once
    fig.supxlabel("answers that follow the decision", fontsize=8, y=0.13)
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=2, frameon=False, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.14, 1, 1))
    fig.savefig(OUT / "study2_fidelity.pdf")
    plt.close(fig)


# ---------------------------------------------------------------- Study 4a
def fig_contagion():
    res = load("study4_traits.json")
    if not res:
        return
    rates = res["contagion"]["as_witnessed"]
    delays = ["1h", "6h", "24h", "72h"]
    styles = {"agnes": (BLUE, "o"), "julian": (ORANGE, "s"), "vivian": (AQUA, "^"), "vance": ("#eda100", "D")}
    names = {"agnes": "Agnes", "julian": "Julian", "vivian": "Miss Cross", "vance": "Dr. Vance"}
    fig, ax = plt.subplots(figsize=(3.45, 2.1))
    for cid in ("agnes", "julian", "vivian", "vance"):
        color, mk = styles[cid]
        ks = [rates[cid][d]["as_witnessed"] for d in delays]
        ns = [rates[cid][d]["recalled"] for d in delays]
        errbar(ax, range(4), ks, ns, color, mk, names[cid])
        ax.annotate(names[cid], (3.08, ks[-1] / ns[-1]), color=INK, fontsize=7, va="center")
    ax.plot(range(4), [0] * 4, color=MUTED, linestyle="--", linewidth=1.0, label="perfect memory (B1)")
    ax.set_xticks(range(4), ["1 h", "6 h", "1 day", "3 days"])
    ax.set_xlim(-0.2, 3.8)
    ax.set_ylim(-0.03, 1.03)
    ax.set_xlabel("time since hearing the remark")
    ax.set_ylabel("recalled as seen,\nnot as heard")
    ax.legend(loc="lower right", frameon=False, ncol=1, fontsize=6.5)
    fig.tight_layout()
    fig.savefig(OUT / "study4_contagion.pdf")
    plt.close(fig)


# ---------------------------------------------------------------- Study 5
def fig_selective():
    days = [0, 1, 3, 7]
    fig, axes = plt.subplots(1, 2, figsize=(3.45, 2.2), sharey=True)
    for col, (tag, mname) in enumerate(MODELS):
        res = load(f"study5_selective_{tag}.json")
        ax = axes[col]
        if not res:
            continue
        for i, (who, kind, lab, color, mk, ls) in enumerate((
                ("thomas", "identity", "Thomas, identity", BLUE, "o", "-"),
                ("thomas", "episode", "Thomas, the night", BLUE, "o", ":"),
                ("vance", "identity", "Dr. Vance, identity", ORANGE, "s", "-"),
                ("vance", "episode", "Dr. Vance, the night", ORANGE, "s", ":"))):
            ks = [sum(r[f"{kind}_ok"] for r in res["rows"] if r["witness"] == who and r["day"] == d) for d in days]
            ns = [sum(1 for r in res["rows"] if r["witness"] == who and r["day"] == d) for d in days]
            ps = [k / n for k, n in zip(ks, ns)]
            ax.plot(range(4), [p + (i - 1.5) * 0.012 for p in ps], color=color, marker=mk, linestyle=ls, label=lab)
        ax.set_xticks(range(4), [f"day {d}" for d in days])
        ax.set_ylim(-0.03, 1.05)
        ax.set_title(mname, color=INK)
    axes[0].set_ylabel("answer still holds\nthe authored fact")
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=2, frameon=False, bbox_to_anchor=(0.5, -0.02))
    fig.tight_layout(rect=(0, 0.13, 1, 1))
    fig.savefig(OUT / "study5_selective.pdf")
    plt.close(fig)


if __name__ == "__main__":
    fig_suggestion()
    fig_fidelity()
    fig_contagion()
    fig_selective()
    print("figures written to", OUT)
