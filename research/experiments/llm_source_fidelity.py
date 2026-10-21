"""LLM study 1 — does the suspect's VOICE follow the memory layer?

The claim everything downstream rests on: when the memory layer loses a planted
detail's source tag, the LLM suspect actually *says* it as something it saw; when
the tag survives, the suspect attributes it to the detective. A perfect-witness
baseline (B0) never misattributes; a 'just act human' baseline (B3) does so
erratically, with no control and no time course.

Run (needs Ollama with qwen2.5-coder:3b):
    cd research && .venv/bin/python experiments/llm_source_fidelity.py [--seeds N] [--model M]
"""

from __future__ import annotations

import argparse

from llm_common import (LLM_CACHE, PROBE_KEY, RESULTS, ROOT, THOMAS, build_messages,
                        label_answer, recalled_view, write_json)
from lcmem import ModelParams
from lcmem.llm import ChatLLM, PRIMARY_MODEL

CONDS = ["B0_perfect", "B3_act_human", "ours"]
DELAYS_H = [3.0, 72.0, 168.0]       # morning after, three days, a week
T_TOLD = 1.0                         # the detective planted it an hour into questioning
STANCES = ["firsthand", "attributed", "unsure", "denies", "absent"]
PARAMS_PATH = ROOT / "results" / "study1" / "params_fitted.json"


def run(n_seeds: int, model: str) -> dict:
    params = ModelParams.load(PARAMS_PATH) if PARAMS_PATH.exists() else ModelParams()
    llm = ChatLLM(model=model, cache_path=LLM_CACHE)
    transcript, cells = [], {}
    total = len(CONDS) * len(DELAYS_H) * n_seeds
    done = 0
    for cond in CONDS:
        for delay in DELAYS_H:
            counts = {s: 0 for s in STANCES}
            for sd in range(n_seeds):
                view = recalled_view(cond, params, THOMAS, delay, T_TOLD, rng_seed=1000 + sd)
                msgs = build_messages(cond, view, delay)
                raw = llm.chat(msgs, seed=sd, num_predict=220, format_json=True)
                parsed = ChatLLM.extract_json(raw)
                stance = label_answer(parsed, raw)
                counts[stance] += 1
                framing = next((v["framing"] for v in view if v["key"] == PROBE_KEY), "forgotten")
                transcript.append({
                    "condition": cond, "delay_h": delay, "seed": sd,
                    "probe_framing": framing, "stance": stance,
                    "answer": str((parsed or {}).get("answer", raw))[:400],
                })
                done += 1
                print(f"\r  {done}/{total}  {cond}@{delay:g}h seed{sd} -> {stance}      ", end="", flush=True)
            cells[f"{cond}@{delay:g}h"] = {
                "n": n_seeds, "counts": counts,
                "p_firsthand": counts["firsthand"] / n_seeds,
                "p_attributed": counts["attributed"] / n_seeds,
                "p_recalled_at_all": 1 - counts["absent"] / n_seeds,
            }
    print()
    out = {
        "status": "LLM-level demonstration; stance from the model's own field + keyword fallback",
        "model": model, "n_seeds": n_seeds, "delays_h": DELAYS_H,
        "cells": cells, "transcript": transcript,
    }
    write_json("llm_source_fidelity.json", out)
    _write_report(out)
    return out


def _write_report(out) -> None:
    tr = out["transcript"]
    L = ["# LLM study 1 — does the voice follow the memory layer?\n",
         f"Model **{out['model']}** · {out['n_seeds']} seeds per cell · "
         "told detail = \"a woman in a red dress on the landing\" (planted by the detective an hour "
         "into questioning).\n",
         "`firsthand` = claims she saw her (an honest false memory); `attributed` = credits the "
         "detective; `absent` = never brought her up.\n",
         "## 1. Headline: does the honest false memory grow with delay?\n",
         "| Condition | Delay | saw her FIRST-HAND | attributed to detective | recalled her at all |",
         "|---|---|---|---|---|"]
    for key, c in out["cells"].items():
        cond, delay = key.split("@")
        L.append(f"| {cond} | {delay} | {c['p_firsthand']:.2f} | {c['p_attributed']:.2f} | {c['p_recalled_at_all']:.2f} |")

    L.append("\n## 2. Faithfulness: did the voice say what the layer framed?\n")
    L.append("How the suspect spoke, split by how the memory layer framed the planted detail. A "
             "faithful voice says *firsthand* when the layer dropped the source tag (`witnessed`), "
             "and *attributed* when it kept it (`told`).\n")
    L.append("| Condition | Layer framing | n | said firsthand | said attributed | unsure | denies | absent |")
    L.append("|---|---|---|---|---|---|---|---|")
    framings = ["witnessed", "told", "gist", "forgotten"]
    stances = STANCES
    for cond in CONDS:
        for fr in framings:
            rows = [t for t in tr if t["condition"] == cond and t["probe_framing"] == fr]
            if not rows:
                continue
            n = len(rows)
            frac = {s: sum(r["stance"] == s for r in rows) / n for s in stances}
            L.append(f"| {cond} | {fr} | {n} | {frac['firsthand']:.2f} | {frac['attributed']:.2f} | "
                     f"{frac['unsure']:.2f} | {frac['denies']:.2f} | {frac['absent']:.2f} |")

    # Confabulation: the layer forgot the detail, yet the suspect produced her.
    L.append("\n## 3. Confabulation (the layer forgot her — did the suspect invent her?)\n")
    L.append("| Condition | runs where layer FORGOT her | of those, suspect still produced her |")
    L.append("|---|---|---|")
    for cond in CONDS:
        forgot = [t for t in tr if t["condition"] == cond and t["probe_framing"] in ("forgotten",)]
        if not forgot:
            L.append(f"| {cond} | 0 | — |")
            continue
        conf = sum(t["stance"] in ("firsthand", "attributed") for t in forgot) / len(forgot)
        L.append(f"| {cond} | {len(forgot)} | {conf:.2f} |")

    L.append("\n## 4. A few actual answers\n")
    seen = set()
    for t in tr:
        tag = (t["condition"], t["probe_framing"], t["stance"])
        if tag in seen or t["stance"] == "absent":
            continue
        seen.add(tag)
        L.append(f"- **{t['condition']} @ {t['delay_h']:g}h** (layer framed it: *{t['probe_framing']}*; "
                 f"labelled *{t['stance']}*):\n  > {t['answer']}\n")
    (RESULTS / "llm_source_fidelity.md").write_text("\n".join(L))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=10)
    ap.add_argument("--model", default=PRIMARY_MODEL)
    args = ap.parse_args()
    run(args.seeds, args.model)
    print((RESULTS / "llm_source_fidelity.md").read_text())
