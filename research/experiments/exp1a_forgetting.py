"""Experiment 1a — Forgetting curve.

Question: which accessibility function reproduces the human forgetting curve,
the exponential used by MemoryBank-style agents (B2) or our power law?

Protocol (decided before running):
* Fit each family by least squares to Ebbinghaus's savings (Murre & Dros 2015,
  Table 3). Compare with AICc (penalises our extra parameter).
* Held-out test: parameters fitted on Ebbinghaus predict the independent
  replication (Dros), and vice versa — RMSE on the unseen curve.
* B1 (Smallville-style) never forgets: retention = 1 at every delay.
Caveat: savings is a retention proxy, not recall probability, so this is a
comparison of curve *shape and level of the proxy*, not of recall rates.
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import curve_fit

from common import COLORS, RESULTS, fit_stats, plot_style, write_json
from lcmem.datasets import human_reference
from lcmem.decay import exp_access, power_access


def power_fn(t, a, tau, d):
    return power_access(t, a, tau, d)


def exp_fn(t, a, S):
    return exp_access(t, a, S)


def _fit(fn, t, y, p0s, bounds):
    best = None
    for p0 in p0s:
        try:
            popt, _ = curve_fit(fn, t, y, p0=p0, bounds=bounds, maxfev=20000)
        except RuntimeError:
            continue
        rss = float(np.sum((y - fn(t, *popt)) ** 2))
        if best is None or rss < best[1]:
            best = (popt, rss)
    return best[0]


def fit_families(t, y):
    power = _fit(
        power_fn,
        t,
        y,
        p0s=[(0.6, tau, d) for tau in (0.05, 0.3, 1, 5) for d in (0.1, 0.25, 0.5)],
        bounds=([0.01, 1e-4, 1e-3], [1.0, 1e4, 5.0]),
    )
    exp = _fit(
        exp_fn,
        t,
        y,
        p0s=[(0.6, S) for S in (1, 10, 100, 1000, 10000)],
        bounds=([0.01, 1e-3], [1.0, 1e7]),
    )
    return power, exp


def run() -> dict:
    ref = human_reference()
    data = {
        "ebbinghaus": (np.array(ref["ebbinghaus_savings"]["hours"]), np.array(ref["ebbinghaus_savings"]["values"])),
        "dros": (np.array(ref["dros_savings"]["hours"]), np.array(ref["dros_savings"]["values"])),
    }

    fits, results = {}, {}
    for name, (t, y) in data.items():
        power, exp = fit_families(t, y)
        fits[name] = {"power": power, "exp": exp}
        results[name] = {
            "ours_power": {
                "params": dict(zip(["a", "tau_hours", "d"], map(float, power))),
                **fit_stats(y, power_fn(t, *power), k=3),
            },
            "B2_exponential": {
                "params": dict(zip(["a", "S_hours"], map(float, exp))),
                **fit_stats(y, exp_fn(t, *exp), k=2),
            },
            "B1_no_forgetting": {"rmse": float(np.sqrt(np.mean((y - 1.0) ** 2)))},
        }

    # Held-out: fit on one curve, predict the other.
    heldout = {}
    for train, test in (("ebbinghaus", "dros"), ("dros", "ebbinghaus")):
        t, y = data[test]
        heldout[f"fit_{train}_predict_{test}"] = {
            "ours_power_rmse": float(np.sqrt(np.mean((y - power_fn(t, *fits[train]["power"])) ** 2))),
            "B2_exponential_rmse": float(np.sqrt(np.mean((y - exp_fn(t, *fits[train]["exp"])) ** 2))),
            "B1_no_forgetting_rmse": float(np.sqrt(np.mean((y - 1.0) ** 2))),
        }

    out = {"fits": results, "heldout": heldout}
    write_json("exp1a_forgetting.json", out)
    _plot(data, fits)
    return out


def _plot(data, fits):
    plt = plot_style()
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.8), sharey=True)
    tt = np.logspace(np.log10(0.25), np.log10(800), 300)
    for ax, (name, title) in zip(axes, (("ebbinghaus", "Fitted to Ebbinghaus (1880/85)"), ("dros", "Fitted to Murre & Dros (2015)"))):
        t, y = data[name]
        p, e = fits[name]["power"], fits[name]["exp"]
        ax.axhline(1.0, color=COLORS["B1_accurate"], lw=1.5, label="B1 accurate (never forgets)")
        ax.plot(tt, exp_fn(tt, *e), color=COLORS["B2_exp_decay"], lw=2, label="B2 exponential (MemoryBank-style)")
        ax.plot(tt, power_fn(tt, *p), color=COLORS["ours"], lw=2.2, label="Ours: power law (verbatim)")
        ax.plot(tt, power_access(tt, p[0], p[1], p[2] * 0.5), color=COLORS["ours"], lw=1.2, ls="--", label="Ours: gist (slower decay)")
        ax.scatter(t, y, color=COLORS["human"], zorder=5, s=28, label="Human savings")
        ax.set_xscale("log")
        ax.set_xticks([1 / 3, 1, 9, 24, 48, 144, 744])
        ax.set_xticklabels(["20m", "1h", "9h", "1d", "2d", "6d", "31d"])
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("Delay since encoding")
    axes[0].set_ylabel("Retention (savings / accessibility)")
    axes[0].set_ylim(0, 1.05)
    axes[1].legend(loc="upper right", fontsize=8)
    fig.suptitle("Exp 1a — Forgetting curve: power law vs exponential vs no forgetting", fontsize=11)
    fig.tight_layout()
    fig.savefig(RESULTS / "exp1a_forgetting.png")
    plt.close(fig)


if __name__ == "__main__":
    import json

    print(json.dumps(run(), indent=2))
