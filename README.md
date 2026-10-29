# Ravenswood

A 1926 country-house murder mystery in which the suspects remember the way people do. Each
suspect is a persistent character with its own memory stream. A memory model fitted to human
data decides what they can still recall, whether a detail still carries its source, and whether
an answer is a lie, an honest false memory or forgetting; a local language model only puts
that decision into words. The player's leading questions plant memories that come back later
as the witness's own.

This repository holds the game, the suspects' backend, the memory model, and every experiment
reported in the paper (`paper/main.tex`).

## Requirements

- Node.js 18+ and npm
- Python 3.11
- [Ollama](https://ollama.com), running locally:
  `ollama pull all-minilm` and `ollama pull qwen2.5:3b`
  (the experiments also use `ollama pull llama3.2:3b`)

One-time setup:

```bash
npm install
python3.11 -m venv research/.venv
research/.venv/bin/pip install -r research/requirements.txt fastapi uvicorn httpx requests
```

Nothing calls a hosted model; no API key is needed.

## Play

```bash
npm run play
```

This starts the suspects' server (port 8000) and the game (port 5173). Open
**http://localhost:5173** once it prints `Ready`. Walk with `WASD`; press `E` beside someone
to question them, or at a glint to search a room. Saves are kept in `backend/data/`.

The game is a research prototype and still in development; the living-house layer (moods,
schedules, gossip, story events) is the least finished part.

## Reproduce the paper

```bash
analysis/run_all.sh
```

Runs every study in order on both voice models (about 2–3 hours on an 8 GB Apple M2) and
writes JSON and Markdown tables to `research/results/study1/` and `analysis/results/`.
Each study can also be run on its own:

| Study | What it measures | Script | Language model |
|---|---|---|---|
| 1 | The memory model against human data: forgetting curve, DRM, misinformation, source monitoring | `research/experiments/run_study1.py` | no |
| 2 | Does the spoken answer follow the engine's decision? Held-out probes; full pipeline vs no checks vs prompt-only | `analysis/study2_fidelity.py` | yes |
| 3 | Does a planted suggestion become the witness's own memory over time? | `analysis/study3_suggestion.py` | yes |
| 4 | Further traits: social contagion, interrogative pressure, schema intrusion, selective fallibility | `analysis/study4_traits.py` | no |
| 5 | Identity stays, episodes fade, over a simulated week | `analysis/study5_selective.py` | yes |

See `analysis/README.md` for the controls applied in every run.

Tests:

```bash
research/.venv/bin/python -m pytest backend/tests -q     # the backend (82 tests)
cd research && .venv/bin/python -m pytest -q             # the memory model (9 tests)
```

## Layout

| Path | What |
|---|---|
| `src/` | The game (React + TypeScript; every scene drawn by our own software rasteriser) |
| `backend/ravenswood/` | The suspects' server: memory stream, retrieval, decision policy, voice, checks, living house |
| `research/lcmem/` | The memory model (power-law access, gist, familiarity, source decay) |
| `research/experiments/`, `research/data/` | Study 1 and the human reference data, with sources |
| `analysis/` | Studies 2–5 and their results |
| `paper/` | The paper |
| `scripts/` | `npm run play` launcher, a terminal demo, screenshot tools |
| `notes/` | Internal development notes and course material; not part of the paper |
