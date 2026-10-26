"""Tunable constants for the suspect backend, in one place.

Times are simulated hours since 11 p.m. on the night of the murder (t = 0).
The interviews start the next morning; asking, walking and searching move the
clock forward, so memories age while you play.
"""

from __future__ import annotations

import os
from pathlib import Path

from . import ROOT

DATA_DIR = Path(os.environ.get("RAVENSWOOD_DATA", ROOT / "backend" / "data"))
DB_PATH = DATA_DIR / "ravenswood.db"
EMBED_CACHE = DATA_DIR / "embed_cache.npz"
FITTED_PARAMS = ROOT / "research" / "results" / "study1" / "params_fitted.json"

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = "all-minilm"
# First installed model wins. Chat/instruct models voice characters far better
# than coder models; the coder model is last-resort because it is what this
# machine had. Override with RAVENSWOOD_MODEL.
MODEL_PREFERENCE = [
    "qwen2.5:3b", "qwen2.5:3b-instruct", "llama3.2:3b", "gemma3:4b", "phi3.5",
    "qwen2.5:7b", "llama3.1:8b", "qwen2.5-coder:3b", "gemma3:1b", "qwen2.5-coder:1.5b",
]
FORCED_MODEL = os.environ.get("RAVENSWOOD_MODEL")

# ---- Simulated clock -------------------------------------------------------
CLOCK_START_H = 10.0        # 9 a.m. the morning after
MINUTES_PER_QUESTION = 4.0  # each exchange takes a few minutes of game time

# ---- Retrieval (Smallville: recency + importance + relevance) --------------
RECENCY_DECAY = 0.995       # per simulated hour since last access (Park et al. 2023)
TOP_K = 6                   # memories surfaced by the combined score
TOP_REL = 3                 # plus the most relevant few, always
# "Is this memory about the question?" — all-MiniLM's absolute cosines between a
# question and a first-person statement are low and noisy (0.2–0.6 for true
# matches), but its *ranking* is reliable. So: within REL_BAND of the best match
# and above REL_MIN. Calibrated on real questions (see backend/README.md).
REL_MIN = 0.20
REL_BAND = 0.10
# Max cosine to a case anchor / own case memory. Calibration: personal questions
# reached 0.335 at most, case questions 0.428 at least → the midpoint.
CASE_THRESHOLD = 0.38
# A habit (or the memory of the night it didn't happen) at least this close to the
# question engages the habit/episode contest. Calibration on Agnes: tea questions
# 0.472–0.699, unrelated questions ≤ 0.366.
HABIT_ENGAGE = 0.42
# An own episode must be at least this similar to a planted suggestion to compete
# with it (memory-to-memory cosine; e.g. "a woman in a crimson gown on the landing"
# vs Thomas's figure-on-the-landing memory = 0.26).
SAME_EVENT_MIN = 0.20
HISTORY_TURNS = 12          # verbatim recent turns (6 exchanges) given to the voice (working memory)
BACKGROUND_MAX = 5          # "other things on your mind" lines in the prompt

# ---- Write-back ------------------------------------------------------------
# Being questioned about a murder is salient: interview memories start strong
# (strength 1.66), so a 20-minute interrogation is remembered — but still fades over
# hours and days, faster for a forgetful suspect.
IMPORTANCE_HEARD = 7
IMPORTANCE_SAID = 7
IMPORTANCE_PLANTED = 6
IMPORTANCE_SELF_FACT = 6
DEDUPE_COSINE = 0.92        # a re-planted detail rehearses the old trace instead
SELF_FACT_DEDUPE = 0.90     # …and a personal answer given again rehearses the old self-fact

# ---- Voice: sampling, checks and one retry ----------------------------------
# Where the engine has decided a fact (the night, a cover story, a denial, the order
# of the interview) the voice only words it: low temperature. Personal answers may
# improvise, so a little more.
TEMP_FACTUAL = 0.3
TEMP_PERSONAL = 0.6
REPEAT_PENALTY = 1.15       # Ollama's default is 1.1; a little more against parroting
# A lie must still be the cover story. Calibration (all-minilm, qwen2.5:3b answers):
# faithful rewordings 0.59–1.0 cosine to the cover, ones that strayed 0.26–0.40. A
# faithful answer can score low ("my chamber" ≈ 0.29), so ≥2 shared content words
# with the cover also passes.
COVER_MIN = 0.5
# Parroting an earlier answer. Calibration (content-word overlap): identical 1.00, a
# near-copy 0.87, a legitimate consistent paraphrase 0.80, varied answers ≈ 0.33.
REPEAT_OVERLAP = 0.85
REPEAT_NGRAM = 5            # …or the same 5-word run in 2 of the last 4 answers
