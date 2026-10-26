"""Deterministic fakes so the memory logic can be tested without Ollama."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys

import numpy as np
import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ravenswood import ROOT  # noqa: E402  (also puts research/ on the path)
from lcmem import ModelParams  # noqa: E402
from ravenswood.agent import Engine  # noqa: E402
from ravenswood.store import MemoryStore  # noqa: E402

STOP = set("the a an and or of to in on at for with was were is are be you your i me my it this that "
           "did do does what who when where how as about from by".split())
DIM = 512


def _stem(w: str) -> str:
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


class FakeEmbeddings:
    """Bag of (stemmed) words hashed into DIM buckets, L2-normalised."""

    def _vec(self, text: str) -> np.ndarray:
        v = np.zeros(DIM, dtype=np.float32)
        for w in re.findall(r"[a-z]+", text.lower()):
            if w in STOP:
                continue
            h = int(hashlib.md5(_stem(w).encode()).hexdigest(), 16) % DIM
            v[h] += 1.0
        n = np.linalg.norm(v)
        return v / n if n else v

    def embed(self, texts):
        return np.stack([self._vec(t) for t in texts])

    embed_cached = embed


class FakeVoice:
    """Echoes what the memory layer chose to show, so tests can see the prompt's effect."""

    model = "fake"

    def __init__(self, plants: dict[str, list[str]] | None = None):
        self.calls: list[list[dict]] = []
        self.plants = plants or {}

    def chat(self, messages, **_):
        self.calls.append(messages)
        system = messages[0]["content"]
        if system.startswith("You analyse one sentence"):
            q = messages[-1]["content"]
            return json.dumps({"details": self.plants.get(q, [])})
        lines = [ln[2:] for ln in system.splitlines() if ln.startswith("- ")]
        # Speak the content of the first memory line, not its bracketed tag — as a voice would.
        spoken = lines[0].split(") ", 1)[-1] if lines else "I don't recall."
        return json.dumps({"answer": spoken})

    @staticmethod
    def json(text):
        return json.loads(text) if text else None

    def last_system(self) -> str:
        return self.calls[-1][0]["content"]


@pytest.fixture
def base_params():
    p = ROOT / "research" / "results" / "study1" / "params_fitted.json"
    return ModelParams.load(p) if p.exists() else ModelParams()


@pytest.fixture
def make_engine(tmp_path, base_params):
    def _make(plants=None, db=None):
        store = MemoryStore(db or tmp_path / "t.db")
        return Engine(store, FakeEmbeddings(), FakeVoice(plants), base_params)
    return _make
