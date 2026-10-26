"""The manor as a place: rooms, corridors, doors, and how to walk between them.

Read from ``src/game/case/manor.json`` — the same floor plan the game draws — so a
suspect the server says is "two tiles from the study door" is exactly where the
player sees them. Suspects move one tile at a time along shortest paths (BFS on the
4-connected walkable grid), so to be anywhere — to gossip, to burn a letter, to kill
— they have to physically walk there, and can be seen on the way.
"""

from __future__ import annotations

from collections import deque
from functools import lru_cache
import json

from . import ROOT
from .fallible import uniform

PLAN = json.loads((ROOT / "src" / "game" / "case" / "manor.json").read_text())
W, H = PLAN["width"], PLAN["height"]
AREAS = {a["id"]: a for a in PLAN["areas"]}
EXIT = tuple(PLAN["exit"])
PLAYER_START = tuple(PLAN["playerStart"])
SCHEDULE = {cid: [(float(t), area) for t, area in rows] for cid, rows in PLAN["schedule"].items()}
ACTIVITIES = PLAN["activities"]
ABOUT = PLAN["about"]          # one line about each room, for a guided tour

# Words for places, as a player types them ("take me to the wine cellar").
PLACE_WORDS = {
    "study": "study", "library": "library", "kitchen": "kitchen", "cellar": "cellar", "wine cellar": "cellar",
    "conservatory": "conservatory", "dining room": "dining", "dining": "dining", "foyer": "foyer",
    "front hall": "foyer", "entrance": "foyer", "great hall": "great_hall", "hall": "great_hall",
}

Tile = tuple[int, int]


def _build() -> tuple[dict[Tile, str], set[Tile]]:
    area_of: dict[Tile, str] = {}
    blocked: set[Tile] = set()
    for a in PLAN["areas"]:
        x0, y0, w, h = a["rect"]
        for x in range(x0, x0 + w):
            for y in range(y0, y0 + h):
                area_of[(x, y)] = a["id"]
        for p in a.get("props", []):
            if p["type"] == "rug":
                continue
            px, py, pw, ph = p["rect"]
            blocked |= {(x, y) for x in range(px, px + pw) for y in range(py, py + ph)}
    for x, y in PLAN["doors"]:
        area_of[(x, y)] = "door"
    area_of[EXIT] = "door"
    return area_of, blocked


AREA_OF, BLOCKED = _build()
WALKABLE = {t for t in AREA_OF if t not in BLOCKED}


def area_at(t: Tile) -> str | None:
    return AREA_OF.get(tuple(t))


def activity(cid: str, area: str, slot: int) -> str:
    """What someone is doing in a room; it changes as they potter about."""
    options = ACTIVITIES.get(cid, {}).get(area, "")
    if isinstance(options, str):
        return options
    return options[slot % len(options)] if options else ""


def search_room(area: str | None) -> str | None:
    """The clue screen (RoomId) for an area, if it has one."""
    return AREAS.get(area or "", {}).get("search")


def scheduled_area(cid: str, t: float) -> str:
    area = SCHEDULE[cid][0][1]
    for start, a in SCHEDULE[cid]:
        if t >= start:
            area = a
    return area


@lru_cache(maxsize=None)
def _area_tiles(area: str) -> tuple[Tile, ...]:
    return tuple(sorted(t for t in WALKABLE if AREA_OF[t] == area))


def spot(area: str, *salt: str) -> Tile:
    """A stable, walkable place to stand in an area (different per person and purpose).
    Where the plan lists seats (the luncheon table), people sit."""
    seats = [tuple(t) for t in AREAS[area].get("seats", [])]
    if seats and salt and salt[0] in SEATING:
        return seats[SEATING[salt[0]] % len(seats)]   # everyone has their place at table
    tiles = tuple(seats) or _area_tiles(area)
    return tiles[int(uniform(area, *salt) * len(tiles))]


# Places at the luncheon table (indices into the hall's seats): Julian beside Miss Cross,
# Thomas beside Agnes, the doctor at the far end.
SEATING = {"julian": 1, "vivian": 2, "agnes": 4, "thomas": 5, "vance": 7}


def path(start: Tile, goal: Tile, avoid: set[Tile] = frozenset()) -> list[Tile]:
    """Shortest walk from start to goal (excluding start). [] if already there or unreachable."""
    start, goal = tuple(start), tuple(goal)
    if start == goal:
        return []
    prev: dict[Tile, Tile] = {start: start}
    q = deque([start])
    while q:
        cur = q.popleft()
        if cur == goal:
            break
        x, y = cur
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if n in WALKABLE and n not in prev and (n not in avoid or n == goal):
                prev[n] = cur
                q.append(n)
    if goal not in prev:
        return []
    out = [goal]
    while out[-1] != start:
        out.append(prev[out[-1]])
    return out[-2::-1]


def dist(a: Tile, b: Tile) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])
