"""Scripted interrogation against a running backend — an end-to-end demo / smoke test.

    research/.venv/bin/python scripts/demo_interrogation.py [http://127.0.0.1:8000]

Shows, with the real model and real embeddings, the four things the memory
system exists for:
  1. it remembers the conversation ("what did I just ask you?");
  2. it answers personal questions as a person, and keeps the answer
     ("what kind of women do you prefer?" … later … "what sort of girl…");
  3. a leading question plants a detail that a suggestible witness later
     reports as his own (Loftus) — while the killer lies and the housekeeper's
     routine overwrites her faded memory of last night;
  4. everything persists: re-reading the session after the fact.
"""

from __future__ import annotations

import sys
import textwrap
import time

import requests

URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")


def call(method: str, path: str, **kw):
    r = requests.request(method, URL + path, timeout=180, **kw)
    r.raise_for_status()
    return r.json()


def ask(save: str, who: str, q: str) -> dict:
    a = call("POST", "/api/ask", json={"save_id": save, "suspect_id": who, "question": q})
    rule = a["trace"]["decision"]["rule"]
    print(f"\n[{a['clock_label']}] YOU → {who}: {q}")
    print(textwrap.indent(textwrap.fill(a["answer"], 92), "    "))
    print(f"    kind={a['kind']}  rule={rule}" + (f"  clue={a['reveals_clue']}" if a["reveals_clue"] else ""))
    return a


def wait_for_plant(save: str, who: str, timeout: float = 90) -> list[str]:
    t0 = time.time()
    while time.time() - t0 < timeout:
        mems = call("GET", f"/api/memories/{save}/{who}")["memories"]
        planted = [m["text"] for m in mems if m["kind"] == "planted"]
        if planted:
            return planted
        time.sleep(2)
    return []


def main() -> None:
    for _ in range(30):
        try:
            h = call("GET", "/api/health")
            break
        except requests.RequestException:
            time.sleep(1)
    else:
        sys.exit(f"no backend at {URL}")
    print(f"backend ok · ollama={h['ollama']} · voice={h['model']} · embeddings={h['embed_model']}")
    save = call("POST", "/api/session", json={"difficulty": "rookie"})["save_id"]
    print(f"new save {save}")

    print("\n== 1-2. A person, with a memory of the conversation ==")
    ask(save, "thomas", "What kind of women do you prefer?")
    ask(save, "thomas", "What did I just ask you?")

    print("\n== 3a. A witness, and a leading question ==")
    ask(save, "thomas", "Did you see anyone near the study last night?")
    lead = "Was it Mrs Hartwell you saw going toward the study door?"
    ask(save, "thomas", lead)
    print(f"    planted (told by the detective): {wait_for_plant(save, 'thomas')}")
    call("POST", "/api/advance", json={"save_id": save, "minutes": 60})
    ask(save, "thomas", "Think hard. Who exactly did you see near the study last night?")

    print("\n== 3b. The killer, and the housekeeper ==")
    ask(save, "vivian", "Where were you at eleven o'clock last night?")
    ask(save, "vivian", "Did you kill Alistair?")
    ask(save, "agnes", "Did you take his lordship's tea up to the study last night?")

    print("\n== 2 (later). Consistency of an improvised answer ==")
    call("POST", "/api/advance", json={"save_id": save, "minutes": 120})
    ask(save, "thomas", "Tell me, what sort of girl catches your eye?")

    print("\n== 4. Persistence ==")
    log = call("GET", f"/api/log/{save}")["turns"]
    print(f"    {len(log)} turns logged for save {save}; memories for Thomas: "
          f"{len(call('GET', f'/api/memories/{save}/thomas')['memories'])}")


if __name__ == "__main__":
    main()
