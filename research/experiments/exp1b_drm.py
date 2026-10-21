"""Experiment 1b — DRM false recognition (Roediger & McDermott 1995, Exp. 2).

Question: does the agent falsely recognise a never-presented critical lure
(e.g. "sleep" after "bed, rest, tired ...") at human rates — and do the
baselines?

Design (mirrors R&M Exp. 2): 24 lists, three counterbalancing groups; each
group studies 16 lists (2.4 min per list) and leaves 8 unstudied. The
recognition test (5 min after the last list) uses serial positions 1, 8, 10 of
every studied and unstudied list, plus all 24 critical lures.

Pre-registered protocol (fixed before any lure result was seen):
* Decay *shape* (tau, d) comes from Exp 1a (Ebbinghaus fit); gist_ratio = 0.5;
  similarity exponent k = 3 (MINERVA 2).
* Ours has 3 free parameters — word encoding level a, criterion, noise —
  calibrated on 3 targets that involve only studied or unrelated items:
      remember(studied) = .41, hits = .65 (i.e. know = .24),
      false alarms to unstudied-list items = .11.
* PREDICTIONS (never fitted): critical-lure false alarms for studied lists
  (human .72) and unstudied lists (human .16), and the remember/know split of
  lure false alarms (human .38 / .34).
* Each baseline gets its best shot at the hit rate (.65): B2 and the
  no-familiarity ablation have their level calibrated to it; B1 has no free
  parameter.
* Reported numbers come from re-running MemoryAgent with the calibrated
  parameters (the calibration maths is only used to find them).
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import brentq, least_squares
from scipy.stats import spearmanr

from common import CACHE, COLORS, LABELS, RESULTS, bootstrap_ci, plot_style, write_json
from lcmem import Condition, MemoryAgent, ModelParams
from lcmem.datasets import DRM_LISTS, DRM_TEST_POSITIONS, human_reference
from lcmem.decay import normal_cdf
from lcmem.embed import Embedder

LIST_HOURS = 2.4 / 60  # 15 words at 1.5 s + recall/arithmetic period
TEST_GAP_HOURS = 5 / 60
NOW = 16 * LIST_HOURS + TEST_GAP_HOURS
KINDS = ["studied", "lure_studied", "unstudied_item", "lure_unstudied"]


def build_design():
    names = sorted(DRM_LISTS)
    sets = [names[0::3], names[1::3], names[2::3]]
    groups = []
    for g in range(3):
        rng = np.random.default_rng(100 + g)
        studied = [n for i, s in enumerate(sets) if i != g for n in s]
        studied = [studied[i] for i in rng.permutation(len(studied))]
        probes = []
        for n in studied:
            probes += [(DRM_LISTS[n][p], n, "studied") for p in DRM_TEST_POSITIONS]
            probes.append((n, n, "lure_studied"))
        for n in sets[g]:
            probes += [(DRM_LISTS[n][p], n, "unstudied_item") for p in DRM_TEST_POSITIONS]
            probes.append((n, n, "lure_unstudied"))
        groups.append({"studied": studied, "probes": probes})
    return groups


def make_agent(condition, params, group, vec):
    agent = MemoryAgent(condition, params)
    for i, n in enumerate(group["studied"]):
        for w in DRM_LISTS[n]:
            agent.encode(w, i * LIST_HOURS, vec=vec[w])
    return agent


def run(params: ModelParams, center: bool = False) -> dict:
    """center=False is the pre-registered analysis. center=True is a POST-HOC
    sensitivity analysis: embeddings are mean-centred over the experiment
    vocabulary and re-normalised (standard correction for the anisotropy of
    sentence-embedding spaces), added after the primary run showed the
    calibration targets were jointly infeasible."""
    ref = human_reference()["drm_rm1995_exp2_recognition"]
    emb = Embedder(CACHE)
    words = sorted({w for ws in DRM_LISTS.values() for w in ws} | set(DRM_LISTS))
    E = emb.embed(words)
    if center:
        E = E - E.mean(axis=0)
        E = E / np.linalg.norm(E, axis=1, keepdims=True)
    vec = dict(zip(words, E))
    tag = "_centered" if center else ""
    groups = build_design()
    pw, k = params.power, params.recognition.k

    # ---------------- calibration quantities (exact, including the 1.0 cap)
    hv, sims, Hg, b2u, kind = [], [], [], [], []
    for g in groups:
        times = np.array([i * LIST_HOURS for i, n in enumerate(g["studied"]) for _ in DRM_LISTS[n]])
        trace_vecs = np.stack([vec[w] for n in g["studied"] for w in DRM_LISTS[n]])
        dt = NOW - times
        hg = (1 + dt / pw.tau) ** (-pw.d * pw.gist_ratio)
        studied_words = {w.lower(): j for j, w in enumerate(w for n in g["studied"] for w in DRM_LISTS[n])}
        for word, _, kd in g["probes"]:
            j = studied_words.get(word.lower())
            hv.append((1 + dt[j] / pw.tau) ** (-pw.d) if j is not None else 0.0)
            b2u.append(float(np.exp(-dt[j] / params.exp.S)) if j is not None else 0.0)
            sims.append(np.clip(trace_vecs @ vec[word], 0, None) ** k)
            Hg.append(hg)
            kind.append(kd)
    hv, b2u, kind = np.array(hv), np.array(b2u), np.array(kind)
    sims, Hg = np.stack(sims), np.stack(Hg)
    S, U = kind == "studied", kind == "unstudied_item"

    target_R = ref["remember_know"]["studied"][0]
    a = brentq(lambda a: np.minimum(1, a * hv[S]).mean() - target_R, 1e-6, 50)
    rec = np.minimum(1, a * hv)
    fam_raw = np.einsum("pj,pj->p", sims, np.minimum(1, a * Hg))

    def resid(x):
        fam = normal_cdf((fam_raw - x[0]) / np.exp(x[1]))
        return [((1 - rec) * fam)[S].mean() - (ref["studied_hit"] - target_R), fam[U].mean() - ref["nonstudied_list_item"]]

    sol = least_squares(resid, [np.median(fam_raw), np.log(np.std(fam_raw) + 1e-9)])
    criterion, noise = float(sol.x[0]), float(np.exp(sol.x[1]))

    # Feasibility: with unrelated FA pinned at its target, how much 'know' can
    # studied items reach at best? (If below .24 the targets are jointly infeasible.)
    max_know = 0.0
    for lsig in np.linspace(-5, 2, 300):
        sig = np.exp(lsig)
        c0 = brentq(lambda c: normal_cdf((fam_raw[U] - c) / sig).mean() - ref["nonstudied_list_item"], -100, 100)
        max_know = max(max_know, float(((1 - rec) * normal_cdf((fam_raw - c0) / sig))[S].mean()))
    a_b2 = brentq(lambda x: np.minimum(1, x * b2u[S]).mean() - ref["studied_hit"], 1e-6, 50)
    a_nofam = brentq(lambda x: np.minimum(1, x * hv[S]).mean() - ref["studied_hit"], 1e-6, 50)

    # ---------------- re-run the real agents with the calibrated parameters
    def tuned(**kw):
        p = ModelParams.from_dict(params.to_dict())
        for key, v in kw.items():
            section, field = key.split("__")
            setattr(getattr(p, section), field, v)
        return p

    cond_params = {
        "B1_accurate": (Condition.B1_ACCURATE, params),
        "B2_exp_decay": (Condition.B2_EXP_DECAY, tuned(exp__a=a_b2)),
        "ours_no_familiarity": (Condition.OURS_NO_FAMILIARITY, tuned(power__a=a_nofam)),
        "ours": (Condition.OURS, tuned(power__a=a, recognition__criterion=criterion, recognition__noise=noise)),
    }
    records = []
    for gi, g in enumerate(groups):
        agents = {c: make_agent(cond, p, g, vec) for c, (cond, p) in cond_params.items()}
        for word, lst, kd in g["probes"]:
            row = {"group": gi, "word": word, "list": lst, "kind": kd}
            for c, ag in agents.items():
                row[c] = ag.p_old(word, NOW, probe_vec=vec[word])
            row["ours_remember"] = agents["ours"].p_recollect(word, NOW)
            records.append(row)

    def summarise(c):
        out = {}
        for kd in KINDS:
            per_list = [np.mean([r[c] for r in records if r["kind"] == kd and r["list"] == n]) for n in sorted(DRM_LISTS) if any(r["kind"] == kd and r["list"] == n for r in records)]
            m, lo, hi = bootstrap_ci(per_list)
            out[kd] = {"mean": m, "ci95": [lo, hi]}
        return out

    rates = {c: summarise(c) for c in cond_params}
    lure_rows = [r for r in records if r["kind"] == "lure_studied"]
    rem = float(np.mean([r["ours_remember"] for r in lure_rows]))
    rates["ours"]["remember_know_lure_studied"] = {"remember": rem, "know": float(np.mean([r["ours"] for r in lure_rows])) - rem}

    # ---------------- mechanism diagnostics: critical lures are semantic hubs
    names = sorted(DRM_LISTS)
    cos_lure, cos_item = [], []
    for n in names:
        M = np.stack([vec[w] for w in DRM_LISTS[n]])
        cos_lure.append(float((M @ vec[n]).mean()))
        G = M @ M.T
        cos_item.append(float((G.sum() - len(M)) / (len(M) * (len(M) - 1))))
    lure_fa = [np.mean([r["ours"] for r in lure_rows if r["list"] == n]) for n in names]
    rho, pval = spearmanr(cos_lure, lure_fa)

    human = {
        "studied": ref["studied_hit"],
        "lure_studied": ref["critical_lure_studied_list"],
        "unstudied_item": ref["nonstudied_list_item"],
        "lure_unstudied": ref["critical_lure_nonstudied_list"],
    }
    achieved = {
        "remember_studied": float(np.mean([r["ours_remember"] for r in records if r["kind"] == "studied"])),
        "hits": rates["ours"]["studied"]["mean"],
        "unrelated_fa": rates["ours"]["unstudied_item"]["mean"],
        "targets": {"remember_studied": target_R, "hits": ref["studied_hit"], "unrelated_fa": ref["nonstudied_list_item"]},
        "max_attainable_know_at_target_unrelated_fa": max_know,
        "target_know": ref["studied_hit"] - target_R,
        "jointly_feasible": bool(max_know >= ref["studied_hit"] - target_R - 1e-3),
    }
    out = {
        "analysis": "post-hoc sensitivity (mean-centred embeddings)" if center else "primary (pre-registered)",
        "calibration_achieved": achieved,
        "protocol": "Ours calibrated on remember(studied)=.41, hits=.65, unrelated FA=.11; critical-lure rates are predictions. Baselines calibrated to hits=.65 where they have a free level.",
        "calibrated_params": {
            "ours": {"a_word": float(a), "criterion": criterion, "noise": noise},
            "B2_exp_decay": {"a": float(a_b2)},
            "ours_no_familiarity": {"a": float(a_nofam)},
        },
        "human": human,
        "rates": rates,
        "per_list_lure_fa_ours": dict(zip(names, map(float, lure_fa))),
        "diagnostics": {
            "mean_cos_lure_to_its_list": float(np.mean(cos_lure)),
            "mean_cos_between_list_items": float(np.mean(cos_item)),
            "spearman_lure_list_similarity_vs_lure_fa": {"rho": float(rho), "p": float(pval)},
        },
    }
    write_json(f"exp1b_drm{tag}.json", out)
    _plot(rates, human, tag)
    return out


def _plot(rates, human, tag=""):
    plt = plot_style()
    xlabels = [
        "Studied words\n(hits — calibrated)",
        "Critical lure,\nstudied list\n(PREDICTED)",
        "Unstudied-list words\n(calibrated)",
        "Critical lure,\nunstudied list\n(PREDICTED)",
    ]
    series = [("human", "Human (Roediger & McDermott 1995)")] + [
        (c, LABELS[c]) for c in ("B1_accurate", "B2_exp_decay", "ours_no_familiarity", "ours")
    ]
    w = 0.16
    fig, ax = plt.subplots(figsize=(10, 4.2))
    x = np.arange(len(KINDS))
    for i, (key, label) in enumerate(series):
        if key == "human":
            vals, err = [human[k] for k in KINDS], None
        else:
            vals = [rates[key][k]["mean"] for k in KINDS]
            err = np.array([[rates[key][k]["mean"] - rates[key][k]["ci95"][0], rates[key][k]["ci95"][1] - rates[key][k]["mean"]] for k in KINDS]).T
        ax.bar(x + (i - 2) * w, vals, w, color=COLORS[key], label=label, yerr=err, capsize=2, error_kw={"lw": 0.8})
    ax.set_xticks(x)
    ax.set_xticklabels(xlabels, fontsize=8.5)
    ax.set_ylabel("Proportion judged 'old'")
    ax.set_ylim(0, 1.1)
    ax.legend(fontsize=8, ncol=3, loc="upper right")
    ax.set_title("Exp 1b — DRM false recognition" + (" [post-hoc: mean-centred embeddings]" if tag else "") + " (95% CI over the 24 lists)", fontsize=10)
    fig.tight_layout()
    fig.savefig(RESULTS / f"exp1b_drm{tag}.png")
    plt.close(fig)


if __name__ == "__main__":
    import json

    p = ModelParams.load(RESULTS / "params_fitted.json")
    print(json.dumps(run(p), indent=2))
    print(json.dumps(run(p, center=True), indent=2))
