from __future__ import annotations

import numpy as np

from ravenswood.store import MemoryRecord, MemoryStore, Turn


def rec(text: str, **kw) -> MemoryRecord:
    v = np.ones(4, dtype=np.float32) / 2
    return MemoryRecord(save_id="s1", suspect_id="thomas", kind="heard", text=text, source="self",
                        t_event=10.0, t_created=10.0, importance=5, vec=v, **kw)


def test_memories_survive_a_restart(tmp_path):
    db = tmp_path / "m.db"
    s = MemoryStore(db)
    s.create_session("s1", 10.0, "detective", "fallible")
    s.add([rec("I like football")])
    s.add_turn("s1", "thomas", Turn("detective", "Hello?", 10.0))
    s2 = MemoryStore(db)  # a new process opening the same file
    [m] = s2.memories("s1", "thomas")
    assert m.text == "I like football" and np.allclose(m.vec, 0.5)
    assert s2.recent_turns("s1", "thomas", 5)[0].text == "Hello?"
    assert s2.session("s1")["clock"] == 10.0


def test_touch_reconsolidates_and_clock_advances(tmp_path):
    s = MemoryStore(tmp_path / "m.db")
    s.create_session("s1", 10.0, "detective", "fallible")
    r = rec("x")
    s.add([r])
    s.touch([r.id], 11.0, rehearse=True)
    [m] = s.memories("s1", "thomas")
    assert m.rehearsals == 1 and m.last_access == 11.0
    assert s.advance("s1", 0.5) == 10.5


def test_recent_turns_are_in_order_and_limited(tmp_path):
    s = MemoryStore(tmp_path / "m.db")
    for i in range(5):
        s.add_turn("s1", "thomas", Turn("detective", f"q{i}", 10.0 + i))
    assert [t.text for t in s.recent_turns("s1", "thomas", 3)] == ["q2", "q3", "q4"]
