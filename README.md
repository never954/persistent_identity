# Ravenswood

Ravenswood is a browser-based, pixel-art detective game set in a candlelit 1920s manor. The player investigates the death of Lord Alistair Ravenswood, searches rooms for physical evidence, questions five witnesses, weighs lies against honest false memories, and accuses the killer.

This README is also a handoff document. It records the product objective, code contracts, current implementation, visual direction, and safe extension points so another developer or LLM can continue the project without reconstructing its history.

**Start with [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** — every agreed decision, the current status, the research and backend design, and all sources. For the Computer Graphics and Game Design explanation (every algorithm, how and why, plus a syllabus coverage map and viva questions), see [docs/VIVA_GUIDE.md](docs/VIVA_GUIDE.md). The presentation is built from [docs/DECK_PROMPT.md](docs/DECK_PROMPT.md).

## Play, demo, or measure: which command?

| You want to… | Do this | Takes |
| --- | --- | --- |
| **Play the game** | `npm run play`, then open http://localhost:5173 | — |
| **Demo it live, in the game** | Play, and follow one of the click-by-click scripts below | ~5 min each |
| **Demo the memory system in a terminal** (no UI) | `backend/demo.py` against a running server | ~2 min |
| **Measure it** | Unit tests, the voice-fidelity eval, Study 1 (table below) | 1 s to ~4 min |

The first-time setup (Node, Python venv, Ollama models) is in [Running Locally](#running-locally).
Everything runs on your machine through Ollama. No API key is needed.

### 1. Play

```bash
npm run play
```

This starts both programs: the suspects' memory server on port 8000 and the game on port 5173.
Wait for `Ready — open http://localhost:5173/`, then open **http://localhost:5173**. Click a
difficulty for a new case, or **Continue**, which resumes your last save even after a restart.
`Ctrl+C` stops both.

> After updating the code, restart (`Ctrl+C`, then `npm run play`) and start a **new case**. A save
> made with older code keeps its old memories.

### 2. Demo in the game (what to click)

**The living house** (a walkable manor, moods, deeds, gossip, 1926). Full script: [docs/LIVING_HOUSE.md §7](docs/LIVING_HOUSE.md).
1. You start in the foyer. Walk with `WASD`. Walk up to Thomas and press `E`. Ask *"have you ever used
   a mobile phone?"* He has never heard of it, and asks what it is.
2. Pick **Threaten**, then ask *"What did you see on the landing?"*. Watch his fear bar and the pop-up
   *"Thomas will remember that."*
3. **Draw revolver**, pick Threaten, then ask *"You killed him, didn't you?"*. He falsely confesses to
   make it stop. Accusing him now leads to the *Coerced Confession* ending.
4. Walk the house. You see only who is in your room, and what they are doing. At noon everyone
   walks to the Great Hall for luncheon. **The day so far** lists what happened while you were
   elsewhere.
5. Julian: insult him three times. He storms out and walks to his room.
6. Ask Agnes *"could you show me around?"* and follow her: she walks you room to room. Ask Miss Cross
   to dance: she refuses, unless your revolver is out.
7. The killer: once word reaches Miss Cross that Thomas talked, she follows him. Stay with him and she
   lingers beside him, doing nothing. Leave, and you find his body where it fell.

**The fallible memory** (persistence, leading questions, lies vs honest mistakes). Full script:
[docs/PERSISTENT_MEMORY.md §6](docs/PERSISTENT_MEMORY.md).
1. Thomas: *"What kind of women do you prefer?"* A few questions later: *"What was the first question
   I asked you?"*
2. Thomas: *"Was it Mrs Hartwell you saw going toward the study?"* Search a room or two (time
   passes), then ask *"Who exactly did you see near the study?"*. Sometimes he now "remembers"
   Agnes. Sometimes his own memory wins.
3. Vivian: *"Where were you at eleven?"* She lies with a cover story. Agnes, on the tea: an honest
   false memory.
4. **Read memory → Memory Inspector** shows why each answer came out the way it did. It spoils the
   case, so use it for the demo, not for play.

### 3. Demo in a terminal (no UI)

`backend/demo.py` runs a scripted interrogation against a server and prints each answer with the
engine's decision. Run it against a **separate demo server**, so it doesn't add saves to your game:

```bash
RAVENSWOOD_DATA=/tmp/rw-demo research/.venv/bin/python -m uvicorn ravenswood.server:app --app-dir backend --port 8765
```

Then, in a second terminal:

```bash
research/.venv/bin/python backend/demo.py http://127.0.0.1:8765
```

### 4. Measurements

| What it measures | Command (from the repo root) | Needs Ollama | Time | Latest result |
| --- | --- | --- | --- | --- |
| Backend logic: memory, decisions, moods, movement, perception, requests, gossip, endings, 1926 checks | `research/.venv/bin/python -m pytest backend/tests -q` | no (fake model) | ~5 s | **76 passed** |
| The research memory model's defining properties | `cd research && .venv/bin/python -m pytest -q` | no | <1 s | **9 passed** |
| **Voice fidelity**: does the spoken answer say what the engine decided? | `research/.venv/bin/python backend/eval_fidelity.py URL 5` | yes | ~3–4 min per model | `qwen2.5:3b` **43/45**, `qwen2.5-coder:3b` **44/45** |
| **Study 1**: the memory model against human forgetting, DRM, misinformation and source data | `cd research && .venv/bin/python experiments/run_study1.py` | no (cached embeddings) | — | `research/results/study1/summary.md` |
| Type-check and production build | `npm run build` | no | ~1 s | passes |

**The fidelity eval.** It plays 5 fresh saves × 9 probes:
- memory: *"what did I just ask?"*;
- a leading question, recalled an hour later;
- Vivian's alibi lie;
- a denial;
- Agnes's habit;
- a consistent personal taste;
- her own name;
- a false premise (*"your wife"*);
- the order of the interview.

It scores each answer against the engine's decision with simple word rules. Those rules are crude:
a sanity check of the pipeline, not a calibrated measure. Read the MISS lines it prints, and judge
each one yourself.

**Comparing voice models fairly.** Pin the model, use a separate data folder and port, then run
the eval. Repeat with the other model:

```bash
RAVENSWOOD_MODEL=qwen2.5:3b RAVENSWOOD_DATA=/tmp/rw-eval-qwen research/.venv/bin/python -m uvicorn ravenswood.server:app --app-dir backend --port 8765
```

```bash
research/.venv/bin/python backend/eval_fidelity.py http://127.0.0.1:8765 5
```

**Your own play sessions as data.** Every turn is logged with its full trace: the decision, the
rule, every memory retrieved and its state, the tone and the mood. Export a save (the id is
`saveId` in the browser's `localStorage` key `ravenswood.save.v2`):

```bash
curl http://127.0.0.1:8000/api/log/YOUR_SAVE_ID
```

**Where the results are written up:**
- [docs/PERSISTENT_MEMORY.md §5](docs/PERSISTENT_MEMORY.md): the model comparison tables, before
  and after the configuration changes, and every failure found and fixed.
- [docs/LIVING_HOUSE.md](docs/LIVING_HOUSE.md): the consequence system, with quotes from live runs.
- `research/results/`: Study 1 and the LLM source study.

## Product Objective

Build a playable investigation prototype around one central idea: witnesses are fallible. A suspect can lie deliberately, evade, or sincerely remember an event incorrectly. The player must compare testimony with engine-owned physical evidence instead of treating every contradiction as proof of guilt.

The suspects are not scripted. Each one is a persistent memory stream: retrieval, decay, interference and source amnesia from the research model, with a local LLM voicing what the engine decides. The house around them is alive too. Moods, deeds, gossip, off-screen life and eleven endings depend on how you treat people.

## Current Case

**Case:** A Storm at Ravenswood  
**Year:** 1926  
**Victim:** Lord Alistair Ravenswood  
**Time of death:** 11:14 p.m.  
**Method:** Sedative in the victim's brandy, followed by a blow from a brass candlestick.  
**Killer:** Vivian Cross. This is stored as private engine truth and is revealed only by the verdict flow.

The storm has cut the power, the bridge is flooded, and nobody can leave the manor. Five guests and servants remain under the roof. Vivian was stealing from the Ravenswood business; she entered through the conservatory, drugged Alistair, killed him with the candlestick, and burned part of the ledger proving the theft.

The case includes deliberate red herrings:

- Agnes Hartwell has a genuine false memory about serving tea; the teapot is still full and cold.
- Julian Ravenswood lies about being in the library to hide gambling debts found in the cellar.

## Running Locally

### Requirements

- Node.js 18 or newer, and npm
- Python 3.11 (for the suspects' memory server)
- [Ollama](https://ollama.com), running, with an embedding model and a chat model:
  `ollama pull all-minilm` and a chat model such as `ollama pull qwen2.5:3b`
  (the server uses the best one installed; `qwen2.5-coder:3b` also works)

### Quick start — one command

The game is **two programs that must run at the same time**: the suspects' memory server (Python,
port 8000) and the game itself (Vite, port 5173). `npm run play` starts both for you.

One-time setup (first run only):

```bash
npm install
python3.11 -m venv research/.venv
research/.venv/bin/pip install -r research/requirements.txt fastapi uvicorn httpx
```

Every time (with the Ollama app running):

```bash
npm run play
```

Wait for **`Ready — open http://localhost:5173/`**, then open **http://localhost:5173** in your
browser. That is the game. `Ctrl+C` stops both programs.

### Or: two terminals, in this order

```bash
# Terminal 1: leave it running
npm run server

# Terminal 2: a second, separate terminal
npm run dev
```

Then open **http://localhost:5173**. Do not stop one to start the other: both must stay running.

### Which address is which

| Address | What it is |
| --- | --- |
| **http://localhost:5173** | **The game. Open this one.** |
| http://127.0.0.1:8000 | The suspects' memory server. It has no game on it; the game talks to it. |

Saves live in `backend/data/ravenswood.db`; **Continue** on the title screen resumes the last game,
even after closing everything. How the suspects' memory works, and how to demo it:
`docs/PERSISTENT_MEMORY.md`.

### Troubleshooting

| You see | Cause | Fix |
| --- | --- | --- |
| `http proxy error: /api/session … ECONNREFUSED 127.0.0.1:8000` in the `npm run dev` terminal, and the title screen says the memory server is not running | The game is running but the suspect server is not | Start `npm run server` in a **second** terminal (keep `npm run dev` running), or use `npm run play` |
| `GET / 404 Not Found` in the `npm run server` terminal, or "This is the suspects' memory server, not the game" in the browser | You opened port 8000, which is the server, not the game | Open **http://localhost:5173** instead (and make sure `npm run dev` is running) |
| The browser cannot reach http://localhost:5173 | The game (`npm run dev`) is not running, e.g. it was stopped with `Ctrl+C` to start the server | Run `npm run dev` in its own terminal, or use `npm run play` |
| `[play] Ollama is not running`, or "could not seed memories (is Ollama running?)" | Ollama is not started | Open the Ollama app (or run `ollama serve`), then try again |
| `address already in use` on port 8000 | A suspect server is already running (maybe in another terminal) | Use that one: just run `npm run dev`. `npm run play` reuses it automatically |
| "This save no longer exists on the server" | The save was deleted (e.g. `backend/data/` was removed) | Start a new case from the title screen |

### Production build and preview

```bash
npm run build
npm run preview
```

`npm run build` runs `tsc -b` and then `vite build`. The production files are emitted to `dist/`. `npm run preview` normally serves them at [http://localhost:4173](http://localhost:4173), but always use the URL printed by Vite.

### Available scripts

| Command | Purpose |
| --- | --- |
| `npm run play` | **Start everything**: the suspects' memory server and the game, together. |
| `npm run server` | Start only the suspects' memory server (Python backend) on port 8000. |
| `npm run dev` | Start only the game (Vite, hot reload) on port 5173; needs `npm run server` running too. |
| `npm run build` | Type-check and create the production build. |
| `npm run preview` | Serve the built application locally. |
| `npm run render:shots` | Render the game's canvas scenes headlessly to PNGs in `docs/shots/` (used by the deck). |
| `npm run annotate:shots` | Rebuild the two annotated screenshots (needs Python 3 + Pillow). |

No API key or environment variable is needed; everything runs locally through Ollama. The backend's tests: `research/.venv/bin/python -m pytest backend/tests -q`.

## Player Experience

1. Click a `Rookie`, `Detective`, or `Inspector` card — this starts the game.
2. Watch or skip the five-scene pixel-art cutscene, then read or skip the prologue.
3. Walk the manor (`WASD`/arrows): rooms, two corridors, a bedroom each, and the Great Hall where
   everyone gathers for luncheon at noon. Time runs while you walk, and the suspects walk too, tile
   by tile, on their own business. You only see who is in the room with you.
4. Search rooms to discover physical clues. Search them before someone tidies the evidence away.
5. Question suspects in any tone: Calm, Press, Threaten, Comfort, Plead or Insult. Typed curses
   and threats count too. Or act: draw your revolver, strike, offer money, post the constable.
   Each suspect's fear, trust and anger change, and *they will remember it*.
6. The house lives on without you. Gossip spreads, people reflect, and the killer makes her own
   moves: a bribe, flight, a second death. See **The day so far** on the map.
7. Review testimony in the Case Book and flag contradictions.
8. Attach evidence and make an accusation (at 5 p.m. the Chief Constable arrives and you must).
9. One of eleven endings, decided by everything you did — see `docs/LIVING_HOUSE.md`.

Suspects live in 1926: ask about Donald Trump or a mobile phone and each meets the strange word in
their own way.

Difficulty changes the visibility of suspect hints:

- `rookie`: all authored tells are visible.
- `detective`: only tells attached to lies and false memories are visible.
- `inspector`: no tells are shown.

## Architecture

### Application entry

- `index.html` provides the root element and loads the Google pixel fonts.
- `src/main.tsx` loads global styles and mounts `App` inside `GameProvider`.
- `src/App.tsx` is a phase router. It renders one screen based on `state.phase`.

### Screens

- `src/screens/TitleScreen.tsx`: difficulty selection and game start; shows the rotating 3-D wireframe manor (`Wireframe3D.tsx`, the 3-D transformation demo).
- `src/screens/CutsceneScreen.tsx`: five procedural pixel-art scenes drawn by the rasterizer (`cutscene/sceneCompositions.ts`); click/Space/Enter advance, Escape skips.
- `src/screens/PrologueScreen.tsx`: case introduction.
- `src/screens/ManorScreen.tsx`: the walkable top-down manor (floor plan in `src/game/case/manor.json`, drawn by `src/components/manor/manorScene.ts`); `E` questions the person beside you or searches the room.
- `src/screens/InterrogationScreen.tsx`: live interrogation scene, speech popup, question composer, memory read, and transcript.
- `src/screens/AccusationScreen.tsx`: suspect selection and evidence attachment.
- `src/screens/VerdictScreen.tsx`: solution, score breakdown, and restart.

### Game state

`src/game/store.tsx` contains the single React reducer and context. Screens read state with `useGame()` and dispatch actions; they should not mutate state directly.

The main state fields are:

- `phase`: `title`, `cutscene`, `prologue`, `investigation`, `interrogation`, `accusation`, or `verdict`.
- `difficulty`: `rookie`, `detective`, or `inspector`.
- `activeSuspectId` and `activeRoomId`: current investigation targets.
- `cluesFound`: discovered physical clue IDs.
- `notebook`: recorded suspect statements and contradiction flags.
- `histories`: per-suspect chat transcript.
- `accusedId`: selected suspect.
- `attachedEvidence`: clues attached to the accusation.

Important reducer behavior:

- `START` resets the game and enters the cutscene.
- `DISCOVER_CLUE` is idempotent.
- `ADD_TURN` is idempotent by turn ID to protect against React StrictMode effects.
- `ADD_NOTEBOOK` avoids duplicate suspect/answer entries.
- `CLOSE_INTERROGATION` returns to the manor, where you were standing.
- `RESTART` returns to the initial title state.

### Case data and ground truth

`src/game/case/caseData.ts` is the authoritative case file. It owns rooms, clues, the case metadata, and the private `SOLUTION`. Suspect dialogue must never be allowed to modify this truth. AI or future backend responses may interpret the world, but cannot invent or change the actual killer, clue facts, room ownership, or time of death.

`src/game/case/suspects.ts` owns the cast and their memory profiles (mirrored, and test-checked, in `backend/ravenswood/characters.py`). `src/game/case/dialogue.ts` owns each suspect's greeting and suggested first questions; every answer after that comes from the suspect backend.

### Suspect service seam

The UI depends on the `SuspectService` interface in `src/game/types.ts`:

```ts
interface SuspectService {
  ask(suspectId: string, question: string, difficulty: Difficulty): Promise<AskResult>;
  suggestions(suspectId: string): string[];
}
```

The active implementation is selected in `src/game/services/serviceProvider.ts` and points to `backendSuspectService`, which sends every question to the suspect backend (`POST /api/ask`) for the current save (`src/game/services/session.ts`). The backend:

- keeps a persistent, timestamped memory stream per suspect (identity, the night, habits, hidden truths, the whole interview);
- retrieves memories by meaning (embeddings) with the Smallville score;
- lets the research memory model (`research/lcmem`) decide what is recalled, in detail, as gist, or not at all, and whether a detail's source is remembered;
- decides the statement kind itself (`plain`, `lie`, `false-memory`, `evasion`) and a difficulty-gated tell, then has the LLM voice it;
- writes every exchange back into memory, so suspects remember the conversation and stay consistent.

Case truth stays engine-owned in `caseData.ts`; the suspects' hidden truths are never sent to the language model. Details: `docs/PERSISTENT_MEMORY.md` (memory) and `docs/LIVING_HOUSE.md` (moods, deeds, gossip, off-screen life, endings).

### Scoring

`src/game/scoring.ts` calculates a deterministic detective rating:

- 8 points per discovered physical clue.
- 6 points for correctly flagging a non-plain statement.
- -4 points for flagging an honest plain statement.
- 40 points for a correct accusation.
- -25 points for a wrong accusation.
- 5 points per attached clue on a correct accusation, counting at most three.
- Difficulty multiplier: Rookie `1.0`, Detective `1.25`, Inspector `1.5`.

Ranks are `Case Unsolved`, `Constable`, `Detective`, `Inspector`, and `Master Detective`.

## Visual Direction

The visual target is a living pixel-art scene inspired by atmospheric pixel-art loop videos: deliberate large pixel clusters, readable silhouettes, deep grouped shadows, limited palettes, practical light, and layered environmental motion. It should feel like a complete place rather than a character sprite floating over a background.

The interrogation room is designed as a side-on cinematic shot:

- cool blue window light and rain provide ambient fill;
- a warm brass desk lamp provides the localized key light;
- the suspect sits in the midground across the table;
- the detective is a dark foreground silhouette on the near side;
- table legs, floorboards, furniture, and occlusion establish depth;
- papers, a steaming teacup, rain, dust, the detective's cigarette smoke, and a flickering sconce animate the environment;
- the suspect bobs, leans while answering, blinks, and talks through sprite-frame swaps;
- dialogue appears in a speech popup beside the suspect so it does not cover the detective or the room.

The whole room is drawn by the software rasterizer, not CSS. `src/components/scene/interrogationScene.ts` composes each frame into a 384×216 `ImageData` buffer with `src/components/pixel/pixelRenderer.ts` (scan-converted shapes, dithered gradients, sprite blits, particles, radial lighting, vignette), and `InterrogationRoom.tsx` runs the `requestAnimationFrame` loop and flushes it to a nearest-neighbour-scaled canvas. `src/components/pixel/characters.ts` generates the bust sprites (normal / blink / talk frames) from compact data; `PixelSprite.tsx` renders sprites for the DOM.

When changing the scene, preserve these visual rules:

- Use a small number of related colors instead of many unrelated gradients.
- Keep window fill cool, lamp light warm, and occlusion near-black.
- Make shadows follow object planes and light direction.
- Prefer hard-edged pixel clusters over smooth blur or generic texture overlays.
- Keep background contrast lower than characters and foreground props.
- Preserve clear z-order: architecture, background furniture, midground suspect, table/lamp, foreground detective, then readable UI.
- Respect `prefers-reduced-motion` for ambient animations.

## Styling and Component Locations

- `src/styles/tokens.css`: colors, typography, spacing, shadows, and motion tokens.
- `src/styles/global.css`: global resets and shared element styling.
- `src/components/pixel/pixelRenderer.ts`: the software rasterizer (primitives, Bresenham/DDA lines, Cohen–Sutherland clipping, midpoint circle/ellipse, dithering, lighting, vignette).
- `src/components/pixel/transforms3d.ts`: 4×4 homogeneous matrices, perspective projection, wireframe manor.
- `src/components/scene/interrogationScene.ts`: the rasterized interrogation room.
- `src/screens/interrogation.css`: interrogation controls, speech popup, memory panel, and transcript.
- `src/components/ui/`: portrait, notebook, toasts, and other investigation UI.
- `src/components/graphics/`: atmosphere, candle flame, rain/dust/grain effects.

The existing visual language is 1920s candlelit gothic pixel art. Preserve the established fonts (`Press Start 2P`, `Pixelify Sans`, and `VT323`) and token usage when extending the interface.

## Safe Extension Workflow

1. Read the relevant type or reducer contract before changing behavior.
2. Keep case truth in `caseData.ts`, not in dialogue or UI components.
3. Add new suspect behavior behind `SuspectService` rather than branching in screens.
4. Keep screens responsible for presentation and dispatching actions, not scoring or truth decisions.
5. Keep visual changes local to the owning component stylesheet.
6. Run `npm run build` after every meaningful change.
7. Manually verify the full flow: start, prologue, investigation, search, interrogation, accusation, verdict, restart.

Avoid broad refactors, new dependencies, or backend assumptions unless the task explicitly requires them. Do not change the public service interface casually: it is the planned frontend/backend contract.

## Known Limitations and Next Steps

- Suspect responses are scripted and keyword matched; there is no live LLM or memory backend.
- There are no automated tests or lint command yet.
- Game state is in memory and is lost on refresh.
- Pixel characters are procedurally generated from compact sprite data; richer assets would need to preserve the shared palette and nearest-neighbour style.
- All scenes are drawn by the in-house software rasterizer and use no external image assets.
- The game is 2-D; the 3-D pipeline is a dedicated demonstration on the title screen.
- The next major product step is a memory-backed suspect service that preserves deterministic engine truth while making testimony fallible and context-sensitive — fully specified in `PROJECT_CONTEXT.md` §6.
