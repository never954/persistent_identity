"""Accessibility functions — the forgetting curves of each condition.

All return a probability in [0, 1] that a trace can be reached after `dt`
hours. A trace below that is *unreachable*, not deleted.
"""

from __future__ import annotations

import numpy as np
from scipy.special import ndtr


def normal_cdf(x):
    """Standard normal CDF (works on floats and numpy arrays)."""
    return ndtr(x)


def power_access(dt, a: float, tau: float, d: float, boost: float = 1.0):
    """Ours: p = min(1, a * boost * (1 + dt/tau) ** -d)."""
    dt = np.maximum(np.asarray(dt, dtype=float), 0.0)
    return np.minimum(1.0, a * boost * (1.0 + dt / tau) ** (-d))


def exp_access(dt, a: float, S: float, boost: float = 1.0):
    """B2 (MemoryBank-style): p = min(1, a * exp(-dt / (S * boost)))."""
    dt = np.maximum(np.asarray(dt, dtype=float), 0.0)
    return np.minimum(1.0, a * np.exp(-dt / (S * boost)))
