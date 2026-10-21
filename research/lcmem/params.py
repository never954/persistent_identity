"""Model parameters.

Every distortion in the model is a named, tunable parameter. Values that are
*fitted* or *calibrated* are written back by the experiments (see
results/study1/params_fitted.json); everything else is a stated assumption,
listed here with its default so the paper can report it.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
import json
from pathlib import Path


@dataclass
class PowerDecay:
    """Ours: accessibility p(t) = a * (1 + t/tau) ** -d  (power law).

    a      initial accessibility of unremarkable material (0..1)       [fitted, Exp 1a]
    tau    time scale in hours                                         [fitted, Exp 1a]
    d      verbatim decay exponent                                     [fitted, Exp 1a]
    gist_ratio  d_gist = gist_ratio * d  (gist fades slower; fuzzy-trace)  [assumption]
    rho    accessibility boost per rehearsal / reconsolidation         [assumption]
    """

    a: float = 0.60
    tau: float = 0.30
    d: float = 0.25
    gist_ratio: float = 0.5
    rho: float = 0.5


@dataclass
class ExpDecay:
    """B2 (MemoryBank-style): retention R(t) = a * exp(-t / S).

    a  initial accessibility  [fitted, Exp 1a]
    S  memory strength in hours  [fitted, Exp 1a]
    """

    a: float = 0.60
    S: float = 200.0


@dataclass
class SourceParams:
    """Source-tag decay. The tag follows the same power law as content but with
    exponent kappa * d (kappa > 1: source is forgotten faster than content,
    Johnson, Hashtroudi & Lindsay 1993).

    a      initial accessibility of the source tag        [assumption]
    kappa  source-decay multiplier                         [assumption; swept in Exp 1c/1d]
    """

    a: float = 0.95
    kappa: float = 2.0


@dataclass
class RecognitionParams:
    """Dual-process recognition: recollection (verbatim access) OR familiarity.

    Familiarity is global matching (MINERVA 2, Hintzman 1988): sum over stored
    traces of gist-accessibility * max(0, cos(probe, trace)) ** k.
    The decision is P(old | F) = Phi((F - criterion) / noise).

    k          similarity exponent (MINERVA 2 uses 3)   [fixed a priori]
    criterion  decision criterion                        [calibrated, Exp 1b]
    noise      decision noise                            [calibrated, Exp 1b]
    """

    k: int = 3
    criterion: float = 1.5
    noise: float = 0.5


@dataclass
class ModelParams:
    power: PowerDecay = field(default_factory=PowerDecay)
    exp: ExpDecay = field(default_factory=ExpDecay)
    source: SourceParams = field(default_factory=SourceParams)
    recognition: RecognitionParams = field(default_factory=RecognitionParams)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "ModelParams":
        return cls(
            power=PowerDecay(**d.get("power", {})),
            exp=ExpDecay(**d.get("exp", {})),
            source=SourceParams(**d.get("source", {})),
            recognition=RecognitionParams(**d.get("recognition", {})),
        )

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2))

    @classmethod
    def load(cls, path: str | Path) -> "ModelParams":
        return cls.from_dict(json.loads(Path(path).read_text()))
