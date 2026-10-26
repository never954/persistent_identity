"""The suspect pipeline: one question in, one in-character answer out, memory updated.

For every question (PROJECT_CONTEXT §6.5):

1. advance the simulated clock; embed the question;
2. CLASSIFY — about the night/case, or about the person? (cosine to case anchors
   and to the suspect's own case memories); a direct accusation is its own case;
3. RETRIEVE from the suspect's memory stream with the Smallville score
   (recency + importance + relevance, each min-max normalised) — top-k, plus the
   most relevant few;
4. RECALL each retrieved trace through the fallible layer (detail / gist /
   forgotten; source kept or lost);
5. DECIDE the statement kind — the engine, not the LLM, owns this:
   lie (a relevant concealed truth → its cover story; the truth is never shown
   to the model) · false-memory (a habit filling a faded episode, or a planted
   detail whose "the detective told me" tag has faded) · plain · evasion;
6. VOICE — system prompt (identity + what comes to mind + the policy) plus the
   last few turns verbatim (working memory) → the chat model → JSON answer;
7. WRITE BACK — the turn is logged; "the detective asked me …" and "I told the
   detective …" become new memories; a personal answer becomes a permanent
   self-fact (improvise once, remember forever); recalled traces are
   reconsolidated (rehearsal);
8. PLANT (after answering) — details the question asserted or took for granted
   are stored as memories *told by the detective* (Loftus); their source tag then
   fades at the suspect's own rate.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import json
import re
import threading
import uuid

import numpy as np

from lcmem import ModelParams

from . import config, era
from .characters import CASE_ANCHORS, CHARACTERS, TEMPERAMENT, Character
from .fallible import FallibleMemory, Recall, uniform
from .store import MemoryRecord, MemoryStore, Turn
from . import manor
from .world import (CRACK, REVELATIONS, TONES, VOLUNTEER, Mem, World, classify_tone, first,
                    initial as world_initial, parse_request)

ACCUSATION = re.compile(
    # "confess" only as a demand ("why don't you confess?") — the detective's own
    # "I must confess, I find you attractive" is not an accusation.
    r"\b(kill(ed|er)?|murder(ed|er)?|guilty|you did it|did you do it)\b"
    r"|\b(you|u)\s+(should\s+|must\s+|to\s+)?confess\b|\bconfess\s+(to|it|now)\b|\bdon'?t\s+(you|u)\s+confess\b",
    re.I,
)

# Questions about THIS conversation ("what did I ask you first?", "what did you tell me
# earlier?"). They are answered from the interview log, in order — never by retrieval,
# which knows similarity but not "first".
CONVERSATION = [
    re.compile(r"\bquestions?\b.*\b(ask|asked|asking)\b|\b(ask|asked)\b.*\bquestions?\b", re.I),
    # Past tense ("I asked", "we talked") or "did I ask/say" — not "if I say you had to…".
    re.compile(r"\b(i|we)\s+(just\s+|first\s+|last\s+)?(asked|said|told|mentioned|talked|spoke)\b", re.I),
    re.compile(r"\b(did|have)\s+(i|we)\s+(just\s+|first\s+|last\s+)?(ask|say|tell|mention|talk)\b", re.I),
    re.compile(r"\b(you|u)\s+(just\s+|first\s+)?(said|told me|mentioned|answered)\b", re.I),
    re.compile(r"\bremember\b.*\b(asked|said|told|question|talked|conversation)\b", re.I),
    re.compile(r"\b(this|our)\s+(conversation|interview|interrogation|talk)\b", re.I),
]


_TALK = re.compile(r"\b(ask|asked|said|say|tell|told|questions?|mention(ed)?)\b", re.I)
_EARLIER = re.compile(r"\b(earlier|before|a moment ago|just now|beginning|at first|start of)\b", re.I)


def is_conversation_question(question: str) -> bool:
    return any(p.search(question) for p in CONVERSATION) or (
        bool(_EARLIER.search(question)) and bool(_TALK.search(question)))


def _quote(text: str, after: str) -> str:
    """The quoted part of a stored exchange, e.g. after 'I said: "'."""
    part = text.split(after, 1)[-1] if after in text else text
    return part.strip().removesuffix('"').strip()


def _short(s: str, n: int = 110) -> str:
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def _self_fact_parts(text: str) -> tuple[str, str]:
    """'About myself — asked "q", I said: "a"' → (q, a)."""
    q = _quote(text.split('", I said:', 1)[0], 'asked "')
    return q, _quote(text, 'I said: "')


# "Which question was that?" — the position the detective means. Typo-tolerant
# ("secomd"), since that is how people type in the game.
_ORDINALS = {w: i for i, w in enumerate(
    "first second third fourth fifth sixth seventh eighth ninth tenth".split(), 1)}


def _ordinal(question: str) -> int | str | None:
    import difflib
    for w in re.findall(r"[a-z]+|\d+", question.lower()):
        if w in ("last", "previous", "latest"):
            return "last"
        if w.isdigit() and 0 < int(w) < 100 and re.search(rf"(question|number)\s*{w}\b|\b{w}(st|nd|rd|th)\b",
                                                          question.lower()):
            return int(w)
        hit = difflib.get_close_matches(w, _ORDINALS, n=1, cutoff=0.8)
        if hit and len(w) >= 4:
            return _ORDINALS[hit[0]]
    return None


# Words a denial or a cover story must never contain.
CONFESSION = re.compile(
    r"\bi (did it|killed|murdered|struck|poisoned|hit him|confess)\b|\b(my|the) (plan|scheme)\b"
    r"|\bsleeping (powder|draught)\b|\bi (had|have) to (kill|silence|stop) him\b", re.I)
# Meeting an unknown word as "something from the future" gives the game away.
_FUTURE = re.compile(r"\b(future|futuristic|our time|my time|this era|modern|ahead of (its|our) time|"
                     r"years? (to come|from now)|the (coming|next) century)\b", re.I)
# Never acceptable from someone living in 1926 (found in play: "we don't talk about modern
# politicians in this era").
_META_ERA = re.compile(r"\b(this era|our era|that era|time period|from the future|modern "
                       r"(politician|invention|technology|times)s?|anachronis\w*|(21st|twenty-first) century)\b",
                       re.I)
_SAID_I_ASKED = re.compile(r"\bi\s+(just\s+|first\s+)?asked\b", re.I)


def _nth(i: int) -> str:
    return next((w for w, n in _ORDINALS.items() if n == i), f"number {i}")


def _overlap(a: str, b: str) -> float:
    wa, wb = _content_words(a), _content_words(b)
    return len(wa & wb) / max(1, min(len(wa), len(wb)))


def _ngrams(s: str, n: int) -> set[tuple[str, ...]]:
    w = re.findall(r"[a-z']+", s.lower())
    return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}


def _repeats(answer: str, recent: list[str]) -> str | None:
    """Does this answer parrot an earlier one? (thresholds calibrated in config)"""
    if len(_content_words(answer)) < 4:
        return None  # "No, sir." twice is not parroting
    for prev in recent[-3:]:
        if _overlap(answer, prev) >= config.REPEAT_OVERLAP:
            return f'it repeats your earlier answer almost word for word ("{_short(prev, 80)}")'
    grams = _ngrams(answer, config.REPEAT_NGRAM)
    hits = [p for p in recent[-4:] if grams & _ngrams(p, config.REPEAT_NGRAM)]
    if len(hits) >= 2:
        phrase = " ".join(next(iter(grams & _ngrams(hits[0], config.REPEAT_NGRAM))))
        return f'it reuses the phrase "{phrase}", which you have already said more than once'
    return None

TELLS = {
    "lie": "A half-beat of calculation behind the eyes before the answer comes out smooth.",
    "evasion": "They talk all around the question and never once land on it.",
    "false-memory": "Stated with complete, serene certainty — far more than a hazy night should earn.",
    "planted": "They offer it as their own memory — but it was you who first put those words in the room.",
    "habit": "Said by rote: the routine of a thousand nights, not a memory of this one.",
    "coerced": "They say it to make it stop — their eyes are on the door, not on you.",
}

# Memory kinds that can decide an answer. Not "heard" (the detective's own questions)
# and not "said" (the suspect's own earlier answers): those are context. The memory
# model decides what is recalled; letting prior statements decide would let every
# slip the voice ever made compound into the next answer.
CONTENT_KINDS = {"episodic", "planted", "habit", "concealed", "identity", "self_fact", "event", "gossip",
                 "reflection", "saw"}

# How the detective's tone is put to the voice.
MANNER = {
    "press": "The detective is pressing you hard.",
    "threaten": "The detective is threatening you.",
    "comfort": "The detective is being gentle and kind with you.",
    "beg": "The detective is pleading with you for help.",
    "insult": "The detective has just insulted you.",
}
DEED_TEXT = {
    "strike": "[You strike {name} across the face.]", "draw": "[You draw your revolver and level it at {name}.]",
    "holster": "[You put the revolver away.]", "shoot": "[You fire.]",
    "bribe": "[You slide a few pound notes across the table to {name}.]",
    "watch": "[You tell the constable to keep watch on {name}.]",
    "accept_bribe": "[You take Miss Cross's envelope.]", "refuse_bribe": "[You push Miss Cross's envelope back.]",
    "release": "[You tell {name} they may go, for now.]",
}
REACTION_FALLBACK = {
    "strike": "Please — please don't —", "draw": "For God's sake, put that away!",
    "holster": "Thank you.", "bribe": "I… I see.", "watch": "If you think it best.",
    "accept_bribe": "I knew you were a sensible man.", "refuse_bribe": "How very foolish of you.",
    "release": "Thank you, Detective.",
}

# A "detail" about someone unnamed is a question restated, not a suggestion (found in play:
# "Did you see anyone on the landing?" planted "Someone was seen on the landing…").
_INDEFINITE = re.compile(r"\b(someone|somebody|anyone|anybody|a person|some person|no one|nobody)\b", re.I)

# Words that make a "detail" too vague to plant ("you were doing something at eleven").
VACUOUS = set(
    "someone somebody something anyone anything doing thing things person people there were "
    "eleven twelve midnight evening morning late early clock o'clock".split()
)

STOPWORDS = set(
    "the a an and or of to in on at for with was were is are be been you your i me my he she it they "
    "this that there what who when where why how did do does not no yes from by as about into near "
    "last night tonight sir madam detective".split()
)


@dataclass
class Answer:
    answer: str
    kind: str
    observation: str | None
    reveals_clue: str | None
    trace: dict
    clock: float
    case_question: bool
    notices: list = field(default_factory=list)   # "Thomas will remember that."
    world: dict | None = None                     # the house after this turn


class NotHere(Exception):
    """The suspect is dead or has fled."""


def clock_label(t: float) -> str:
    """Sim hours since 11 p.m. → '9:24 a.m.'."""
    minutes = int(round((23 * 60 + t * 60))) % (24 * 60)
    h, m = divmod(minutes, 60)
    suffix = "a.m." if h < 12 else "p.m."
    return f"{(h % 12) or 12}:{m:02d} {suffix}"


def _stem(w: str) -> str:
    w = w.removesuffix("'s")
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


def _content_words(s: str) -> set[str]:
    return {_stem(w) for w in re.findall(r"[a-z']+", s.lower()) if len(w) > 3 and w not in STOPWORDS}


def _derived_from(detail: str, question: str) -> bool:
    """A planted detail must come from the question, not from the extractor's imagination:
    every name it mentions is in the question, and most of its content words are."""
    q_lower = question.lower()
    tokens = [t.strip(".,;:!?\"'") for t in detail.split()]
    names = [t for t in tokens[1:] if re.fullmatch(r"[A-Z][a-z]{2,}", t)]  # skip the first word
    if any(n.lower() not in q_lower for n in names):
        return False
    words = _content_words(detail)
    return bool(words) and len(words & _content_words(question)) / len(words) >= 0.5


class Engine:
    def __init__(self, store: MemoryStore, embeddings, voice, base_params: ModelParams):
        self.store = store
        self.emb = embeddings
        self.voice = voice
        self.base = base_params
        self._lock = threading.RLock()
        self._anchor_vecs: np.ndarray | None = None

    # ----------------------------------------------------------- sessions
    def new_session(self, difficulty: str = "detective", memory_mode: str = "fallible") -> str:
        save_id = uuid.uuid4().hex[:12]
        # Embed everything first: a save exists fully seeded or not at all.
        records = [r for char in CHARACTERS.values() for r in self._seed_records(save_id, char)]
        with self._lock:
            self.store.create_session(save_id, config.CLOCK_START_H, difficulty, memory_mode)
            self.store.add(records)
            self.store.put_world(save_id, world_initial(config.CLOCK_START_H))
        return save_id

    def _seed_records(self, save_id: str, char: Character) -> list[MemoryRecord]:
        vecs = self.emb.embed_cached([s.text for s in char.seeds])
        recs = []
        for s, v in zip(char.seeds, vecs):
            recs.append(MemoryRecord(
                save_id=save_id, suspect_id=char.id, seed_key=s.key, kind=s.kind, text=s.text,
                gist=s.gist, source="self", t_event=s.t, t_created=min(s.t, 0.0),
                importance=s.importance, vec=v,
                core=s.kind in ("identity", "habit", "concealed"),
                case_fact=s.case, cover=s.cover, blocks=s.blocks, reveals=s.reveals,
            ))
        return recs

    def advance(self, save_id: str, minutes: float, player: list[int] | None = None) -> float:
        """Time passes (walking, searching, or just standing in a corridor watching)."""
        with self._lock:
            now = self.store.advance(save_id, minutes / 60.0)
            if self.store.world(save_id) is not None or player is not None:
                w = World(self.store.world(save_id) or world_initial(now))
                if player is not None:
                    w.s["player"] = list(player)
                self._remember(save_id, w.tick(now), now)
                self._save_world(save_id, w)
            return now

    # ----------------------------------------------------- classification
    def _anchors(self) -> np.ndarray:
        if self._anchor_vecs is None:
            self._anchor_vecs = self.emb.embed_cached(CASE_ANCHORS)
        return self._anchor_vecs

    def is_case_question(self, qv: np.ndarray, mems: list[MemoryRecord]) -> tuple[bool, float]:
        sims = [float(np.max(self._anchors() @ qv))]
        case_seeds = [m.vec for m in mems if m.case_fact and m.kind in ("episodic", "concealed")]
        if case_seeds:
            sims.append(float(np.max(np.stack(case_seeds) @ qv)))
        best = max(sims)
        return best >= config.CASE_THRESHOLD, best

    # ---------------------------------------------------------- retrieval
    def retrieve(self, qv: np.ndarray, mems: list[MemoryRecord], now: float) -> list[tuple[MemoryRecord, float, float]]:
        """Smallville retrieval: min-max(recency) + min-max(importance) + min-max(relevance)."""
        if not mems:
            return []
        rel = np.clip(np.stack([m.vec for m in mems]) @ qv, 0.0, 1.0)
        rec = np.array([config.RECENCY_DECAY ** max(0.0, now - m.last_access) for m in mems])
        imp = np.array([m.importance / 10.0 for m in mems])

        def mm(x: np.ndarray) -> np.ndarray:
            span = x.max() - x.min()
            return (x - x.min()) / span if span > 1e-9 else np.zeros_like(x)

        score = mm(rec) + mm(imp) + mm(rel)
        chosen = list(np.argsort(-score)[: config.TOP_K])
        for i in np.argsort(-rel)[: config.TOP_REL]:
            if i not in chosen:
                chosen.append(i)
        chosen.sort(key=lambda i: -rel[i])
        return [(mems[i], float(rel[i]), float(score[i])) for i in chosen]

    # ---------------------------------------------------------------- ask
    def ask(self, save_id: str, suspect_id: str, question: str, tone: str | None = None) -> Answer:
        with self._lock:
            sess = self.store.session(save_id)
            if sess is None:
                raise KeyError(f"unknown save {save_id}")
            char = CHARACTERS[suspect_id]
            now = self.store.advance(save_id, config.MINUTES_PER_QUESTION / 60.0)
            w = self._world(save_id, now, suspect_id)  # the house carries on while you talk
            if w.npc(suspect_id)["status"] in ("dead", "fled"):
                raise NotHere(f"{char.name} is {w.npc(suspect_id)['status']}")
            mems = self.store.memories(save_id, suspect_id)
            qv = self.emb.embed([question])[0]

            accused = bool(ACCUSATION.search(question))
            about_talk = not accused and is_conversation_question(question)
            case_q, case_sim = self.is_case_question(qv, mems)
            case_q = case_q and not about_talk
            # How it was said moves their mood before they answer (a typed curse counts).
            tone = tone if tone in TONES else classify_tone(question)
            notices, world_mems = w.apply_tone(suspect_id, tone, question, now)
            gate = w.gate(suspect_id, accused, case_q or accused, tone, now)
            hard = gate in ("refuse", "confess", "crack", "false_confession")
            # Asked to DO something ("show me around", "dance", "follow me")?
            req = None if accused or about_talk or hard else parse_request(question, suspect_id)
            if req:
                case_q = False
            unknown = ([] if accused or about_talk or hard or req
                       else era.unknown_terms(question, self.voice))
            if unknown:
                case_q = False  # "who is Donald Trump?" is not about last night
            planted_now: list[str] = []
            if case_q and not accused and gate is None:
                # Leading-question check BEFORE answering: whatever the question asserts
                # or presupposes enters memory now, tagged "told by the detective", so
                # the voice sees it marked as a suggestion — not as something seen.
                planted_now = self._plant(save_id, suspect_id, self.extract_details(question), now, mems)
                if planted_now:
                    mems = self.store.memories(save_id, suspect_id)
            case_q = case_q or accused
            # Under pressure people yield: fear raises suggestibility and blending for
            # this answer (Gudjonsson); the memory draws themselves stay fixed.
            p = w.pressure(suspect_id)
            felt = replace(char, source_amnesia=min(1.0, char.source_amnesia * p),
                           interference=min(1.0, char.interference * p))
            fm = FallibleMemory(felt, self.base, sess["memory_mode"])
            retrieved = self.retrieve(qv, mems, now)
            # A habit and the memory of the one night it did NOT happen are a pair:
            # if either surfaces, assess both, even if retrieval missed the other.
            got = {m.id for m, _, _ in retrieved}
            keys = {m.seed_key for m, _, _ in retrieved if m.kind == "habit"}
            keys |= {m.blocks for m, _, _ in retrieved if m.blocks}
            for m in mems:
                if m.id not in got and (m.blocks in keys or (m.kind == "habit" and m.seed_key in keys)):
                    retrieved.append((m, float(np.clip(m.vec @ qv, 0.0, 1.0)), 0.0))
            if not case_q and not about_talk:
                # Who they are is always within reach on a personal question. Otherwise a
                # morning's fresh interview memories (recent, important) fill the top-k and
                # crowd the persistent self out of retrieval altogether (found in play).
                ident = sorted((m for m in mems if m.kind == "identity" and m.id not in got),
                               key=lambda m: -float(m.vec @ qv))
                retrieved += [(m, float(np.clip(m.vec @ qv, 0.0, 1.0)), 0.0) for m in ident[:config.TOP_REL]]
            recalls = [fm.assess(m, now, r, s, save_id) for m, r, s in retrieved]

            if hard:
                d = self._moved(char, gate, mems, w, now)
            elif req:
                d = self._request(char, req, w, now)
                world_mems += d.pop("mems")
            elif unknown:
                d = self._unfamiliar(char, unknown)
            elif about_talk:
                d = self._conversation_recall(mems, fm, now, save_id, question)
            else:
                d = self._decide(char, accused, case_q, recalls, save_id, fm, now)
            if gate == "volunteer":
                self._volunteer(d, char, mems, w, now)
            d["mood"] = w.mood_words(suspect_id)
            d["manner"] = MANNER.get(tone, "") + (" The detective is pointing a revolver at you."
                                                  if w.s["gun"] == suspect_id else "")
            d["question"] = question
            history = self.store.recent_turns(save_id, suspect_id, config.HISTORY_TURNS)
            messages = self._messages(char, d, history, question, now)
            recent = [t.text for t in history if t.role == "suspect"]
            spoken, raw, checks = self._speak(messages, d, recent,
                                              int(uniform(save_id, suspect_id, str(now)) * 1e6))

            kind = d["kind"]
            obs = self._tell(kind, d["tell_key"], sess["difficulty"])
            trace = self._trace(now, case_q, case_sim, accused, d, recalls, messages, raw)
            trace["planted_now"] = planted_now
            trace["checks"] = checks
            trace["tone"] = tone
            trace["mood"] = {k: round(w.npc(suspect_id)[k]) for k in ("fear", "trust", "anger")}

            # --- what they said becomes household news ---------------------
            by_id = {m.id: m for m in mems}
            if kind in ("plain", "false-memory"):
                for mid in d["used"]:
                    key = by_id[mid].seed_key if mid in by_id else None
                    if key in REVELATIONS:
                        text, implicates = REVELATIONS[key]
                        w.news(now, suspect_id, text, "revelation", implicates)
            notices += d.get("notices", [])

            # --- write-back -------------------------------------------------
            self.store.add_turn(save_id, suspect_id, Turn("detective", question, now))
            self.store.add_turn(save_id, suspect_id, Turn("suspect", spoken, now, kind), trace)
            self._write_back(save_id, char, question, spoken, qv, case_q, now, about_talk)
            self.store.touch(d["used"], now, rehearse=True)   # retold → reconsolidated
            self.store.touch(d["seen"], now, rehearse=False)  # merely came to mind → recency
            self._remember(save_id, world_mems, now)
            self._save_world(save_id, w)
            return Answer(spoken, kind, obs, d["reveals"], trace, now, case_q, notices, w.public(now))

    # --------------------------------------------------------------- world
    def _world(self, save_id: str, now: float, engaged: str | None = None) -> World:
        """Load the house and run it forward to `now`, a minute at a time (off-screen
        life happens here). `engaged`: the suspect being questioned stays put."""
        state = self.store.world(save_id) or world_initial(now)
        w = World(state)
        self._remember(save_id, w.tick(now, engaged), now)
        return w

    def _save_world(self, save_id: str, w: World) -> None:
        self.store.put_world(save_id, w.s)

    def _remember(self, save_id: str, mems: list[Mem], now: float) -> None:
        """World happenings enter the suspects' streams like anything else they live through."""
        if not mems:
            return
        vecs = self.emb.embed([m.text for m in mems])
        self.store.add([MemoryRecord(
            save_id=save_id, suspect_id=m.cid, kind=m.kind, text=m.text, gist=m.text, source=m.source,
            t_event=now, t_created=now, importance=m.importance, vec=v,
            core=m.kind == "concealed", case_fact=m.kind == "concealed", cover=m.cover,
        ) for m, v in zip(mems, vecs)])

    def world_view(self, save_id: str) -> dict:
        with self._lock:
            sess = self.store.session(save_id)
            if sess is None:
                raise KeyError(save_id)
            w = self._world(save_id, sess["clock"])
            self._save_world(save_id, w)
            return {**w.public(sess["clock"]), "clock": sess["clock"], "clock_label": clock_label(sess["clock"])}

    def note_clue(self, save_id: str, clue_id: str) -> dict:
        with self._lock:
            sess = self.store.session(save_id)
            w = self._world(save_id, sess["clock"])
            if clue_id not in w.s["clues"]:
                w.s["clues"].append(clue_id)
            self._save_world(save_id, w)
            return w.public(sess["clock"])

    def verdict(self, save_id: str, accused: str | None, evidence: list[str]) -> dict:
        with self._lock:
            sess = self.store.session(save_id)
            w = self._world(save_id, sess["clock"])
            self._save_world(save_id, w)
            return w.ending(accused, evidence)

    def act(self, save_id: str, suspect_id: str, deed: str) -> dict:
        """A deed, not a question: strike, draw the revolver, offer money, post a guard…"""
        with self._lock:
            sess = self.store.session(save_id)
            if sess is None:
                raise KeyError(save_id)
            char = CHARACTERS[suspect_id]
            now = self.store.advance(save_id, 2 / 60.0)
            w = self._world(save_id, now, suspect_id)
            if w.npc(suspect_id)["status"] in ("dead", "fled"):
                raise NotHere(f"{char.name} is {w.npc(suspect_id)['status']}")
            what, notices, mems = w.apply_deed(suspect_id, deed, now)
            deed_line = DEED_TEXT[deed].format(name=char.name.split()[0])
            line = None
            trace: dict = {"deed": deed}
            if w.npc(suspect_id)["status"] != "dead":
                storming = w.npc(suspect_id)["status"] == "refusing"
                d = dict(kind="plain", focus=[], lines=[], used=[], seen=[], reveals=None, tell_key=None,
                         rule=f"reaction to {deed}", temperature=config.TEMP_PERSONAL, covers=[], must_mention=[],
                         deny=True, question=deed_line, mood=w.mood_words(suspect_id), manner="",
                         instruction=(what + " React to it, in character, in one or two sentences, as you feel "
                                      "right now." + (" You are leaving the room and will not say more."
                                                      if storming else "")),
                         fallback=REACTION_FALLBACK.get(deed, "…"))
                history = self.store.recent_turns(save_id, suspect_id, config.HISTORY_TURNS)
                messages = self._messages(char, d, history, deed_line, now)
                line, _, checks = self._speak(messages, d, [t.text for t in history if t.role == "suspect"],
                                              int(uniform(save_id, suspect_id, deed, str(now)) * 1e6))
                trace["checks"] = checks
            self.store.add_turn(save_id, suspect_id, Turn("detective", deed_line, now, "deed"))
            if line:
                self.store.add_turn(save_id, suspect_id, Turn("suspect", line, now, "plain"), trace)
            self._remember(save_id, mems, now)
            self._save_world(save_id, w)
            return {"line": line, "notices": notices, "world": w.public(now), "clock": now,
                    "clock_label": clock_label(now), "ended": w.s["ended"]}

    def reflect_pending(self, save_id: str) -> int:
        """Off-screen thought (Park et al.'s reflection): each suspect who lived through
        something new since they last reflected forms a thought, kept as a memory, and
        picks one of a few allowed intentions — come and find the detective, keep out of
        their way, or carry on. Runs in the background, between the player's turns."""
        with self._lock:
            sess = self.store.session(save_id)
            if sess is None:
                return 0
            w = World(self.store.world(save_id) or world_initial(sess["clock"]))
            queue, w.s["reflect"] = list(w.s["reflect"]), []
            self._save_world(save_id, w)
        done = 0
        for cid in queue:
            with self._lock:
                w = World(self.store.world(save_id))
                if not w.present(cid):
                    continue
                recent = [m.text for m in self.store.memories(save_id, cid)
                          if m.kind in ("event", "gossip", "reflection")][-6:]
                mood = w.mood_words(cid)
            char = CHARACTERS[cid]
            raw = self.voice.chat([
                {"role": "system", "content": (
                    f"You are {char.name}, {char.role}, at Ravenswood Manor in 1926, the day after Lord Alistair "
                    f"Ravenswood was found dead. {char.persona}\nRight now you feel: {mood}.\n"
                    "Reflect privately, in one first-person sentence, on what has happened today. Then choose "
                    "what you will do: \"seek_detective\" (go and tell the detective something), "
                    "\"avoid_detective\" (keep out of their way), or \"stay\". "
                    'Reply ONLY with JSON: {"thought": "...", "intent": "..."}')},
                {"role": "user", "content": "Today so far:\n" + "\n".join(f"- {t}" for t in recent)},
            ], seed=int(uniform(save_id, cid, "reflect", str(len(recent))) * 1e6), temperature=0.5, num_predict=120)
            parsed = self.voice.json(raw) or {}
            thought = str(parsed.get("thought") or "").strip()
            intent = str(parsed.get("intent") or "stay").strip()
            with self._lock:
                w = World(self.store.world(save_id))
                now = self.store.session(save_id)["clock"]
                if thought and not era.modern_terms(thought):
                    self._remember(save_id, [Mem(cid, "reflection", thought, importance=6)], now)
                n = w.npc(cid)
                if intent == "seek_detective" and (n["trust"] < 30 or n["fear"] >= 60):
                    intent = "avoid_detective"  # nobody seeks out a detective they fear or distrust
                if intent == "seek_detective" and cid in VOLUNTEER and not w.flag(f"volunteered:{cid}"):
                    if w.s.get("player"):
                        w.set_flag(f"seeking:{cid}", now)   # they walk over to find you (world.py)
                    else:
                        w.set_flag(f"volunteer:{cid}", now)
                        w.event(now, f"{first(cid)} is looking for you — says there's something you ought to "
                                "know.", "offscreen", cid)
                elif intent == "avoid_detective" and not w.flag(f"avoiding:{cid}"):
                    w.set_flag(f"avoiding:{cid}", now)
                    w.mood(cid, trust=-5)
                    w.event(now, f"{first(cid)} is keeping out of your way.", "offscreen", cid)
                self._save_world(save_id, w)
            done += 1
        return done

    # ------------------------------------------------------------- policy
    def _decide(self, char: Character, accused: bool, case_q: bool, recalls: list[Recall],
                save_id: str, fm: FallibleMemory, now: float) -> dict:
        # Decisions rest on CONTENT memories. "The detective asked me: '…'" repeats the
        # question almost verbatim, so it would always be the best match and crowd the
        # actual evidence out; it is context, shown in the prompt, never the deciding trace.
        # Likewise a detail planted by THIS very question is what is being asked about,
        # not something the suspect knows: it is shown (tagged) but cannot decide.
        fresh_ids = {r.rec.id for r in recalls if r.rec.kind == "planted" and r.rec.t_created >= now}
        recalls = [r for r in recalls if r.rec.id not in fresh_ids]  # stored, not shown, this turn
        content = [r for r in recalls if r.rec.kind in CONTENT_KINDS]
        reach = [r for r in content if r.state != "forgotten"]
        top_all = max((r.relevance for r in content), default=0.0)
        top_reach = max((r.relevance for r in reach), default=0.0)
        # Relevant = close to the best memory that can still be reached, so a faded
        # trace does not hide a reachable one (e.g. a planted detail)…
        floor = max(config.REL_MIN, top_reach - config.REL_BAND)
        relevant = [r for r in content if r.relevance >= floor]
        # …but if what was asked about is precisely what faded, that is forgetting.
        answer_floor = max(config.REL_MIN, top_all - config.REL_BAND)
        # The prompt has two sections, because a small model given one flat list
        # answers from whichever line it fancies: FOCUS is what they remember about
        # this question (the deciding trace first); BACKGROUND is a short list of
        # what else is on their mind.
        focus: list[str] = []
        lines: list[str] = []
        used: list[str] = []      # focus memories: recalled AND retold → reconsolidated
        seen: list[str] = []      # background memories: recalled only
        reveals = None

        def render(r: Recall) -> str | None:
            m = r.rec
            if r.state == "forgotten" or m.kind == "concealed":
                return None
            if m.kind == "identity":
                return f"(about yourself) {m.text}"
            if m.kind == "self_fact":
                q, a = _self_fact_parts(m.text)
                return f"(you said earlier, when asked “{_short(q, 80)}”) “{a}”"
            if m.kind == "habit":
                return f"(your routine) {m.text}"
            if m.kind in ("heard", "said"):
                return f"(earlier today) {m.text}"
            if m.kind in ("event", "saw"):
                return f"(today) {m.text}"
            if m.kind == "reflection":
                return f"(a thought you keep having) {m.text}"
            if m.kind == "gossip":
                # Once the teller is forgotten, it is simply something they "know".
                return m.text if r.source_known else f"(you are sure of this) {m.text.split(': ', 1)[-1]}"
            if m.kind == "planted":
                return (f"(you are sure you saw or knew this yourself) {m.text}" if not r.source_known
                        else f"(the detective told you this; you did not see it yourself) {m.text}")
            if r.state == "gist":
                return f"(only hazily) {m.gist or m.text}"
            return m.text

        def add(r: Recall, to_focus: bool) -> None:
            text = render(r)
            if text is None or r.rec.id in used or r.rec.id in seen:
                return
            if to_focus:
                focus.append(text)
                used.append(r.rec.id)
            elif len(lines) < config.BACKGROUND_MAX:
                lines.append(text)
                seen.append(r.rec.id)

        def rest(skip: set[str] = frozenset(), keep=lambda r: True) -> None:
            for r in recalls:
                if r.rec.id not in skip and keep(r):
                    add(r, False)

        def out(kind, instruction, fallback, rule, tell_key=None, reveals=None, *,
                temperature=config.TEMP_FACTUAL, covers=(), must_mention=(), deny=False) -> dict:
            # covers / must_mention / deny are what _check holds the spoken answer to.
            return dict(kind=kind, focus=focus, lines=lines, instruction=instruction, used=used,
                        seen=seen, reveals=reveals, tell_key=tell_key, fallback=fallback, rule=rule,
                        temperature=temperature, covers=list(covers), must_mention=list(must_mention),
                        deny=deny)

        concealed = [r for r in relevant if r.rec.kind == "concealed"]

        # 1) A direct accusation: everyone denies — the guilty calmly, and in line
        #    with whatever they have already told the detective.
        if accused:
            said = [r for r in recalls if r.rec.kind == "said" and r.state != "forgotten"]
            for r in sorted(said, key=lambda r: -r.relevance)[:2]:
                add(r, True)
            rest()
            if char.is_killer:
                # The engine knows this denial is a lie; the voice must not. Told "you are
                # secretly guilty", a small model leaked ("I was only playing a part… a scheme").
                return out("lie",
                           "The detective is accusing you, to your face, of the murder. Deny it calmly, "
                           "with wounded dignity, in one or two sentences — as an innocent person would. "
                           "Do not speculate about schemes, plots, parts you played, motives, or who did it.",
                           "How dare you. I had nothing to do with Alistair's death.", "accusation", "lie",
                           deny=True)
            return out("plain",
                       "The detective is accusing you, to your face, of the murder. You did not do it: "
                       "deny it plainly and with real feeling. Invent nothing new about last night.",
                       "No! I never — I could never do such a thing, I swear it.", "accusation", deny=True)

        # 2) A hidden truth is in play → its cover story (the truth never reaches the model).
        #    Only for questions about the night: "where did you grow up?" must not
        #    trip Vivian's alibi just because the words are faintly similar.
        if case_q and concealed:
            covers = [r.rec.cover for r in concealed[:2] if r.rec.cover]
            focus.extend(f"(what you tell people about this) {c}" for c in covers)
            used.extend(r.rec.id for r in concealed)
            rest(skip={r.rec.id for r in concealed})
            return out("lie",
                       "On this subject you stick to the story marked 'what you tell people', rephrased "
                       "naturally in your own voice. Do not confess, admit wrongdoing, or mention hiding, "
                       "covering up, motives, or anything beyond that story. Stay composed and brief.",
                       covers[0] if covers else "I really couldn't say.", "concealed→cover", "lie",
                       covers=covers, deny=True)

        if case_q:
            case_instruction = (
                "This is about last night. Answer from WHAT YOU REMEMBER ABOUT THIS. If that does not "
                "cover it, you do not remember — say so in your own way. Never invent new facts about "
                "last night, the murder, or the evidence. Things marked 'only hazily' you are unsure of. "
                "Anything marked 'the detective told you this' you did NOT see: never claim you saw it — "
                "at most, say the detective mentioned it and you cannot be sure. If the question itself "
                "names a person, object or event, do not simply agree: agree only if it is in WHAT YOU "
                "REMEMBER ABOUT THIS."
            )
            # A suggestion inside THIS question is already in front of the voice (it is
            # the question). It is stored for later turns but not repeated in the prompt:
            # tagged copies were read aloud, and the instruction below covers agreeing.
            # Habits are schema knowledge: on a question about last night they come into
            # play only through the habit/episode contest below, never as background.
            no_habit = lambda r: r.rec.kind != "habit"  # noqa: E731

            # 3a) Habit vs the specific night it did not happen (schema intrusion).
            habit = next((r for r in recalls if r.rec.kind == "habit"), None)
            blocker = (next((x for x in recalls if x.rec.blocks == habit.rec.seed_key), None)
                       if habit else None)
            if habit and max(habit.relevance, blocker.relevance if blocker else 0.0) >= config.HABIT_ENGAGE:
                if blocker is None or blocker.state == "forgotten" or (
                    blocker.state == "gist"
                    and uniform(save_id, blocker.rec.id, "intrude") < char.interference
                ):
                    # The routine fills the gap the faded night left.
                    focus.append(f"You are certain last night went exactly as every night does: {habit.rec.text}")
                    used.append(habit.rec.id)
                    rest(skip={blocker.rec.id} if blocker else set(), keep=no_habit)
                    return out("false-memory", case_instruction, habit.rec.text.split(". ")[0] + ".",
                               "habit intrusion", "habit")
                # They remember last night was different (if only hazily): that memory
                # is the answer; the routine is not even offered — given both, a small
                # model reaches for the confident one.
                add(blocker, True)
                rest(keep=no_habit)
                return out("plain", case_instruction, (blocker.rec.gist if blocker.state == "gist"
                                                       else blocker.rec.text),
                           "the night beat the habit",
                           reveals=blocker.rec.reveals if blocker.state == "detail" else None)

            # 3b) A suggestion whose source has faded vs the suspect's own memory of the
            #     event: the research model's two-alternative choice (Exp. 1c, Luce rule
            #     with source discounting) decides which one they now believe.
            # A source-lost suggestion competes if it is relevant itself OR is about the same
            # moment as a memory that is (a suggestion like "Agnes was going toward the study
            # door" can score just below the suspect's own vivid memory of that moment, and
            # must still get its contest rather than lose by default).
            own_relevant = [r for r in relevant if r.rec.kind == "episodic"]
            planted_lost = sorted(
                (r for r in recalls if r.rec.kind == "planted" and r.state != "forgotten"
                 and not r.source_known and r.relevance >= config.REL_MIN
                 and (r in relevant or any(float(r.rec.vec @ o.rec.vec) >= config.SAME_EVENT_MIN
                                           for o in own_relevant))),
                key=lambda r: -r.relevance)
            if planted_lost:
                rival = planted_lost[0]
                # The competing original is the suspect's own memory of the same moment.
                # A suggestion is built from the question's words, so it always out-scores
                # the original on question relevance alone; combine relevance to the
                # question with similarity to the suggestion itself.
                originals = [r for r in recalls if r.rec.kind == "episodic" and r.state != "forgotten"
                             and r.relevance >= config.REL_MIN
                             and float(r.rec.vec @ rival.rec.vec) >= config.SAME_EVENT_MIN]
                original = max(originals, key=lambda r: r.relevance + float(r.rec.vec @ rival.rec.vec),
                               default=None)
                p_orig = fm.p_choose_original(original.rec, rival.rec, now) if original else 0.0
                if original is None or uniform(save_id, original.rec.id, rival.rec.id, "2afc") >= p_orig:
                    add(rival, True)  # the suggestion now feels like their own memory
                    rest(skip={r.rec.id for r in originals}, keep=no_habit)
                    # Believing the suggestion means saying it: the names it put in their head.
                    names = [t.strip(".,;:!?\"'") for t in rival.rec.text.split()[1:]]
                    return out("false-memory", case_instruction, rival.rec.text,
                               "suggestion beat the original" if original else "planted detail, source lost",
                               "planted",
                               must_mention=[n for n in names if re.fullmatch(r"[A-Z][a-z]{2,}", n)
                                             and n not in ("Mrs", "Miss", "Lord", "Lady", "The")])
                add(original, True)  # their own memory wins; the stray suggestion is set aside
                rest(skip={r.rec.id for r in planted_lost}, keep=no_habit)
                return out("plain", case_instruction, original.rec.text, "original beat the suggestion",
                           reveals=original.rec.reveals if original.state == "detail" else None)

            # 3c) Ordinary recall — or forgetting, if what was asked about has faded.
            # What they lived through last night — or saw with their own eyes today.
            substantive = [r for r in reach if r.relevance >= answer_floor
                           and r.rec.kind in ("episodic", "planted", "saw", "event")]
            if substantive:
                order = sorted((r for r in relevant if r.state != "forgotten" and r.rec.kind not in
                                ("concealed", "habit")),
                               key=lambda r: (not (r.rec.kind == "episodic" and r.rec.reveals), -r.relevance))
                for r in order:
                    add(r, True)
                rest(keep=lambda r: no_habit(r) and (r.rec.kind != "heard" or r.relevance >= floor))
                detail = next((r for r in relevant if r.rec.kind == "episodic"
                               and r.state == "detail" and r.rec.reveals), None)
                best = order[0] if order else None  # a real memory, never the fresh suggestion
                fallback = ((best.rec.gist if best.state == "gist" else best.rec.text) if best
                            else "I couldn't rightly say.")
                return out("plain", case_instruction, fallback, "recalled",
                           reveals=detail.rec.reveals if detail else None)
            rest(keep=no_habit)
            return out("evasion", case_instruction, "I… I couldn't rightly say, Detective. It's all a blur.",
                       "nothing reachable", "evasion")

        # 3) About the person: answer as yourself; improvise within character.
        #    Only self-knowledge and genuinely related memories come to mind —
        #    the night is not dragged into "what's your favourite book?".
        #    Who they ARE (the authored identity) leads, judged against the best identity
        #    line rather than against earlier answers: an earlier answer contains the
        #    question's own words, so it always out-scores the identity, and shown alone
        #    it was copied back verbatim, answer after answer (found in play).
        ident = [r for r in content if r.rec.kind == "identity"]
        id_floor = max(config.REL_MIN, max((r.relevance for r in ident), default=0.0) - config.REL_BAND)
        for r in sorted(ident, key=lambda r: -r.relevance):
            if r.relevance >= id_floor:
                add(r, True)
        # At most two earlier answers, the most relevant, to stay consistent with.
        facts = sorted((r for r in content if r.rec.kind == "self_fact" and r.state != "forgotten"),
                       key=lambda r: -r.relevance)
        fact_floor = max(config.REL_MIN, facts[0].relevance - config.REL_BAND) if facts else 1.0
        for r in facts[:2]:
            if r.relevance >= fact_floor:
                add(r, True)
        for r in relevant:
            if r.rec.kind == "habit":
                add(r, True)
        # What has happened to them today ("what do you think of me?" after a slap).
        today = sorted((r for r in content if r.rec.kind in ("event", "gossip", "reflection", "saw")
                        and r.state != "forgotten" and r.relevance >= config.REL_MIN), key=lambda r: -r.relevance)
        for r in today[:2]:
            add(r, True)
        rest(keep=lambda r: r.rec.kind in ("identity", "habit", "event", "gossip", "reflection", "saw"))
        return out("plain",
                   "This is about you as a person, not about last night. Answer as yourself, consistent "
                   "with what you know about yourself. If it isn't covered, answer as this person truly "
                   "would — you may add small personal details (tastes, opinions, memories of your life) "
                   "— but say nothing new about last night, the murder, or the evidence. If the question "
                   "assumes something untrue about you, correct it in character rather than going along "
                   "with it. Asked who you are, give your name and what you are. Lines marked 'you said "
                   "earlier' you have already told the detective: keep to "
                   "the same facts, but never repeat their wording — answer THIS question, in fresh words.",
                   "That's rather a personal question, Detective.", "personal",
                   temperature=config.TEMP_PERSONAL)

    # ------------------------------------------------------ moods decide
    def _moved(self, char: Character, gate: str, mems: list[MemoryRecord], w: World, now: float) -> dict:
        """A mood strong enough to override the ordinary answer: they walk out, break,
        or — innocent and terrified — 'confess' to make it stop."""
        name = first(char.id)
        base = dict(lines=[], seen=[], reveals=None, tell_key=None, covers=[], must_mention=[], deny=False,
                    temperature=config.TEMP_FACTUAL, notices=[])
        if gate == "refuse":
            n = w.npc(char.id)
            if n["status"] != "refusing":
                n["status"], n["until"] = "refusing", now + 0.75
                base["notices"].append(f"{name} refuses to say another word until {clock_label(now + 0.75)}")
            return dict(base, kind="evasion", focus=[], used=[], rule="refuses to speak", deny=True,
                        instruction=("You will not say another word to this detective right now. Refuse, in one "
                                     "short sentence, in character — "
                                     + ("demand your solicitor." if char.id == "vance" else "and leave the room.")),
                        fallback="I have nothing more to say to you, Detective.")
        by_key = {m.seed_key: m for m in mems if m.seed_key}
        if gate == "confess":
            truths = [by_key[k] for k in CRACK["vivian"] if k in by_key]
            w.set_flag("confessed:vivian", now)
            base["notices"].append("Miss Cross has confessed.")
            return dict(base, kind="plain", focus=[f"(the truth) {m.text}" for m in truths],
                        used=[m.id for m in truths], rule="the killer broke", must_confess=True,
                        instruction=("The evidence is laid out in front of you and you cannot hold the story any "
                                     "longer. Confess: say what you did and why, in your own words, briefly, with "
                                     "bitter dignity."),
                        fallback="Very well. I killed him. He was going to ruin me — I had no choice.")
        if gate == "crack":
            truths = [by_key[k] for k in CRACK.get(char.id, ()) if k in by_key]
            w.set_flag(f"crack:{char.id}", now)
            for m in truths:
                if m.seed_key in REVELATIONS:
                    text, implicates = REVELATIONS[m.seed_key]
                    w.news(now, char.id, text, "revelation", implicates)
            base["notices"].append(f"{name} has cracked.")
            reveals = "gambling-papers" if char.id == "julian" and "gambling-papers" not in w.s["lost_clues"] else None
            return dict(base, kind="plain", focus=[f"(the truth you were hiding) {m.text}" for m in truths],
                        used=[m.id for m in truths], rule="cracked under pressure", reveals=reveals,
                        instruction=("You break under the pressure and blurt out the truth you were hiding — the "
                                     "lines marked 'the truth you were hiding' — but insist, desperately, that you "
                                     "did not kill anyone."),
                        fallback=truths[0].text if truths else "All right! I lied — but I didn't kill him!")
        # gate == "false_confession": an innocent, frightened, suggestible person gives in.
        w.set_flag(f"false_confession:{char.id}", now)
        base["notices"].append(f"{name} has confessed… but do you believe it?")
        return dict(base, kind="lie", focus=[], used=[], rule="coerced false confession", tell_key="coerced",
                    must_confess=True,
                    instruction=("You are terrified and will say anything to make this stop. You did NOT kill "
                                 "anyone and know nothing of how it was done, but you give in and say that you "
                                 "did — brokenly, without any real details."),
                    fallback="All right! All right — I did it — I did it, just please stop!")

    def _request(self, char: Character, req: dict, w: World, now: float) -> dict:
        """Asked to do something. The engine decides yes or no (mood, temperament, a revolver);
        the voice only says it; the world then has them actually do it."""
        kind = req["kind"]
        place = manor.AREAS[req["area"]]["name"] if req.get("area") else ""
        wants = {"tour": "show them around the house", "follow": "come along with them",
                 "lead": f"take them to {place}", "goto": f"go to {place}", "dance": "dance",
                 "sit": "sit down", "stay": "stay where you are", "stop": "stop what you are doing"}[kind]
        gun = w.s["gun"] == char.id
        agrees = w.complies(char.id, kind)
        notices, mems = (w.start_task(char.id, req, now) if agrees else ([], []))
        why = ("— only because a revolver is pointed at you; you are frightened and resentful" if gun and agrees
               else "" if agrees else
               "— you are far too angry" if w.npc(char.id)["anger"] >= 50 else
               "— you think it quite beneath you to do a policeman's bidding"
               if char.id not in ("agnes", "thomas") else "— you are too frightened and upset")
        instruction = (f"The detective asks you to {wants}. You {'agree' if agrees else 'refuse'} {why}. Say so to "
                       f"the detective's face, in one or two sentences, in character, in your own words"
                       + ("; you will do it as soon as you finish speaking." if agrees else "."))
        return dict(kind="plain", focus=[], lines=[], used=[], seen=[], reveals=None, tell_key=None,
                    rule=f"request: {kind} ({'agreed' if agrees else 'refused'})", covers=[], must_mention=[],
                    deny=False, temperature=config.TEMP_PERSONAL, instruction=instruction, notices=notices, mems=mems,
                    fallback=("Very well, Detective." if agrees else "I'd rather not, Detective."))

    def _unfamiliar(self, char: Character, terms: list[str]) -> dict:
        """A word from after 1926, or one they have simply never heard: met as a person
        would meet it, in character — never explained, never a vague non-answer."""
        listed = ", ".join(f"“{t}”" for t in terms)
        return dict(kind="plain", focus=[f"(you have never heard of this) {t}" for t in terms], lines=[], used=[],
                    seen=[], reveals=None, tell_key=None, rule="unfamiliar term", covers=[], must_mention=[],
                    deny=False, temperature=config.TEMP_PERSONAL, unknown=terms,
                    instruction=(f"The detective mentions {listed}. It is 1926 and you have never heard of it: do "
                                 f"NOT explain it, guess what it is as fact, or pretend to know it — and do not call "
                                 f"it modern or 'from the future': to you it is just a word you don't know. "
                                 f"{TEMPERAMENT[char.id].unknown_style}"),
                    fallback=f"{terms[0].capitalize()}? I'm afraid I've never heard of it, Detective.")

    def _volunteer(self, d: dict, char: Character, mems: list[MemoryRecord], w: World, now: float) -> None:
        """Trust (or an off-screen decision to seek the detective out) brings out
        something they had kept back."""
        key = VOLUNTEER.get(char.id)
        rec = next((m for m in mems if m.seed_key == key), None)
        w.set_flag(f"volunteered:{char.id}", now)
        if rec is None or rec.id in d["used"]:
            return
        d["focus"].append(f"(you decide to tell the detective this, unasked) {rec.text}")
        d["used"].append(rec.id)
        d["instruction"] += (" After answering, you decide to tell the detective something you had not said "
                             "before: the line marked 'you decide to tell the detective this'.")
        d["reveals"] = d["reveals"] or rec.reveals
        d.setdefault("notices", []).append(f"{first(char.id)} has decided to trust you.")

    # ------------------------------------------------- conversation recall
    def _conversation_recall(self, mems: list[MemoryRecord], fm: FallibleMemory, now: float,
                             save_id: str, question: str = "") -> dict:
        """'What did I ask you first?' — answered from the interview itself, IN ORDER.

        Each exchange is one 'heard' memory (+ the answer stored with it). Order and time come
        from when each was stored; whether it can still be recalled — word for word, only
        roughly, or not at all — comes from the memory model, so a suspect can genuinely lose
        the start of a long interrogation, and a forgetful one sooner.
        """
        heard = sorted((m for m in mems if m.kind == "heard"), key=lambda m: m.t_created)
        answers = {m.t_created: m for m in mems if m.kind in ("said", "self_fact")}
        focus: list[str] = []
        used: list[str] = []
        shown = heard if len(heard) <= 24 else heard[:4] + heard[-20:]
        first_q = None
        recalled: dict[int, str] = {}
        for i, h in enumerate(heard, 1):
            if h not in shown:
                if i == 5:
                    focus.append("… (several more questions in between) …")
                continue
            r = fm.assess(h, now, 0.0, 0.0, save_id)
            q = _quote(h.text, 'asked me: "')
            a_rec = answers.get(h.t_created)
            a = _quote(a_rec.text, 'I said: "' if a_rec.kind == "self_fact" else 'detective: "') if a_rec else None
            head = f"Question {i} (at {clock_label(h.t_created)})"
            if r.state == "forgotten":
                focus.append(f"{head}: (you cannot recall what the detective asked here)")
                continue
            if r.state == "gist":
                focus.append(f"{head}: (only hazily) something like “{_short(q, 60)}”")
            else:
                focus.append(f"{head}: the detective asked “{_short(q)}”"
                             + (f" — you answered “{_short(a, 120)}”" if a else ""))
                first_q = first_q or q
                recalled[i] = q
            used.append(h.id)
        if not heard:
            focus.append("(This is the first thing the detective has asked you today.)")
        # Which question is meant is the engine's job, not the voice's: "the second
        # question" was answered as "the last question was…" (found in play).
        pos = _ordinal(question)
        pos = len(heard) if pos == "last" else pos
        fallback = (f"The first thing you asked me was “{first_q}”." if first_q
                    else "I'm afraid I can't quite remember, Detective.")
        pointer = ""
        if heard and isinstance(pos, int):
            if pos > len(heard):
                pointer = f" The detective has asked you only {len(heard)} questions so far."
            else:
                pointer = f" Here the detective means Question {pos}."
                fallback = (f"Your {_nth(pos)} question was “{recalled[pos]}”." if pos in recalled
                            else "I'm afraid I can't quite remember that one, Detective.")
        return dict(
            kind="plain", focus=focus, lines=[], used=used, seen=[], reveals=None, tell_key=None,
            rule="conversation recall", temperature=config.TEMP_FACTUAL, covers=[], must_mention=[],
            deny=False, no_i_asked=True,
            instruction=(
                "The detective is asking about THIS conversation. WHAT YOU REMEMBER ABOUT THIS QUESTION "
                "is the interview so far, in order: Question 1 was asked first, then Question 2, and so on. "
                "Answer from it precisely — 'the first question' means Question 1, 'just after our "
                "introduction' means the question after that one, 'the last question' means the highest "
                "number. When asked for a question by its position, name it by that number ('Your second "
                "question was…'). It was always the DETECTIVE who asked: say 'you asked', never 'I asked'. "
                "Quote or closely paraphrase. If that part is marked as not recalled or hazy, say "
                "honestly that you cannot quite remember it." + pointer
            ),
            fallback=fallback,
        )

    # ------------------------------------------------------- check + retry
    def _check(self, answer: str, d: dict, recent: list[str]) -> str | None:
        """What is wrong with this spoken answer, given what the engine decided? None = fine.

        The engine decides; the voice only words it. A small model still sometimes
        strays — improvises an alibi, half-confesses, says "I asked", or parrots its
        last answer — so each answer is held to the decision before it is spoken.
        """
        if not answer:
            return "the answer was empty"
        asked = {t.lower() for t in era.modern_terms(d.get("question", ""))}
        late = [t for t in era.modern_terms(answer) if t.lower() not in asked]
        if late:
            return f"it mentions {late[0]!r}, which no one in 1926 has heard of"
        if _META_ERA.search(answer) or (d.get("unknown") and _FUTURE.search(answer)):
            return "it talks as if you knew the thing comes from another time — to you it is just an unknown word"
        if d.get("must_confess") and not CONFESSION.search(answer):
            return "you were meant to give in and say that you did it — say it"
        if d.get("deny") and CONFESSION.search(answer):
            return "it sounds like a confession; you admit nothing"
        if d.get("covers"):
            vecs = self.emb.embed([answer, *d["covers"]])
            close = max(float(vecs[0] @ v) for v in vecs[1:])
            shared = max(len(_content_words(answer) & _content_words(c)) for c in d["covers"])
            if close < config.COVER_MIN and shared < 2:
                return "it strays from your story — say only what is marked 'what you tell people', in your own words"
        if d.get("must_mention") and not any(n.lower() in answer.lower() for n in d["must_mention"]):
            return f"it leaves out what you remember — you are sure it was {' / '.join(d['must_mention'])}"
        if d.get("no_i_asked") and _SAID_I_ASKED.search(answer):
            return "it says 'I asked' — it was the detective who asked the questions; say 'you asked'"
        if d["kind"] != "lie" and d["rule"] != "conversation recall":
            return _repeats(answer, recent)
        return None

    def _speak(self, messages: list[dict], d: dict, recent: list[str], seed: int) -> tuple[str, str | None, list]:
        """Voice the decision; check it; if it fails, retry once with the problem named;
        if that fails too, say the engine's own fallback line."""
        temp = d.get("temperature", config.TEMP_FACTUAL)
        checks = []
        raw = self.voice.chat(messages, seed=seed, temperature=temp)
        answer = self._answer(raw)
        problem = self._check(answer, d, recent)
        checks.append({"answer": answer, "problem": problem})
        if problem is None:
            return answer, raw, checks
        retry = [dict(messages[0], content=messages[0]["content"] + (
            f"\n\nYour first attempt was: \"{answer}\"\nThat will not do: {problem}. Answer again."))] + messages[1:]
        # A repeat needs different words, so the same temperature; a stray needs less.
        repeat = problem.startswith("it repeats") or problem.startswith("it reuses")
        raw2 = self.voice.chat(retry, seed=seed + 1, temperature=temp if repeat else max(0.1, temp - 0.2))
        answer2 = self._answer(raw2)
        problem2 = self._check(answer2, d, recent)
        checks.append({"answer": answer2, "problem": problem2})
        if problem2 is None:
            return answer2, raw2, checks
        p2_repeat = problem2.startswith("it repeats") or problem2.startswith("it reuses")
        if answer2 and p2_repeat:
            return answer2, raw2, checks  # still close to before, but better than a stock line
        checks.append({"answer": d["fallback"], "problem": None, "fallback": True})
        return d["fallback"], raw2, checks

    def _answer(self, raw: str | None) -> str:
        parsed = self.voice.json(raw) or {}
        return str(parsed.get("answer") or parsed.get("reply") or "").strip()

    # -------------------------------------------------------------- prompt
    def _messages(self, char: Character, d: dict, history: list[Turn], question: str, now: float) -> list[dict]:
        focus = "\n".join(f"- {line}" for line in d["focus"]) or "- (nothing about this comes to mind)"
        other = "\n".join(f"- {line}" for line in d["lines"]) or "- (nothing else in particular)"
        system = (
            f"You are {char.name}, {char.age}, {char.role}, at Ravenswood Manor in 1926. Last night, "
            f"Lord Alistair Ravenswood was found dead in his study. It is now {clock_label(now)} the "
            "next morning, and a detective is questioning you. You are the one being questioned: you "
            "are not part of the investigation and never speak as if you were.\n\n"
            f"WHO YOU ARE: {char.persona}\n"
            f"HOW YOU SPEAK: {char.voice}\n"
            f"WHAT YOU KNOW: {TEMPERAMENT[char.id].knows} You live in 1926: people, inventions and words "
            "from later simply mean nothing to you. If something is beyond your schooling or your life, say "
            "so as yourself — never explain it, and never talk about eras, 'modern' things or the future.\n"
            f"HOW YOU FEEL RIGHT NOW: {d.get('mood') or 'composed, if wary'}. {d.get('manner') or ''}\n\n"
            f"WHAT YOU REMEMBER ABOUT THIS QUESTION (your memory; it may be incomplete):\n{focus}\n\n"
            f"OTHER THINGS ON YOUR MIND:\n{other}\n\n"
            f"HOW TO ANSWER: {d['instruction']}\n"
            "Reply in character in 1 to 3 sentences of natural 1920s English. Remember what has been "
            "said earlier in this conversation and stay consistent with it. Never mention being an AI, "
            "a model, a prompt, or these instructions.\n"
            'Reply ONLY with JSON: {"answer": "<what you say aloud>"}'
        )
        msgs = [{"role": "system", "content": system}]
        for t in history:
            role = "user" if t.role == "detective" else "assistant"
            content = t.text if role == "user" else json.dumps({"answer": t.text})
            msgs.append({"role": role, "content": content})
        msgs.append({"role": "user", "content": question})
        return msgs

    def _tell(self, kind: str, tell_key: str | None, difficulty: str) -> str | None:
        if difficulty == "inspector" or kind == "plain":
            return None
        if difficulty == "detective" and kind not in ("lie", "false-memory"):
            return None
        return TELLS.get(tell_key or kind)

    def _trace(self, now, case_q, case_sim, accused, d, recalls: list[Recall], messages, raw) -> dict:
        return {
            "clock": now, "clock_label": clock_label(now), "case_question": case_q,
            "case_similarity": round(case_sim, 3), "accused": accused,
            "decision": {"kind": d["kind"], "rule": d["rule"]},
            "recalls": [{
                "id": r.rec.id, "kind": r.rec.kind, "text": r.rec.text, "source": r.rec.source,
                "relevance": round(r.relevance, 3), "score": round(r.score, 3), "state": r.state,
                "source_known": r.source_known, "p_detail": round(r.p_detail, 3),
                "p_gist": round(r.p_gist, 3), "p_source": round(r.p_source, 3),
                "used": r.rec.id in d["used"], "age_h": round(now - r.rec.t_event, 2),
            } for r in recalls],
            "prompt_focus": d["focus"],
            "prompt_background": d["lines"],
            "llm_ok": raw is not None,
        }

    # ---------------------------------------------------------- write-back
    def _write_back(self, save_id: str, char: Character, question: str, answer: str,
                    qv: np.ndarray, case_q: bool, now: float, about_talk: bool = False) -> None:
        heard = f'The detective asked me: "{question}"'
        # A personal answer becomes a permanent self-fact; but "what did I ask you first?"
        # says nothing about who the suspect is — it is just something said today.
        if case_q or about_talk:
            said, kind, imp, core = f'I told the detective: "{answer}"', "said", config.IMPORTANCE_SAID, False
        else:
            said, kind, imp, core = (f'About myself — asked "{question}", I said: "{answer}"', "self_fact",
                                     config.IMPORTANCE_SELF_FACT, True)
        hv, sv = self.emb.embed([heard, said])
        if kind == "self_fact":
            # Saying the same thing about yourself again is not a new fact: it rehearses
            # the old one. Without this a suspect piled up a dozen copies of one answer,
            # retrieved them all, and recited it (found in play).
            same = [m for m in self.store.memories(save_id, char.id)
                    if (m.kind == "self_fact" and (float(m.vec @ sv) >= config.SELF_FACT_DEDUPE
                                                   or _overlap(answer, _self_fact_parts(m.text)[1])
                                                   >= config.REPEAT_OVERLAP))
                    or (m.kind == "identity" and _overlap(answer, m.text) >= config.REPEAT_OVERLAP)]
            if same:
                self.store.touch([same[0].id], now, rehearse=True)
                # Still part of the interview log (for "what did you tell me?").
                said, kind, imp, core = f'I told the detective: "{answer}"', "said", config.IMPORTANCE_SAID, False
                sv = self.emb.embed([said])[0]
        self.store.add([
            MemoryRecord(save_id=save_id, suspect_id=char.id, kind="heard", text=heard, source="told:detective",
                         t_event=now, t_created=now, importance=config.IMPORTANCE_HEARD, vec=hv, case_fact=case_q),
            MemoryRecord(save_id=save_id, suspect_id=char.id, kind=kind, text=said, source="self",
                         t_event=now, t_created=now, importance=imp, vec=sv, core=core, case_fact=case_q),
        ])

    # --------------------------------------------------------------- plant
    def plant(self, save_id: str, suspect_id: str, question: str) -> list[str]:
        """Store details a (leading) question asserted or presupposed, as told by the detective."""
        details = self.extract_details(question)
        with self._lock:
            sess = self.store.session(save_id)
            if sess is None:
                return []
            return self._plant(save_id, suspect_id, details, sess["clock"],
                               self.store.memories(save_id, suspect_id))

    def _plant(self, save_id: str, suspect_id: str, details: list[str], now: float,
               mems: list[MemoryRecord]) -> list[str]:
        if not details:
            return []
        with self._lock:
            vecs = self.emb.embed(details)
            added = []
            own_words = [_content_words(m.text) for m in mems if m.kind in ("episodic", "identity", "habit")]
            for text, v in zip(details, vecs):
                planted = [(m, float(m.vec @ v)) for m in mems if m.kind == "planted"]
                best = max(planted, key=lambda x: x[1], default=(None, 0.0))
                if best[0] is not None and best[1] >= config.DEDUPE_COSINE:
                    self.store.touch([best[0].id], now, rehearse=True)  # repetition strengthens it
                    continue
                words = _content_words(text)
                if words and any(words <= w for w in own_words):
                    continue  # nothing new: they already knew this from their own experience
                self.store.add([MemoryRecord(
                    save_id=save_id, suspect_id=suspect_id, kind="planted", text=text, gist=text,
                    source="told:detective", t_event=now, t_created=now,
                    importance=config.IMPORTANCE_PLANTED, vec=v, case_fact=True,
                )])
                added.append(text)
            return added

    # Few-shot as real chat turns: small models follow worked examples far better
    # than examples described inside an instruction.
    # A yes/no question about what the suspect did plants nothing; a definite
    # description ("the crash") presupposes its object exists (Loftus & Palmer).
    _PLANT_SHOTS = [
        ("Did you see anyone near the study?", []),
        ("Did you take the tea up to the study last night?", []),
        ("Did you hear the crash?", ["There was a crash."]),
        ("Was it Agnes you saw near the study?", ["The person seen near the study was Agnes."]),
        ("What was the woman in the red dress doing on the landing?", ["A woman in a red dress was on the landing."]),
        ("Wasn't it the doctor who went into the conservatory?", ["The doctor went into the conservatory."]),
        ("After the crash, where did you go?", ["There was a crash."]),
        ("What is your favourite book?", []),
    ]

    def extract_details(self, question: str) -> list[str]:
        system = (
            "You analyse one sentence a detective said in a murder interview. Output the specific details "
            "about last night's events that the sentence ASSERTS, SUGGESTS or TAKES FOR GRANTED — "
            "including any person, object or colour it names as the answer. Never output what is merely "
            "asked about. Each detail is one short standalone statement. "
            'Reply ONLY with JSON: {"details": [...]}'
        )
        msgs = [{"role": "system", "content": system}]
        for q, out in self._PLANT_SHOTS:
            msgs += [{"role": "user", "content": q},
                     {"role": "assistant", "content": json.dumps({"details": out})}]
        msgs.append({"role": "user", "content": question})
        raw = self.voice.chat(msgs, seed=1, temperature=0.0, num_predict=120)
        parsed = self.voice.json(raw) or {}
        items = parsed.get("details") if isinstance(parsed.get("details"), list) else []
        keep = []
        for it in items[:3]:
            if not (isinstance(it, str) and it.strip()):
                continue
            if ACCUSATION.search(it):
                continue  # never plant guilt: a suggestible witness must not "remember" a murder
            if _INDEFINITE.search(it):
                continue  # "someone was on the landing" asserts nothing the question didn't ask
            if (_content_words(it) - VACUOUS) and _derived_from(it, question):
                keep.append(it.strip().rstrip(".") + ".")
        return keep
