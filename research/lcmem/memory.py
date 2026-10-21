"""The memory record: a structured event, never deleted, with decaying access."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class Memory:
    """One episodic trace.

    text       natural-language content (what gets embedded / verbalised)
    slots      structured fields (who / what / where / when / details ...);
               blending and labelling operate on these
    t          encoding time, in simulated hours
    strength   initial accessibility multiplier (salience); 1.0 = typical
    source     "self" (witnessed) or e.g. "told:detective"
    core       identity memory — exempt from every distortion
    rehearsals number of reconsolidations (retrieval-and-retelling)
    vec        unit-normalised embedding
    """

    id: str
    text: str
    t: float
    slots: dict[str, Any] = field(default_factory=dict)
    strength: float = 1.0
    source: str = "self"
    core: bool = False
    rehearsals: int = 0
    vec: np.ndarray | None = None

    @property
    def witnessed(self) -> bool:
        return self.source == "self"
