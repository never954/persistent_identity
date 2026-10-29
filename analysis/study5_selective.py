"""Study 5 — selective fallibility over a simulated week.

    research/.venv/bin/python analysis/study5_selective.py --model qwen2.5:3b --saves 8

The same two questions are put to a witness on day 0, 1, 3 and 7: one about who they are
(core identity: should stay the same) and one about a detail of the night (episodic: should
fade, faster for a forgetful witness). Thomas (decay dial 0.4) and Dr. Vance (0.1).

Scored from the words: does the identity answer still contain the authored facts, and does
the episodic answer still contain the detail? The engine's own memory state for the episodic
trace (detail / gist / forgotten) is recorded alongside.
"""

from __future__ import annotations

import argparse
import re
import time

from common import engine, fmt, save

ITEMS = {
    "thomas": dict(identity="Tell me about your family back home.", id_pat=r"barnsley|miner|\bpit\b|mam|mother|wash|wages",
                   episode="What did you hear from the study end of the house a bit after eleven last night?",
                   ep_pat=r"thud|crash|bang|shutter", ep_key="th-crash"),
    "vance": dict(identity="Tell me about your late husband.", id_pat=r"robert|passchendaele|1917|war|killed",
                  episode="What did you find when you came back downstairs last night?",
                  ep_pat=r"garden door|door|bang|latch", ep_key="va-shawl"),
}
DAYS = [0, 1, 3, 7]


def run(model: str, saves: int) -> dict:
    rows = []
    t0 = time.time()
    with engine(model) as e:
        for s in range(saves):
            sid = e.new_session()
            for i, day in enumerate(DAYS):
                if i:
                    e.advance(sid, (day - DAYS[i - 1]) * 24 * 60)
                for who, it in ITEMS.items():
                    a_id = e.ask(sid, who, it["identity"])
                    a_ep = e.ask(sid, who, it["episode"])
                    state = next((r["state"] for r in a_ep.trace["recalls"]
                                  if r["kind"] == "episodic" and it["ep_pat"] and re.search(it["ep_pat"], r["text"], re.I)),
                                 "not retrieved")
                    rows.append({"save": s, "day": day, "witness": who,
                                 "identity_answer": a_id.answer, "identity_ok": bool(re.search(it["id_pat"], a_id.answer, re.I)),
                                 "episode_answer": a_ep.answer, "episode_ok": bool(re.search(it["ep_pat"], a_ep.answer, re.I)),
                                 "episode_state": state, "episode_rule": a_ep.trace["decision"]["rule"]})
            print(f"  {model} save {s + 1}/{saves} ({time.time() - t0:.0f}s)", flush=True)
    return {"model": model, "saves": saves, "rows": rows}


def summarise(res: dict) -> str:
    rows = res["rows"]
    out = [f"### {res['model']} — {res['saves']} saves\n",
           "| Witness | Question | " + " | ".join(f"day {d}" for d in DAYS) + " |", "|---|---|" + "---|" * len(DAYS)]
    for who in ITEMS:
        for kind in ("identity", "episode"):
            cells = []
            for d in DAYS:
                sel = [r for r in rows if r["witness"] == who and r["day"] == d]
                cells.append(fmt(sum(r[f"{kind}_ok"] for r in sel), len(sel)))
            out.append(f"| {who} | {kind} | " + " | ".join(cells) + " |")
        cells = []
        for d in DAYS:
            sel = [r for r in rows if r["witness"] == who and r["day"] == d]
            cells.append(" / ".join(f"{st[0]}{sum(r['episode_state'] == st for r in sel)}"
                                    for st in ("detail", "gist", "forgotten")))
        out.append(f"| {who} | engine state d/g/f | " + " | ".join(cells) + " |")
    return "\n".join(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="qwen2.5:3b")
    ap.add_argument("--saves", type=int, default=8)
    args = ap.parse_args()
    res = run(args.model, args.saves)
    tag = args.model.replace(":", "_").replace(".", "")
    save(f"study5_selective_{tag}.json", res)
    md = summarise(res)
    (save.__globals__["RESULTS"] / f"study5_selective_{tag}.md").write_text(md + "\n")
    print(md)
