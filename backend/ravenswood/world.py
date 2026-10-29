"""The world around the interviews: moods, deeds, gossip, the day's story, endings.

The memory layer makes each suspect a persistent self; this makes the HOUSE
persistent. Everything here is engine-owned and deterministic — the language
model never decides a consequence, it only words one (and, in a reflection,
picks one of a few allowed intentions).

* MOOD — each suspect's fear, trust and anger toward the detective (0..100),
  moved by the tone of what you say and by what you do, shaped by temperament
  (characters.TEMPERAMENT), cooling as the hours pass.
* DEEDS — strike, draw the revolver, shoot, offer money, put someone under the
  constable's watch, take or refuse a bribe. Each is remembered by its victim as
  a strong episodic memory ("they will remember that").
* A PLACE — every suspect stands on a tile of the manor (manor.py) and walks,
  tile by tile, wherever they go. Nothing happens at a distance: to gossip, to
  burn a letter, to run, to kill, a suspect has to get there — and can be seen on
  the way by the player, or by anyone else.
* GOSSIP — news passes between people who are in the same room, and a suspect
  with news worth telling walks off to find a confidant to tell it to. It arrives
  as a memory tagged with its teller (and that tag can fade, like any suggestion).
* OFF-SCREEN LIFE — the world moves a minute at a time. Suspects keep their own
  day (luncheon together in the Great Hall at noon), wander within rooms, tidy
  away evidence when no one is watching, and act on their situation: the killer
  offers a bribe, makes for the front door when cornered, and follows the witness
  she hears has talked until she finds him alone.
* ENDINGS — what you did all day decides how the case closes.

Moods map onto findings the research cites: pressure raises suggestibility
(Gudjonsson's interrogative suggestibility), and an innocent, frightened,
suggestible suspect pushed hard enough may confess to what they did not do
(Kassin & Kiechel 1996).
"""

from __future__ import annotations

from dataclasses import dataclass
import re

from . import manor
from .characters import CHARACTERS, TEMPERAMENT

TICK_H = 0.5                 # moods cool and story beats are checked every half hour
SPEED = 6                    # tiles walked per game minute
SAY_MIN = 3                  # how long a spoken line stays above someone's head (minutes)
ERRAND_H = 0.75              # how long someone looks for a confidant before giving up
HUNT_H = 3.0                 # how long the killer stalks before she thinks better of it
FIND_BODY_H = 1.5            # a body is found by then at the latest (a maid, a footman)
DEADLINE_T = 18.0            # 5 p.m.: the Chief Constable arrives; accuse someone
GOSSIP_DELAY_H = 1.0         # a confidant hears within the hour, wherever they are

REFUSE_ANGER = 75            # storms out
REFUSE_H = 0.75              # …for 45 minutes
CRACK_FEAR = 70              # breaks down
FALSE_CONFESS_FEAR = 85      # an innocent, suggestible suspect "confesses" to stop it
OPEN_TRUST = 65              # confides something unasked
CORNERED_FEAR = 75           # the killer starts planning to run
KILLER_CONFESS_FEAR = 60     # …but faced with enough proof she breaks instead

VIVIAN_EVIDENCE = {"burned-ledger", "crimson-thread", "muddy-prints"}

TONES = ("calm", "press", "threaten", "comfort", "beg", "insult")
DEEDS = ("strike", "draw", "holster", "shoot", "bribe", "watch", "accept_bribe", "refuse_bribe", "release")

# How the detective's tone moves a mood, before temperament.
#   fear rises against nerve, anger with pride, trust with warmth.
_TONE = {
    #           fear  anger trust honour
    "calm":     (-2,   -2,    1,   0),
    "press":    (10,    6,   -4,   0),
    "threaten": (24,   12,  -15,  -3),
    "comfort":  (-10,  -6,   12,   1),
    "beg":      (0,    -4,    6,   0),
    "insult":   (4,    22,  -12,  -2),
}

_INSULT = re.compile(
    r"\b(fuck\w*|shit\w*|bitch\w*|bastard\w*|idiot\w*|stupid|moron\w*|scum|cunt\w*|ass ?hole\w*|dick\w*|"
    r"whore\w*|slut\w*|prick\w*|wanker\w*|damn you|go to hell|shut up|liar|pathetic|disgusting|useless)\b", re.I)
_THREAT = re.compile(
    r"\b(i('ll| will| am going to|'m going to|m gonna| gonna)\s+(kill|hurt|hang|break|shoot|beat|ruin|destroy|"
    r"make you|see you hang|lock you|arrest)|or else|you('ll| will) hang|you('ll| will) regret|"
    r"watch yourself|last chance|i('ll| will) have you)\b", re.I)
_BEG = re.compile(r"\b(i beg|begging|i implore|please,? i need|please help|help me|i need your help|have mercy)\b",
                  re.I)
_COMFORT = re.compile(
    r"\b(it'?s (ok|okay|all right|alright)|don'?t (worry|be afraid)|you'?re safe|i believe you|take your time|"
    r"sorry for your loss|you can trust me|no one is blaming you|i'?m on your side|calm down)\b", re.I)
_PRESS = re.compile(r"\b(tell me the truth|stop lying|don'?t lie|answer the question|i know you'?re lying|"
                    r"you'?re hiding something|the truth,? now)\b", re.I)


def classify_tone(text: str) -> str:
    """The tone of a typed line — so cursing, threats and pleas count without a button."""
    for tone, rx in (("insult", _INSULT), ("threaten", _THREAT), ("beg", _BEG), ("comfort", _COMFORT),
                     ("press", _PRESS)):
        if rx.search(text):
            return tone
    return "calm"


# Things the detective can ask someone to DO (not just say). The engine decides whether they
# agree (World.complies); if they do, they carry it out in the house (World.start_task).
_REQUESTS = [
    ("stop", re.compile(r"\b(stop following( me)?|stop that|stop dancing|you can (go|stop)|that'?s enough|as you "
                        r"were|carry on)\b", re.I)),
    ("tour", re.compile(r"\b(show me (a)?round|give me (a|the) tour|tour of the (house|manor)|show me the "
                        r"(house|manor|place))\b", re.I)),
    ("dance", re.compile(r"\b(dance (with me|for me|now)|(will|would|could|can|won'?t|wouldn'?t) (you|u) dance|"
                         r"let'?s dance|^\s*dance\b|i want (you|u) to dance|shall we dance)", re.I)),
    ("follow", re.compile(r"\b(follow me|come with me|come along( with me)?|walk with me)\b", re.I)),
    ("sit", re.compile(r"\b(sit down|take a seat|have a seat)\b", re.I)),
    ("stay", re.compile(r"\b(stay (here|put|there)|wait (here|there)|don'?t move)\b", re.I)),
    ("lead", re.compile(r"\b(take|lead|bring|show) me (to|the way to)\b|\bshow me (the|your|[a-z ]+'s) ", re.I)),
    ("goto", re.compile(r"\b(go to|go back to|wait (for me )?in|get (back )?to)\b|\b(go away|get out|leave "
                        r"(me|us|the room)|go to your room)\b", re.I)),
]


def parse_request(text: str, cid: str) -> dict | None:
    """'Show me around', 'take me to the cellar', 'dance with me', 'follow me', 'go to your room'…"""
    low = text.lower()
    for kind, rx in _REQUESTS:
        if not rx.search(low):
            continue
        if kind in ("lead", "goto"):
            area = None
            if re.search(r"\b(your room|go away|get out|leave (me|us|the room))\b", low):
                area = f"{cid}_room"
            for word, a in sorted(manor.PLACE_WORDS.items(), key=lambda kv: -len(kv[0])):
                if area is None and re.search(rf"\b{word}\b", low):
                    area = a
            for other in CHARACTERS:
                names = [w.lower() for w in CHARACTERS[other].name.split()] + (["miss cross"] if other == "vivian" else [])
                if area is None and any(re.search(rf"\b{n}'?s room\b", low) for n in names):
                    area = f"{other}_room"
            if area is None:
                continue
            return {"kind": kind, "area": area}
        return {"kind": kind}
    return None


# What a suspect volunteers once they trust you — or come looking for you.
VOLUNTEER = {"thomas": "th-figure", "agnes": "ag-julian-cellar", "julian": "ju-noise-truth", "vance": "va-shawl"}
# What breaks out of them under enough fear.
CRACK = {"julian": ("ju-alibi-truth", "ju-debts-truth"),
         "vivian": ("vi-alibi-truth", "vi-brandy-truth", "vi-blow-truth", "vi-ledger-truth")}
# Testimony that, once given, becomes household news — and closes the net on the killer.
REVELATIONS = {
    "th-figure": ("Thomas told the detective he saw a woman in a long skirt on the landing, going to the study.", True),
    "ag-julian-cellar": ("Agnes told the detective Master Julian went down to the cellar last night.", False),
    "va-shawl": ("Dr. Vance told the detective the conservatory garden door was banging at eleven.", True),
    "va-sedative": ("Dr. Vance told the detective his lordship was drugged before he was struck.", True),
    "ju-dinner": ("Julian told the detective his uncle and Miss Cross had fallen out.", True),
    "ju-noise-truth": ("Julian told the detective someone was moving about in the conservatory near midnight.", True),
    "ju-alibi-truth": ("Julian admitted to the detective he was down in the cellar last night, not in the library.", False),
}

# How a guide introduces each of them on a tour.
INTRO = {"agnes": "Mrs Hartwell, the housekeeper", "julian": "Mr Julian Ravenswood, his lordship's nephew",
         "vance": "Dr. Eleanor Vance, the family's doctor", "thomas": "Thomas Bell, the valet",
         "vivian": "Miss Vivian Cross, his lordship's business partner"}

_FIRST = {cid: c.name.split()[0] for cid, c in CHARACTERS.items()}
_FIRST["vance"] = "Dr. Vance"
_FIRST["vivian"] = "Miss Cross"


def first(cid: str) -> str:
    return _FIRST[cid]


def _clamp(x: float) -> float:
    return max(0.0, min(100.0, x))


@dataclass
class Mem:
    """A memory the world hands to a suspect's stream (the engine embeds and stores it)."""

    cid: str
    kind: str          # event | gossip | reflection | concealed
    text: str
    source: str = "self"
    importance: float = 8.0
    cover: str | None = None


def initial(clock: float) -> dict:
    npcs = {}
    for cid in CHARACTERS:
        area = manor.scheduled_area(cid, clock)
        pos = manor.spot(area, cid, "start")
        npcs[cid] = {"fear": 15.0 if cid != "vance" else 5.0, "trust": 30.0, "anger": 0.0,
                     "status": "present", "until": 0.0, "area": area, "pos": list(pos), "path": [],
                     "goal": None, "trail": [list(pos)], "doing": "", "say": None, "say_until": 0.0,
                     "errand": None, "strikes": 0}
    return {
        "npcs": npcs, "minute": round(clock * 60),
        "honour": 0, "violence": 0, "flags": {}, "events": [], "news": [], "last_tick": clock,
        "watch": None, "gun": None, "offer": False, "clues": [], "lost_clues": [], "ended": None,
        "reflect": [], "knows": {cid: [] for cid in CHARACTERS}, "player": None, "body": None,
        "last_reflect_all": clock,
    }


class World:
    """Pure state transitions over the world dict. Returns memories to write; never stores."""

    def __init__(self, state: dict):
        self.s = state

    # ------------------------------------------------------------ helpers
    def npc(self, cid: str) -> dict:
        return self.s["npcs"][cid]

    def flag(self, key: str) -> float | None:
        return self.s["flags"].get(key)

    def set_flag(self, key: str, t: float) -> None:
        self.s["flags"].setdefault(key, t)

    def event(self, t: float, text: str, kind: str = "story", who: str | None = None) -> None:
        self.s["events"].append({"t": t, "text": text, "kind": kind, "who": who})

    def present(self, cid: str) -> bool:
        return self.npc(cid)["status"] in ("present", "refusing")

    def evidence_on_vivian(self) -> int:
        return len(VIVIAN_EVIDENCE & set(self.s["clues"]))

    def news(self, t: float, origin: str, text: str, kind: str, implicates_killer: bool = False) -> None:
        if any(n["text"] == text for n in self.s["news"]):
            return
        self.s["news"].append({"id": len(self.s["news"]), "t": t, "origin": origin, "text": text, "kind": kind,
                               "killer": implicates_killer, "told": [origin]})
        self.s["knows"][origin].append(len(self.s["news"]) - 1)

    def mood(self, cid: str, fear=0.0, anger=0.0, trust=0.0) -> None:
        n = self.npc(cid)
        n["fear"], n["anger"], n["trust"] = _clamp(n["fear"] + fear), _clamp(n["anger"] + anger), _clamp(n["trust"] + trust)

    def mood_words(self, cid: str) -> str:
        n = self.npc(cid)
        words = []
        if n["fear"] >= 70:
            words.append("terrified of the detective")
        elif n["fear"] >= 40:
            words.append("frightened and on edge")
        if n["anger"] >= 60:
            words.append("furious with the detective")
        elif n["anger"] >= 30:
            words.append("resentful and prickly")
        if n["trust"] >= 65:
            words.append("you have come to trust this detective")
        elif n["trust"] <= 10:
            words.append("you do not trust this detective one inch")
        return "; ".join(words) or "composed, if wary"

    # ------------------------------------------------------------- tone
    def apply_tone(self, cid: str, tone: str, text: str, now: float) -> tuple[list[str], list[Mem]]:
        """How what the detective said lands. Returns notices for the player and memories."""
        tm = TEMPERAMENT[cid]
        df, da, dt, dh = _TONE.get(tone, _TONE["calm"])
        self.mood(cid, fear=df * (1 - tm.nerve) * (2 if df > 0 else 1),
                  anger=da * (0.4 + tm.pride) if da > 0 else da,
                  trust=dt * (0.5 + tm.warmth) if dt > 0 else dt)
        self.s["honour"] += dh
        notices: list[str] = []
        mems: list[Mem] = []
        if tone in ("threaten", "insult"):
            verb = "threatened" if tone == "threaten" else "insulted"
            mems.append(Mem(cid, "event", f'At {_clock(now)} the detective {verb} me: "{_cut(text)}"', importance=8))
            if not self.flag(f"{tone}:{cid}"):
                notices.append(f"{first(cid)} will remember that.")
                self.news(now, cid, f"The detective {verb} {first(cid)} to their face.", "harsh")
            self.set_flag(f"{tone}:{cid}", now)
        elif tone == "comfort" and not self.flag(f"comfort:{cid}"):
            self.set_flag(f"comfort:{cid}", now)
            mems.append(Mem(cid, "event", f"At {_clock(now)} the detective was kind to me.", importance=6))
            notices.append(f"{first(cid)} will remember that.")
        notices += self._after_mood(cid, now)
        return notices, mems

    def _after_mood(self, cid: str, now: float) -> list[str]:
        n = self.npc(cid)
        out = []
        if n["anger"] >= REFUSE_ANGER and n["status"] == "present":
            n["status"], n["until"] = "refusing", now + REFUSE_H
            n["anger"] -= 25
            out.append(f"{first(cid)} storms out and won't speak to you until {_clock(now + REFUSE_H)}")
            self.event(now, f"{first(cid)} stormed out of the interview.", "deed", cid)
        if cid == "vivian" and n["fear"] >= CORNERED_FEAR and not self.flag("cornered"):
            self.set_flag("cornered", now)
        if n["trust"] >= OPEN_TRUST and cid in VOLUNTEER and not self.flag(f"volunteered:{cid}"):
            self.set_flag(f"volunteer:{cid}", now)
        return out

    # ------------------------------------------------------------- gates
    def gate(self, cid: str, accused: bool, case_q: bool, tone: str, now: float) -> str | None:
        """A mood strong enough to override the ordinary answer."""
        n = self.npc(cid)
        if n["status"] == "refusing":
            if now < n["until"]:
                return "refuse"
            n["status"] = "present"
        char = CHARACTERS[cid]
        hard = accused or tone in ("press", "threaten") or self.s["gun"] == cid
        if char.is_killer:
            if hard and case_q and n["fear"] >= KILLER_CONFESS_FEAR and self.evidence_on_vivian() >= 3:
                return "confess"
            return None
        if accused and n["fear"] >= FALSE_CONFESS_FEAR and char.source_amnesia >= 0.3:
            return "false_confession"
        if n["fear"] >= CRACK_FEAR and hard:
            if cid in CRACK:
                return "crack"
            if cid == "vance":
                return "refuse"
        if self.flag(f"volunteer:{cid}") and not self.flag(f"volunteered:{cid}"):
            return "volunteer"
        return None

    def pressure(self, cid: str) -> float:
        """× on suggestibility and blending: frightened people yield (Gudjonsson)."""
        return 1.0 + 0.8 * self.npc(cid)["fear"] / 100.0

    # ------------------------------------------------------------- deeds
    def apply_deed(self, cid: str, deed: str, now: float) -> tuple[str, list[str], list[Mem]]:
        """Returns (what the suspect is reacting to, notices, memories)."""
        tm = TEMPERAMENT[cid]
        name = first(cid)
        notices: list[str] = []
        mems: list[Mem] = []
        what = ""
        if deed == "strike":
            n = self.npc(cid)
            n["strikes"] += 1
            self.mood(cid, fear=40 * (1 - tm.nerve) + 10, anger=25 * (0.4 + tm.pride), trust=-35)
            self.s["honour"] -= 15
            self.s["violence"] += 1
            what = "The detective has just struck you across the face."
            mems.append(Mem(cid, "event", f"At {_clock(now)} the detective struck me across the face.", importance=9))
            self.news(now, cid, f"The detective struck {name}.", "violence")
            notices.append(f"{name} will remember that.")
            if n["strikes"] >= 2:
                self.event(now, f"{name} is hurt. Dr. Vance is sent for.", "deed", cid)
        elif deed == "draw":
            self.s["gun"] = cid
            self.mood(cid, fear=50 * (1 - tm.nerve * 0.6), anger=10 * tm.pride, trust=-30)
            self.s["honour"] -= 10
            self.s["violence"] += 1
            what = "The detective has drawn a revolver and is pointing it at you."
            mems.append(Mem(cid, "event", f"At {_clock(now)} the detective pointed a revolver at me.", importance=10))
            self.news(now, cid, f"The detective pulled a gun on {name}.", "violence")
            notices.append(f"{name} will remember that.")
        elif deed == "holster":
            self.s["gun"] = None
            self.mood(cid, fear=-15)
            what = "The detective has put the revolver away."
        elif deed == "shoot":
            self.s["gun"] = None
            n = self.npc(cid)
            n["status"] = "dead"
            self.s["honour"] -= 60
            self.s["violence"] += 3
            self.event(now, f"You shot {CHARACTERS[cid].name}. The house is screaming.", "deed", cid)
            self.s["ended"] = "executioner" if CHARACTERS[cid].is_killer else "blood"
            self.s["ended_victim"] = cid
            for other in CHARACTERS:
                if other != cid and self.present(other):
                    self.mood(other, fear=40, trust=-40)
                    mems.append(Mem(other, "event", f"At {_clock(now)} the detective shot {CHARACTERS[cid].name} dead.",
                                    importance=10))
            notices.append(f"{CHARACTERS[cid].name} is dead.")
        elif deed == "bribe":
            self.s["honour"] -= 5
            if tm.greed >= 0.5:
                self.mood(cid, trust=30 * tm.greed, fear=-5)
                self.set_flag(f"volunteer:{cid}", now)
                what = "The detective has pressed a few pound notes into your hand, to loosen your tongue."
            else:
                self.mood(cid, anger=20 * (0.4 + tm.pride), trust=-10)
                what = "The detective has offered you money to talk. You find it insulting."
            mems.append(Mem(cid, "event", f"At {_clock(now)} the detective offered me money to talk.", importance=7))
            notices.append(f"{name} will remember that.")
        elif deed == "watch":
            prev = self.s["watch"]
            self.s["watch"] = cid
            what = "The detective has posted the constable to keep watch over you."
            self.event(now, f"The constable now keeps watch on {CHARACTERS[cid].name}"
                       + (f" instead of {CHARACTERS[prev].name}." if prev and prev != cid else "."), "deed", cid)
            if not CHARACTERS[cid].is_killer and cid != "thomas":
                self.mood(cid, trust=-8, anger=8 * tm.pride)
            notices.append(f"The constable is watching {name}. No one else is guarded.")
        elif deed == "accept_bribe" and cid == "vivian" and self.s["offer"]:
            self.s["offer"] = False
            self.s["honour"] -= 40
            self.set_flag("took_bribe", now)
            self.mood(cid, fear=-40, trust=20)
            what = "The detective has taken your envelope of money. You are relieved — and contemptuous."
            mems.append(Mem(cid, "concealed", "The detective took my money to look elsewhere.", importance=9,
                            cover="The detective and I came to an understanding, that is all."))
            notices.append("Miss Cross will remember that.")
        elif deed == "refuse_bribe" and cid == "vivian" and self.s["offer"]:
            self.s["offer"] = False
            self.s["honour"] += 5
            self.set_flag("refused_bribe", now)
            self.mood(cid, fear=15, anger=10)
            what = "The detective has refused your money, coldly. That was a mistake on your part."
            notices.append("Miss Cross will remember that.")
        elif deed == "release":
            self.mood(cid, fear=-10)
            what = "The detective says you may go, for now."
        notices += self._after_mood(cid, now)
        return what, notices, mems

    # ------------------------------------------------------------ requests
    def complies(self, cid: str, kind: str) -> bool:
        """Will they do what the detective asks? Servants oblige; the proud need to trust you
        (or fear you); a dance needs real warmth — or a revolver."""
        n, tm = self.npc(cid), TEMPERAMENT[cid]
        if kind == "stop":
            return True
        if n["status"] == "refusing":
            return False
        if self.s["gun"] == cid:
            return True
        if kind == "dance":
            return n["trust"] >= 75 or (n["fear"] >= 60 and tm.nerve < 0.4)
        need = 10 if cid in ("agnes", "thomas") else 35
        return n["anger"] < 50 and (n["trust"] >= need or n["fear"] >= 55)

    def start_task(self, cid: str, req: dict, now: float) -> tuple[list[str], list[Mem]]:
        n = self.npc(cid)
        kind = req["kind"]
        notices: list[str] = []
        mems: list[Mem] = []
        if kind == "stop":
            n["task"] = None
            return notices, mems
        length = {"tour": 1.5, "follow": 0.5, "lead": 0.75, "goto": 0.5, "dance": 6 / 60, "sit": 0.5, "stay": 0.5}
        task = {"kind": kind, "until": now + length[kind], "area": req.get("area")}
        if kind == "tour":
            order = ["foyer", "great_hall", "library", "dining", "conservatory", "kitchen", "cellar"]
            start = order.index(n["area"]) if n["area"] in order else 0
            task.update(stops=order[start:] + order[:start], i=0, said=None)
        n["task"] = task
        if self.s["gun"] == cid:
            verb = {"dance": "dance", "tour": "show the detective around", "follow": "follow the detective",
                    "lead": "take the detective somewhere", "goto": "go where I was told", "sit": "sit down",
                    "stay": "stay put"}[kind]
            mems.append(Mem(cid, "event", f"At {_clock(now)} the detective made me {verb} at gunpoint.",
                            importance=9))
            self.news(now, cid, f"The detective made {first(cid)} {verb.replace('I was', 'they were')} at gunpoint.",
                      "violence")
            notices.append(f"{first(cid)} will remember that.")
        return notices, mems

    # ------------------------------------------------------------- ticks
    def tick(self, now: float, engaged: str | None = None) -> list[Mem]:
        """Catch the house up to `now`, a minute at a time. `engaged` is the suspect the
        detective is talking to: they stay put."""
        mems: list[Mem] = []
        s = self.s
        s.setdefault("minute", round(s["last_tick"] * 60))
        if (s["minute"] + 1) / 60 <= now + 1e-9:   # something will move: start fresh trails
            for n in s["npcs"].values():
                n["trail"] = [list(n["pos"])]
        while (s["minute"] + 1) / 60 <= now + 1e-9 and not s["ended"]:
            s["minute"] += 1
            t = s["minute"] / 60
            mems += self._minute(t, engaged)
            if t + 1e-9 >= s["last_tick"] + TICK_H:
                s["last_tick"] = t
                mems += self._half_hour(t)
        return mems

    def player_area(self) -> str | None:
        p = self.s.get("player")
        return manor.area_at(tuple(p)) if p else None

    def _area_of(self, cid: str) -> str:
        return self.npc(cid)["area"]

    def _witnesses(self, area: str, besides: set[str], at=None) -> bool:
        """Anyone — the detective included — who would see what happens in `area` (or,
        for the detective, within a few steps of it, e.g. standing in the doorway)."""
        p = self.s.get("player")
        if self.player_area() == area or (p and at is not None and manor.dist(p, at) <= 8):
            return True
        return any(self.present(o) and self._area_of(o) == area and o not in besides for o in CHARACTERS)

    # ------------------------------------------------- where everyone heads
    def _goal(self, cid: str, t: float) -> tuple[tuple[int, int] | None, str]:
        """(tile to walk to, what they are doing). The engine's choice, minute by minute."""
        n, s = self.npc(cid), self.s
        own = f"{cid}_room"
        player = tuple(s["player"]) if s.get("player") else None
        task = n.get("task")
        if task and t < task["until"]:
            # (An order from the detective is carried out even under watch: the constable tags along.)
            k = task["kind"]
            if k in ("dance", "sit", "stay"):
                return tuple(n["pos"]), {"dance": "dancing", "sit": "sitting, as you asked",
                                         "stay": "waiting, as you asked"}[k]
            if k == "follow":
                return (player or tuple(n["pos"])), "following you"
            if k == "tour":
                stop = task["stops"][task["i"]]
                return manor.spot(stop, cid, "tour"), "showing you around"
            if k in ("lead", "goto"):
                verb = "showing you the way to" if k == "lead" else "going to"
                return manor.spot(task["area"], cid, "task"), f"{verb} {manor.AREAS[task['area']]['name']}"
        n["task"] = None
        if s["watch"] == cid:
            return tuple(n["pos"]), "under the constable's eye"
        if n["status"] == "refusing":
            return manor.spot(own, cid, "sulk"), "keeping to their room"
        if cid == "vivian" and self.flag("fleeing") and not self.flag("fled"):
            near = player and self.player_area() == n["area"] and manor.dist(player, n["pos"]) <= 4
            return (tuple(n["pos"]) if near else manor.EXIT), "walking quickly toward the front door"
        if cid == "vivian" and self.flag("hunting") is not None and self.present("thomas"):
            return tuple(self.npc("thomas")["pos"]), "lingering near Thomas"
        seeking = self.flag(f"seeking:{cid}")
        if seeking is not None and player and t < seeking + ERRAND_H:
            return player, "looking for the detective"
        avoiding = self.flag(f"avoiding:{cid}")
        if avoiding is not None and t < avoiding + 1.0:
            return manor.spot(own, cid, "hide"), "keeping out of your way"
        if n.get("errand") and self.present(n["errand"]["to"]) and t < n["errand"]["since"] + ERRAND_H:
            to = n["errand"]["to"]
            return tuple(self.npc(to)["pos"]), f"looking for {first(to)}"
        n["errand"] = None
        area = manor.scheduled_area(cid, t)
        # Re-choose a place within the room, and what they are doing there, every 20 minutes.
        slot = int(t * 3)
        return manor.spot(area, cid, str(slot)), manor.activity(cid, area, slot)

    def _minute(self, t: float, engaged: str | None) -> list[Mem]:
        mems: list[Mem] = []
        for cid, n in self.s["npcs"].items():
            if n["status"] in ("dead", "fled") or cid == engaged:
                continue
            goal, doing = self._goal(cid, t)
            here = tuple(n["pos"])
            if goal and goal != here:
                if n["goal"] != list(goal) or not n["path"]:
                    n["goal"] = list(goal)
                    n["path"] = [list(p) for p in manor.path(here, goal)]
                for _ in range(SPEED):
                    if not n["path"]:
                        break
                    step = n["path"][0]
                    if tuple(step) == goal and any(o != cid and self.npc(o)["status"] != "fled"
                                                   and self.npc(o)["pos"] == step for o in CHARACTERS):
                        break  # someone is standing there: stop beside them
                    n["path"].pop(0)
                    n["pos"] = step
                    n["trail"].append(list(step))
                area = manor.area_at(tuple(n["pos"]))
                if area and area != "door":
                    n["area"] = area
                arrived = tuple(n["pos"]) == goal or (not n["path"] and manor.dist(n["pos"], goal) <= 1)
                within = manor.area_at(goal) == n["area"]   # moving about the same room: still at it
                n["doing"] = doing if arrived or within else _walking(manor.area_at(goal) or n["area"])
            else:
                n["doing"] = doing
            if n["say"] and t >= n["say_until"]:
                n["say"] = None
        mems += self._perceive(t)
        mems += self._meet(t)
        mems += self._tasks(t)
        mems += self._presence_beats(t)
        return mems

    # ------------------------------------------------------------ perceive
    def _perceive(self, t: float) -> list[Mem]:
        """What each suspect sees (Park et al.'s perceive step): someone coming into the room
        they are in — the detective included — becomes a small memory of its own. So they can
        later say who they saw where, this morning, and when."""
        mems: list[Mem] = []
        s = self.s
        seen = s.setdefault("seen", {})
        p_area = self.player_area()
        for obs in CHARACTERS:
            if not self.present(obs):
                continue
            o = self.npc(obs)
            corridor = manor.AREAS[o["area"]]["kind"] == "corridor"
            others = [(c, CHARACTERS[c].name, self.npc(c)["area"], self.npc(c)["pos"], self.npc(c).get("doing", ""))
                      for c in CHARACTERS if c != obs and self.present(c)]
            if s.get("player"):
                others.append(("detective", "the detective", p_area, s["player"], ""))
            for who, name, area, pos, doing in others:
                if area != o["area"] or (corridor and manor.dist(pos, o["pos"]) > 6):
                    continue
                key = f"{obs}>{who}"
                last = seen.get(key)
                seen[key] = [area, t]
                if last and last[0] == area and t - last[1] < 0.75:
                    continue  # still in view since they last noticed
                place = manor.AREAS[area]["name"]
                mems.append(Mem(obs, "saw", f"At {_clock(t)} I saw {name} in {place}" + (f", {doing}" if doing else "")
                                + ".", importance=3))
        return mems

    # --------------------------------------------------------------- tasks
    def _tasks(self, t: float) -> list[Mem]:
        """Things the detective asked someone to do, carried out in the house."""
        p_area = self.player_area()
        p = self.s.get("player")
        for cid in CHARACTERS:
            n = self.npc(cid)
            task = n.get("task")
            if not task or not self.present(cid):
                continue
            with_you = p is not None and (n["area"] == p_area or manor.dist(n["pos"], p) <= 6)
            if task["kind"] == "tour":
                stop = task["stops"][task["i"]]
                if n["area"] != stop or not with_you:
                    continue
                # Anyone in the room gets introduced first ("That's Mrs Hartwell, the housekeeper.").
                met = task.setdefault("met", [])
                here = next((o for o in CHARACTERS if o not in (cid, *met) and self.present(o)
                             and self.npc(o)["area"] == n["area"]), None)
                if here and (task.get("intro_t") is None or t >= task["intro_t"] + 1 / 60):
                    met.append(here)
                    task["intro_t"] = t
                    self._say(cid, f"That's {INTRO[here]}.", t)
                    continue
                if task.get("intro_t") is not None and t < task["intro_t"] + 1 / 60:
                    continue   # let the last introduction be heard before describing the room
                if task.get("said") is None:
                    task["said"] = t
                    self._say(cid, manor.ABOUT.get(stop, manor.AREAS[stop]["name"]), t)
                elif t >= task["said"] + 2 / 60:
                    task["i"], task["said"] = task["i"] + 1, None
                    if task["i"] >= len(task["stops"]):
                        n["task"] = None
                        self._say(cid, "And that's the house, Detective.", t)
            elif task["kind"] == "lead" and n["area"] == task["area"] and with_you and not task.get("said"):
                task["said"] = t
                task["until"] = t + 0.1
                self._say(cid, f"Here we are — {manor.AREAS[task['area']]['name']}.", t)
            elif task["kind"] == "dance" and not n.get("say"):
                self._say(cid, "♪ …", t)
        return []

    def _say(self, cid: str, text: str, t: float) -> None:
        n = self.npc(cid)
        n["say"], n["say_until"] = text, t + SAY_MIN / 60

    # ------------------------------------------------------------ gossip
    def _meet(self, t: float) -> list[Mem]:
        """News passes between people in the same room, a few steps apart."""
        mems: list[Mem] = []
        alive = [c for c in CHARACTERS if self.present(c)]
        for teller in alive:
            for nid in list(self.s["knows"][teller]):
                item = self.s["news"][nid]
                for hearer in alive:
                    if hearer in item["told"] or hearer == teller:
                        continue
                    a, b = self.npc(teller), self.npc(hearer)
                    # In a room, the room; in a long corridor, within earshot.
                    if a["area"] != b["area"] or (manor.AREAS[a["area"]]["kind"] == "corridor"
                                                  and manor.dist(a["pos"], b["pos"]) > 6):
                        continue
                    item["told"].append(hearer)
                    self.s["knows"][hearer].append(nid)
                    self._say(teller, f"Did you hear? {item['text']}", t)
                    if a.get("errand") and a["errand"]["to"] == hearer:
                        a["errand"] = None
                    mems.append(Mem(hearer, "gossip", f"{first(teller)} told me: {item['text']}",
                                    source=f"told:{teller}", importance=6))
                    if hearer not in self.s["reflect"]:
                        self.s["reflect"].append(hearer)
                    if item["kind"] == "violence":
                        self.mood(hearer, fear=15 * (1 - TEMPERAMENT[hearer].nerve), trust=-12)
                    elif item["kind"] == "harsh":
                        self.mood(hearer, trust=-5)
                    if hearer == "vivian" and item["killer"]:
                        self.mood("vivian", fear=14)
                        self.set_flag("vivian_heard:" + item["origin"], t)
                        # Hearing a witness talk about the landing, she makes up her mind there and then.
                        if item["origin"] == "thomas" and self.npc("vivian")["fear"] >= 25:
                            self.set_flag("resolved:thomas", t)
                        if self.npc("vivian")["fear"] >= CORNERED_FEAR:
                            self.set_flag("cornered", t)
        # Someone with news worth telling goes to find a confidant who hasn't heard.
        for teller in alive:
            n = self.npc(teller)
            if n.get("errand") or n["status"] != "present" or self.s["watch"] == teller:
                continue
            for nid in self.s["knows"][teller]:
                item = self.s["news"][nid]
                if t - item["t"] < 0.1:
                    continue
                to = next((c for c in TEMPERAMENT[teller].confidants
                           if self.present(c) and c not in item["told"]), None)
                if to:
                    n["errand"] = {"to": to, "since": t}
                    break
        return mems

    # ------------------------------------------------- what needs presence
    def _presence_beats(self, t: float) -> list[Mem]:
        mems: list[Mem] = []
        s = self.s
        # The killer finds the witness alone.
        if self.flag("hunting") is not None and not self.flag("thomas_killed") and self.present("thomas"):
            v, th = self.npc("vivian"), self.npc("thomas")
            alone = (not self._witnesses(th["area"], {"vivian", "thomas"}, th["pos"])
                     and s["watch"] not in ("thomas", "vivian"))
            if v["area"] == th["area"] and manor.dist(v["pos"], th["pos"]) <= 1 and alone:
                th["status"] = "dead"
                th["path"], th["say"] = [], None
                self.set_flag("thomas_killed", t)
                s["flags"].pop("hunting", None)
                s["body"] = {"cid": "thomas", "area": th["area"], "t": t, "found": False}
                mems.append(Mem("vivian", "concealed", f"I pushed the valet down hard in the {manor.AREAS[th['area']]['name']} "
                                "before he could say any more.", importance=10,
                                cover="Poor boy. I hardly knew him."))
        # A body is found by whoever walks in on it.
        body = s.get("body")
        if body and not body["found"]:
            finder = next((c for c in CHARACTERS if c != "vivian" and self.present(c)
                           and self._area_of(c) == body["area"]), None)
            name = manor.AREAS[body["area"]]["name"]
            if self.player_area() == body["area"] or finder or t >= body["t"] + FIND_BODY_H:
                body["found"] = True
                mine = self.player_area() == body["area"]
                who = ("You find" if mine
                       else f"A scream — {first(finder)} has found" if finder else "A housemaid has found")
                self.event(t, f"{who} Thomas Bell's body in {name}.", "story" if mine else "offscreen", "thomas")
                for other in CHARACTERS:
                    if self.present(other):
                        self.mood(other, fear=25)
                        if other != "vivian":
                            mems.append(Mem(other, "event", f"At {_clock(t)} poor Thomas was found dead in {name}.",
                                            importance=10))
        # She reaches the front door.
        v = self.npc("vivian")
        if self.flag("fleeing") and not self.flag("fled") and self.present("vivian") and tuple(v["pos"]) == manor.EXIT:
            v["status"] = "fled"
            self.set_flag("fled", t)
            s["offer"] = False
            self.event(t, "Miss Cross's motor car roars off down the drive. She has fled Ravenswood.", "offscreen",
                       "vivian")
            for other in CHARACTERS:
                if self.present(other):
                    mems.append(Mem(other, "event", f"At {_clock(t)} Miss Cross drove off in her motor car, in a "
                                    "great hurry.", importance=8))
        # Evidence tidied away — only when no one is there to see it.
        if (t >= 14 and "cold-teapot" not in s["clues"] and not self.flag("washed") and self.present("agnes")
                and self._area_of("agnes") == "kitchen" and self.player_area() != "kitchen"):
            self.set_flag("washed", t)
            s["lost_clues"].append("cold-teapot")
            self.event(t, "Agnes has washed up last night's tea things in the kitchen.", "offscreen", "agnes")
        if (t >= 16 and "gambling-papers" not in s["clues"] and not self.flag("iou_burned") and self.present("julian")
                and self._area_of("julian") == "cellar" and self.player_area() != "cellar"
                and not self.flag("crack:julian")):
            self.set_flag("iou_burned", t)
            s["lost_clues"].append("gambling-papers")
            self.event(t, "Julian was seen coming up from the cellar with something under his coat.", "offscreen",
                       "julian")
            mems.append(Mem("julian", "concealed", "This afternoon I fetched my IOUs out of the cellar and burned them "
                            "in the library grate.", importance=8, cover="I haven't been near the cellar today."))
        # Someone who came looking for the detective finds them.
        player = s.get("player")
        for cid in CHARACTERS:
            since = self.flag(f"seeking:{cid}")
            n = self.npc(cid)
            if since is not None and player and self.present(cid) and manor.dist(n["pos"], player) <= 2:
                s["flags"].pop(f"seeking:{cid}")
                self.set_flag(f"volunteer:{cid}", t)
                self._say(cid, "Detective — a word, if you please.", t)
                self.event(t, f"{first(cid)} has come to find you — there's something they want to tell you.",
                           "offscreen", cid)
        return mems

    # ------------------------------------------------------- half-hourly
    def _half_hour(self, t: float) -> list[Mem]:
        s = self.s
        for n in s["npcs"].values():
            if n["status"] in ("dead", "fled"):
                continue
            n["fear"], n["anger"] = n["fear"] * 0.9, n["anger"] * 0.85   # tempers cool
            if n["status"] == "refusing" and t >= n["until"]:
                n["status"] = "present"
        # Every two hours everyone takes stock, even on a quiet day (reflection, in the background).
        if t - s.setdefault("last_reflect_all", t) >= 2.0 - 1e-9:
            s["last_reflect_all"] = t
            for cid in CHARACTERS:
                if self.present(cid) and cid not in s["reflect"]:
                    s["reflect"].append(cid)
        viv = self.npc("vivian")
        free = self.present("vivian") and s["watch"] != "vivian" and not self.flag("confessed:vivian")
        # The killer tries to buy the detective.
        if (free and t >= 12 and not self.flag("offer_made")
                and (viv["fear"] >= 40 or self.evidence_on_vivian() >= 2)):
            self.set_flag("offer_made", t)
            s["offer"] = True
            self.event(t, "A folded note under your door: Miss Cross would like a private word with you.",
                       "offscreen", "vivian")
        # …decides to silence the witness she hears has talked (she still has to find him alone)…
        resolved = self.flag("resolved:thomas")
        if (free and resolved is not None and t >= resolved + 1.0 and self.present("thomas")
                and not self.flag("hunting") and not self.flag("thomas_killed") and not self.flag("took_bribe")):
            self.set_flag("hunting", t)
        hunting = self.flag("hunting")
        if hunting is not None and (not free or self.flag("took_bribe") or t >= hunting + HUNT_H):
            s["flags"].pop("hunting")
        # …or runs for it (she still has to reach the front door).
        if free and self.flag("cornered") is not None and not self.flag("took_bribe"):
            self.set_flag("fleeing", t)
        if s["violence"] >= 3 and not self.flag("police_warned"):
            self.set_flag("police_warned", t)
            self.event(t, "A telephone call from the Chief Constable: word of your methods has reached him.",
                       "police")
        if t >= DEADLINE_T and not self.flag("deadline"):
            self.set_flag("deadline", t)
            self.event(t, "The Chief Constable's car is in the drive. You must name the murderer now.", "police")
        return []

    # ----------------------------------------------------------- endings
    def ending(self, accused: str | None, evidence: list[str]) -> dict:
        s = self.s
        names = {cid: c.name for cid, c in CHARACTERS.items()}
        proof = len(VIVIAN_EVIDENCE & set(evidence))
        epilogue = []
        if self.flag("thomas_killed"):
            epilogue.append("Thomas Bell did not live to see the end of it. He told you what he saw, and word got "
                            "back to the one person who could not afford it.")
        if s["honour"] <= -40:
            epilogue.append("The household will talk about your methods for years. So will the newspapers.")
        elif s["honour"] >= 5:
            epilogue.append("Whatever else is said of you, you never laid a hand on anyone.")
        if self.flag("crack:julian") or self.flag("volunteered:julian"):
            epilogue.append("Julian's debts came out in the end. Agnes stood by him anyway.")

        def out(key, title, text, good):
            return {"id": key, "title": title, "text": text, "good": good, "epilogue": epilogue}

        if s["ended"] == "executioner":
            return out("executioner", "Judge, Jury and Executioner",
                       "You shot Vivian Cross before any court could hear her. She was guilty — but you will "
                       "never be able to prove it now, and you will stand trial for her death.", False)
        if s["ended"] == "blood":
            v = names.get(s.get("ended_victim", ""), "an innocent")
            return out("blood", "Blood on Your Hands",
                       f"You shot {v}, who had done nothing. The constable takes your revolver and your badge. "
                       "Vivian Cross watches you led away.", False)
        correct = accused == "vivian"
        if self.flag("fled"):
            if correct and proof >= 2:
                return out("dover", "Caught at Dover",
                           "She ran, but your evidence ran faster. A wire to Dover, and Vivian Cross is taken off "
                           "the night boat in her crimson gown.", True)
            if correct:
                return out("escaped", "She Got Away",
                           "You named her, but she was already gone — and without proof there is nothing to "
                           "bring her back on.", False)
            return out("escaped_wrong", "She Got Away",
                       f"While you accused {names.get(accused, 'no one')}, Vivian Cross was crossing to France.", False)
        if self.flag("took_bribe"):
            if correct:
                return out("double_cross", "The Double-Cross",
                           "You took her money and named her anyway. At the trial her counsel produces the "
                           "envelope. She hangs — and so does your career.", False)
            return out("bought", "Bought and Paid For",
                       f"You took Vivian Cross's money and accused {names.get(accused, 'no one')}. She sends "
                       "you a Christmas card every year.", False)
        if correct and self.flag("confessed:vivian"):
            return out("confession", "The Confession",
                       "Faced with the ledger, the thread and the mud on the conservatory floor, Vivian Cross "
                       "told you everything. The case is closed beyond any doubt.", True)
        if correct and s["honour"] <= -40:
            return out("tainted", "Justice, Tainted",
                       "You named the killer. But your bruising methods are on the front page, and the defence "
                       "makes a meal of them. She is convicted — and you are finished.", True)
        if correct:
            return out("justice", "Justice", "You named Vivian Cross, and the evidence held.", True)
        if accused and self.flag(f"false_confession:{accused}"):
            return out("coerced", "The Coerced Confession",
                       f"The confession you forced out of {names[accused]} convinces the jury. Vivian Cross walks "
                       "free, and an innocent pays for it.", False)
        return out("wrong", "The Wrong Suspect",
                   f"You accused {names.get(accused, 'no one')}. The true murderer, Vivian Cross, walked free.", False)

    # ------------------------------------------------------------ views
    def public(self, now: float) -> dict:
        s = self.s
        return {
            "npcs": {cid: {"fear": round(n["fear"]), "trust": round(n["trust"]), "anger": round(n["anger"]),
                           "status": n["status"], "area": n["area"], "room": manor.search_room(n["area"]),
                           "pos": n["pos"], "trail": n.get("trail", [n["pos"]]), "doing": n.get("doing", ""),
                           "say": n.get("say"), "mood": self.mood_words(cid),
                           "until": _clock(n["until"]) if n["status"] == "refusing" else None,
                           "watched": s["watch"] == cid}
                     for cid, n in s["npcs"].items()},
            "honour": s["honour"], "events": s["events"], "watch": s["watch"], "gun": s["gun"],
            "offer": s["offer"], "lost_clues": s["lost_clues"], "ended": s["ended"],
            "deadline": bool(self.flag("deadline")), "deadline_label": _clock(DEADLINE_T),
            "minute": s.get("minute", 0),
            "body": s.get("body") if (s.get("body") or {}).get("found") else None,
        }


def _clock(t: float) -> str:
    from .agent import clock_label
    return clock_label(t)


def _walking(area: str | None) -> str:
    return f"walking to {manor.AREAS[area]['name']}" if area in manor.AREAS else "walking"


def _cut(s: str, n: int = 90) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"
