"""Shared helpers for the Study 1 experiments: paths, fit statistics,
bootstrap CIs and a consistent plot style."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parent.parent  # research/
sys.path.insert(0, str(ROOT))

RESULTS = ROOT / "results" / "study1"
RESULTS.mkdir(parents=True, exist_ok=True)
CACHE = ROOT / "cache" / "embeddings.npz"

COLORS = {
    "human": "#1A1917",
    "human2": "#8A857C",
    "B1_accurate": "#9AA5B1",
    "B2_exp_decay": "#3B6EA8",
    "ours_no_familiarity": "#E8A093",
    "ours": "#DA3E28",
}
LABELS = {
    "B1_accurate": "B1 accurate (Smallville-style)",
    "B2_exp_decay": "B2 exp-decay (MemoryBank-style)",
    "ours_no_familiarity": "Ours − familiarity (ablation)",
    "ours_no_source": "Ours − source decay (ablation)",
    "ours": "Ours",
}


def plot_style():
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update(
        {
            "figure.dpi": 150,
            "savefig.dpi": 200,
            "font.size": 10,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "grid.alpha": 0.25,
            "legend.frameon": False,
        }
    )
    return plt


def fit_stats(y, yhat, k: int) -> dict:
    """RMSE, R^2 and small-sample AIC (AICc) for a least-squares fit with k params."""
    y, yhat = np.asarray(y, float), np.asarray(yhat, float)
    n = len(y)
    rss = float(np.sum((y - yhat) ** 2))
    tss = float(np.sum((y - y.mean()) ** 2))
    aic = n * np.log(rss / n) + 2 * k
    aicc = aic + (2 * k * (k + 1)) / (n - k - 1) if n - k - 1 > 0 else float("nan")
    return {
        "rmse": float(np.sqrt(rss / n)),
        "r2": 1.0 - rss / tss if tss > 0 else float("nan"),
        "aicc": float(aicc),
        "k": k,
    }


def bootstrap_ci(values, n_boot: int = 4000, seed: int = 0, alpha: float = 0.05):
    """Percentile bootstrap CI of the mean."""
    rng = np.random.default_rng(seed)
    values = np.asarray(values, float)
    idx = rng.integers(0, len(values), size=(n_boot, len(values)))
    means = values[idx].mean(axis=1)
    lo, hi = np.quantile(means, [alpha / 2, 1 - alpha / 2])
    return float(values.mean()), float(lo), float(hi)


def write_json(name: str, obj) -> Path:
    path = RESULTS / name
    path.write_text(json.dumps(obj, indent=2))
    return path
