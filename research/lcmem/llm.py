"""Chat client for the character's *voice* — a local model served by Ollama.

The LLM never decides what is remembered. The memory layer samples a recalled
*view* (which details survive, and whether a told detail is felt as witnessed),
builds a prompt from only that view, and this client turns it into speech. So
the character's fallibility is controlled and logged by the layer, not by the
model's whim.

Deterministic given (model, messages, seed, options): responses are cached on
disk keyed by their full hash, so a re-run costs nothing and gives the same
words. This mirrors `embed.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import json
from pathlib import Path

import requests

DEFAULT_URL = "http://localhost:11434"
# Chosen after probing the models already on this machine (21 Oct 2026):
# qwen2.5-coder:3b returns clean JSON with every field and stays first-person
# and grounded; gemma3:1b is a different family (Google, general-tuned) kept for
# the cross-model robustness check. See PROJECT_CONTEXT.md D4.
PRIMARY_MODEL = "qwen2.5-coder:3b"
SECONDARY_MODEL = "gemma3:1b"


@dataclass
class ChatLLM:
    model: str = PRIMARY_MODEL
    url: str = DEFAULT_URL
    cache_path: Path | None = None
    temperature: float = 0.7
    _cache: dict = field(default_factory=dict, repr=False)

    def __post_init__(self):
        if self.cache_path is not None:
            self.cache_path = Path(self.cache_path)
            if self.cache_path.exists():
                self._cache = json.loads(self.cache_path.read_text())

    def _key(self, messages, seed, options) -> str:
        blob = json.dumps(
            {"model": self.model, "messages": messages, "seed": seed, "options": options},
            sort_keys=True,
        )
        return hashlib.sha256(blob.encode()).hexdigest()

    def chat(self, messages: list[dict], *, seed: int = 0, num_predict: int = 256,
             format_json: bool = False, **options) -> str:
        """One completion. `messages` is [{role, content}, ...]."""
        opts = {"temperature": self.temperature, "seed": seed, "num_predict": num_predict, **options}
        key = self._key(messages, seed, {**opts, "fmt": format_json})
        if key in self._cache:
            return self._cache[key]
        payload = {"model": self.model, "messages": messages, "stream": False, "options": opts}
        if format_json:
            payload["format"] = "json"
        r = requests.post(f"{self.url}/api/chat", json=payload, timeout=300)
        r.raise_for_status()
        text = r.json()["message"]["content"]
        self._cache[key] = text
        self._flush()
        return text

    def _flush(self) -> None:
        if self.cache_path is not None:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(self._cache))

    @staticmethod
    def extract_json(text: str) -> dict | None:
        """Best-effort parse of a JSON object out of a model reply."""
        try:
            s = text[text.find("{"): text.rfind("}") + 1]
            return json.loads(s)
        except Exception:  # noqa: BLE001 - malformed model output is expected sometimes
            return None
