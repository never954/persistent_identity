"""Shared set-up for the analysis scripts.

Every study runs the real engine in-process (no web server), against a fresh
SQLite file in a temporary folder, with the voice model fixed by name. The player's
own saves (backend/data/) are never read or written.

Controls applied here, so the environment does not skew results:
* the world layer is OFF unless a study needs it (no moods, gossip, schedules or story
  events, and no pressure on suggestibility);
* the voice model is pinned (no automatic "best installed model" switching);
* every memory draw depends only on the save id, and every save is new;
* language-model calls use a fixed seed per turn, derived from the save and the clock.
"""

from __future__ import annotations

from contextlib import contextmanager
import json
import math
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from ravenswood import config  # noqa: E402  (also puts research/ on the path)
from lcmem import ModelParams  # noqa: E402
from ravenswood.agent import Engine  # noqa: E402
from ravenswood.ollama import Voice, default_embeddings  # noqa: E402
from ravenswood.store import MemoryStore  # noqa: E402

RESULTS = Path(__file__).resolve().parent / "results"
RESULTS.mkdir(exist_ok=True)
BASE = ModelParams.load(config.FITTED_PARAMS)


@contextmanager
def engine(model: str, *, world: bool = False, checks: bool = True, policy: str = "engine"):
    """A fresh engine with its own throwaway database."""
    old = (config.WORLD_ON, config.CHECKS_ON, config.POLICY)
    config.WORLD_ON, config.CHECKS_ON, config.POLICY = world, checks, policy
    with tempfile.TemporaryDirectory() as tmp:
        e = Engine(MemoryStore(Path(tmp) / "run.db"), default_embeddings(), Voice(model), BASE)
        try:
            yield e
        finally:
            config.WORLD_ON, config.CHECKS_ON, config.POLICY = old


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson score interval for a proportion."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def fmt(k: int, n: int) -> str:
    lo, hi = wilson(k, n)
    return f"{k}/{n} ({k / n:.2f} [{lo:.2f}, {hi:.2f}])" if n else "—"


def save(name: str, obj) -> Path:
    p = RESULTS / name
    p.write_text(json.dumps(obj, indent=2, ensure_ascii=False))
    return p
