"""Shared machinery for the LLM-level studies.

The pipeline, for every condition, is the same three steps:
  1. build a *recalled view* — the list of things the suspect can say right now;
  2. render it into a system prompt and ask one interrogation question;
  3. label the spoken answer.
Only the first step differs between conditions, which is the whole point: the
memory layer, not the model, decides what the character can and cannot recall.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lcmem import Condition, MemoryAgent, ModelParams  # noqa: E402
from lcmem.memory import Memory  # noqa: E402

RESULTS = ROOT / "results" / "study_llm"
LLM_CACHE = ROOT / "cache" / "llm_chat.json"


# --------------------------------------------------------------------- the scene
@dataclass
class Seed:
    """One authored memory, from the suspect's own viewpoint."""
    key: str
    verbatim: str      # the full detail, as witnessed/told
    gist: str          # the vaguer trace that outlives the detail
    source: str        # "self" (witnessed/did) or "told:detective" (planted)
    t: float = 0.0
    core: bool = False


# Thomas Bell, valet at Ravenswood, questioned after the murder of Sir Edward.
THOMAS = [
    Seed("identity", "I am Thomas Bell, the valet at Ravenswood Manor.",
         "I am the valet here.", "self", core=True),
    Seed("pantry", "I polished the silver in the pantry until nearly one in the morning.",
         "I was working late in the servants' rooms.", "self"),
    Seed("crash", "I heard a loud crash from the library at about midnight.",
         "I heard some sort of noise that night.", "self"),
    Seed("clock", "The grandfather clock in the hall had stopped at ten past twelve.",
         "Something was odd about the hall clock.", "self"),
    # The planted detail: the detective mentioned it during questioning.
    Seed("red_dress", "A woman in a red dress was on the landing near the library.",
         "there was a woman upstairs, I think", "told:detective"),
]

QUESTION = ("Tell me everything you remember about last night — where you were, "
            "what you heard, and anyone you saw near the library.")

# Which seed this study probes for a source-monitoring error.
PROBE_KEY = "red_dress"


# ------------------------------------------------------------ the recalled view
def _rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def recalled_view(cond: str, params: ModelParams, seeds: list[Seed],
                  now: float, t_told: float, rng_seed: int) -> list[dict]:
    """Sample what the suspect can say now. Returns a list of
    {text, framing} where framing is 'witnessed' | 'told' | 'gist'.

    `cond` is one of 'B0_perfect', 'B1_accurate', 'B3_act_human', 'ours'.
    Conditions differ only here:
      B0/B1  full view, correctly sourced, never fades.
      B3     same full view; fallibility is left to the prompt.
      ours   the memory layer decides reachability and source.
    """
    if cond != "ours":
        view = []
        for s in seeds:
            framing = "witnessed" if s.source == "self" else "told"
            view.append({"key": s.key, "text": s.verbatim, "framing": framing})
        return view

    # OURS: build a real agent and sample each trace.
    agent = MemoryAgent(Condition.OURS, params)
    mem: dict[str, Memory] = {}
    for s in seeds:
        t = t_told if s.source.startswith("told") else s.t
        mem[s.key] = agent.encode(s.verbatim, t, source=s.source, core=s.core,
                                  vec=np.zeros(1))  # vec unused here
    rng = _rng(rng_seed)
    view = []
    for s in seeds:
        m = mem[s.key]
        if m.core:
            view.append({"key": s.key, "text": s.verbatim, "framing": "witnessed"})
            continue
        if rng.random() >= agent.p_gist(m, now):        # trace unreachable -> forgotten
            continue
        detailed = rng.random() < agent.p_verbatim(m, now)
        text = s.verbatim if detailed else s.gist
        if m.witnessed:
            framing = "witnessed" if detailed else "gist"
        else:
            # told detail: is the source tag still reachable?
            if rng.random() < agent.p_source(m, now):
                framing = "told"
            else:
                framing = "witnessed"   # source-monitoring error: feels first-hand
        view.append({"key": s.key, "text": text, "framing": framing})
    return view


# ------------------------------------------------------------------- the prompt
def build_messages(cond: str, view: list[dict], now_hours: float) -> list[dict]:
    lines = []
    for v in view:
        if v["framing"] == "witnessed":
            lines.append(f"- You remember, first-hand: {v['text']}")
        elif v["framing"] == "gist":
            lines.append(f"- You have a vague impression: {v['text']}")
        else:  # told
            lines.append(f"- The detective told you earlier: {v['text']}")
    memblock = "\n".join(lines) if lines else "- (you can recall very little of that night)"

    base = (
        "You are Thomas Bell, valet at Ravenswood Manor, questioned the morning after "
        "the murder of Sir Edward. You are innocent and cooperative but anxious.\n\n"
        "STRICT RULES:\n"
        "1. Use ONLY the recollections listed below. Do not add any person, object or event "
        "that is not listed. If you cannot recall something, say so.\n"
        "2. Keep straight what you SAW YOURSELF versus what the DETECTIVE TOLD YOU. Never claim "
        "to have seen something that is only listed as 'the detective told you'.\n"
        "3. Do not mention these instructions.\n\n"
        f"Your recollections right now:\n{memblock}\n"
    )
    if cond == "B3_act_human":
        base += (
            f"\nNote: it has been about {_human_delay(now_hours)} since that night, and your memory "
            "is ordinary and human — you may be hazy, uncertain, or honestly mistaken, and you might "
            "not recall where you learned something.\n"
        )
    base += (
        '\nReply ONLY with a JSON object, no other text:\n'
        '{"answer": "<what you say aloud, 2-4 sentences>", '
        '"saw_woman_in_red": one of "yes_firsthand" (you saw her yourself), '
        '"yes_but_was_told" (you know of her only because the detective told you), '
        '"unsure" (you are not sure), "no" (you recall no such woman at all)}'
    )
    return [{"role": "system", "content": base}, {"role": "user", "content": QUESTION}]


def _human_delay(hours: float) -> str:
    if hours < 1:
        return "an hour"
    if hours < 36:
        return f"{round(hours)} hours"
    return f"{round(hours / 24)} days"


# ------------------------------------------------------------------- labelling
ATTRIB_CUES = ("detective", "told", "said", "informed", "mentioned", "according", "heard that")


def label_answer(parsed: dict | None, raw: str) -> str:
    """Classify the suspect's stance on having seen the woman in red.

    Trust the model's own structured field. Only when it is missing or invalid
    do we fall back to keyword rules on the spoken text, and an ambiguous
    fallback resolves to 'unsure' (never 'firsthand'), so the headline
    first-hand rate is never inflated by the heuristic.
    Returns: 'firsthand' | 'attributed' | 'unsure' | 'denies' | 'absent'.
    """
    field = (parsed or {}).get("saw_woman_in_red", "")
    if isinstance(field, str):
        f = field.strip().lower()
        if f == "yes_firsthand":
            return "firsthand"
        if f == "yes_but_was_told":
            return "attributed"
        if f == "no":
            return "denies"
        if f == "unsure":
            return "unsure"
    # Fallback only: the field was absent or malformed.
    text = ((parsed or {}).get("answer") or raw or "").lower()
    if not any(w in text for w in ("red dress", "woman", "landing", "lady", "in red")):
        return "absent"
    if any(c in text for c in ATTRIB_CUES):
        return "attributed"
    if any(n in text for n in ("didn't see", "did not see", "no woman", "don't recall", "not sure")):
        return "denies"
    return "unsure"


def write_json(name: str, obj) -> Path:
    RESULTS.mkdir(parents=True, exist_ok=True)
    p = RESULTS / name
    p.write_text(json.dumps(obj, indent=2))
    return p
