"""Study 3 — does a planted suggestion become the witness's own memory, over time?

    research/.venv/bin/python analysis/study3_suggestion.py --model qwen2.5:3b --saves 15

A detail suggested by the detective is planted in a witness (source = detective), then
the witness is asked about that moment after 1 hour, 1 day or 1 week of simulated time.
Two witnesses with different authored suggestibility: Thomas (0.9) and Agnes (0.3).

  fallible     our memory layer decides (source tag fades at the witness's own rate)
  perfect      baseline B1: nothing fades, the source is always kept
  prompt_only  the language model decides, told to act like a person with imperfect memory

Each answer is labelled from its words alone:
  adopted     names the suggested person as if seen first-hand
  attributed  names them but credits the detective ("you said…")
  original    names the person the witness actually saw (Agnes: Julian), not the suggestion
  other       none of these (unsure, forgot, evasive)
"""

from __future__ import annotations

import argparse
import re
import time

from common import engine, fmt, save

ATTRIB = r"\byou (said|told|mentioned|asked|suggested|say)\b|\bthe detective\b|\bi was told\b|\btold me\b|\byou think\b"
UNSURE = r"not sure|can'?t be sure|cannot be sure|couldn'?t say|might have|hazily|i think|perhaps|maybe"

WITNESSES = {
    "thomas": dict(detail="The person seen going toward the study door on the landing was Agnes.",
                   question="Who did you see going toward the study door on the landing last night?",
                   suggested=r"agnes|hartwell", original=None),
    "agnes": dict(detail="The man who came through the kitchen to the cellar at eleven was Thomas.",
                  question="Who came through your kitchen and down to the cellar last night?",
                  suggested=r"thomas|valet|\bbell\b", original=r"julian|master"),
}
CONDITIONS = {"fallible": dict(policy="engine", mode="fallible"),
              "perfect": dict(policy="engine", mode="perfect"),
              "prompt_only": dict(policy="prompt_only", mode="fallible")}
DELAYS_H = [1, 24, 168]


def label(answer: str, w: dict) -> str:
    """Hedging ("only hazily I remember seeing Agnes") still claims the memory as one's own;
    it is recorded separately (hedged), not counted as attribution."""
    a = answer.lower()
    if re.search(w["suggested"], a):
        return "attributed" if re.search(ATTRIB, a) else "adopted"
    if w["original"] and re.search(w["original"], a):
        return "original"
    return "other"


def run(model: str, saves: int) -> dict:
    rows = []
    t0 = time.time()
    for cname, c in CONDITIONS.items():
        with engine(model, checks=(c["policy"] == "engine"), policy=c["policy"]) as e:
            for delay in DELAYS_H:
                for s in range(saves):
                    sid = e.new_session(memory_mode=c["mode"])
                    now = e.store.session(sid)["clock"]
                    for who, w in WITNESSES.items():
                        e._plant(sid, who, [w["detail"]], now, e.store.memories(sid, who))
                    e.advance(sid, delay * 60)
                    for who, w in WITNESSES.items():
                        a = e.ask(sid, who, w["question"])
                        decided_false = a.kind == "false-memory"
                        rows.append({"condition": cname, "delay_h": delay, "save": s, "witness": who,
                                     "answer": a.answer, "label": label(a.answer, w),
                                     "hedged": bool(re.search(UNSURE, a.answer, re.I)),
                                     "engine_rule": a.trace["decision"]["rule"].replace(" [prompt-only voice]", ""),
                                     "engine_false_memory": decided_false})
                print(f"  {model} {cname} {delay}h done ({time.time() - t0:.0f}s)", flush=True)
    return {"model": model, "saves": saves, "rows": rows}


def summarise(res: dict) -> str:
    rows = res["rows"]
    out = [f"### {res['model']} — {res['saves']} saves per cell\n",
           "P(adopted: names the suggestion as seen first-hand)\n",
           "| Witness | Condition | " + " | ".join(f"{d} h" for d in DELAYS_H) + " |",
           "|---|---|" + "---|" * len(DELAYS_H)]
    for who in WITNESSES:
        for cname in CONDITIONS:
            cells = []
            for d in DELAYS_H:
                sel = [r for r in rows if r["witness"] == who and r["condition"] == cname and r["delay_h"] == d]
                cells.append(fmt(sum(r["label"] == "adopted" for r in sel), len(sel)))
            out.append(f"| {who} | {cname} | " + " | ".join(cells) + " |")
    out += ["\nFaithfulness (fallible condition): the words match the engine's decision",
            "(engine decided false memory → adopted; engine kept the original/source → not adopted)\n"]
    for who in WITNESSES:
        sel = [r for r in rows if r["witness"] == who and r["condition"] == "fallible"]
        ok = sum((r["label"] == "adopted") == r["engine_false_memory"] for r in sel)
        fm = sum(r["engine_false_memory"] for r in sel)
        out.append(f"- {who}: {fmt(ok, len(sel))}; engine decided false memory in {fm}/{len(sel)}")
    sel = [r for r in rows if r["condition"] == "prompt_only"]
    ok = sum((r["label"] == "adopted") == r["engine_false_memory"] for r in sel)
    out.append(f"- prompt_only agrees with what the calibrated layer would have decided: {fmt(ok, len(sel))}")
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="qwen2.5:3b")
    ap.add_argument("--saves", type=int, default=15)
    args = ap.parse_args()
    res = run(args.model, args.saves)
    tag = args.model.replace(":", "_").replace(".", "")
    save(f"study3_suggestion_{tag}.json", res)
    md = summarise(res)
    (save.__globals__["RESULTS"] / f"study3_suggestion_{tag}.md").write_text(md + "\n")
    print(md)
