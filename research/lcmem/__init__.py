"""lcmem — the Living Characters memory model.

A persistent agent memory whose episodic traces become *inaccessible* (not
deleted), lose detail before gist, lose their source tag faster than their
content, and support familiarity-based (global-matching) recognition —
alongside two baselines:

* B1 "accurate"  — Smallville-style: perfect content, perfect source.
* B2 "exp-decay" — MemoryBank-style exponential forgetting, perfect source.

See PROJECT_CONTEXT.md §6 for the design and the claims we make.
"""

from .params import ModelParams, PowerDecay, ExpDecay, SourceParams, RecognitionParams
from .memory import Memory
from .agent import MemoryAgent, Condition

__all__ = [
    "ModelParams",
    "PowerDecay",
    "ExpDecay",
    "SourceParams",
    "RecognitionParams",
    "Memory",
    "MemoryAgent",
    "Condition",
]
