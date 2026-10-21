# Study 1 — Cognitive fidelity at the memory level (auto-generated)

Run 2026-10-20T23:26:28+00:00 · embeddings ollama:all-minilm (all-MiniLM-L6-v2, 384-d) · numpy 2.4.6 · scipy 1.17.1

All numbers below are produced by `experiments/run_study1.py`; nothing is hand-entered.

## Exp 1a — Forgetting curve (fit to Ebbinghaus; held-out test on Murre & Dros 2015)

| Model | params | R² (fit) | RMSE (fit) | AICc | RMSE predicting the replication |
|---|---|---|---|---|---|
| Ours — power law | a=1.000, τ=0.004 h, d=0.130 | 0.974 | 0.019 | -41.7 | 0.094 |
| B2 — exponential (MemoryBank-style) | a=0.400, S=804 h | 0.397 | 0.091 | -26.6 | 0.112 |
| B1 — no forgetting (Smallville-style) | — | — | 0.659 | — | 0.743 |

## Exp 1b — DRM false recognition (primary, pre-registered)

Calibration (Ours): targets remember=.41, hits=.65, unrelated FA=.11 → achieved remember=0.410, hits=0.624, unrelated FA=0.130. Max attainable 'know' at unrelated FA=.11: 0.200 (target 0.240; jointly feasible: False).

| | Studied (hits) | **Critical lure, studied list** | Unstudied-list words | **Critical lure, unstudied list** |
|---|---|---|---|---|
| Human (R&M 1995, Exp 2) | 0.65 | **0.72** | 0.11 | **0.16** |
| Ours | 0.624 [0.582, 0.667] | 0.585 [0.425, 0.741] | 0.130 [0.080, 0.185] | 0.124 [0.031, 0.236] |
| Ours − familiarity | 0.650 [0.637, 0.663] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| B2 exp-decay | 0.650 [0.650, 0.650] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| B1 accurate | 1.000 [1.000, 1.000] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |

Bold columns are predictions (never fitted). Lure false alarms in Ours: remember 0.000 / know 0.585 (human .38 / .34). Mean cosine lure→its list 0.471 vs between list items 0.358; Spearman(lure–list similarity, lure FA) ρ = 0.688, p = 2.0e-04.

## Exp 1b — DRM false recognition (POST-HOC sensitivity: mean-centred embeddings)

Calibration (Ours): targets remember=.41, hits=.65, unrelated FA=.11 → achieved remember=0.410, hits=0.650, unrelated FA=0.110. Max attainable 'know' at unrelated FA=.11: 0.590 (target 0.240; jointly feasible: True).

| | Studied (hits) | **Critical lure, studied list** | Unstudied-list words | **Critical lure, unstudied list** |
|---|---|---|---|---|
| Human (R&M 1995, Exp 2) | 0.65 | **0.72** | 0.11 | **0.16** |
| Ours | 0.650 [0.636, 0.664] | 0.272 [0.232, 0.314] | 0.110 [0.106, 0.114] | 0.105 [0.101, 0.111] |
| Ours − familiarity | 0.650 [0.637, 0.663] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| B2 exp-decay | 0.650 [0.650, 0.650] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |
| B1 accurate | 1.000 [1.000, 1.000] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] | 0.000 [0.000, 0.000] |

Bold columns are predictions (never fitted). Lure false alarms in Ours: remember 0.000 / know 0.272 (human .38 / .34). Mean cosine lure→its list 0.263 vs between list items 0.127; Spearman(lure–list similarity, lure FA) ρ = 0.922, p = 1.6e-10.

## Exp 1c — Misinformation (demonstration; κ = source-decay multiplier, assumption)

P(choose original) after MISLEADING information (control in brackets):

| Timing | B1 | B2 | Ours − source decay | Ours (κ = 2) |
|---|---|---|---|---|
| 30min, early | 1.000 (1.000) | 0.700 (0.700) | 0.763 (0.763) | 0.566 (0.763) |
| 30min, late | 1.000 (1.000) | 0.700 (0.700) | 0.763 (0.763) | 0.557 (0.763) |
| 1week, early | 1.000 (1.000) | 0.662 (0.662) | 0.623 (0.623) | 0.507 (0.623) |
| 1week, late | 1.000 (1.000) | 0.662 (0.662) | 0.623 (0.623) | 0.407 (0.623) |

Misinformation effect (control − misleading) for Ours by κ:

| κ | 30min_early | 30min_late | 1week_early | 1week_late |
|---|---|---|---|---|
| 1.0 | 0.132 | 0.132 | 0.094 | 0.139 |
| 1.5 | 0.170 | 0.173 | 0.109 | 0.182 |
| 2.0 | 0.197 | 0.205 | 0.116 | 0.216 |
| 3.0 | 0.232 | 0.253 | 0.122 | 0.267 |

Human (secondary source, verify): 0.75 correct consistent vs 0.41 misleading. Pattern: Misleading information is most damaging when it arrives late in a long retention interval (original memory weak, misinformation fresh).

## Exp 1d — Source monitoring (demonstration)

Source-amnesia index — of told details still recalled, share recalled as WITNESSED:

| κ | 20m | 1h | 9h | 1d | 2d | 6d | 31d |
|---|---|---|---|---|---|---|---|
| 1.0 | 0.470 | 0.547 | 0.656 | 0.698 | 0.724 | 0.761 | 0.807 |
| 1.5 | 0.605 | 0.687 | 0.793 | 0.830 | 0.851 | 0.880 | 0.913 |
| 2.0 | 0.705 | 0.784 | 0.875 | 0.904 | 0.920 | 0.940 | 0.961 |
| 3.0 | 0.835 | 0.897 | 0.955 | 0.970 | 0.977 | 0.985 | 0.992 |
| B1 / B2 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

Joint P(told detail recalled AND felt witnessed) — falls later only because content itself fades:

| κ | 20m | 1h | 9h | 1d | 2d | 6d | 31d |
|---|---|---|---|---|---|---|---|
| 1.0 | 0.262 | 0.261 | 0.238 | 0.222 | 0.210 | 0.191 | 0.164 |
| 1.5 | 0.337 | 0.328 | 0.287 | 0.264 | 0.247 | 0.221 | 0.185 |
| 2.0 | 0.393 | 0.374 | 0.317 | 0.287 | 0.267 | 0.236 | 0.195 |
| 3.0 | 0.466 | 0.428 | 0.346 | 0.308 | 0.284 | 0.248 | 0.202 |
| B1 / B2 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

## Parameters used

```json
{
  "power": {
    "a": 0.9999999999999999,
    "tau": 0.003601198890297679,
    "d": 0.13023682890826124,
    "gist_ratio": 0.5,
    "rho": 0.5
  },
  "exp": {
    "a": 0.3996512924194147,
    "S": 804.0543834879492
  },
  "source": {
    "a": 0.95,
    "kappa": 2.0
  },
  "recognition": {
    "k": 3,
    "criterion": 1.5,
    "noise": 0.5
  }
}
```
