"""Local models through Ollama: embeddings for memory, a chat model for the voice.

Reuses the research code's clients (``lcmem.embed.Embedder``, ``lcmem.llm.ChatLLM``)
so the game and the experiments embed text identically. Seed memories and case
anchors are embedded once and cached on disk; conversation text is embedded on
the fly and stored in the memory row itself.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
import requests

from lcmem.embed import Embedder
from lcmem.llm import ChatLLM

from . import config


def available_models() -> list[str]:
    try:
        r = requests.get(f"{config.OLLAMA_URL}/api/tags", timeout=3)
        r.raise_for_status()
        return [m["name"] for m in r.json().get("models", [])]
    except Exception:  # noqa: BLE001 - "not running" is a normal state
        return []


def pick_model(installed: list[str] | None = None) -> str | None:
    installed = available_models() if installed is None else installed
    if config.FORCED_MODEL:
        return config.FORCED_MODEL
    names = set(installed) | {n.split(":latest")[0] for n in installed}
    for name in config.MODEL_PREFERENCE:
        if name in names:
            return name
    chat_models = [n for n in installed if "minilm" not in n and "embed" not in n]
    return chat_models[0] if chat_models else None


class Embeddings:
    """Unit-normalised sentence embeddings (all-MiniLM-L6-v2, 384-d)."""

    def __init__(self, cache_path=config.EMBED_CACHE):
        self._disk = Embedder(cache_path, model=config.EMBED_MODEL, url=config.OLLAMA_URL)
        self._mem: dict[str, np.ndarray] = {}

    def embed_cached(self, texts: list[str]) -> np.ndarray:
        """For stable text (seeds, anchors): cached on disk across runs."""
        return self._disk.embed(texts)

    def embed(self, texts: list[str]) -> np.ndarray:
        """For conversation text: cached in memory only (it is stored in the row)."""
        missing = [t for t in dict.fromkeys(texts) if t not in self._mem]
        if missing:
            for t, v in zip(missing, self._disk._request(missing)):  # noqa: SLF001 - reuse the client
                self._mem[t] = v
        return np.stack([self._mem[t] for t in texts])


class Voice:
    """The suspect's voice: one chat model, JSON replies, deterministic per seed."""

    def __init__(self, model: str | None = None):
        self.model = model or pick_model()
        self._llm = ChatLLM(model=self.model or "", url=config.OLLAMA_URL, cache_path=None)

    def chat(self, messages: list[dict], *, seed: int = 0, temperature: float = 0.7,
             num_predict: int = 200) -> str | None:
        if not self.model:
            return None
        try:
            return self._llm.chat(messages, seed=seed, num_predict=num_predict, format_json=True,
                                  temperature=temperature, num_ctx=4096,
                                  repeat_penalty=config.REPEAT_PENALTY)
        except Exception:  # noqa: BLE001 - the caller falls back
            return None

    @staticmethod
    def json(text: str | None) -> dict | None:
        return ChatLLM.extract_json(text) if text else None


@lru_cache(maxsize=1)
def default_embeddings() -> Embeddings:
    return Embeddings()
