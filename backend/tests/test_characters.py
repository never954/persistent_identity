"""The backend's characters must agree with the game's case file and suspect dials."""

from __future__ import annotations

import re

from ravenswood import ROOT
from ravenswood.characters import CHARACTERS

SUSPECTS_TS = (ROOT / "src" / "game" / "case" / "suspects.ts").read_text()
CASE_TS = (ROOT / "src" / "game" / "case" / "caseData.ts").read_text()
CLUE_IDS = set(re.findall(r"id: '([a-z-]+)',\s*\n\s*title:", CASE_TS))


def ts_dials(sid: str) -> tuple[float, float, float]:
    block = SUSPECTS_TS[SUSPECTS_TS.index(f"id: '{sid}'"):]
    grab = lambda k: float(re.search(rf"{k}: ([0-9.]+)", block).group(1))  # noqa: E731
    return grab("decay"), grab("interference"), grab("sourceAmnesia")


def test_dials_match_the_game():
    for sid, c in CHARACTERS.items():
        assert (c.decay, c.interference, c.source_amnesia) == ts_dials(sid), sid


def test_exactly_one_killer_and_it_is_vivian():
    assert [c.id for c in CHARACTERS.values() if c.is_killer] == ["vivian"]
    assert "killerId: 'vivian'" in CASE_TS


def test_every_suspect_has_a_persistent_self():
    for c in CHARACTERS.values():
        assert sum(s.kind == "identity" for s in c.seeds) >= 8, c.id
        assert sum(s.kind == "episodic" for s in c.seeds) + sum(s.kind == "concealed" for s in c.seeds) >= 3


def test_concealed_have_covers_and_links_resolve():
    assert CLUE_IDS, "could not parse clue ids from caseData.ts"
    for c in CHARACTERS.values():
        keys = {s.key for s in c.seeds}
        for s in c.seeds:
            if s.kind == "concealed":
                assert s.cover and s.case, s.key
            if s.blocks:
                assert s.blocks in keys and s.kind == "episodic", s.key
            if s.reveals:
                assert s.reveals in CLUE_IDS, s.reveals
