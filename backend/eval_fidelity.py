"""How often does the voice say what the memory layer decided? (a small Study-2 check)

    research/.venv/bin/python backend/eval_fidelity.py [URL] [N_SESSIONS]

Runs N fresh saves through fixed probes against a running backend and scores each
answer with transparent word rules against the ENGINE's decision for that turn:

  memory      "What did I just ask you?"            answer refers back to the question
  persona     romance question asked twice, 3h apart  the two answers overlap
  suggestion  leading question, then recall an hour later:
                false-memory  → names the suggested person
                plain         → does not claim the suggested person
  lie         Vivian's alibi                          tells the cover story (quarters/chamber/headache…)
  denial      Vivian accused                          no confession words
  habit       Agnes's tea:  false-memory → affirms she took it up;
                            plain        → says it went wrong / she didn't
  identity    "Who are you?"                          Vivian names herself, never as Alistair
  premise     Thomas asked about "your wife"          corrects it (he is 19 and unmarried)
  order       after several questions, "What was the first question I asked you?"
                                                      names the first question, as YOUR question

Word rules are crude and stated in full below — the numbers are a sanity check of
the pipeline, not a calibrated measure.
"""

from __future__ import annotations

import re
import sys

import requests

URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
N = int(sys.argv[2]) if len(sys.argv) > 2 else 5


def post(path, **body):
    r = requests.post(URL + path, json=body, timeout=180)
    r.raise_for_status()
    return r.json()


def has(text: str, *patterns: str) -> bool:
    return any(re.search(rf"\b{p}", text, re.I) for p in patterns)


def overlap(a: str, b: str) -> float:
    wa = {w for w in re.findall(r"[a-z]+", a.lower()) if len(w) > 3}
    wb = {w for w in re.findall(r"[a-z]+", b.lower()) if len(w) > 3}
    return len(wa & wb) / max(1, min(len(wa), len(wb)))


def session() -> dict[str, tuple[bool, str]]:
    s = post("/api/session", difficulty="rookie")["save_id"]
    ask = lambda who, q: post("/api/ask", save_id=s, suspect_id=who, question=q)  # noqa: E731
    out: dict[str, tuple[bool, str]] = {}

    first = ask("thomas", "What kind of women do you prefer?")
    a = ask("thomas", "What did I just ask you?")
    out["memory"] = (has(a["answer"], "women", "woman", "girl", "prefer", "like"), a["answer"])

    ask("thomas", "Was it Mrs Hartwell you saw going toward the study door?")
    post("/api/advance", save_id=s, minutes=60)
    a = ask("thomas", "Think hard. Who exactly did you see near the study last night?")
    names = has(a["answer"], "hartwell", "agnes")
    if a["kind"] == "false-memory":
        out["suggestion"] = (names, f"[{a['kind']}] {a['answer']}")
    else:
        out["suggestion"] = (not names or has(a["answer"], "not sure", "couldn't", "can't", "suggest", "mention"),
                             f"[{a['kind']}] {a['answer']}")

    a = ask("vivian", "Where were you at eleven o'clock last night?")
    out["lie"] = (a["kind"] == "lie" and has(a["answer"], "quarters", "room", "chamber", "headache", "retired",
                                             "bed", "early", "turned in"),
                  a["answer"])
    a = ask("vivian", "Did you kill Alistair?")
    out["denial"] = (not has(a["answer"], "i killed", "i struck", "i did it", "candlestick", "sleeping powder",
                             "ledger"), a["answer"])

    a = ask("agnes", "Did you carry his lordship's tea up to the study last night?")
    affirms = has(a["answer"], "yes", "i did", "carried", "took it", "i took", "as always", "every night")
    denies = has(a["answer"], "flood", "scullery", "never", "didn't", "did not", "amiss", "forgot")
    unsure = has(a["answer"], "not sure", "can't be sure", "cannot be sure", "hazy", "can't recall")
    # A false memory affirmed with a hedge ("yes, as always — though I can't be sure") is
    # still the routine speaking; for the plain case, doubt about it counts as not affirming.
    out["habit"] = ((affirms and not denies) if a["kind"] == "false-memory" else (denies or unsure),
                    f"[{a['kind']} · {a['trace']['decision']['rule']}] {a['answer']}")

    post("/api/advance", save_id=s, minutes=180)
    again = ask("thomas", "Tell me, what sort of girl catches your eye?")
    out["persona"] = (overlap(first["answer"], again["answer"]) >= 0.3,
                      f"{first['answer']}  ||  {again['answer']}")

    # The slips seen in play (24 Oct 2026): a wrong name, going along with a false
    # premise, and losing the order of the conversation.
    a = ask("vivian", "Who are you, exactly?")
    out["identity"] = (has(a["answer"], "vivian", "cross") and not has(a["answer"], r"(i am|i'm|my name is) (lord )?alistair"),
                       a["answer"])
    a = ask("thomas", "Tell me about your wife.")
    corrects = has(a["answer"], "not married", "no wife", "don't have a wife", "haven't got a wife", "haven't a wife",
                   "not wed", "unmarried", "too young", "nell", "sweetheart", "isn't my wife", "not my wife",
                   "don't have one", "haven't one", "no one to", "single", "isn't one")
    out["premise"] = (corrects and not has(a["answer"], "my wife is", "my wife and"), a["answer"])
    a = ask("thomas", "What was the first question I asked you?")
    out["order"] = (has(a["answer"], "women", "woman", "prefer") and not has(a["answer"], r"i asked"),
                    f"[{a['trace']['decision']['rule']}] {a['answer']}")
    return out


def main() -> None:
    h = requests.get(URL + "/api/health", timeout=10).json()
    print(f"voice={h['model']}  sessions={N}\n")
    tally: dict[str, list[bool]] = {}
    for i in range(N):
        res = session()
        for k, (ok, text) in res.items():
            tally.setdefault(k, []).append(ok)
            print(f"  s{i + 1} {k:10} {'ok ' if ok else 'MISS'}  {text[:150]}")
        print()
    print("agreement between the engine's decision and the spoken words:")
    for k, oks in tally.items():
        print(f"  {k:10} {sum(oks)}/{len(oks)}")
    total = [x for v in tally.values() for x in v]
    print(f"  {'overall':10} {sum(total)}/{len(total)}  ({100 * sum(total) / len(total):.0f}%)")


if __name__ == "__main__":
    main()
