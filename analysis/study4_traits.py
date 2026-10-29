"""Study 4 — further human memory traits, at the level of the engine (no language model).

    research/.venv/bin/python analysis/study4_traits.py

Each result is computed from the same memory model the game uses, over many independent
saves (each save fixes its own random draws), so the numbers are exact rates of the model
rather than samples of a voice.

4a  Social contagion / memory conformity: a remark one character makes to another travels
    through the house on foot (world.py); how fast does it reach everyone, and how often do
    hearers later remember it as something they SAW rather than something they were told?
4b  Interrogative pressure: does a frightened witness yield to a suggestion more often?
4c  Schema intrusion: how often does a habit fill in a faded memory of the night, by how
    forgetful the witness is?
4d  Selective fallibility: identity versus episodic memories over a week.
"""

from __future__ import annotations

from dataclasses import replace
import numpy as np

from common import BASE, fmt, save
from ravenswood.characters import CHARACTERS
from ravenswood.fallible import FallibleMemory
from ravenswood.store import MemoryRecord
from ravenswood.world import World, initial

N = 2000          # independent saves per cell
_RNG = np.random.default_rng(2026)   # seeded: every run gives the same numbers


def _hex() -> str:
    return _RNG.bytes(8).hex()
VEC = np.zeros(4, dtype=np.float32)


def rec(cid: str, kind: str, t: float, imp: float, source: str = "self", core: bool = False) -> MemoryRecord:
    return MemoryRecord(suspect_id=cid, kind=kind, text=kind, source=source, t_event=t, t_created=t,
                        importance=imp, vec=VEC, core=core, id=_hex())


# ---------------------------------------------------------------- 4a
def contagion() -> dict:
    """A remark by Thomas at 9:30 a.m. or at 11:30 a.m. (just before luncheon)."""
    out = {}
    for label, t0 in (("9:30 a.m.", 10.5), ("11:30 a.m.", 12.5)):
        w = World(initial(t0 - 0.01))
        w.tick(t0)
        w.news(t0, "thomas", "Thomas said he saw a woman in a long skirt on the landing.", "revelation", True)
        heard_at = {}
        t = t0
        while t < t0 + 6 and len(heard_at) < 4:
            t += 1 / 60
            w.tick(t)
            for c in w.s["news"][0]["told"]:
                if c != "thomas" and c not in heard_at:
                    heard_at[c] = round((t - t0) * 60)
        out[label] = heard_at
    # How often a hearer later recalls the remark as WITNESSED (source lost), by delay since hearing.
    delays = [1, 6, 24, 72]
    rates = {}
    for cid, char in CHARACTERS.items():
        if cid == "thomas":
            continue
        fm = FallibleMemory(char, BASE)
        row = {}
        for d in delays:
            lost = 0
            reachable = 0
            for _ in range(N):
                r = rec(cid, "gossip", 0.0, 6, source="told:thomas")
                a = fm.assess(r, float(d), 0, 0, _hex())
                if a.state != "forgotten":
                    reachable += 1
                    lost += not a.source_known
            row[f"{d}h"] = {"recalled": reachable, "as_witnessed": lost}
        rates[cid] = row
    perfect = FallibleMemory(CHARACTERS["agnes"], BASE, "perfect")
    b1 = sum(not perfect.assess(rec("agnes", "gossip", 0, 6, "told:thomas"), 72.0, 0, 0, _hex()).source_known
             for _ in range(N))
    return {"spread_minutes": out, "as_witnessed": rates, "b1_as_witnessed_72h": b1, "n": N}


# ---------------------------------------------------------------- 4b
def pressure() -> dict:
    """P(suggestion beats the witness's own memory), one hour after the suggestion, by fear."""
    out = {}
    for cid in ("thomas", "agnes", "julian", "vance"):
        char = CHARACTERS[cid]
        row = {}
        for fear in (0, 25, 50, 75, 100):
            p = 1.0 + 0.8 * fear / 100.0           # world.World.pressure
            felt = replace(char, source_amnesia=min(1.0, char.source_amnesia * p),
                           interference=min(1.0, char.interference * p))
            fm = FallibleMemory(felt, BASE)
            orig = rec(cid, "episodic", 0.0, 7)            # last night, 11 p.m.
            rival = rec(cid, "planted", 10.0, 6, "told:detective")  # suggested at 9 a.m.
            row[fear] = round(1.0 - fm.p_choose_original(orig, rival, 11.0), 3)
        out[cid] = row
    return out


# ---------------------------------------------------------------- 4c
def intrusion() -> dict:
    """The habit replaces the memory of the night when that memory is forgotten, or only
    hazy and the witness blends (world-free rule from agent._decide)."""
    out = {}
    for decay in (0.1, 0.4, 0.75):
        char = replace(CHARACTERS["agnes"], decay=decay)
        fm = FallibleMemory(char, BASE)
        row = {}
        for h in (10, 24, 72, 168):
            k = 0
            for _ in range(N):
                sid = _hex()
                night = rec("agnes", "episodic", -0.5, 3)
                a = fm.assess(night, float(h), 0, 0, sid)
                from ravenswood.fallible import uniform
                k += a.state == "forgotten" or (a.state == "gist" and uniform(sid, night.id, "intrude") < char.interference)
            row[f"{h}h"] = k
        out[str(decay)] = row
    return {"rates": out, "n": N}


# ---------------------------------------------------------------- 4d
def selective() -> dict:
    out = {}
    for cid, char in CHARACTERS.items():
        fm = FallibleMemory(char, BASE)
        row = {}
        for h in (10, 24, 72, 168):
            det = sum(fm.assess(rec(cid, "episodic", 0.0, 6), float(h), 0, 0, _hex()).state == "detail"
                      for _ in range(N))
            core = sum(fm.assess(rec(cid, "identity", -1000.0, 6, core=True), float(h), 0, 0,
                                 _hex()).state == "detail" for _ in range(N))
            row[f"{h}h"] = {"episodic_detail": det, "identity_detail": core}
        out[cid] = row
    return {"rates": out, "n": N}


def md(res: dict) -> str:
    n = res["n"]
    L = ["## 4a Social contagion (memory conformity)\n",
         "Minutes until each person has heard Thomas's remark (walking, meeting, telling):\n"]
    for when, heard in res["contagion"]["spread_minutes"].items():
        L.append(f"- said at {when}: " + ", ".join(f"{c} {m} min" for c, m in sorted(heard.items(), key=lambda x: x[1])))
    L += ["\nOf hearers who still recall the remark, the share who recall it as WITNESSED (source lost):\n",
          "| Hearer | 1 h | 6 h | 24 h | 72 h |", "|---|---|---|---|---|"]
    for cid, row in res["contagion"]["as_witnessed"].items():
        L.append(f"| {cid} | " + " | ".join(fmt(v["as_witnessed"], v["recalled"]) for v in row.values()) + " |")
    L.append(f"\nB1 (perfect memory), Agnes at 72 h: {res['contagion']['b1_as_witnessed_72h']}/{n}")
    L += ["\n## 4b Interrogative pressure\n", "P(the suggestion wins over the witness's own memory), 1 h after it:\n",
          "| Witness | fear 0 | 25 | 50 | 75 | 100 |", "|---|---|---|---|---|---|"]
    for cid, row in res["pressure"].items():
        L.append(f"| {cid} | " + " | ".join(f"{v:.3f}" for v in row.values()) + " |")
    L += ["\n## 4c Schema intrusion (the habit replaces the night)\n",
          "| decay dial | 10 h | 24 h | 72 h | 168 h |", "|---|---|---|---|---|"]
    for dec, row in res["intrusion"]["rates"].items():
        L.append(f"| {dec} | " + " | ".join(fmt(v, n) for v in row.values()) + " |")
    L += ["\n## 4d Selective fallibility (share recalled in full detail)\n",
          "| Suspect | memory | 10 h | 24 h | 72 h | 168 h |", "|---|---|---|---|---|---|"]
    for cid, row in res["selective"]["rates"].items():
        L.append(f"| {cid} | episodic | " + " | ".join(f"{v['episodic_detail'] / n:.2f}" for v in row.values()) + " |")
        L.append(f"| {cid} | identity | " + " | ".join(f"{v['identity_detail'] / n:.2f}" for v in row.values()) + " |")
    return "\n".join(L)


if __name__ == "__main__":
    res = {"n": N, "contagion": contagion(), "pressure": pressure(), "intrusion": intrusion(), "selective": selective()}
    save("study4_traits.json", res)
    text = md(res)
    (save.__globals__["RESULTS"] / "study4_traits.md").write_text(text + "\n")
    print(text)
