# Ravenswood / MysteryXMystery — Complete Technical Explainer & Viva Guide

*Everything you need to defend the project: how the living-characters memory system works
(and how Smallville differs), and every computer-graphics algorithm in the game — what it is,
how our code does it, and the reasoning behind it.*

> **Honesty rule (say this if asked):** the graphics engine is fully built and runs. The
> memory system is **designed and partially prototyped** — the game currently answers with a
> **scripted** dialogue service behind a clean interface; the vector-DB + decay backend is the
> next milestone. Never claim the LLM memory pipeline is running today.

*Decisions, research design and every source live in [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md);
this guide explains how things work so you can answer questions on any part.*

---

# PART I — The living characters (memory & identity)

## 1.1 Recap: how an LLM produces text (you know this — one paragraph)
Text is split into **tokens**; each token becomes an **embedding** (a vector). A transformer
runs **self-attention** over the sequence (every token weighs every other), producing a
probability distribution over the next token; we sample one, append it, repeat. The model has no
memory of its own beyond what is inside its **context window** — so any "long-term memory" must
be supplied *in the prompt*. That is the hook everything else hangs on.

## 1.2 Recap: RAG (Retrieval-Augmented Generation)
Store knowledge as embeddings in a **vector database**; when a question arrives, embed it,
retrieve the **top-k most similar** stored items (cosine similarity), and paste them into the
prompt so the model answers *from* them. Normal RAG optimises retrieval to be **as accurate as
possible.** Our whole idea is to **invert that** — retrieve, then *deliberately degrade* what we
retrieved, so the character misremembers like a person.

## 1.3 How "Smallville" (Generative Agents, Park et al., UIST 2023) works
This is the architecture we build on, so know it cold.

- **Memory stream.** Each agent keeps a growing list of natural-language **observations**, each
  with a timestamp ("Isabella is setting out pastries at 8:02").
- **Retrieval score.** To act, the agent retrieves relevant memories, ranking each by a weighted
  sum of three signals:
  - **Recency** — exponential decay since the memory was last accessed (recent = higher);
    in the paper, `0.995^(game-hours since last retrieval)`.
  - **Importance** — a "poignancy" score 1–10 the LLM assigns when the memory is created
    (mundane vs significant).
  - **Relevance** — cosine similarity between the memory's embedding and the current situation's
    embedding.
  Normalise the three, sum, take the **top-k** into the prompt.
- **Reflection.** Periodically the agent asks itself high-level questions about recent memories
  and writes **reflections** (e.g., "I care about Isabella's party") back into the stream —
  higher-order beliefs that shape later behaviour.
- **Planning.** It generates a daily plan and recursively decomposes it into actions.
- **Where "identity" lives:** a **seed description** (name, occupation, relationships) + the
  accumulating memory stream + reflections. There is no "self" module — identity is an *emergent
  property* of a persistent, growing memory. The agents were rated **believably human** in the
  study.

**Key point for the viva:** Smallville's memory is engineered to be *accurate and useful*
(recency+importance+relevance retrieval, reflection). Its recency term *looks* like forgetting, but
it only changes a memory's **rank** — content never changes, never blends, never loses its source.
A Smallville agent can fail to *mention* something; it can never *misremember* it. That is the gap
we step into.

## 1.4 Our architecture (four components)
```
Player question
   │
   ▼
[GAME ENGINE]  →  [PERSISTENT SELF-MODEL]  →  [HUMAN-MEMORY LAYER]  →  [LLM = VOICE]  →  reply
 ground truth      identity + episodic         decay · interference     speaks in
 (code-held)       memories (vectors)          · source-drop            character
```
- **Game engine (ground truth).** The authoritative world: who did it, the timeline, the
  physical clues, the clock — authored in code (`caseData.ts`), never generated. This is what
  keeps the mystery *solvable*: N free-generating agents would contradict each other into an
  unsolvable mess. The LLM **never reads ground truth directly.**
- **Persistent self-model (the person).** Per character: an **identity component** (traits,
  opinions, relationships, backstory) plus an **episodic store** of that character's lived events
  as embedded vectors. The identity biases every retrieval and every generated line, so the
  character stays recognisably itself. Each memory is a **structured event with slots** — not
  free text — so blending and evaluation are exact:
  `{ who, what, where, when, details{…}, verbatim_strength, gist_strength, source,
  source_strength, salience 1–10, t_encoded (sim-time), last_access, rehearsals, core }`.
  Seed memories are authored per suspect *from their own viewpoint*, consistent with `caseData.ts`.
- **Human-memory layer (the humanity).** Sits *between* the self-model and the LLM and degrades
  retrieval **before** the model ever sees it (see 1.6).
- **LLM (the voice).** Verbalises, in character, only what the memory layer hands it. It reasons
  and phrases; it does **not own** the character's state. (Answers "isn't the LLM doing
  everything?" — no: it never holds the truth or the memory; it only speaks the degraded slice.)

## 1.5 Two ways to make memory "human" — and why we chose ours
There are two honest routes; know both and why we picked the second.

1. **Weight manipulation (fine-tuning / LoRA).** Bake the persona or the "forgetting" into the
   model's **weights** by training on examples. *Cons:* needs GPUs + a dataset, is slow, is hard
   to **control** (you can't cleanly dial "decay = 0.4"), and is hard to **validate** against
   human data. You'd retrain to change behaviour.
2. **A corruption / retrieval layer (our choice).** Keep the model **frozen**; manipulate *what
   we retrieve and feed it* — the RAG context. Forgetting = weaken/drop a retrieval;
   interference = merge similar ones; source-amnesia = strip/swap the source tag. *Pros:* **pure
   Python + a vector DB, no training**, every effect is a **tunable parameter**, every retrieval
   is **logged and auditable**, and the distortion can be **validated** against human psychology
   rates. This is feasible for a TY project and is where the novelty lives.

> One-line answer: *"We don't corrupt the weights; we corrupt the retrieval — so forgetting is a
> controllable, measurable parameter, not a retraining job."*

## 1.6 The memory mechanisms — mechanism + why (the heart of the project)
Every effect is **structured, literature-grounded error — not random noise** — and every one is a
tunable parameter. Four mechanisms in v1 (see `PROJECT_CONTEXT.md` §6 for the full design):

- **Accessibility decay — power law, verbatim vs gist.** Human forgetting is fit better by a
  **power function** than an exponential (Wixted & Ebbesen), and **detail fades before gist**
  (fuzzy-trace theory). Strength:
  `S(t) = salience · (1 + Δt/τ)^(−d) · (1 + ρ·rehearsals)`, with `d_verbatim > d_gist`.
  Retrieved if `S + ε > θ` (ε = noise). Between the two thresholds the character remembers *that*
  it happened but not *the details* ("a woman… dark dress, I think"). Below both it is
  **unreachable but still stored** — *forgetting = loss of access, not deletion.* Seeing the body
  (high salience) survives; breakfast decays out.
- **Interference — slot blending and lures.** Weak memories that sit close in vector space
  (cosine > τ, e.g. near-identical nightly routines) **swap detail slots** — the *when* of Tuesday's
  tea migrates to Thursday (Bartlett's reconstructive memory). An unexperienced item close to a
  dense cluster's centroid can be "recognised" as a lure, `p = σ(k·(cos(cue, centroid) − τ))`
  — the DRM effect, which *The Geometry of Forgetting* (2026) shows emerges from embedding geometry.
- **Source-monitoring failure — Loftus misinformation (the crown jewel).** The **source tag decays
  faster than the content**. When it fades, the character defaults to the most plausible source —
  *themselves* (Johnson's source-monitoring framework). **Leading questions** ("When you saw the
  woman in red…") store their presupposition as a memory with `source = detective` → later it
  comes back as the suspect's *own* observation. The player's questioning contaminates testimony.
- **Reconsolidation — retelling drift** (Nader et al.). Every retrieval-and-retelling writes the
  *retold* version back and strengthens it, so a distortion said once is said more confidently next
  time.
- **Core protection → selective fallibility.** `core = true` items (name, relationships,
  identity) never decay, blend or lose their source: the character stays itself while its episodic
  memory is human.
- **Lies are a separate deception policy.** Each suspect has true knowledge K and a conceal set
  C ⊂ K with a motive; when a question touches C the policy denies / fabricates / deflects. **Lies
  come from policy; false memories come from the memory layer** — two mechanisms, so every claim can
  be labelled *true · lie · false memory · gist/forgotten · evasion*. That is what turns "lie vs
  honest mistake" from a story into a measurement.
- Together they produce the game's core ambiguity: from the outside an **honest false memory** and a
  **deliberate lie** look identical. Telling them apart is the detective's real job.

## 1.7 What is actually built today (be honest)
Right now the suspects answer from a **scripted dialogue service**
(`scriptedSuspectService.ts`): it lower-cases your question, scores each authored line by
**keyword overlap** weighted by an authored priority, and returns the best match — each line
tagged with a **kind**: `plain`, `lie`, `false-memory`, or `evasion`. The difficulty tier gates
whether a "tell" hint is shown. Everything routes through one interface, **`SuspectService.ask()`**.
The planned backend (Python **FastAPI** + **ChromaDB** + local **sentence-transformers** embeddings
+ a **provider-agnostic LLM adapter**, experiments run on one API model *and* one local model)
drops in by changing **one line** in `serviceProvider.ts`, with **no change to any screen.** The
`kind` tags in today's scripted data are exactly the labels the memory layer will produce.

## 1.8 Evaluation (how we'll prove it) and the honest novelty claim
- **Study 1 — cognitive fidelity (automated):** run classic paradigms on our agent and baselines
  (perfect witness; Smallville-style; decay-only; "prompted to act human"): Ebbinghaus forgetting
  curve, **DRM** (human critical-lure recall ≈ 40–55%, Roediger & McDermott 1995), **misinformation**
  (human acceptance commonly ~20–40% depending on paradigm), source monitoring. Target: baselines
  superhuman, ours inside human ranges.
- **Study 2 — selective fallibility (automated):** core identity stays stable while peripheral
  episodic accuracy declines like a person's.
- **Study 3 — play:** an AI-detective proxy sweeps fallibility (solve-rate dose-response + "false
  statements per leading question"), then a small player pilot measures lie-vs-mistake
  discrimination, believability and solve behaviour (memory ON vs OFF).
- **Honest novelty (after the Oct 2026 literature check):** the mechanisms themselves exist
  (MemoryBank, ACT-R memory, *Human-Inspired Memory Architecture* 2026 — all built for
  **efficiency**). Our contribution is using them for **fidelity**: a persistent character that
  fails *like a person*, calibrated against human data across several paradigms, with stable core
  identity, evaluated adversarially in a game where players must tell lies from honest mistakes.
  (COMPACTOR, 2026, calibrated working-memory **capacity** against humans; it does not model false
  memory or distortion.)
- **Grounding citations:** Park et al. 2023 (persistent agents rated believably human); Zargham
  et al. 2026 (players felt immersed with believable NPCs but lost immersion when responses were
  *incoherent* — which is why our error must be **designed, not random**).

---

# PART II — The computer-graphics engine (every algorithm)

All of this is our own code in `src/components/pixel/pixelRenderer.ts` (the rasterizer),
`transforms3d.ts` (3D), `characters.ts` (sprites), and `interrogationScene.ts` /
`sceneCompositions.ts` (the scenes). No engine, no WebGL, no drawing library.

## 2.1 The raster model & frame buffer
We draw into an **`ImageData`** buffer at an internal resolution of **384 × 216**. It is a flat
byte array (`Uint8ClampedArray`) of **RGBA**, 4 bytes per pixel. The pixel at (x, y) starts at
```
index = (y · width + x) · 4     → bytes [R, G, B, A]
```
We write colours into this array ourselves, then present the finished frame with
`ctx.putImageData(...)`. **This is a software frame buffer** — the same rectangular-grid-of-samples
model as any raster display; we just fill it in code with nested `for y … for x` loops
(**raster-scan order**). *Why 384×216:* small buffer = **fast** (fewer pixels to touch each
frame) and, upscaled with nearest-neighbour, it gives big, crisp, deliberately chunky pixels —
the whole game is ~64 KB and holds ~60 fps because of this choice.

## 2.2 Point plotting — `putPixel` + alpha blending
The base of everything. `putPixel(x, y, r, g, b, a)`:
1. **Bounds-check** (ignore out-of-buffer writes — a free, implicit clip).
2. If opaque, write the 4 bytes directly.
3. If translucent, **source-over alpha blend** with what's already there:
```
Cout = α·Csrc + (1 − α)·Cdst        (applied per channel, α = a/255)
```
*Why:* this compositing rule is what lets rain, dust, smoke and glows layer over the scene
without erasing it. Every higher-level primitive ultimately calls `putPixel`.

## 2.3 Rectangle scan-fill — `fillRect`
Clamp the rectangle to the buffer, then two nested loops over rows and columns calling
`putPixel`. This is **scan conversion of an axis-aligned region** (a simplified scan-line fill).
*Used for:* walls, desk, window panes, portraits, bookshelf, papers. *Why loops not a library:*
we own every pixel, and clamping gives us clipping for free.

## 2.3a Region filling — what we use, and what we deliberately don't (flood fill, polygons, convex vs concave)
Know exactly which filling algorithms are and aren't in the game — an examiner may probe this.
- **What we use — scan-conversion (area) fills only.** `fillRect` fills a rectangle span-by-span;
  `fillEllipse` fills the ellipse interior by drawing **horizontal spans between symmetric
  boundary points** (a scan-line fill specialised to the ellipse); `fillDithered` / `fillGradient`
  are those same area fills run through Bayer dithering. The character **coat** is a **convex
  trapezoid** filled by computing each scanline's left/right x directly:
  `for each row y: fill x from CX−half(y) to CX+half(y)` — an analytic per-scanline span fill.
- **What we do NOT implement, and why:** **flood fill** and **boundary fill (seed fill)** — start
  from a seed pixel and spread to neighbours until a boundary — are **not** used; nothing in the
  game fills an arbitrary already-drawn region, so they'd be dead code. There is also **no
  general scan-line polygon fill** (no edge tables, no active-edge list) and **no point-in-polygon
  test** — we never fill an arbitrary polygon.
- **Convex vs concave polygons — where the distinction lives (and why it doesn't bite us).** The
  convex/concave difference only matters for a **general polygon scan-fill**: a scan-line crosses
  a **convex** polygon's boundary exactly twice (fill straight between the two), but a **concave**
  polygon can be crossed **4, 6, … times**, so you must sort the intersections and apply the
  **odd–even (parity) rule** — fill only the *odd*-numbered spans. We never hit this because:
  (a) our only polygon-shaped fill (the coat) is **convex**, so its per-scanline span is trivially
  the single left→right run; and (b) the **3-D manor is a wireframe** — edges drawn with Bresenham,
  **no filled faces at all** — so there is no polygon rasterisation and thus no convex/concave case
  to handle. If asked "could you fill the 3-D faces?": yes, by adding a scan-line polygon fill with
  the odd–even rule (and back-face culling) — it's simply not needed for a wireframe.

## 2.4 Lines — DDA and Bresenham (`drawLineDDA`, `drawLine`)
Two classic line-scan-conversion algorithms; we implement both.
- **DDA (Digital Differential Analyzer):** compute `steps = max(|dx|, |dy|)`, then step
  `x += dx/steps`, `y += dy/steps`, rounding each to a pixel. Simple, but uses **floating-point**
  in the inner loop.
- **Bresenham:** keeps an **integer error term** and decides at each step whether to move one
  pixel across, or across *and* down — **no floating point, no rounding**, exact pixels.
```
err = dx − dy
loop: putPixel; if reached end break
      e2 = 2·err
      if e2 > −dy: err −= dy; x += sx
      if e2 <  dx: err += dx; y += sy
```
*Why Bresenham is the one we use for real edges (window mullions, rain, 3-D wireframe):* integer
math is faster and gives **crisp, unambiguous** pixels with no anti-aliased fuzz — exactly the
pixel-art aesthetic. We keep DDA to *show* both syllabus methods.

## 2.5 Line clipping — Cohen–Sutherland (`clipLine`)
Before drawing a line we trim it to the buffer rectangle. Each endpoint gets a 4-bit **outcode**
(left/right/top/bottom). If both codes are 0 → wholly inside, draw. If the bitwise **AND** is
non-zero → both on the same outside side, **reject**. Otherwise pick an endpoint that's outside,
intersect the line with that boundary, replace the endpoint, recompute, repeat. *Why:* it stops
us wasting work (and avoids artefacts) drawing the parts of a slanted line — e.g. a rotating
wireframe edge — that fall off the screen.

## 2.6 Circle & ellipse — midpoint algorithm (`drawCircle`, `fillEllipse`)
Instead of sampling angles with `sin`/`cos` (slow, floating-point), the **midpoint** method keeps
an integer **decision parameter** derived from the implicit equation
`(x/rx)² + (y/ry)² = 1`, and at each step decides whether the next pixel goes straight or
diagonally. It exploits **symmetry** (a circle has 8-way symmetry; the ellipse 4-way) so one
computed point plots several. `fillEllipse` draws horizontal spans between symmetric points to
fill. *Used for:* the lamp shade, character heads, glow ellipses, portrait faces. *Why:* integer
decisions + symmetry = fast and pixel-exact, no floating-point angle sampling.

## 2.7 Sprite blitting & procedural characters (`blitSprite`, `characters.ts`)
A sprite is a small **grid of characters** (text rows) plus a **palette** mapping each character
to a colour; `.` = transparent. `blitSprite` walks the grid and `putPixel`s each non-transparent
cell — a classic **indexed-colour** technique (tiny data, no image files). The characters
themselves are **generated in code**: `buildBust` fills an ellipse head, a widening trapezoid
coat, adds hair/eyes/nose from a per-suspect config, then traces a **1-px outline** around the
silhouette (mark every empty cell touching a filled one) and produces **normal / talking / blink**
frames. *Why procedural:* zero art assets, every character is consistent and tweakable by
changing a few colours, and the same cast is reused in the map and the scene.

## 2.7a Text rendering — a bitmap font (in-engine) + pixel web fonts (UI)
There are **two** text systems; know both.
- **In-engine bitmap font (drawn by our rasterizer).** The cutscene title ("RAVENSWOOD") is not
  browser text — it is a hand-authored **bitmap font**. A `FONT` table maps each character to a
  **5×7 grid of `'1'/'0'`** (e.g. `A = ['01110','10001','10001','11111','10001','10001','10001']`).
  To render a word we walk the string, and for each glyph draw every `'1'` cell as a **2×2
  `fillRect`** at an advancing x (letter spacing 14). This is classic **bitmap-font glyph
  blitting** — the same idea as sprite blitting, applied to letters — with a per-letter reveal
  animation and a warm `applyLighting` glow behind it. *This is genuine in-engine text
  rendering.* (There is **no** `ctx.fillText`; the canvas never uses the browser's font engine.)
- **DOM / CSS text (everything you read and type).** All interactive and reading text — the
  suspect dialogue, names, the notebook, buttons, on-screen titles, subtitles — is ordinary
  **HTML rendered by the browser** and styled with CSS, using **pixel web fonts** loaded from
  Google Fonts: **Press Start 2P** (display/labels), **Pixelify Sans** (readable body), **VT323**
  (monospace/terminal). The pixel *look* comes from the fonts themselves being bitmap-style
  letterforms.
- **Why the split:** a bitmap-font blitter is perfect for a short, stylised **title**, but it is
  poor for **paragraphs** — the browser gives us legibility, selectable/accessible text,
  responsive line-wrapping and different sizes for free. So the **canvas carries the art, the DOM
  carries the words.** *If asked "how would you draw all text in-engine?":* extend the `FONT`
  atlas to the full character set and blit each glyph — exactly what the title already does — but
  it isn't worth it for a text-heavy interrogation game.

## 2.8 Ordered dithering, gradients & colour ramps (`fillDithered`, `fillGradient`, `colorRamp`)
To blend two colours *without* a smooth (non-pixel) gradient or random noise, we use a **4×4
Bayer ordered-dither matrix**. For each pixel, compare a blend **level (0–16)** to the matrix
threshold at `(x mod 4, y mod 4)`; pick colour A or B accordingly. Tiling this gives a stable
cross-hatch that reads as a gradient but stays **pure pixels**. `fillGradient` walks a **colour
ramp** (array of colours) down the rows, choosing the two adjacent ramp colours and a dither
level per row. *Why Bayer, not alpha or noise:* alpha blur would break the pixel look; random
dithering would shimmer; ordered dithering is **deterministic, banding-free, and crisp** — the
signature pixel-art gradient (sky, walls, wood).

## 2.9 Radial additive lighting — the illumination (`applyLighting`)
This is "how the lamp glow works." For every pixel inside a circle of radius **R** around a light
centre, compute distance **d**, a normalised falloff, **square** it, and **add** a tinted amount
to the existing pixel:
```
strength = ( 1 − d/R )²  · intensity        (quadratic falloff)
pixel.rgb += lightColor.rgb · strength       (additive, clamped to 255)
```
*Why this shape:* squaring makes the centre bright and the edge fade softly — a cheap, convincing
**point-light falloff** without any physically-based lighting. **Additive** compositing (adding
light rather than blending) is what makes overlapping lights build up and read as *glow*. We call
it for the **lamp pool** and the flickering **candle sconce** (the flicker is just
`intensity · (0.7 + 0.3·sin(t·13))`).

## 2.10 Vignette — attention & mood (`applyVignette`)
The opposite of lighting: for every pixel **outside** a central radius, darken it by
`min(1, (d − R)/R · strength)` (multiply its RGB toward black). *Why:* it sinks the corners into
shadow and pulls the eye to the lit interrogation — a classic cinematic framing trick, done in
one pixel pass.

## 2.11 Particle systems — rain, dust, smoke (the "particle thing")
Each particle is a tiny struct with a position and velocity. Every frame we do **Euler
integration** — the simplest numerical step:
```
position += velocity · dt        (dt = time since last frame)
```
then draw it (a short line for rain, a dot for dust/smoke, via `putPixel` with **alpha**), and
when it leaves the screen we **respawn** it at the other edge so the system runs forever.
Flavours:
- **Rain:** slanted streaks — `y += speed·dt`, `x += speed·wind·dt`; drawn as a short line.
- **Dust motes:** float **up** slowly with a **sine sway** (`x += sin(t)·amp`) so they drift in
  the lamp beam.
- **Cigarette smoke:** rises, widens and fades — alpha decreases with height; the ember is a tiny
  bright pixel plus a small `applyLighting` that **flares** on a slow `sin` "drag".
*Why particles + Euler:* emergent, living motion for almost no cost — no simulation, no assets,
just a few dozen structs stepped each frame. Alpha blending makes them read as translucent
atmosphere rather than solid dots.

## 2.12 2D transformations & the map camera (viewing transformation)
Standard **affine** operations — **translation, scaling, rotation, shear** — and their
**composition** (order matters: `translate then scale ≠ scale then translate`). Represented with
**homogeneous coordinates** (a 3×3 matrix in 2D) so translation is a matrix multiply too:
```
[x']   [ a  c  tx ] [x]
[y'] = [ b  d  ty ] [y]
[1 ]   [ 0  0  1  ] [1]
```
In the game:
- **Sprites** are drawn at an **integer scale** (nearest-neighbour) so pixels stay square.
- The **mansion map** is a full **viewing transformation**: the world lives in a 0–100
  coordinate space; the on-screen stage is `translate(cameraX, cameraY) · scale(zoom)`. **Dragging**
  adds a pointer delta to `cameraX/Y` (**translation**); the **wheel** changes `zoom`
  (**scaling**); **focusing a room** computes the exact translate+scale that moves that room's
  centre to the viewport centre — i.e. window-to-viewport mapping. *Why explain it this way:* it
  is the textbook **world → camera → viewport** pipeline, in code you can point to.

## 2.13 The 3D pipeline — homogeneous matrices & perspective (`transforms3d.ts`)
The rotating wireframe manor is a genuine (if tiny) 3D pipeline:
1. **Model matrix** — a **4×4** composite of rotations (`rotationY(t) · rotationX(…)`) that spins
   the house in object space.
2. **View matrix** — `translate(0, −0.3, −5.2)` pulls the camera back.
3. **Projection matrix** — a **perspective** matrix built from field-of-view, aspect, near, far.
4. **MVP** — multiply them: `MVP = Projection · View · Model`. Each vertex is transformed by MVP
   into **clip space** `(x, y, z, w)`.
5. **Perspective divide** — divide by `w`: `(x/w, y/w)` → **normalised device coordinates**. This
   is what makes far things smaller — the essence of perspective.
6. **Viewport transform** — map NDC `[−1, 1]` to screen pixels (and flip Y).
7. **Rasterise edges** — draw each of the house's edges between projected vertices with
   **Bresenham** (clipped by Cohen–Sutherland).
*Why it matters for the viva:* this is the exact **model → view → projection → divide → viewport**
sequence from the syllabus, with real 4×4 homogeneous-matrix multiplication and a real
perspective divide — not a CSS trick.

**Where it runs — be precise:** the rotating wireframe manor on the **title screen**
(`TitleScreen.tsx` → `Wireframe3D.tsx` → `drawWireframeManor` in `transforms3d.ts`), also exported
as `docs/shots/wireframe.png`. It is a **dedicated demonstration of the 3-D pipeline; the game
itself is 2-D.** Say exactly that if asked — don't present it as 3-D gameplay. (A possible upgrade,
deferred: a 3-D wireframe fly-in of the manor inside the cutscene.)

## 2.14 The render loop, upscaling & why the low resolution
Every frame, driven by **`requestAnimationFrame`**, a scene function composes the picture in
draw-order: **clear → dithered-gradient background → scan-convert furniture → blit sprites →
particles → radial lighting → vignette → `putImageData`** (flush to the visible canvas). The
canvas element is then stretched to screen with CSS **`image-rendering: pixelated`**
(**nearest-neighbour** upscaling), so each of our 384×216 logical pixels becomes a crisp 2–4-pixel
block instead of a blurred one. *Why the whole design hangs together:* a tiny buffer is cheap to
fill (performance), procedural art means **zero asset files** (~64 KB game), and nearest-neighbour
upscale keeps it razor-sharp — **the art style and the performance are the same decision.**

---

# PART III — Game engineering (how the app is built)

- **Stack:** React 18 + TypeScript + Vite. UI is the DOM; scenes are the canvas rasterizer.
- **Finite-state machine:** a `useReducer` store (`store.tsx`) holds the `phase`
  (title → cutscene → prologue → investigation → interrogation → accusation → verdict) and all
  game state; screens **dispatch actions**, never mutate state. Making the states explicit is both
  a rubric item and what keeps the flow debuggable.
- **Engine-owned truth:** `caseData.ts` holds rooms, clues, timeline, and the private solution;
  dialogue can discuss them but never redefine them.
- **The service seam:** all suspect replies go through `SuspectService.ask()` — the single point
  where the scripted mock is swapped for the memory-backed LLM later.
- **Scoring:** `scoring.ts` — +8 per physical clue found; +6 for flagging a statement that really
  was off (lie / false memory / evasion); −4 for flagging an honest plain statement; +40 correct
  accusation / −25 wrong; +5 per attached clue on a correct accusation (max 3); multiplied by
  difficulty (Rookie 1.0, Detective 1.25, Inspector 1.5); `total = max(0, round(subtotal × mult))`.
  Ranks: Case Unsolved · Constable · Detective · Inspector · Master Detective.
- **Difficulty = the memory-fallibility dial:** today it gates the "tells" (Rookie shows all,
  Detective only those on lies/false memories, Inspector none); with the backend it will also set
  the suspects' decay / interference / source-monitoring strengths.
- **Cutscene system (`CutsceneScreen.tsx`, `cutscene/sceneCompositions.ts`):** five procedural
  scenes (exterior approach → detective walking → entrance doors → foyer → case-begins title card),
  ~5 s each, drawn every frame into the 384×216 `PixelCanvas` and flushed with `putImageData`.
  Click / Space / Enter advances, Escape or "Skip" jumps to the prologue. The scene table (draw
  function + subtitle + duration) *is* the storyboard.

---

# PART IV — Likely viva questions (crisp answers)

- **Why Canvas 2D and not OpenGL/WebGL?** We wanted to *implement* the graphics algorithms
  ourselves, not call a GPU library. A raw `ImageData` buffer lets us write `putPixel`, scan
  conversion, dithering and lighting by hand — which is exactly what the syllabus is about. The
  same concepts map to OpenGL (frame buffer, textures/sprites, blending, transforms, viewport),
  we just do them on the CPU.
- **Which circle algorithm?** The **midpoint** (Bresenham-family) method — integer decision
  parameter + symmetry; a circle is the `rx = ry` special case of our `fillEllipse`.
- **DDA vs Bresenham — which and why?** Both implemented; we draw real edges with **Bresenham**
  because it is integer-only and pixel-exact (crisp), and keep DDA to show the incremental method.
- **How are gradients pixel-art, not smooth?** **Bayer 4×4 ordered dithering** — a deterministic
  threshold pattern, no blur, no noise.
- **What filling algorithm do you use — flood fill / boundary fill / polygon fill?** **Scan-
  conversion (area) fills only:** rectangles span-by-span, and the ellipse interior by horizontal
  spans between symmetric points. We **don't** use flood fill or boundary (seed) fill — nothing
  fills an arbitrary drawn region — and we have **no general polygon scan-fill**. The only
  polygon-shaped fill is the character coat, a **convex** trapezoid filled analytically per
  scanline.
- **Convex or concave polygons?** Neither are filled as general polygons. Concave polygons only
  matter for a general scan-line fill (a scanline crosses a concave boundary an even number of
  times, needing the **odd–even parity rule**); we never do that. Our one polygon-ish fill is
  **convex**, and the 3-D manor is a **wireframe** (edges only, no filled faces), so the case
  never arises. It *could* be added (odd–even scan-fill + back-face culling) if we filled the 3-D
  faces.
- **How does the lighting work?** CPU **radial additive** light: add `(1 − d/R)² · intensity` of
  the light colour to each pixel in range; darken outside with a vignette. Stylised, not PBR.
- **How is text drawn?** Two ways. The cutscene **title** is a real **in-engine bitmap font** — a
  5×7 `'1'/'0'` glyph grid per character, each `'1'` stamped as a 2×2 `fillRect` (glyph blitting).
  All other text (dialogue, UI, notebook) is **DOM/CSS** using pixel web fonts (Press Start 2P,
  Pixelify Sans, VT323) — chosen for legibility, wrapping and accessibility. The canvas carries
  the art; the DOM carries the words.
- **How is animation done?** Continuous canvas effects on `requestAnimationFrame` with elapsed
  time + `sin` for flicker/sway; CSS keyframes for UI; and **sprite-frame swaps** (normal / blink
  / talking) for characters.
- **Is it 3D?** The game is 2D. There is a real 3D **wireframe** pipeline — 4×4 homogeneous
  matrices, MVP composition, perspective divide, viewport transform, Bresenham edges — shown live
  as the rotating manor on the **title screen**. It is a dedicated demonstration of the syllabus
  3D-transform topic, not 3D gameplay.
- **How do you stop the AI changing the mystery?** The solution and physical clues live in
  **code** (`caseData.ts`); the LLM only ever produces *testimony* and never reads ground truth,
  so it can misremember but can't rewrite who did it.
- **What is genuinely novel?** Not an algorithm, and not the individual mechanisms (decay,
  interference, reconsolidation already exist — built to make agent memory more *efficient*). Our
  contribution is the **objective inversion**: using them for **fidelity** — a persistent character
  whose episodic memory fails at **human-calibrated** rates across several classic paradigms while
  its core identity stays stable — and evaluating that **adversarially** in a game where honest
  false memories and lies come from separate, labelled mechanisms and players must tell them
  apart. (COMPACTOR, 2026, calibrated working-memory *capacity* against humans; it doesn't model
  distortion. A 2026 detective-game paper cut suspect hallucinations to make them *reliable*; we
  make them *reliably unreliable*.)
- **Biggest limitation?** The memory backend is designed but the live build answers with a
  scripted service; it is a 2D CPU renderer, not a 3D/GPU engine (3D is a title-screen
  demonstration); and several syllabus algorithms (flood fill, polygon clipping) aren't needed by
  this game, so we didn't force them in.

---

# PART V — Syllabus coverage map (what is implemented, and what honestly isn't)

Say it this way in the viva: name the algorithm that *is* present, and for missing ones explain
why the game doesn't need it and how you would add it — never claim a CSS feature is a textbook
algorithm.

### 5.1 Introduction to computer graphics
| Topic | Status in Ravenswood |
|---|---|
| Graphics system | DOM (structure) + CSS (UI styling) + Canvas 2D (raster scenes) + TypeScript (render loop, interaction) |
| **Raster scan** | **Implemented** — `ImageData` frame buffer filled in row-major (raster-scan) order |
| Random (vector) scan | Not implemented — the browser canvas is raster-only |
| CRT display | Not simulated — explain conceptually: frame buffer → canvas surface → browser compositor → screen |
| Input devices | Mouse click, mouse wheel, pointer drag (map camera), keyboard Space / Enter / Escape (cutscene), text input (questions) |
| Colour models | **RGB / RGBA** used throughout; alpha compositing; HSL/HSV not used |
| Graphics data | RGBA byte arrays, colour ramps, character-grid sprites + palettes, a 5×7 bitmap font, normalised map coordinates |

### 5.2 Scan conversion
| Topic | Status |
|---|---|
| Point plotting | **Implemented** — `putPixel` |
| Line: DDA | **Implemented** — `drawLineDDA` |
| Line: Bresenham | **Implemented** — `drawLine` (used for real edges: window mullions, rain, 3D wireframe) |
| Circle (midpoint) | **Implemented** — `drawCircle` (8-way symmetry) |
| Ellipse (midpoint) | **Implemented** — `fillEllipse` (two regions, 4-way symmetry, span fill) |
| Rectangle fill | **Implemented** — `fillRect` |
| Flood / boundary (seed) fill | Not implemented — nothing fills an arbitrary drawn region (§2.3a) |
| Scan-line polygon fill | Not implemented — no filled general polygons; only a convex coat filled per scanline (§2.3a) |

### 5.3 2D / 3D transformations and projection
| Topic | Status |
|---|---|
| Translation, scaling, rotation, shear | **Implemented** — map camera, sprite scaling, character/scene animation, shadow skew |
| Composite transforms | **Implemented** — e.g. `translate · scale` camera; `rotationY · rotationX` model matrix |
| Homogeneous coordinates | **Implemented in code for 3D** (4×4 matrices in `transforms3d.ts`); 2D composition done by CSS/canvas, explainable in 3×3 form |
| Reflection | Not implemented (no mirror transform needed) |
| **3D transforms + perspective projection** | **Implemented** — MVP, perspective divide, viewport; shown as the title-screen wireframe manor |

### 5.4 Windowing and clipping
| Topic | Status |
|---|---|
| Window → viewport / viewing transformation | **Implemented** — mansion map: world (0–100) → camera translate + scale → viewport |
| Line clipping | **Implemented** — Cohen–Sutherland `clipLine`, used by every `drawLine` |
| Midpoint-subdivision / Liang–Barsky clipping | Not implemented (Cohen–Sutherland covers the need) |
| Polygon clipping (Sutherland–Hodgman) | Not implemented — no filled polygons to clip |

### 5.5 Introduction to gaming and game-design steps
- **Type of game:** single-player narrative investigation (mystery / interactive fiction) with
  exploration, dialogue, evidence, scoring and a verdict.
- **Engine / platform:** a custom lightweight shell (React + TypeScript + Canvas 2D) — not Unity /
  Unreal / Godot; runs in any modern browser.
- **Storyboard:** Title → Cutscene scenes 1–5 → Prologue → Map → Interrogation → Accusation →
  Verdict; the cutscene's scene table is a literal storyboard (draw function, subtitle, duration).
- **Object definitions:** typed interfaces — `Room`, `Clue`, `Suspect`, `MemoryProfile`,
  `Statement`, `NotebookEntry`, `AskResult`, `SuspectService`.
- **Key-frame animation:** CSS keyframes (UI, popups) plus time-driven canvas animation (flicker,
  sway, rain, smoke) and sprite key-frames (normal / blink / talk).
- **In-betweens:** the browser interpolates CSS keyframes; the canvas recomputes positions every
  `requestAnimationFrame` from elapsed time (`sin`, linear steps).
- **Rendering order:** background → architecture → furniture → characters & props → lighting →
  particles → vignette → flush; DOM UI on top.

### 5.6 OpenGL — not used; what replaces each concept
| OpenGL concept | Ravenswood equivalent |
|---|---|
| Frame buffer | `ImageData` buffer in a Canvas 2D context |
| Textures / sprites | Character-grid sprites + palettes; bitmap font glyphs |
| Primitives | `putPixel`, `drawLine`, `drawCircle`, `fillEllipse`, `fillRect` |
| Blending | Source-over alpha in `putPixel`; additive light in `applyLighting` |
| Model-view-projection | `transforms3d.ts` 4×4 matrices + perspective divide |
| Viewport | Viewport transform in the 3D pipeline; map camera; browser viewport |
| Animation loop | `requestAnimationFrame` |
| Lighting | CPU radial additive lights + vignette |
| Clipping | Cohen–Sutherland in software; buffer bounds checks |
Honest answer if asked: *"We deliberately implemented these on the CPU so the algorithms are ours;
the same concepts map one-to-one onto OpenGL."*

### 5.7 Safe development rules (for anyone extending the code)
1. Case truth lives only in `caseData.ts`. 2. Suspect behaviour stays behind `SuspectService`.
3. State changes go through the reducer. 4. Screens present and dispatch; they don't score or
decide truth. 5. Keep drawing code deterministic. 6. Keep the 384×216 internal resolution and
nearest-neighbour scaling. 7. Keep the cool-ambient / warm-practical lighting model. 8. Respect
`prefers-reduced-motion`. 9. Run `npm run build` after changes and play the full flow. 10. Document
any new algorithm here and say whether it is textbook, approximated, or browser-provided.

---

# Appendix — file map & formula cheat-sheet

**Files:** `pixelRenderer.ts` (rasterizer: primitives, clipping, dithering, lighting) ·
`transforms3d.ts` + `Wireframe3D.tsx` (3D pipeline, title screen) · `characters.ts` +
`PixelSprite.tsx` (procedural sprites) · `palettes.ts` (colour ramps) · `interrogationScene.ts` +
`InterrogationRoom.tsx` (interrogation scene) · `screens/cutscene/sceneCompositions.ts` +
`CutsceneScreen.tsx` (cutscene + bitmap font) · `store.tsx` (FSM) · `caseData.ts` (ground truth) ·
`scriptedSuspectService.ts` (current dialogue) · `serviceProvider.ts` (the swap point) ·
`scripts/renderEntry.ts` + `runRender.mjs` (headless PNG renders) · `scripts/annotate.py`
(annotated screenshots).

**Formulas:**
- Frame-buffer index: `i = (y·W + x)·4`
- Source-over alpha: `Cout = α·Csrc + (1−α)·Cdst`
- Bresenham decision: `e2 = 2·err; if e2 > −dy → x+=sx; if e2 < dx → y+=sy`
- Bayer pick: `useColorB = level > BAYER4[y&3][x&3]`
- Radial light: `strength = (1 − d/R)² · intensity` (added)
- Vignette: `dark = min(1, (d−R)/R · strength)` (multiplied toward black)
- Particle step: `pos += vel · dt`
- Perspective: transform by `Projection·View·Model`, then divide by `w` → NDC → viewport
- Smallville retrieval: `score = recency + importance + relevance` (normalised), `recency = 0.995^hours`
- Memory accessibility (design): `S(t) = salience·(1 + Δt/τ)^(−d)·(1 + ρ·rehearsals)`,
  `d_verbatim > d_gist`; recalled if `S + ε > θ`; below threshold → unreachable, not deleted
- Lure acceptance (design): `p = σ(k·(cos(cue, centroid) − τ))`
- Source monitoring (design): source tag decays faster than content → default to "I saw it"
- Scoring: `total = max(0, round((8·clues + flags + accusation + evidence) × difficulty))`
