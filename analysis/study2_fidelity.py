"""Study 2 — does the spoken answer follow the engine's decision?

    research/.venv/bin/python analysis/study2_fidelity.py --model qwen2.5:3b --saves 12

Held-out probes: none of these questions (or these situations) were used while the
game was being developed and tuned; the development probes live in
analysis/dev_probes.py and are NOT used for any number in the paper.

Three variants of the same pipeline, same model, same saves:
  full         the engine decides, the voice words it, the answer is checked and retried
  no_checks    the engine decides, the voice words it, the first answer is spoken as is
  prompt_only  the voice decides: it sees the memories as stored (secret included) and is
               told to behave like a person with imperfect memory; no checks

Scoring rules are fixed in this file (written before the final runs) and applied
identically to every variant and model. Every answer is saved, so anyone can re-score.
"""

from __future__ import annotations

import argparse
import re
import time

from common import engine, fmt, save

CONFESS = r"\b(i (did it|killed|struck|poisoned|put (a |the |some )?(powder|sleeping)|hit him)|my plan|i confess)\b"
# Details only the concealed truths contain: saying any of them leaks a secret.
LEAK = (r"sleeping powder|powder (in|into)|tipped|candlestick from the mantel|splinter|caught on|side door|"
        r"in at the conservatory|garden in the rain|moving money|burned the ledger|ledger page|IOU|wine rack")


def has(text: str, pattern: str) -> bool:
    return re.search(pattern, text, re.I) is not None


def rule(a) -> str:
    return a.trace["decision"]["rule"].replace(" [prompt-only voice]", "")


# Each probe: (id, suspect, [setup questions], question, scorer(answer, trace, earlier) -> bool)
def probes():
    return [
        ("recall_last", "vance", ["What do you make of the new motorcars everyone is buying?"],
         "Remind me — what did I just ask you?",
         lambda a, t, e: has(a, r"motor|car|automobile")),
        ("order_first", "julian", ["Do you ride?", "Which club do you belong to in London?",
                                   "How often do you visit Ravenswood?"],
         "Which question did I put to you first?",
         lambda a, t, e: has(a, r"\bride|riding|horse") and not has(a, r"\bi asked\b")),
        ("lie_alibi", "julian", [], "Where were you between ten and midnight last night?",
         lambda a, t, e: t["decision"]["kind"] == "lie" and has(a, r"library|reading|book")
         and not has(a, r"cellar") and not has(a, LEAK)),
        ("lie_brandy", "vivian", [], "Did you go into the study last night and touch his brandy?",
         lambda a, t, e: not has(a, CONFESS) and not has(a, LEAK)),
        ("denial_innocent", "julian", [], "Did you kill your uncle?",
         lambda a, t, e: not has(a, CONFESS) and has(a, r"\bno\b|never|not|how dare|absurd|ridiculous")),
        ("denial_killer", "vivian", [], "You murdered him. Admit it.",
         lambda a, t, e: not has(a, CONFESS) and not has(a, LEAK)),
        ("habit_tea", "agnes", [], "Tell me how you served his lordship's tea last night.",
         lambda a, t, e: (has(a, r"\b(took|carried|brought|set|served)\b") and not has(a, r"flood|scullery|never|didn'?t|did not"))
         if rule_t(t) == "habit intrusion" else has(a, r"flood|scullery|never|didn'?t|did not|not sure|amiss|forgot")),
        ("persona_music", "julian", ["What kind of music do you like?"],
         "And what do you put on the gramophone when you're alone?",
         lambda a, t, e: overlap(a, e[-1]) >= 0.25 or has(a, r"jazz|whiteman|dance band|foxtrot")),
        ("identity", "agnes", [], "Tell me who you are.",
         lambda a, t, e: has(a, r"agnes|hartwell|housekeeper")),
        ("premise_vance", "vance", [], "How long were you married to Lord Ravenswood?",
         lambda a, t, e: has(a, r"never|wasn'?t|was not|not married|not related|no relation|robert|husband|widow|no,")
         and not has(a, r"\bwe were married for\b|\bmarried to (him|alistair|lord) for\b")),
        ("premise_julian", "julian", [], "Tell me about your children.",
         lambda a, t, e: has(a, r"no children|haven'?t any|have none|don'?t have|not married|bachelor|no wife|none")),
        ("unknown_term", "thomas", [], "What do you think of the internet?",
         lambda a, t, e: not has(a, r"network|computer|online|web|e-?mail")
         and has(a, r"never heard|don'?t know|what (is|'s)|not sure what|don'?t understand|no idea|means nothing")),
        ("no_confabulation", "vance", [], "What colour was the dress of the woman on the landing?",
         lambda a, t, e: not has(a, r"\b(red|crimson|scarlet|blue|green|black|white|grey|gray|yellow|purple|pink)\b")
         or has(a, r"didn'?t see|did not see|no idea|couldn'?t say|cannot say|don'?t know|not see")),
    ]


def rule_t(t: dict) -> str:
    return t["decision"]["rule"].replace(" [prompt-only voice]", "")


def overlap(a: str, b: str) -> float:
    wa = {w for w in re.findall(r"[a-z]+", a.lower()) if len(w) > 3}
    wb = {w for w in re.findall(r"[a-z]+", b.lower()) if len(w) > 3}
    return len(wa & wb) / max(1, min(len(wa), len(wb)))


VARIANTS = {"full": dict(checks=True, policy="engine"),
            "no_checks": dict(checks=False, policy="engine"),
            "prompt_only": dict(checks=False, policy="prompt_only")}


def run(model: str, saves: int, variants: list[str]) -> dict:
    out = {"model": model, "saves": saves, "variants": {}}
    for vname in variants:
        rows = []
        t0 = time.time()
        with engine(model, **VARIANTS[vname]) as e:
            for s in range(saves):
                sid = e.new_session()
                for pid, who, setup, q, score in probes():
                    earlier = [e.ask(sid, who, x).answer for x in setup]
                    if pid == "persona_music":
                        e.advance(sid, 180)          # three hours later
                    a = e.ask(sid, who, q)
                    ok = bool(score(a.answer, a.trace, earlier))
                    rows.append({"save": s, "probe": pid, "suspect": who, "question": q, "answer": a.answer,
                                 "kind": a.kind, "rule": rule(a), "ok": ok,
                                 "retried": len(a.trace.get("checks", [])) > 1,
                                 "fallback": any(c.get("fallback") for c in a.trace.get("checks", []))})
                print(f"  {model} {vname} save {s + 1}/{saves}  ({time.time() - t0:.0f}s)", flush=True)
        out["variants"][vname] = rows
    return out


def summarise(res: dict) -> str:
    lines = [f"### {res['model']} — {res['saves']} saves per variant\n",
             "| Probe | " + " | ".join(res["variants"]) + " |", "|---|" + "---|" * len(res["variants"])]
    pids = [p[0] for p in probes()]
    for pid in pids + ["ALL"]:
        cells = []
        for rows in res["variants"].values():
            sel = [r for r in rows if pid == "ALL" or r["probe"] == pid]
            cells.append(fmt(sum(r["ok"] for r in sel), len(sel)))
        lines.append(f"| {pid} | " + " | ".join(cells) + " |")
    full = res["variants"].get("full", [])
    if full:
        lines.append(f"\nfull: retried {sum(r['retried'] for r in full)}/{len(full)}, "
                     f"engine fallback line {sum(r['fallback'] for r in full)}/{len(full)}")
    return "\n".join(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="qwen2.5:3b")
    ap.add_argument("--saves", type=int, default=12)
    ap.add_argument("--variants", default="full,no_checks,prompt_only")
    args = ap.parse_args()
    res = run(args.model, args.saves, args.variants.split(","))
    tag = args.model.replace(":", "_").replace(".", "")
    save(f"study2_fidelity_{tag}.json", res)
    md = summarise(res)
    (save.__globals__["RESULTS"] / f"study2_fidelity_{tag}.md").write_text(md + "\n")
    print(md)
