# Ravenswood — Technical Documentation

**A map of the whole codebase: where everything lives, which function does what, where each
computer-graphics algorithm is implemented, how the game is built, and how to justify that it is a
real Computer Graphics & Gaming project — not "just a frontend".**

- Project: *Living Characters / MysteryXMystery* → demo game **Ravenswood — "A Storm at Ravenswood"**
- Stack: React 18 + TypeScript + Vite. **Zero** art libraries, **zero** game engines, **zero** image
  assets for the scenes. Every scene pixel is computed by our own code.
- Companion docs: `VIVA_GUIDE.md` (Q&A-style viva prep), `RESULTS_EXPLAINED.md` (the AI research
  numbers), `PROJECT_CONTEXT.md` (decisions & sources). This file is the **implementation reference**.

> How to use this in a viva: every claim below names a **file and function** you can open and point
> at. The one-line answer to "is this really graphics?" is in §10.

---

## 1. System overview

Ravenswood is defended on **two independent technical tracks**, kept separate everywhere:

1. **Computer Graphics (the course).** A from-scratch **software rasterizer** draws every scene —
   the cutscene, the interrogation room, and the eight explorable rooms — plus a real **3-D
   transformation pipeline** for the title wireframe. Nothing in these scenes is an image file, an
   SVG, a CSS gradient, or a call to the browser's shape API. We fill a raw pixel buffer ourselves.
2. **AI research.** A persistent-identity suspect with a **human-fallible memory layer** (power-law
   forgetting, source-monitoring errors, a deception policy) whose voice is produced by a local LLM.

### The rendering pipeline in one paragraph
Every scene is drawn into a **384 × 216 `ImageData` buffer** (a flat `Uint8ClampedArray` of RGBA
bytes). We write that buffer one pixel at a time with our own primitives — lines, ellipses, fills,
dithering, lighting — then push it to a `<canvas>` **once per frame** with `ctx.putImageData` and
scale it up with **nearest-neighbour** (`image-rendering: pixelated`) so each logical pixel becomes a
crisp block. The browser gives us only two things: a byte array and a blit. **Everything between is
our code.** That is the literal definition of a software rasterizer.

### Two layers, never confused
- **Scenes** (rasterized by us): title wireframe, cutscene, interrogation room, explorable rooms.
- **UI chrome** (ordinary HTML/CSS, as any app): menus, dialogue boxes, the Case Book, the pan/zoom
  manor map, difficulty cards. This is honest to say in a viva — the *graphics* claim is about the
  scenes, and the chrome being HTML does not weaken it.

---

## 2. Directory map

```
src/
  main.tsx                     React entry; mounts <App/> inside <GameProvider/>
  App.tsx                      Screen router — renders exactly one screen per game phase (the FSM made visible)

  components/
    pixel/
      pixelRenderer.ts   ★     THE RASTER ENGINE. PixelCanvas class + every drawing primitive & algorithm
      transforms3d.ts    ★     THE 3-D PIPELINE. 4×4 matrices, MVP, perspective divide, wireframe manor
      textures.ts              Procedural surface detail (wood grain, damask, marble veins, balustrade, portrait)
      palettes.ts              Named colour ramps (Color = [r,g,b]); the project's whole palette
      characters.ts            Procedural 26×32 suspect "busts" built from a small config
      PixelSprite.tsx          React wrapper that renders a bust to a small canvas (UI portraits)
      Wireframe3D.tsx          React wrapper that animates drawWireframeManor on the title
    scene/
      interrogationScene.ts    drawInterrogationRoom() — the questioning room, rasterized
      InterrogationRoom.tsx    React canvas host + rAF loop for the interrogation scene
    room/
      props.ts           ★     The furniture library: one drawer per prop kind (bookshelf, desk, …)
      roomScene.ts       ★     drawRoom() composes a room; drawDetective() is the player avatar
    graphics/
      Atmosphere.tsx           Decorative canvas overlay: dust/rain/glow via ctx arc+gradient (chrome, NOT the scene rasterizer)
      CandleFlame.tsx          Small CSS candle flame (chrome)
    manor/
      manorScene.ts      ★     drawManor(): the whole manor top-down — tiles, walls, furniture, people, fog, candlelight
    ui/
      Toasts.tsx               "They will remember that." / "Meanwhile…" pop-ups (chrome)
      NotebookPanel.tsx        Case Book panel (chrome)
      Portrait.tsx             Suspect portrait chip (chrome)

  screens/
    TitleScreen.tsx            Title + 3-D wireframe + difficulty select
    CutsceneScreen.tsx         Plays the five cutscene compositions on a canvas (rAF loop)
    cutscene/sceneCompositions.ts ★  The five cinematic scenes (exterior, walk, doors, FOYER, title card)
    PrologueScreen.tsx         Typeset case-file intro (chrome)
    ManorScreen.tsx      ★     THE WALKABLE MANOR: walk (WASD), time runs, suspects move tile by tile; E = question / search
    ExploreRoomScreen.tsx ★    THE EXPLORE LOOP: move the detective, approach props, examine, find clues
    InterrogationScreen.tsx    The questioning UI; calls the SuspectService seam
    AccusationScreen.tsx       Pick the culprit + attach evidence
    VerdictScreen.tsx          Resolution & scoring

  game/
    types.ts             ★     Domain contracts; GamePhase; the SuspectService SEAM
    store.tsx            ★     The finite-state machine: one reducer, all game state
    scoring.ts                 Accusation scoring
    case/
      caseData.ts        ★     GROUND TRUTH: rooms, clues, the solution (engine-owned, never AI-invented)
      suspects.ts              The five suspects + their memory profiles + isKiller
      dialogue.ts              Each suspect's greeting + three suggested first questions
      roomLayouts.ts     ★     Per-room THEME + walkable bounds + HOTSPOTS mapped to real clues
    services/
      session.ts               This browser's link to one save on the suspect backend (/api)
      backendSuspectService.ts ★  The live SuspectService: every question → POST /api/ask
      serviceProvider.ts       The one line that selects the live service

scripts/
  renderEntry.ts               Headless render list (every scene → PNG) used by render:shots
  runRender.mjs                Node runner: shims ImageData, upscales, PNG-encodes to docs/shots/
research/                      The Python memory model + Study 1/2 experiments (see RESULTS_EXPLAINED.md)
backend/                       The suspect server: persistent memory stream + fallible recall + LLM voice (see PERSISTENT_MEMORY.md)
```
★ = the files that carry the technical substance.

---

## 3. The raster engine — `components/pixel/pixelRenderer.ts`

This is the heart of the Computer Graphics claim. `PixelCanvas` owns an `ImageData` and exposes the
classic raster-graphics toolkit, each implemented by hand. Line numbers are from the current file.

### 3.1 The framebuffer model
- **`PixelCanvas` constructor** (≈ L43) allocates `new ImageData(width, height)`; `this.data` is its
  raw `Uint8ClampedArray` (4 bytes/pixel, RGBA).
- **`putPixel(x,y,r,g,b,a)`** (≈ L62) is the single lowest-level write. It bounds-checks, then either
  writes the pixel directly (opaque) or **alpha-blends source-over** into the existing pixel
  (`out = src·α + dst·(1−α)`). Every other primitive ultimately calls this.
- **`getPixel`** (≈ L82), **`clear`** (≈ L51) fill the buffer.
- **`flush(ctx)`** (≈ L389) is the *only* time we touch the browser's 2-D context:
  `ctx.putImageData(this.imageData, 0, 0)`. Up-scaling to the screen is nearest-neighbour via CSS
  `image-rendering: pixelated` (browser) or an explicit integer upscale in `runRender.mjs` (PNG export).

### 3.2 Line scan-conversion — **two algorithms, both from scratch**
- **Bresenham** — `drawLine` (≈ L203). Integer decision variable, no floating point in the inner
  loop (`err`, `e2`, `sx`, `sy`). This is the primary line used everywhere (including every 3-D edge).
- **DDA** — `drawLineDDA` (≈ L226). Floating-point incremental stepping (`xInc`, `yInc`). Kept
  deliberately alongside Bresenham to show both standard line-generation methods side by side.
- Both are preceded by clipping (below) so the syllabus triangle *generate → clip → fill* is complete.

### 3.3 Clipping — **Cohen–Sutherland** (region outcodes)
- **`outcode(x,y)`** (≈ L164) computes the 4-bit region code (left/right/top/bottom) for a point.
- **`clipLine(x0,y0,x1,y1)`** (≈ L177) is the full Cohen–Sutherland loop: trivial-accept when both
  codes are 0, trivial-reject when `code0 & code1 ≠ 0`, otherwise clip to the offending edge and
  repeat. `drawLine` calls this first, so no out-of-bounds pixels are ever computed.

### 3.4 Circles & ellipses — **midpoint algorithms**
- **`drawCircle`** (≈ L243) is the midpoint circle algorithm with **8-way symmetry** (`plot8`): it
  computes one octant and mirrors the other seven; integer error term `err`.
- **`fillEllipse`** (≈ L268) is the midpoint ellipse algorithm in its two regions (`Region 1` / `Region
  2`), emitting symmetric horizontal spans (`hline`) — i.e. a scan-filled ellipse, not an outline.

### 3.5 Area fill & dithering
- **`fillRect`** (≈ L89) clipped solid span fill.
- **`fillDithered`** (≈ L106) blends between two colours using a **4×4 Bayer ordered-dither matrix**
  (`BAYER4`, ≈ L25): for each pixel it compares a per-pixel threshold `BAYER4[y&3][x&3]` against a
  `level` 0–16. This is how we get smooth-looking gradients on a tiny palette with no anti-aliasing —
  the defining "pixel-chill" texture.
- **`fillGradient`** (≈ L130) walks a multi-stop colour **ramp** down the rows, picking the two
  adjacent ramp colours per row and dithering between them — a dithered vertical gradient.

### 3.6 Colour model
- `Color = [r,g,b]`, 0–255 (an explicit RGB colour model).
- **`lerpColor(a,b,t)`** (≈ L416) linear RGB interpolation.
- **`colorRamp(ramp,t)`** (≈ L398) samples a multi-stop ramp at `t∈[0,1]` (piecewise-linear RGB).
- All named ramps live in `palettes.ts` (`STONE_RAMP`, `WOOD_DARK_RAMP`, `CANDLE_RAMP`, …).

### 3.7 Shading / lighting model
- **`applyLighting(cx,cy,radius,r,g,b,intensity)`** (≈ L344) is an **additive radial light** with
  **quadratic falloff** (`strength = falloff² · intensity`, `falloff = 1 − dist/radius`). It adds
  tinted light to existing pixels — this is how every candle, lamp, fireplace and the banker's lamp
  pool are lit. It is a real (if simple) local illumination model, not a CSS shadow.
- **`applyVignette(cx,cy,radius,strength)`** (≈ L370) darkens pixels *outside* a radius — a
  post-process that focuses the eye, applied at the end of most scenes.

### 3.8 Sprite blitting
- **`blitSprite(rows,x,y,palette)`** (≈ L324) stamps a character-grid sprite (array of strings) through
  a palette map, skipping transparent cells. `interrogationScene.ts`'s `blitScaled` wraps it to draw
  each sprite cell as an `s×s` block (integer scaling).

### 3.9 Primitive → syllabus map (point at this table)

| Graphics topic | Our implementation | Where |
|---|---|---|
| Raster framebuffer, `setpixel` | `PixelCanvas`, `putPixel` (+ alpha blend) | `pixelRenderer.ts` ≈ L43/L62 |
| Line scan-conversion — Bresenham | `drawLine` | ≈ L203 |
| Line scan-conversion — DDA | `drawLineDDA` | ≈ L226 |
| Line clipping — Cohen–Sutherland | `outcode`, `clipLine` | ≈ L164/L177 |
| Circle — midpoint, 8-way symmetry | `drawCircle` | ≈ L243 |
| Ellipse — midpoint, region fill | `fillEllipse` | ≈ L268 |
| Area filling / span fill | `fillRect`, `fillGradient` | ≈ L89/L130 |
| Halftoning / ordered dithering | `fillDithered` + `BAYER4` | ≈ L106/L25 |
| Colour models & interpolation | `lerpColor`, `colorRamp`, `palettes.ts` | ≈ L416/L398 |
| Illumination (local, additive) | `applyLighting` (quadratic falloff) | ≈ L344 |
| Post-process (vignette) | `applyVignette` | ≈ L370 |
| Sprite / bitmap blit | `blitSprite`, `blitScaled` | ≈ L324 |
| 2-D transforms (the whole image is scaled) | nearest-neighbour upscale | CSS + `runRender.mjs` |
| 3-D transforms & projection | `transforms3d.ts` | see §4 |

---

## 4. The 3-D pipeline — `components/pixel/transforms3d.ts`

This file demonstrates the "3-D transformations & projection" topic explicitly in code. It is used on
the **title screen** (`Wireframe3D.tsx`) to spin the Ravenswood manor as a wireframe, and is also
rendered headless as `docs/shots/wireframe.png`.

- **Representation:** `Mat4` is a row-major 16-number 4×4 matrix; `Vec3` a point. Homogeneous
  coordinates throughout.
- **Matrix builders:** `identity` (L20), `translate` (L37), `scale` (L40), `rotationX/Y/Z` (L43–54),
  and **`perspective(fovY, aspect, near, far)`** (L57) — a standard perspective projection matrix.
- **`multiply(a,b)`** (L25) is hand-written 4×4 matrix multiplication (triple loop).
- **`transform(m,v)`** (L69) multiplies a matrix by a point and returns homogeneous `[x,y,z,w]`.
- **The pipeline** in `drawWireframeManor` (L96):
  1. Build **Model** (`rotationY ∘ rotationX`, time-driven), **View** (`translate` camera back),
     **Projection** (`perspective`).
  2. Compose **MVP** = `proj · view · model` via `multiply` (L109).
  3. For each of the 10 house vertices: `transform(mvp, v)` → **perspective divide** (`x/w, y/w`,
     L114–115) → **viewport transform** to screen pixels (`cx + ndcX·scale`, `cy − ndcY·scale`, L117).
  4. Rasterize each of the 17 edges with **`canvas.drawLine`** (Bresenham + Cohen–Sutherland, L124).

So the 3-D object literally flows Model → View → Projection → perspective divide → viewport → our
Bresenham rasterizer. That is the full textbook pipeline, implemented, not called from a library.

---

## 5. Procedural texture layer — `components/pixel/textures.ts`

Higher-level detail painted on top of base fills, so surfaces read as "lived-in". All seeded
(deterministic) and additive. Shared by the cutscenes *and* the explorable rooms.

- **`rng(seed)`** — small mulberry32 PRNG, so every render is identical.
- **`speckle(...)`** — scattered grime/dust/ash specks.
- **`woodGrain(...)`** — vertical fibre streaks + a couple of knots over a wood base.
- **`damask(...)`** — a diamond-lattice brocade motif for wallpaper (computed per pixel from a modular
  "diamond distance").
- **`marbleVein(...)`** — wandering diagonal veins for the foyer floor.
- **`balustrade(...)`** — a rail + evenly spaced balusters (used for the foyer gallery).
- **`portrait(...)`** — a gilt frame + a dim shadowy sitter (all integer-coord; the earlier green-pixel
  artifact was a non-integer `fillEllipse` call, since fixed).

---

## 6. The scenes

### 6.1 Cutscene — `screens/cutscene/sceneCompositions.ts`, hosted by `CutsceneScreen.tsx`
Five `draw(canvas, time)` functions, played in sequence by a `requestAnimationFrame` loop in
`CutsceneScreen` (L116 effect) that calls `scene.draw` then `pxCanvas.flush(ctx)` each frame:
1. `drawExteriorApproach` — the manor in the storm (dithered stone, layered clouds, rain, lightning,
   approaching car headlights lighting the gravel).
2. `drawDetectiveWalking` — parallax scrolling background + a 4-frame walk cycle.
3. `drawEntranceDoors` — doors opening on warm interior light.
4. **`drawFoyerInterior`** — the interior that had the "stairs that led to nothing" bug. **Now fixed:**
   the grand staircase climbs to a **landing + upper gallery** (`balustrade`), a **lit arched
   corridor** (warm `fillGradient` + `applyLighting`), flanked by moonlit windows, with raked
   banisters, newel posts, framed `portrait`s, a lit chandelier, grandfather clock, and a marble
   floor with `marbleVein` + candle reflection.
5. `drawCaseBegins` — title card (the 5×7 `FONT`, letter-by-letter reveal, glow).
Shared helpers in the same file: `makeRain`/`drawRain`, `applyLightning`, `drawWindow`, `drawTree`.

### 6.2 Interrogation room — `components/scene/interrogationScene.ts`
`drawInterrogationRoom(c, time, {suspectId, speaking})` rasterizes the questioning room: a moonlit
window with rain, a bookshelf with coloured spines, a wall sconce, floorboards, the **suspect bust**
(`blitScaled` of a `characters.ts` sprite with blink/talk frames), the desk with case papers and a
steaming teacup, the **banker's lamp** (its warm pool is two `applyLighting` calls), the detective
silhouette (back to camera) with an animated **cigarette ember + smoke**, drifting dust motes, and a
final `applyVignette`. Hosted by `InterrogationRoom.tsx` (rAF loop).

### 6.3 Explorable rooms — `components/room/roomScene.ts` + `props.ts` + `game/case/roomLayouts.ts`
This is the "walk in and search" system. Three pieces:

- **`roomLayouts.ts`** — data. For each `RoomId`: a **`RoomTheme`** (wall/floor/wood ramps, ambient
  light tint & strength, warm/cool), the walkable band (`floorY`, `walkMinX/MaxX`, `spawnX`), the
  resident **`suspectId`** (if any), and a list of **`Hotspot`**s. Each hotspot has a footprint
  `(x,y,w,h)`, a `kind` (which prop to draw), a `label`, and either a **`clueId`** (reveals a real
  `caseData` clue when examined) or just `flavor` text. The clueIds are the exact ids in `caseData`,
  so the explorable rooms never invent evidence.
- **`props.ts`** — one drawer per prop kind in `PROP_DRAWERS`: `bookshelf`, `fireplace`, `desk`,
  `window`, `painting`, `cabinet`, `armchair`, `fern`, `wineRack`, `diningTable`, `stove`,
  `bodyOutline`, `barrel`, `bed`, `door`, `crate` (the study grate), `mantelClock`, `teaCart`. Each
  uses the raster primitives + texture helpers and reads colours from the room's theme.
- **`roomScene.ts`** — composition. **`drawRoom(c, time, roomId, opts)`** paints themed walls
  (`fillGradient` + `damask` + `speckle`), the floor (gradient + receding boards), every hotspot prop,
  the **ambient key light** (`applyLighting` with the theme tint), a floating **magnifier marker** over
  the prop the player is near, an amber tick over already-searched props, then the player avatar and a
  vignette. **`drawDetective(c, x, baseY, facing, moving, time)`** draws the trench-coated avatar with
  a 2-frame walk, flipped by `facing`.

### 6.4 Characters — `components/pixel/characters.ts`
Rather than hand-plot every suspect, each is a small `CharConfig` (skin/hair/coat colours, a hair
`style`, glasses/earring). `buildBust` assembles a 26×32 bust (ellipse-filled head, trapezoid body,
1-px traced outline) plus `talk`/`blink` frames and a palette. `BUSTS[id]` is what the interrogation
scene blits.

---

## 7. Game architecture — the finite-state machine

### 7.1 `game/types.ts` — the contracts
- **`GamePhase`** = `title | cutscene | prologue | investigation | explore | interrogation | accusation
  | verdict`. The explicit set of top-level states.
- Ground-truth types: `Room`, `Clue`, `Suspect` (+ `MemoryProfile`), `Statement` (+ `StatementKind` =
  `plain | lie | false-memory | evasion`), `NotebookEntry`, `Difficulty`.
- **`SuspectService`** — **the seam** (`ask()` + `suggestions()`). The UI depends only on this
  interface; swapping scripted ↔ memory-backed is one line in `serviceProvider.ts`.

### 7.2 `game/store.tsx` — one reducer, all state
`GameState` holds `phase`, `difficulty`, `activeSuspectId`, `activeRoomId`, `cluesFound`, `notebook`,
per-suspect chat `histories`, `accusedId`, `attachedEvidence`. The `reducer` handles `START`,
`SET_PHASE`, `ENTER_ROOM`, `DISCOVER_CLUE`, `OPEN_INTERROGATION`, `ADD_TURN`, `ADD_NOTEBOOK`,
`ACCUSE`, `TOGGLE_EVIDENCE`, `RESTART`, etc. (`DISCOVER_CLUE` and `ADD_TURN` are idempotent, which
guards against React StrictMode double-invocation). Exposed via `GameProvider` + `useGame()`.

### 7.3 `App.tsx` — the router
A single `switch (state.phase)` renders exactly one screen. This *is* the state machine made visible,
and is where the new `explore` phase maps to `ExploreRoomScreen`.

### 7.4 The explore gameplay loop — `screens/ExploreRoomScreen.tsx`
- A `requestAnimationFrame` loop drives movement with a delta-time step. Held keys live in a `Set`
  ref; `←/→` or `A/D` move and set `facing`/`moving`, clamped to the room's walk bounds.
- Each frame finds the nearest non-décor hotspot within `REACH` px (`standX`); that id drives the
  on-screen "Examine …" prompt and the magnifier marker.
- **`E` / Space / Enter** examines: a clue hotspot `dispatch({type:'DISCOVER_CLUE'})` and shows the
  real clue; a flavour hotspot shows its text. Searched hotspots are tracked and ticked.
- **`Q`** opens interrogation if a suspect is in the room; **Esc** returns to the map.
- `drawRoom` is called every frame with the live player + near-hotspot + examined set.

The manor (`ManorScreen.tsx`) is the hub: a top-down, walkable floor plan (`src/game/case/manor.json`,
shared with the server) drawn by `manorScene.ts` with the same rasterizer. A camera translation follows
the detective; rooms you are not in are dark and their occupants hidden. Standing at a room's glint and
pressing **E** opens that room's side-view search (→ `ENTER_ROOM` + `SET_PHASE 'explore'`); pressing
**E** beside a person opens the interrogation. See `docs/LIVING_HOUSE.md`.

---

## 8. The fallible-memory AI — the suspect backend (`backend/`) + `game/services/`

The suspects are answered by a Python server, documented in full in **`docs/PERSISTENT_MEMORY.md`**
(every feature, every failure fixed, results, demo). In short:

- **A persistent memory stream per suspect** (`backend/ravenswood/store.py`): a SQLite table of
  timestamped memories with stored embeddings — identity facts, the night as they lived it, habits,
  hidden truths with cover stories, and everything said in the interviews. Nothing is ever deleted.
- **Smallville retrieval** (recency + importance + relevance, `agent.py`) over embeddings from
  Ollama's `all-minilm`; a calibrated rule decides whether a question is about the night (no
  improvising) or about the person (answer as yourself, then remember the answer).
- **The research model decides what is recalled** (`fallible.py` calls `research/lcmem` with the
  Study 1 fitted power law scaled by each suspect's dials): full detail, gist only, or forgotten;
  source tag kept or lost.
- **The engine owns the statement KIND** — lie (a cover story; the truth never reaches the model),
  honest false memory (a habit filling a faded night, or a detective's suggestion that won the
  Exp. 1c two-alternative choice), plain, or evasion — plus a difficulty-gated tell. The LLM only
  words it.
- **Leading questions are real**: details your question asserts or presupposes become memories
  "told by the detective", whose source tag fades at that suspect's rate.
- **Write-back** after every turn, the last 12 turns sent verbatim (working memory), questions about
  the conversation answered from the ordered interview log, a simulated
  clock, and a full decision trace per answer.

The game's side is small:
- **`session.ts`** — holds the save id (from the persisted game state), calls the server through the
  Vite `/api` proxy, moves the clock when you walk into a room or examine a prop, and turns failures
  into clear messages ("the suspects' memory server is not running — `npm run server`").
- **`backendSuspectService.ts`** — the `SuspectService` seam: `POST /api/ask` → `{answer, kind,
  observation, reveals_clue, trace, clock_label}`.
- **`store.tsx`** — the save id, the clock and the whole game state persist in `localStorage`; the
  title screen offers **Continue** when the server still has that save.
- **`InterrogationScreen.tsx`** — "Read memory" includes a **Memory Inspector** (a spoiler toggle)
  showing the decision, its rule, and every memory considered with its state.

The earlier in-browser TypeScript suspect services (keyword-matched beliefs and a scripted keyword
bot) were removed on 23 Oct 2026; they remain in git history.

---

## 9. Build, run, and regenerate

```bash
npm install
npm run play         # everything: the suspects' server + the game, together (then open http://localhost:5173)
npm run server       # only the suspects (Python backend, http://127.0.0.1:8000) — needs Ollama running
npm run dev          # the game at http://localhost:5173 (proxies /api to the suspect server)
npm run build        # tsc -b type-check + vite production build
npm run render:shots # headless-render every scene to docs/shots/*.png (no browser)
```
The suspects need Ollama with `all-minilm` (embeddings) and a chat model; the server picks the best
one installed. Python setup and the backend's own tests and demo are in `docs/PERSISTENT_MEMORY.md`.

`render:shots` is the fastest way to inspect scene art: `scripts/renderEntry.ts` lists every scene,
`scripts/runRender.mjs` shims `ImageData` in Node, runs our renderer, upscales nearest-neighbour, and
PNG-encodes — proving the scenes are pure computation with **no browser and no DOM** involved.

---

## 10. "Is this really Computer Graphics, or just a frontend?" — how to justify it

This is the question to be ready for. The answer is concrete and demonstrable.

### 10.1 What we deliberately did NOT use for the scenes
- **No image/sprite asset files** — there are no `.png/.jpg` scene assets; `render:shots` *produces*
  the PNGs from code.
- **No SVG, no CSS backgrounds/gradients** for scenes — scene colour is written into a byte buffer.
- **No WebGL / Three.js / Pixi / game engine.**
- **No `canvas` shape API** (`ctx.fillRect`, `ctx.arc`, `ctx.drawImage`, gradients) **in the rasterized
  scenes**. Across `pixelRenderer.ts`, `transforms3d.ts`, `textures.ts`, `sceneCompositions.ts`,
  `interrogationScene.ts`, `roomScene.ts`, `props.ts` and their host screens, the *only* 2-D-context
  call is **`ctx.putImageData`** once per frame, showing the buffer we filled ourselves
  (`pixelRenderer.ts` `flush`, ≈ L389). You can verify by grep.
- **Two honest exceptions, both outside the scene rasterizer** (name them before a grader does):
  `components/graphics/Atmosphere.tsx` is a *separate decorative overlay* that draws dust/rain/candle
  glow with the 2-D context's `arc`/gradient (a mood layer on the hub, not a rendered scene); and
  `components/pixel/PixelSprite.tsx` renders the small **UI portrait chips** by `ctx.fillRect(x,y,1,1)`
  — still one pixel at a time, but via the context rather than our buffer. Neither is part of a scene.

### 10.2 What we actually implemented (the graphics)
A software rasterizer with the standard pipeline: **set-pixel + alpha blending → line scan-conversion
(Bresenham *and* DDA) → Cohen–Sutherland clipping → midpoint circle/ellipse fill → span/area fill →
Bayer ordered dithering → RGB colour ramps & interpolation → additive radial lighting with quadratic
falloff → vignette post-process → bitmap blitting** — and a separate **3-D pipeline** with 4×4
homogeneous matrices, hand-written matrix multiplication, Model·View·Projection composition, the
perspective divide, the viewport transform, and wireframe edge rasterization. Every one maps to a line
of code (the table in §3.9 and §4).

### 10.3 The one-paragraph viva answer
> "The browser gives me exactly two things: a flat array of RGBA bytes and one call to blit that array
> to the screen. Everything else — turning geometry into pixels — I wrote. Lines are Bresenham and DDA,
> clipped with Cohen–Sutherland; circles and ellipses are midpoint algorithms; gradients are Bayer
> ordered dithering over my own RGB ramps; the lighting is an additive radial model with quadratic
> falloff; and the title manor runs through a full 4×4 Model-View-Projection pipeline with a perspective
> divide before my Bresenham rasterizer draws its edges. I can show you each algorithm in
> `pixelRenderer.ts` and `transforms3d.ts`, and I can render every scene with no browser at all using
> `npm run render:shots`. The HTML parts are only menus and the dialogue box — the *pictures* are
> computed."

### 10.4 The honesty line (say this, it strengthens the claim)
The **UI chrome** (menus, dialogue boxes, the Case Book, the pan/zoom map) is ordinary HTML/CSS, and
the `Atmosphere` overlay is a small decorative canvas (dust/rain/glow) layered on the hub. That is
fine and normal — the graphics contribution is the **rendered scenes** (cutscene, interrogation room,
the eight explorable rooms, the 3-D wireframe), which are **100% our software rasterizer**. Being
precise about that boundary — scenes = our rasterizer; chrome and the mood overlay = ordinary web —
is more convincing than over-claiming.

### 10.5 Gameplay / "Gaming" half of the course
Beyond rendering: an explicit **finite-state machine** (`store.tsx`, §7), a **real-time input + rAF
game loop** with delta-time movement and collision-to-bounds (`ExploreRoomScreen`, §7.4), **scene
management** across eight explorable rooms, and an **AI system** driving NPC behaviour (§8). That is
the "Gaming" side to the "Graphics" side above.

---

## 11. Quick "where is …?" index

| You want… | Open |
|---|---|
| Bresenham / DDA / clipping / circle / ellipse / dither / lighting | `components/pixel/pixelRenderer.ts` |
| 3-D matrices, MVP, perspective, wireframe | `components/pixel/transforms3d.ts` |
| The colour palette | `components/pixel/palettes.ts` |
| Wood/damask/marble/portrait texture | `components/pixel/textures.ts` |
| The five cutscene scenes (incl. fixed foyer) | `screens/cutscene/sceneCompositions.ts` |
| The interrogation room art | `components/scene/interrogationScene.ts` |
| A room you can walk in | `components/room/roomScene.ts` + `game/case/roomLayouts.ts` |
| A piece of furniture's pixels | `components/room/props.ts` |
| The player avatar | `drawDetective` in `components/room/roomScene.ts` |
| The game states / transitions | `game/store.tsx` + `App.tsx` |
| The explore loop (movement, examine) | `screens/ExploreRoomScreen.tsx` |
| Ground-truth case / clues / solution | `game/case/caseData.ts` |
| A suspect's memory profile | `game/case/suspects.ts` |
| Forgetting / source-decay math | `research/lcmem/` (used by `backend/ravenswood/fallible.py`) |
| How lie vs false-memory is decided | `backend/ravenswood/agent.py` (`_decide`) |
| A suspect's memories / identity | `backend/ravenswood/characters.py`; live: `GET /api/memories/{save}/{suspect}` |
| The game's link to the suspects | `game/services/session.ts` + `backendSuspectService.ts` |
