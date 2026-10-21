# research/ — the fallible-memory model and Study 1

The memory layer behind *Living Characters*, and the experiments that compare it with published
human memory data. Design decisions and the latest results are in `../PROJECT_CONTEXT.md` (§2 D13–D16,
§6.9); this file is how to run things.

## Setup
```bash
cd research
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
ollama pull all-minilm      # only needed if cache/embeddings.npz is missing or a new word appears
```
Embeddings (`all-MiniLM-L6-v2`, 384-d) come from a local Ollama server and are cached in
`cache/embeddings.npz`, so a re-run with the committed cache needs no network or Ollama.

## Run
```bash
.venv/bin/python -m pytest -q                    # 9 unit tests of the model's defining properties
.venv/bin/python experiments/run_study1.py       # all of Study 1 -> results/study1/
```
Single experiments (after one full run has written `results/study1/params_fitted.json`):
`.venv/bin/python experiments/exp1c_misinformation.py`, etc.

## Layout
| Path | What |
|---|---|
| `lcmem/params.py` | All model parameters (dataclasses, save/load as JSON) |
| `lcmem/decay.py` | Power-law and exponential accessibility |
| `lcmem/memory.py` | A memory record (text, time, slots, strength, source, core, rehearsals) |
| `lcmem/agent.py` | `MemoryAgent` and the conditions: `B1_accurate`, `B2_exp_decay`, `ours`, `ours_no_familiarity`, `ours_no_source` |
| `lcmem/embed.py` | Ollama embedding client with an on-disk cache |
| `lcmem/datasets.py` | The 24 DRM lists (Roediger & McDermott 1995, Appendix) and the human-data loader |
| `data/human_reference.json` | Every human number used, with its source and verification status |
| `experiments/exp1a_forgetting.py` | Fit power vs exponential to Ebbinghaus; predict the Murre & Dros replication |
| `experiments/exp1b_drm.py` | DRM recognition, R&M 1995 Exp 2 design; `center=True` = post-hoc mean-centred run |
| `experiments/exp1c_misinformation.py` | Loftus-style misinformation, 2 × 2 timing, κ sweep (demonstration) |
| `experiments/exp1d_source.py` | Source monitoring: told details recalled as witnessed (demonstration) |
| `experiments/run_study1.py` | Runs all four in order, writes `manifest.json` and `summary.md` |
| `results/study1/` | JSON, PNG figures, fitted parameters, auto-generated summary |

## Rules for these numbers
- `results/` is generated; never edit it by hand. Re-run instead.
- Lure rates in Exp 1b are predictions: never add them to a calibration target.
- Anything decided after seeing a result is labelled post-hoc in code, JSON and summary.
- Exp 1c/1d are demonstrations: κ is an assumption and is always shown as a sweep.
