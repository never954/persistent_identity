# analysis/ — Studies 2 to 5

Everything here runs the real game engine in-process against a throwaway database, so the
player's own saves are never touched. `run_all.sh` runs every study in the paper, Study 1
included.

## Controls applied in every run

These exist so the test environment cannot produce the result by itself.

| Possible skew | Control |
|---|---|
| The living house changing things mid-test: moods, gossip, a suspect killed or fled, fear raising suggestibility | `WORLD_ON=False` for Studies 2, 3 and 5: the house is frozen and pressure is fixed at 1. Study 4 turns on only the mechanism it measures. |
| Prompts tuned on the same questions used to score them | Study 2 uses **held-out** probes written for evaluation; the probes used during development are kept apart in `dev_probes.py` and never reported. |
| A different model being picked automatically | The model is pinned by name in each script. |
| Repeated or correlated randomness | Every save is new; every memory draw depends only on that save's id; model calls use a fixed seed per turn. |
| The scorer favouring one variant | One fixed rule set per probe, written before the final runs, applied identically to every variant and model. Every answer is saved in the JSON for re-scoring by others. |
| Response caching | The voice has no response cache; only embeddings of fixed text are cached. |

## Files

| File | Study |
|---|---|
| `common.py` | Shared set-up: fresh engine, pinned model, switches, Wilson intervals |
| `study2_fidelity.py` | 13 held-out probes × 12 saves × {full pipeline, no checks, prompt-only} |
| `study3_suggestion.py` | A suggestion planted in two witnesses, recalled after 1 h, 1 day, 1 week × {fallible, perfect, prompt-only} × 15 saves |
| `study4_traits.py` | Social contagion, interrogative pressure, schema intrusion, selective fallibility (2000 saves per cell, no language model) |
| `study5_selective.py` | Identity and episodic questions on day 0, 1, 3, 7 × 8 saves |
| `dev_probes.py` | Development probes (not used in the paper) |
| `results/` | JSON (every answer) and Markdown tables, one pair per study and model |
