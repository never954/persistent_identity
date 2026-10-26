from __future__ import annotations

from ravenswood import config
from ravenswood.ollama import pick_model


def test_chat_model_preferred_over_coder(monkeypatch):
    monkeypatch.setattr(config, "FORCED_MODEL", None)
    installed = ["qwen2.5-coder:3b", "all-minilm:latest", "gemma3:1b", "qwen2.5:3b"]
    assert pick_model(installed) == "qwen2.5:3b"


def test_coder_is_only_the_fallback(monkeypatch):
    monkeypatch.setattr(config, "FORCED_MODEL", None)
    assert pick_model(["qwen2.5-coder:3b", "all-minilm:latest", "gemma3:1b"]) == "qwen2.5-coder:3b"
    assert pick_model(["all-minilm:latest"]) is None  # an embedding model is not a voice


def test_override(monkeypatch):
    monkeypatch.setattr(config, "FORCED_MODEL", "gemma3:1b")
    assert pick_model(["qwen2.5:3b"]) == "gemma3:1b"
