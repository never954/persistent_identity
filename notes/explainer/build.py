"""Builds the explainer page from template.html: fills in numbers read from
analysis/results/ and embeds the figures as images.

    research/.venv/bin/python notes/explainer/build.py
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RES = ROOT / "analysis" / "results"
FIG = ROOT / "paper" / "figures"
SECRET = {"lie_alibi", "lie_brandy", "denial_killer"}


def study2(tag: str) -> dict:
    r = json.loads((RES / f"study2_fidelity_{tag}.json").read_text())
    out = {}
    for v, key in (("full", "full"), ("no_checks", "nocheck"), ("prompt_only", "prompt")):
        rows = r["variants"][v]
        out[key] = sum(x["ok"] for x in rows) / len(rows)
        sec = [x for x in rows if x["probe"] in SECRET]
        out["sec" + key] = sum(x["ok"] for x in sec) / len(sec)
    return out


def main() -> None:
    subprocess.run([str(ROOT / "research/.venv/bin/python"), str(ROOT / "analysis/make_figures.py")], check=True)
    for name in ("study2_fidelity", "study3_suggestion", "study4_contagion", "study5_selective"):
        subprocess.run(["sips", "-s", "format", "png", "-Z", "1400", str(FIG / f"{name}.pdf"),
                        "--out", str(HERE / f"{name}.png")], check=True, capture_output=True)
    html = (HERE / "template.html").read_text()
    ll = study2("llama32_3b")
    for k, v in ll.items():
        html = html.replace("{{LL_" + k + "}}", f"{v:.2f}".lstrip("0") if v < 1 else "1.00")

    def img(m: re.Match) -> str:
        data = base64.b64encode((HERE / m.group(1)).read_bytes()).decode()
        return f"data:image/png;base64,{data}"

    html = re.sub(r"\{\{img:([\w.]+)\}\}", img, html)
    left = re.findall(r"\{\{[^}]+\}\}", html)
    assert not left, left
    out = HERE / "reliably_unreliable_explained.html"
    out.write_text(html)
    print(out, f"{out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
