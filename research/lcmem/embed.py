"""Text embeddings via a local Ollama model, with an on-disk cache.

Default model: Ollama's `all-minilm` (sentence-transformers all-MiniLM-L6-v2,
23M params, 384-d). Vectors are L2-normalised so a dot product is a cosine.
The cache makes every experiment reproducible offline once it has run once.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import requests

DEFAULT_URL = "http://localhost:11434"
DEFAULT_MODEL = "all-minilm"


class Embedder:
    def __init__(
        self,
        cache_path: str | Path,
        model: str = DEFAULT_MODEL,
        url: str = DEFAULT_URL,
        batch_size: int = 64,
    ):
        self.model = model
        self.url = url.rstrip("/")
        self.batch_size = batch_size
        self.cache_path = Path(cache_path)
        self._cache: dict[str, np.ndarray] = {}
        if self.cache_path.exists():
            data = np.load(self.cache_path, allow_pickle=False)
            for key, vec in zip(data["keys"], data["vecs"]):
                self._cache[str(key)] = vec

    def _key(self, text: str) -> str:
        return f"{self.model}::{text}"

    def _request(self, texts: list[str]) -> np.ndarray:
        resp = requests.post(
            f"{self.url}/api/embed",
            json={"model": self.model, "input": texts},
            timeout=120,
        )
        resp.raise_for_status()
        vecs = np.asarray(resp.json()["embeddings"], dtype=np.float32)
        return vecs / np.linalg.norm(vecs, axis=1, keepdims=True)

    def embed(self, texts: list[str]) -> np.ndarray:
        """Return a (len(texts), dim) array of unit vectors."""
        missing = [t for t in dict.fromkeys(texts) if self._key(t) not in self._cache]
        for i in range(0, len(missing), self.batch_size):
            chunk = missing[i : i + self.batch_size]
            for text, vec in zip(chunk, self._request(chunk)):
                self._cache[self._key(text)] = vec
        if missing:
            self.save()
        return np.stack([self._cache[self._key(t)] for t in texts])

    def embed_one(self, text: str) -> np.ndarray:
        return self.embed([text])[0]

    def save(self) -> None:
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        keys = np.array(list(self._cache.keys()))
        vecs = np.stack(list(self._cache.values()))
        np.savez_compressed(self.cache_path, keys=keys, vecs=vecs)
