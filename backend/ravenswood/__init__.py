"""Ravenswood suspect backend — persistent, fallible NPC memory.

The game's suspects run here: a timestamped memory stream per suspect
(SQLite + stored embeddings), Smallville-style retrieval, the research
memory model (``research/lcmem``) deciding what each trace looks like when
recalled, a deception policy, an LLM voice, and write-back after every turn.

``research/`` is put on the import path so the game uses the *same* calibrated
memory model as the paper instead of a copy.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_RESEARCH = ROOT / "research"
if str(_RESEARCH) not in sys.path:
    sys.path.insert(0, str(_RESEARCH))
