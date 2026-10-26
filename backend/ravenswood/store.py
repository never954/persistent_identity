"""The memory stream: a timestamped, embedded, persistent record per suspect.

One SQLite file holds every save game. Each memory row is one trace in a
suspect's stream (Park et al. 2023): its text, when the event happened, when it
was stored and last recalled (simulated hours), its importance, how often it
has been retold, its source tag, and its embedding (float32 bytes). Nothing is
ever deleted — the memory model decides what is *reachable*, the store only
remembers that it happened. The turns table is the full interview log.

A minimal vector store: retrieval is an exact cosine scan over one suspect's
rows (tens to hundreds of vectors), which at this scale is faster and more
transparent than an approximate index.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
import uuid

import numpy as np

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    save_id     TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    clock       REAL NOT NULL,
    difficulty  TEXT NOT NULL,
    memory_mode TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
    id          TEXT PRIMARY KEY,
    save_id     TEXT NOT NULL,
    suspect_id  TEXT NOT NULL,
    seed_key    TEXT,
    kind        TEXT NOT NULL,
    text        TEXT NOT NULL,
    gist        TEXT,
    source      TEXT NOT NULL,
    t_event     REAL NOT NULL,
    t_created   REAL NOT NULL,
    last_access REAL NOT NULL,
    importance  REAL NOT NULL,
    rehearsals  INTEGER NOT NULL DEFAULT 0,
    core        INTEGER NOT NULL DEFAULT 0,
    case_fact   INTEGER NOT NULL DEFAULT 0,
    cover       TEXT,
    blocks      TEXT,
    reveals     TEXT,
    embedding   BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mem_owner ON memories(save_id, suspect_id);
CREATE TABLE IF NOT EXISTS turns (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id     TEXT NOT NULL,
    suspect_id  TEXT NOT NULL,
    t_sim       REAL NOT NULL,
    role        TEXT NOT NULL,
    text        TEXT NOT NULL,
    kind        TEXT,
    trace       TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_turn_owner ON turns(save_id, suspect_id, id);
CREATE TABLE IF NOT EXISTS world (
    save_id     TEXT PRIMARY KEY,
    state       TEXT NOT NULL
);
"""


@dataclass
class MemoryRecord:
    """One trace in a suspect's memory stream."""

    suspect_id: str
    kind: str                 # identity | episodic | habit | concealed | heard | said | self_fact | planted
                              # | event | gossip | reflection | saw (the day's life: world.py)
    text: str
    source: str               # "self" | "told:detective" | "told:<suspect>"
    t_event: float            # when it happened (sim hours)
    t_created: float          # when it entered the stream
    importance: float
    vec: np.ndarray
    save_id: str = ""
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    seed_key: str | None = None
    gist: str | None = None
    last_access: float | None = None
    rehearsals: int = 0
    core: bool = False
    case_fact: bool = False
    cover: str | None = None
    blocks: str | None = None
    reveals: str | None = None

    def __post_init__(self) -> None:
        if self.last_access is None:
            self.last_access = self.t_created

    def public(self) -> dict:
        """Inspector view (no embedding)."""
        return {
            "id": self.id, "kind": self.kind, "text": self.text, "gist": self.gist,
            "source": self.source, "t_event": self.t_event, "t_created": self.t_created,
            "last_access": self.last_access, "importance": self.importance,
            "rehearsals": self.rehearsals, "core": self.core, "case": self.case_fact,
            "seed_key": self.seed_key,
        }


@dataclass
class Turn:
    role: str
    text: str
    t_sim: float
    kind: str | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class MemoryStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        if str(path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(SCHEMA)
        self._db.commit()

    # ------------------------------------------------------------- sessions
    def create_session(self, save_id: str, clock: float, difficulty: str, memory_mode: str) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO sessions(save_id, created_at, clock, difficulty, memory_mode) VALUES (?,?,?,?,?)",
                (save_id, _now_iso(), clock, difficulty, memory_mode),
            )
            self._db.commit()

    def session(self, save_id: str) -> dict | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM sessions WHERE save_id=?", (save_id,)).fetchone()
            return dict(row) if row else None

    def advance(self, save_id: str, hours: float) -> float:
        with self._lock:
            self._db.execute("UPDATE sessions SET clock = clock + ? WHERE save_id=?", (hours, save_id))
            self._db.commit()
            return self._db.execute("SELECT clock FROM sessions WHERE save_id=?", (save_id,)).fetchone()[0]

    def delete_session(self, save_id: str) -> None:
        with self._lock:
            for table in ("memories", "turns", "world", "sessions"):
                self._db.execute(f"DELETE FROM {table} WHERE save_id=?", (save_id,))
            self._db.commit()

    # ---------------------------------------------------------------- world
    def world(self, save_id: str) -> dict | None:
        """The house around the interviews (moods, events, story flags) — see world.py."""
        with self._lock:
            row = self._db.execute("SELECT state FROM world WHERE save_id=?", (save_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def put_world(self, save_id: str, state: dict) -> None:
        with self._lock:
            self._db.execute("INSERT INTO world(save_id, state) VALUES (?,?) "
                             "ON CONFLICT(save_id) DO UPDATE SET state=excluded.state", (save_id, json.dumps(state)))
            self._db.commit()

    # ------------------------------------------------------------- memories
    def add(self, records: list[MemoryRecord]) -> None:
        with self._lock:
            self._db.executemany(
                """INSERT INTO memories(id, save_id, suspect_id, seed_key, kind, text, gist, source,
                   t_event, t_created, last_access, importance, rehearsals, core, case_fact,
                   cover, blocks, reveals, embedding) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                [
                    (r.id, r.save_id, r.suspect_id, r.seed_key, r.kind, r.text, r.gist, r.source,
                     r.t_event, r.t_created, r.last_access, r.importance, r.rehearsals, int(r.core),
                     int(r.case_fact), r.cover, r.blocks, r.reveals,
                     np.asarray(r.vec, dtype=np.float32).tobytes())
                    for r in records
                ],
            )
            self._db.commit()

    def memories(self, save_id: str, suspect_id: str) -> list[MemoryRecord]:
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM memories WHERE save_id=? AND suspect_id=? ORDER BY t_created, rowid",
                (save_id, suspect_id),
            ).fetchall()
        return [self._record(r) for r in rows]

    @staticmethod
    def _record(r: sqlite3.Row) -> MemoryRecord:
        return MemoryRecord(
            id=r["id"], save_id=r["save_id"], suspect_id=r["suspect_id"], seed_key=r["seed_key"],
            kind=r["kind"], text=r["text"], gist=r["gist"], source=r["source"],
            t_event=r["t_event"], t_created=r["t_created"], last_access=r["last_access"],
            importance=r["importance"], rehearsals=r["rehearsals"], core=bool(r["core"]),
            case_fact=bool(r["case_fact"]), cover=r["cover"], blocks=r["blocks"], reveals=r["reveals"],
            vec=np.frombuffer(r["embedding"], dtype=np.float32),
        )

    def touch(self, ids: list[str], now: float, rehearse: bool) -> None:
        """Mark memories as recalled at `now`; a retelling also reconsolidates them."""
        if not ids:
            return
        with self._lock:
            self._db.executemany(
                "UPDATE memories SET last_access=?, rehearsals = rehearsals + ? WHERE id=?",
                [(now, 1 if rehearse else 0, i) for i in ids],
            )
            self._db.commit()

    # ---------------------------------------------------------------- turns
    def add_turn(self, save_id: str, suspect_id: str, turn: Turn, trace: dict | None = None) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO turns(save_id, suspect_id, t_sim, role, text, kind, trace, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (save_id, suspect_id, turn.t_sim, turn.role, turn.text, turn.kind,
                 json.dumps(trace) if trace is not None else None, _now_iso()),
            )
            self._db.commit()

    def recent_turns(self, save_id: str, suspect_id: str, n: int) -> list[Turn]:
        with self._lock:
            rows = self._db.execute(
                "SELECT role, text, t_sim, kind FROM turns WHERE save_id=? AND suspect_id=? ORDER BY id DESC LIMIT ?",
                (save_id, suspect_id, n),
            ).fetchall()
        return [Turn(r["role"], r["text"], r["t_sim"], r["kind"]) for r in reversed(rows)]

    def all_turns(self, save_id: str) -> list[dict]:
        with self._lock:
            rows = self._db.execute(
                "SELECT suspect_id, t_sim, role, text, kind, trace FROM turns WHERE save_id=? ORDER BY id",
                (save_id,),
            ).fetchall()
        return [dict(r) for r in rows]
