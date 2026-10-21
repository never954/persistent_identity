# Ravenswood

Ravenswood is a browser-based, pixel-art detective game set in a candlelit 1920s manor. The player investigates the death of Lord Alistair Ravenswood, searches rooms for physical evidence, questions five witnesses, weighs lies against honest false memories, and accuses the killer.

This README is also a handoff document. It records the product objective, code contracts, current implementation, visual direction, and safe extension points so another developer or LLM can continue the project without reconstructing its history.

**Start with [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** — every agreed decision, the current status, the research and backend design, and all sources. For the Computer Graphics and Game Design explanation (every algorithm, how and why, plus a syllabus coverage map and viva questions), see [docs/VIVA_GUIDE.md](docs/VIVA_GUIDE.md). The presentation is built from [docs/DECK_PROMPT.md](docs/DECK_PROMPT.md).

## Product Objective

Build a playable investigation prototype around one central idea: witnesses are fallible. A suspect can lie deliberately, evade, or sincerely remember an event incorrectly. The player must compare testimony with engine-owned physical evidence instead of treating every contradiction as proof of guilt.

The intended future version will connect the frontend to a memory-backed service using retrieval, memory decay, interference, source amnesia, and an LLM. The current version is deliberately self-contained and uses scripted dialogue to demonstrate the experience and preserve a deterministic mystery.

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

- Node.js 18 or newer
- npm

### Development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, normally [http://localhost:5173](http://localhost:5173). The Vite config uses port `5173` and does not open a browser automatically. Stop the server with `Ctrl+C`.

### Production build and preview

```bash
npm run build
npm run preview
```

`npm run build` runs `tsc -b` and then `vite build`. The production files are emitted to `dist/`. `npm run preview` normally serves them at [http://localhost:4173](http://localhost:4173), but always use the URL printed by Vite.

### Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server with hot reload. |
| `npm run build` | Type-check and create the production build. |
| `npm run preview` | Serve the built application locally. |
| `npm run render:shots` | Render the game's canvas scenes headlessly to PNGs in `docs/shots/` (used by the deck). |
| `npm run annotate:shots` | Rebuild the two annotated screenshots (needs Python 3 + Pillow). |

There is currently no test runner, lint script, API server, database, or required environment variable. No API key is needed. (The planned memory backend — Python FastAPI + ChromaDB + an LLM — is specified in `PROJECT_CONTEXT.md` §6.)

## Player Experience

1. Click a `Rookie`, `Detective`, or `Inspector` card — this starts the game.
2. Watch or skip the five-scene pixel-art cutscene, then read or skip the prologue.
3. Explore the mansion map.
4. Search rooms to discover physical clues.
5. Question suspects using suggested or free-form questions.
6. Review testimony in the Case Book and flag contradictions.
7. Attach evidence and make an accusation.
8. Review the verdict and detective rating.

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
- `src/screens/InvestigationHub.tsx`: pan/zoom mansion map, room searches, suspect entry points, Case Book.
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
- `CLOSE_INTERROGATION` returns to the investigation hub.
- `RESTART` returns to the initial title state.

### Case data and ground truth

`src/game/case/caseData.ts` is the authoritative case file. It owns rooms, clues, the case metadata, and the private `SOLUTION`. Suspect dialogue must never be allowed to modify this truth. AI or future backend responses may interpret the world, but cannot invent or change the actual killer, clue facts, room ownership, or time of death.

`src/game/case/suspects.ts` owns the cast and their memory profiles. `src/game/case/dialogue.ts` owns the current hand-authored questions, answers, suggestions, statement kinds, tells, and optional clue reveals.

### Suspect service seam

The UI depends on the `SuspectService` interface in `src/game/types.ts`:

```ts
interface SuspectService {
  ask(suspectId: string, question: string, difficulty: Difficulty): Promise<AskResult>;
  suggestions(suspectId: string): string[];
}
```

The active implementation is selected in `src/game/services/serviceProvider.ts` and currently points to `scriptedSuspectService`.

`src/game/services/scriptedSuspectService.ts`:

- matches question keywords against authored dialogue lines;
- returns a `Statement` with `plain`, `lie`, `false-memory`, or `evasion` kind;
- simulates thinking latency;
- reveals authored clues when appropriate;
- filters observations according to difficulty.

The intended backend replacement should implement the same interface and be swapped in through `serviceProvider.ts`. The UI should not be rewritten for the backend. A future implementation can embed the question, retrieve memories from ChromaDB, apply decay/interference/source-amnesia rules, and ask an LLM to produce a constrained answer. The engine-owned case truth should remain separate from retrieved suspect memory.

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

The whole room is drawn by the software rasterizer, not CSS. `src/components/scene/interrogationScene.ts` composes each frame into a 384×216 `ImageData` buffer with `src/components/pixel/pixelRenderer.ts` (scan-converted shapes, dithered gradients, sprite blits, particles, radial lighting, vignette), and `InterrogationRoom.tsx` runs the `requestAnimationFrame` loop and flushes it to a nearest-neighbour-scaled canvas. `src/components/pixel/characters.ts` generates the bust sprites (normal / blink / talk frames) from compact data; `PixelSprite.tsx` renders sprites for the DOM (mansion map).

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
- `src/components/ui/`: mansion map, portrait, notebook, and other investigation UI.
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
