"""What a person in an English country house in 1926 could not know.

Asked about Donald Trump, a mobile phone or "RA", a character must not explain
it — and should not give a vague, generic non-answer either. A real person meets
a strange word and reacts in character: asks what it means, makes a joke of it,
or cannot be bothered (characters.TEMPERAMENT[...].unknown_style).

Two layers, cheapest first:

1. a lexicon of well-known later people, inventions, brands, events and slang
   (deterministic, no model call);
2. for questions that ASK about a term ("what is ra?", "have you heard of X?",
   "who is Y?") or contain an unexplained acronym, a one-shot check by the chat
   model at temperature 0, told who and what the household does know.

The same lexicon checks the answers: a 1926 suspect who mentions the internet
is retried (agent._check).
"""

from __future__ import annotations

import json
import re

from .characters import CHARACTERS

# Later than 1926, or never a thing in 1926 England. Whole words, case-insensitive.
# Left out on purpose — words a 1926 Englishman did use: robot (R.U.R., 1920), jet
# (the black stone), musk, Drake, Madonna, Stalin, satellite, pandemic (1918),
# helicopter, television (Baird showed it in January 1926).
MODERN = [
    # people
    "donald trump", "trump", "biden", "obama", "hillary clinton", "clinton", "putin", "zelensky",
    "elon musk", "bill gates", "steve jobs", "zuckerberg", "jeff bezos", "taylor swift",
    "beyonce", "kanye", "michael jackson", "elvis", "beatles", "messi", "ronaldo",
    "modi", "boris johnson", "thatcher", "princess diana", "harry potter", "marilyn monroe",
    "netanyahu", "benjamin netanyahu", "bibi", "trudeau", "macron", "merkel", "sunak", "rishi sunak",
    "starmer", "keir starmer", "theresa may", "tony blair", "xi jinping", "kim jong", "kim jong un",
    "erdogan", "zelenskyy", "bolsonaro", "kamala harris", "reagan", "nixon", "mandela",
    "elizabeth ii", "queen elizabeth ii", "king charles iii", "prince harry",
    "meghan markle", "princess kate", "mr bean", "james bond", "star wars", "marvel", "disney",
    "hitler", "nazi", "nazis", "mao", "jfk", "martin luther king",
    # technology
    "internet", "online", "website", "web site", "wifi", "wi-fi", "bluetooth", "email", "e-mail",
    "computer", "laptop", "smartphone", "iphone", "android", "mobile phone", "cell phone", "cellphone",
    "text message", "texting", "selfie", "app", "apps", "software", 
    "artificial intelligence", "ai", "chatgpt", "gpt", "chatbot", "google", "youtube", "facebook",
    "instagram", "tiktok", "twitter", "whatsapp", "snapchat", "netflix", "amazon prime", "spotify",
    "uber", "bitcoin", "crypto", "cryptocurrency", "nft", "tv", "microwave", "nuclear",
    "atomic bomb", "atom bomb", "rocket ship", "spaceship", "jet plane",
    "credit card", "dvd", "cd", "mp3", "video game", "videogame", "playstation", "xbox", "nintendo",
    "emoji", "hashtag", "podcast", "zoom call", "gps",
    # events / ideas
    "world war 2", "world war ii", "ww2", "wwii", "second world war", "cold war", "moon landing",
    "9/11", "covid", "coronavirus", "lockdown", "brexit", "the eu", "european union",
    # slang
    "lol", "lmao", "omg", "rizz", "sus", "vibe", "vibes", "bro", "bruh", "cringe", "simp", "noob",
    "selfies", "ok boomer", "boomer",
]
_MODERN_RE = re.compile(r"\b(" + "|".join(re.escape(t) for t in sorted(MODERN, key=len, reverse=True)) + r")\b",
                        re.I)

# Asking ABOUT a term: the cases where an unknown word must be met as unknown.
_ASKS_ABOUT = re.compile(
    r"\b(what|who)\s*(is|are|was|'s|s)\s+(an?\s+|the\s+)?(?P<t1>[\w\-' ]{1,40}?)\s*\??$"
    r"|\bwhat\s+(does|do)\s+(?P<t2>[\w\-']{1,30})\s+mean\b"
    r"|\b(heard of|know about|know of|think of|think about|opinion of|opinion on)\s+(?P<t3>[\w\-' ]{1,40}?)\s*\??$",
    re.I)
_ACRONYM = re.compile(r"\b[A-Z]{2,5}s?\b")
# Acronyms a 1926 Englishman knows.
KNOWN_ACRONYMS = {"BBC", "RAF", "MP", "MPS", "GP", "PM", "USA", "UK", "OK", "DR", "MR", "MRS", "VC", "QC", "KC",
                  "HMS", "RSVP", "AM", "PM", "SOS", "GWR", "LMS", "IOU", "IOUS", "OBE", "CID"}

# Names, places and things everyone in the house knows: never "unknown".
_HOUSEHOLD = {w.lower() for c in CHARACTERS.values() for w in re.findall(r"[A-Za-z]+", c.name)} | {
    "alistair", "ravenswood", "manor", "nell", "barnaby", "daisy", "robert", "albert", "barnsley", "bristol",
    "mayfair", "london", "oxford", "paris", "cross", "lord", "lady", "miss", "mrs", "mr", "dr", "doctor",
    "detective", "inspector", "study", "library", "conservatory", "cellar", "kitchen", "foyer", "brandy",
    "candlestick", "ledger", "tea", "you", "me", "him", "her", "it", "this", "that", "your", "my", "he", "she",
}

_ERA_SHOTS = [
    ("what is ra?", ["ra"]),
    ("Who is Charlie Chaplin?", []),
    ("What is a gramophone?", []),
    ("Have you heard of the Kardashians?", ["the Kardashians"]),
    ("What does yeet mean?", ["yeet"]),
    ("What is the League of Nations?", []),
    ("What do you think of NATO?", ["NATO"]),
]


def modern_terms(text: str) -> list[str]:
    """Lexicon hits, in order, without repeats."""
    seen: list[str] = []
    for m in _MODERN_RE.finditer(text):
        t = m.group(0)
        if t.lower() not in (s.lower() for s in seen):
            seen.append(t)
    return seen


def _candidates(question: str) -> list[str]:
    """Terms the question asks about, plus unexplained acronyms — the ones worth a check."""
    out = []
    m = _ASKS_ABOUT.search(question.strip())
    if m:
        term = (m.group("t1") or m.group("t2") or m.group("t3") or "").strip(" ?.!")
        words = [w for w in re.findall(r"[a-z']+", term.lower())]
        if term and words and not all(w in _HOUSEHOLD for w in words) and len(words) <= 4:
            out.append(term)
    for a in _ACRONYM.findall(question):
        if a.upper() not in KNOWN_ACRONYMS and a.lower() not in _HOUSEHOLD and a not in out and a != "I":
            out.append(a)
    return out


def unknown_terms(question: str, voice) -> list[str]:
    """Terms in the question that a person in 1926 England would not know or understand."""
    hits = modern_terms(question)
    if hits:
        return hits
    cands = _candidates(question)
    if not cands or voice is None:
        return []
    system = (
        "You decide whether a person living in an English country house in 1926 would know a word, "
        "name, abbreviation or thing mentioned in a question. They know the world up to 1926 — the Great "
        "War, the King, Chaplin, motorcars, the wireless, jazz — and nothing invented, named or famous "
        "later. They do not know modern slang or abbreviations they have never seen. List ONLY the terms "
        'they would not know or understand. Reply ONLY with JSON: {"unknown": [...]}'
    )
    msgs = [{"role": "system", "content": system}]
    for q, out in _ERA_SHOTS:
        msgs += [{"role": "user", "content": q}, {"role": "assistant", "content": json.dumps({"unknown": out})}]
    msgs.append({"role": "user", "content": question})
    parsed = voice.json(voice.chat(msgs, seed=3, temperature=0.0, num_predict=60)) or {}
    items = parsed.get("unknown") if isinstance(parsed.get("unknown"), list) else []
    q = question.lower()
    # Only terms really in the question (the checker must not invent any).
    return [str(t).strip() for t in items[:3] if isinstance(t, str) and t.strip() and t.strip().lower() in q]
