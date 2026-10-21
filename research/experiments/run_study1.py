"""Run all of Study 1 (cognitive fidelity, memory level) and write a summary.

    cd research && .venv/bin/python experiments/run_study1.py

Order matters: Exp 1a fits the decay shape that 1b-1d reuse.
Outputs: results/study1/*.json, *.png, params_fitted.json, summary.md
"""

from __future__ import annotations

from datetime import datetime, timezone
import platform

import matplotlib
import numpy
import requests
import scipy

from common import RESULTS, write_json
import exp1a_forgetting
import exp1b_drm
import exp1c_misinformation
import exp1d_source
from lcmem import ModelParams
from lcmem.embed import DEFAULT_MODEL, DEFAULT_URL


def _ollama_version() -> str:
    try:
        return requests.get(f"{DEFAULT_URL}/api/version", timeout=5).json().get("version", "?")
    except Exception:  # noqa: BLE001 - informational only
        return "unavailable (embeddings served from cache)"


def main() -> None:
    a = exp1a_forgetting.run()
    eb = a["fits"]["ebbinghaus"]
    params = ModelParams()
    params.power.a = eb["ours_power"]["params"]["a"]
    params.power.tau = eb["ours_power"]["params"]["tau_hours"]
    params.power.d = eb["ours_power"]["params"]["d"]
    params.exp.a = eb["B2_exponential"]["params"]["a"]
    params.exp.S = eb["B2_exponential"]["params"]["S_hours"]
    params.save(RESULTS / "params_fitted.json")

    b = exp1b_drm.run(params)
    bc = exp1b_drm.run(params, center=True)
    c = exp1c_misinformation.run(params)
    d = exp1d_source.run(params)

    manifest = {
        "run_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "python": platform.python_version(),
        "numpy": numpy.__version__,
        "scipy": scipy.__version__,
        "matplotlib": matplotlib.__version__,
        "embedding_model": f"ollama:{DEFAULT_MODEL} (all-MiniLM-L6-v2, 384-d)",
        "ollama": _ollama_version(),
    }
    write_json("manifest.json", manifest)
    (RESULTS / "summary.md").write_text(_summary(a, b, bc, c, d, params, manifest))
    print((RESULTS / "summary.md").read_text())


def _r(x: float) -> str:
    return f"{x:.3f}"


def _summary(a, b, bc, c, d, params, manifest) -> str:
    eb, ho = a["fits"]["ebbinghaus"], a["heldout"]
    L = []
    L.append("# Study 1 — Cognitive fidelity at the memory level (auto-generated)\n")
    L.append(f"Run {manifest['run_utc']} · embeddings {manifest['embedding_model']} · numpy {manifest['numpy']} · scipy {manifest['scipy']}\n")
    L.append("All numbers below are produced by `experiments/run_study1.py`; nothing is hand-entered.\n")

    L.append("## Exp 1a — Forgetting curve (fit to Ebbinghaus; held-out test on Murre & Dros 2015)\n")
    L.append("| Model | params | R² (fit) | RMSE (fit) | AICc | RMSE predicting the replication |")
    L.append("|---|---|---|---|---|---|")
    pw, ex = eb["ours_power"], eb["B2_exponential"]
    L.append(f"| Ours — power law | a={_r(pw['params']['a'])}, τ={_r(pw['params']['tau_hours'])} h, d={_r(pw['params']['d'])} | {_r(pw['r2'])} | {_r(pw['rmse'])} | {pw['aicc']:.1f} | {_r(ho['fit_ebbinghaus_predict_dros']['ours_power_rmse'])} |")
    L.append(f"| B2 — exponential (MemoryBank-style) | a={_r(ex['params']['a'])}, S={ex['params']['S_hours']:.0f} h | {_r(ex['r2'])} | {_r(ex['rmse'])} | {ex['aicc']:.1f} | {_r(ho['fit_ebbinghaus_predict_dros']['B2_exponential_rmse'])} |")
    L.append(f"| B1 — no forgetting (Smallville-style) | — | — | {_r(eb['B1_no_forgetting']['rmse'])} | — | {_r(ho['fit_ebbinghaus_predict_dros']['B1_no_forgetting_rmse'])} |\n")

    for res, title in ((b, "primary, pre-registered"), (bc, "POST-HOC sensitivity: mean-centred embeddings")):
        ca, r, hu = res["calibration_achieved"], res["rates"], res["human"]
        L.append(f"## Exp 1b — DRM false recognition ({title})\n")
        L.append(f"Calibration (Ours): targets remember=.41, hits=.65, unrelated FA=.11 → achieved remember={_r(ca['remember_studied'])}, hits={_r(ca['hits'])}, unrelated FA={_r(ca['unrelated_fa'])}. "
                 f"Max attainable 'know' at unrelated FA=.11: {_r(ca['max_attainable_know_at_target_unrelated_fa'])} (target {_r(ca['target_know'])}; jointly feasible: {ca['jointly_feasible']}).\n")
        L.append("| | Studied (hits) | **Critical lure, studied list** | Unstudied-list words | **Critical lure, unstudied list** |")
        L.append("|---|---|---|---|---|")
        L.append(f"| Human (R&M 1995, Exp 2) | {hu['studied']} | **{hu['lure_studied']}** | {hu['unstudied_item']} | **{hu['lure_unstudied']}** |")
        for key, name in (("ours", "Ours"), ("ours_no_familiarity", "Ours − familiarity"), ("B2_exp_decay", "B2 exp-decay"), ("B1_accurate", "B1 accurate")):
            row = r[key]
            cells = [f"{_r(row[k]['mean'])} [{_r(row[k]['ci95'][0])}, {_r(row[k]['ci95'][1])}]" for k in ("studied", "lure_studied", "unstudied_item", "lure_unstudied")]
            L.append(f"| {name} | " + " | ".join(cells) + " |")
        rk = r["ours"]["remember_know_lure_studied"]
        dg = res["diagnostics"]
        L.append(f"\nBold columns are predictions (never fitted). Lure false alarms in Ours: remember {_r(rk['remember'])} / know {_r(rk['know'])} (human .38 / .34). "
                 f"Mean cosine lure→its list {_r(dg['mean_cos_lure_to_its_list'])} vs between list items {_r(dg['mean_cos_between_list_items'])}; "
                 f"Spearman(lure–list similarity, lure FA) ρ = {_r(dg['spearman_lure_list_similarity_vs_lure_fa']['rho'])}, p = {dg['spearman_lure_list_similarity_vs_lure_fa']['p']:.1e}.\n")

    L.append("## Exp 1c — Misinformation (demonstration; κ = source-decay multiplier, assumption)\n")
    L.append("P(choose original) after MISLEADING information (control in brackets):\n")
    L.append("| Timing | B1 | B2 | Ours − source decay | Ours (κ = 2) |")
    L.append("|---|---|---|---|---|")
    for cell, row in c["accuracy"].items():
        f = lambda k: f"{_r(row[k]['misleading'])} ({_r(row[k]['control'])})"  # noqa: E731
        L.append(f"| {cell.replace('_', ', ')} | {f('B1_accurate')} | {f('B2_exp_decay')} | {f('ours_no_source')} | {f('ours')} |")
    L.append("\nMisinformation effect (control − misleading) for Ours by κ:\n")
    L.append("| κ | " + " | ".join(c["accuracy"]) + " |")
    L.append("|---|" + "---|" * len(c["accuracy"]))
    for kappa, cells in c["kappa_sweep_ours"].items():
        L.append(f"| {kappa} | " + " | ".join(_r(cells[k]["misinformation_effect"]) for k in c["accuracy"]) + " |")
    L.append(f"\nHuman (secondary source, verify): {c['human_secondary']['consistent']} correct consistent vs {c['human_secondary']['misleading']} misleading. Pattern: {c['human_secondary']['pattern']}\n")

    L.append("## Exp 1d — Source monitoring (demonstration)\n")
    cols = ["20m", "1h", "9h", "1d", "2d", "6d", "31d"]
    for key, title in (("misattributed_given_recalled", "Source-amnesia index — of told details still recalled, share recalled as WITNESSED"), ("misattributed", "Joint P(told detail recalled AND felt witnessed) — falls later only because content itself fades")):
        L.append(f"{title}:\n")
        L.append("| κ | " + " | ".join(cols) + " |")
        L.append("|---|" + "---|" * 7)
        for kappa, cur in d["ours_by_kappa"].items():
            L.append(f"| {kappa} | " + " | ".join(_r(x) for x in cur[key]) + " |")
        L.append("| B1 / B2 | " + " | ".join("0.000" for _ in range(7)) + " |\n")

    L.append("## Parameters used\n")
    L.append("```json\n" + __import__("json").dumps(params.to_dict(), indent=2) + "\n```\n")
    return "\n".join(L)


if __name__ == "__main__":
    main()
