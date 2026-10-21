# Prompt — "Living Characters / MysteryXMystery" FA presentation (v2)

> Paste everything below into a fresh Claude (Design canvas, or Claude Code + pptx).
> Follow the design system and the **written content** exactly — the content per slide
> below is deliberately dense so **no slide looks empty**. Use your judgement only for
> visual polish, image cropping and placement. Titles and labels must read **academic and
> professional** — no cute nicknames, no "money slide", no jokey takeaways.

---

## Role & goal

You are a senior presentation designer. Produce a **16-slide** deck (16:9, 13.33×7.5in `.pptx`,
or a Claude Design canvas) for a Third-Year B.Tech **Computer Graphics & Gaming (BCE25PE01)**
formative assessment.

The project — **"Living Characters / MysteryXMystery"** — is a browser **pixel-art detective
game** whose NPCs have a **persistent identity** and a **human-fallible memory**, so the player
must distinguish a deliberate lie from an honest false memory. It is defended on **two fronts**:
(1) a **from-scratch computer-graphics engine** (a software rasterizer + a 3D pipeline), and
(2) an **AI/LLM research contribution** (living characters with a designed memory-distortion
layer). The demo case is **"Ravenswood."** Presenter: **Vedant Ghule.**

Serve all five rubric columns: **Selection & Scope · Requirement Analysis & Benchmarking ·
Game Elements & Algorithm Planning · Graphics, Display & Transformation Design · Presentation.**

**Two hard requirements:**
- **Density:** every slide must be *full* of substance — use the written bullet content
  provided; do not thin it out. Empty space that isn't deliberate whitespace is a defect.
- **The CGG algorithms are the centre of gravity.** There is a lot of graphics material —
  give it **four dedicated slides**, and **pair each algorithm with the screenshot region that
  shows it** (annotate the image: "window frame = Bresenham lines", "lamp glow = radial
  lighting", etc.). This is what makes the graphics easy to explain in the viva.

---

## Visual design system (match exactly — the team's established editorial style)

Light editorial / Swiss look.

- **Palette (hex, no `#`):** background `F3F2EF`; ink `1A1917`; single red accent `DA3E28`;
  muted gray `6E6A63`; hairline `D4D1CA`; alt-row `EAE8E3`; white `FFFFFF`. Red is the ONLY
  accent.
- **Type:** heavy grotesk titles (Helvetica Neue / Arial Black → fall back Arial Bold); clean
  sans body (Arial/Helvetica). Titles are big, bold, lower-case, ending in a period. Eyebrows
  and labels UPPERCASE, bold, letter-spaced, red. **Academic phrasing only.**
- **Masthead (each content slide):** section name top-left (muted-gray UPPERCASE); page number
  top-right in red (`04 / 16`); one thin hairline rule beneath. A short red **eyebrow** may sit
  above the title.
- **Footer:** `Vedant Ghule` bottom-left; `MYSTERYXMYSTERY · SEPT 2026` bottom-right (gray).
- **Signature elements (deliberate, not on every slide):** a red full-width bottom bar for the
  slide's key point (white bold text); a red full-height side panel for a callout; a red
  highlighted table row for the key item; large image panels with a thin red caption bar.
- **Layout variety is mandatory — do NOT put a bordered box grid on every slide.** Rotate:
  full-bleed-image title; text-left / image-right; large-image-left / text-right; **annotated
  screenshot with callout labels**; clean flow/pipeline **diagram**; comparison table; numbered
  editorial columns; image gallery; dark closing. One dominant element per slide.
- **Avoid:** dark backgrounds except the title-image and summary slides; a second accent colour;
  clip-art; thin underlines beneath titles; centered body text; sparse slides.

---

## Diagrams to build (make them clean, flat, on-brand — thin lines, red highlight, no 3-D bevels)

1. **System architecture** — a left-to-right 4-stage flow with arrows: Game Engine → Persistent
   Self-Model → Human-Memory Layer (highlight red) → LLM (voice). Label each stage (below).
2. **Rendering pipeline** — a left-to-right (or numbered) flow of the per-frame steps: clear →
   dithered-gradient background → scan-convert furniture → blit sprites → particles → radial
   lighting → vignette → flush + nearest-neighbour upscale.
3. **Game-flow FSM** — a simple state chain: Title → Cutscene → Prologue → Investigation →
   Interrogation → Accusation → Verdict (Investigation branches to Interrogation and back).
4. **Annotated screenshots** — on the CGG slides, draw thin red leader lines from the image to
   short labels naming the algorithm used for each element.

---

## Imagery — use real images, placed as design elements (never tiny thumbnails)

**Our game renders (already produced — the game visuals). Files in `docs/shots/`, 1152×648 PNG:**

| File | Shows | Use on |
|---|---|---|
| `interrogation.png` | Interrogation room: moonlit rainy window, lamp glow, suspect, detective silhouette, dust, cigarette smoke | Title; **annotated on the scan-conversion slide and the lighting/atmosphere slide** |
| `cutscene_1_approach.png` | Manor exterior in a storm (rain, lightning) | Game-design / gallery / particles |
| `cutscene_2_walking.png` | Detective walking through the storm | "Why it matters" |
| `cutscene_3_doors.png` | Entrance doors | Gallery |
| `cutscene_4_foyer.png` | Candle-lit foyer with chandelier, staircase | Game-design slide |
| `cutscene_5_begins.png` | "You are the detective" card | Summary background / gallery |
| `wireframe.png` | Rotating 3D wireframe manor | The transformations slide |
| `interrogation_algorithms.png` | The interrogation scene with **numbered callouts + a legend strip** mapping each element to its scan-conversion algorithm (Bresenham line, midpoint ellipse, sprite blit, rect scan-fill, Bayer dithering) | **Slide 9** — drop in as-is, full width; callouts are already baked in |
| `interrogation_lighting.png` | Same scene with **numbered callouts + legend** for lighting & atmosphere (radial lighting, particles+alpha, clipped-line rain, ember+smoke, vignette) | **Slide 11** — drop in as-is, full width |

**External reference images to source (place large, cleanly cropped, with the red caption bar):**
- **Skyrim** / **Red Dead Redemption 2** NPC-dialogue screenshots — "NPCs today are scripted"
  and "why living NPCs change games."
- **NVIDIA ACE** (e.g. *Covert Protocol* / *Kairos* ramen-shop demo) and **Inworld AI** — the
  industry cutting-edge slide.
- **Generative Agents "Smallville"** figure (Park et al., 2023) — the academic cutting-edge slide.
- **Crowd / traffic simulation** still (e.g. SUMO or an agent crowd) — applications + research bridge.

---

## Slide-by-slide (dense content — use it all)

### 1 · Title
Light left / image right. Masthead `COMPUTER GRAPHICS & GAMING` + `BCE25PE01`. Red eyebrow
`A PERSISTENT DIGITAL PERSON`. Title **"Living Characters"** (two lines). Sub-quote: *"Not a
chatbot with a bad memory — a character that's actually `someone`."* (word "someone" red). Right
~40%: full-bleed `interrogation.png` + red caption `THE DEMO · A LOCKED-ROOM MYSTERY`. Footer.

### 2 · The problem & our scope  (Selection & Scope)
Title: "NPCs are scripted, and they don't remember you." Image-right: a **Skyrim/RDR2 NPC
screenshot**. Left content (dense):
- Today's NPCs run on dialogue trees, finite-state machines or behaviour trees — every line is
  authored in advance.
- They keep no persistent memory of the player and have no inner life between interactions.
- With a raw LLM they flip to the opposite failure: **flawless recall** — superhuman, never
  human.
- In a detective game a perfect-recall suspect is trivial to catch; the only slip is a coded
  contradiction.
- **Our scope:** one authored case, five suspects, and NPCs that *are someone* and remember
  *imperfectly* — so the detective must ask "a lie, or an honest mistake?"
- **What this unlocks (the vision):** because the outcome turns on how the suspects remember and
  react to *you*, the same case can resolve differently for different players — memory-driven,
  per-player branching, rather than one scripted ending.
Red bottom bar: *"The persistent self is the person; the fallible memory makes it human; the
LLM is only the voice."*

### 3 · Living characters: identity + human memory  (Selection & Scope / Game Elements)
Title: "A persistent self, weathered by human memory." Left: the **two pillars** — (i) a
persistent self-model: stable identity of traits, relationships, backstory and lived episodic
memories that stays itself across a long interrogation; (ii) human memory dynamics that decay,
blur and can be misled. Right: a **table** (Human effect · Cognitive basis · In our character):
- Time decay — Ebbinghaus forgetting curve — the retrieval path weakens with time × salience.
- Interference — semantic blending — similar memories merge into one.
- **Source amnesia — Loftus misinformation effect — a planted detail becomes the suspect's own
  memory.** (red row)
- Stress narrowing — Yerkes–Dodson — under pressure recall collapses to the core.
- Conformity — Asch — memory drifts toward the group.
Red bottom bar: *"Forgetting is loss of access, not deletion — a memory persists but becomes
unreachable. Structured, literature-grounded error, not random noise."*

### 4 · System architecture  (Game Elements & Algorithm Planning)
Title: "The engine owns the truth; the model only speaks." Centre: the **4-stage architecture
diagram** (Engine → Self-model → Memory layer [red] → LLM voice). Labels:
- **Game engine (ground truth):** facts, clock, clue graph, the solution — code-held, never
  invented by the AI. This is what keeps the case solvable.
- **Persistent self-model:** identity component + an episodic store of lived events (embedded as
  vectors) that biases every retrieval.
- **Human-memory layer:** degrades retrieval *before* the model sees it — decay (detail before
  gist), interference, source-monitoring failure and retelling drift; core identity is exempt.
- **Deception policy (separate):** lies come from a conceal-and-deflect policy, not from memory —
  so every claim can be labelled true / lie / false memory.
- **LLM (voice):** verbalises in character only what still reaches it; never reads ground truth.
Note strip: currently the memory layer is scripted behind a `SuspectService` interface; a FastAPI
+ ChromaDB + sentence-transformer embeddings + provider-agnostic LLM version swaps in with no UI
change. RAG, no training.

### 5 · Related work & the gap  (Requirement Analysis & Benchmarking)
Title: "The pieces exist — the combination does not." Two academic images: **Generative Agents
"Smallville"** and an **NVIDIA ACE / Inworld** still. Four rows:
- **Generative Agents (Stanford, UIST 2023):** persistent agents with memory + reflection, rated
  believably human — but their memory is *accurate*: recency only re-ranks, never distorts.
- **Human-inspired memory for efficiency (2023–26):** MemoryBank (Ebbinghaus decay), ACT-R-style
  memory (HAI 2025), *Human-Inspired Memory Architecture* (2026: interference, reconsolidation) —
  the same mechanisms, built to make memory *cleaner*, never checked against human error data.
- **Human-memory fidelity (2026):** COMPACTOR calibrates working-memory *capacity* against human
  data (LMs are superhuman even when told to act human) — it does not model false memory or
  distortion.
- **Industry & detective games:** Inworld · NVIDIA ACE runtimes; a 2026 LLM detective game cut
  suspect hallucinations ~65% to make them *reliable*. Nobody designs the error.
Red full-height side panel: *"Same mechanisms, opposite goal: a persistent character that fails
the way people fail — calibrated to human data, core identity intact — tested against a human
detective who must tell honest mistakes from lies."*

### 6 · Positioning against comparable systems  (Benchmarking)
Title: "Ravenswood against comparable work." Comparison **table** — columns: System · NPC memory
model · NPC intelligence · Art pipeline · Human-in-loop evaluation. Rows: Ace Attorney · Return
of the Obra Dinn · Disco Elysium · Inworld / NVIDIA ACE · Generative Agents (2023) ·
**Ravenswood (ours)** (red row: Designed fallible memory · Persistent identity + LLM ·
From-scratch rasterizer · Adversarial detective). Red bottom bar: *"Each system holds one or two
of our axes; none holds designed fallible memory + persistent identity + adversarial human
evaluation together."*

### 7 · The game: "A Storm at Ravenswood"  (Game Elements & Algorithm Planning)
Title: '"A Storm at Ravenswood."' Image-right: `cutscene_4_foyer.png` (caption "The foyer, by
candlelight"). Left content:
- 1926; a storm cuts the power, the bridge floods, the manor is sealed. Lord Ravenswood is found
  dead in his study at 11:14 p.m.; the killer is Vivian Cross.
- Five suspects, each engineered around one memory phenomenon; the innocent housekeeper's honest
  false memory is the red herring, a nephew lies to hide gambling debts.
- Engine-owned ground truth: rooms and coordinates, clue descriptions and locations, the timeline
  and the solution — the AI can discuss them but never redefine them.
- Core loop: search rooms for physical clues → question suspects → log testimony → flag
  contradictions → attach evidence → accuse → verdict + Detective Rating score.
- Three difficulty tiers are the memory-fallibility dial (Rookie shows every tell → Inspector
  shows none).
Include the small **game-flow FSM diagram**.

### 8 · CGG · The rendering pipeline  (Graphics, Display & Transformation Design)
Red eyebrow `COMPUTER GRAPHICS`. Title: "Every frame is built by our own rasterizer." Centre/left:
the **rendering-pipeline diagram**. Right: `interrogation.png` (small). Content:
- No engine, no WebGL, no drawing library — an internal **384×216 `ImageData` frame buffer** of
  raw RGBA bytes (`Uint8ClampedArray`, index `= (y·width + x)·4`), written pixel-by-pixel.
- Per `requestAnimationFrame` frame: **clear → dithered-gradient background → scan-convert
  furniture (rects, ellipses) → blit character sprites (palette lookup) → particles (rain, dust,
  smoke) with alpha → radial lighting (lamp, candle) → vignette → `putImageData` → CSS
  nearest-neighbour upscale.**
- The same rasterizer draws **both** the cinematic cutscene and the interactive interrogation
  room. Characters are 26×32 sprites generated procedurally from character-grid + palette.
- All art is procedural: **0 external image assets**; the whole game is ~**64 KB** gzipped and
  the low-res buffer keeps it at ~**60 fps**.

### 9 · CGG · Scan conversion & the syllabus algorithms  (Graphics, Display & Transformation Design)
Title: "Scan-conversion algorithms — implemented, and visible." Layout: **place the finished
`interrogation_algorithms.png` large (it already has numbered callouts + a legend baked in)**;
put a compact two-column table (Algorithm → Our function) beside or below it. Table:
- Point plotting → `putPixel` (bounds-checked RGBA write, source-over alpha).
- Line — DDA & Bresenham → `drawLineDDA` (float incremental) + `drawLine` (integer decision).
- Midpoint circle & filled ellipse → `drawCircle` (8-way symmetry) + `fillEllipse`.
- Rectangle scan-fill → `fillRect` (row/column scan conversion).
- Line clipping → **Cohen–Sutherland** (`clipLine`) trims every line to the buffer.
- Ordered dithering → **Bayer 4×4** threshold matrix (`fillDithered` / `fillGradient`).
Annotate the screenshot: **window mullions = Bresenham lines**; **lamp shade & character heads =
midpoint ellipse**; **walls, desk, portraits, bookshelf = rectangle scan-fill**; **rain streaks =
clipped lines**; **sky/wall gradient = Bayer dithering**.

### 10 · CGG · 2D & 3D transformations  (Graphics, Display & Transformation Design)
Title: "Transformations — from the map camera to a 3D manor." Left: **2D** — translate, scale,
rotate, shear and *composite* transforms; character sprites are integer-scaled (nearest-neighbour)
blits; the mansion map is a **viewing transformation** (pan = translation, zoom = scaling; a drag
delta becomes a translation; focusing a room computes the translate+scale that centres it). Note
homogeneous coordinates (3×3 for 2D, 4×4 for 3D) with the matrix form. Right: **3D** — the
rotating wireframe manor (`wireframe.png`, large): vertices → **Model·View·Projection (4×4
homogeneous matrices)** → **perspective divide** (x/w, y/w) → viewport transform → edges drawn
with **Bresenham**. Caption it honestly: *"a dedicated demonstration of the 3-D pipeline, live on
the title screen — the game itself is 2-D."* Red bottom bar: *"The same affine machinery drives a
2-D camera and a 3-D perspective projection."*

### 11 · CGG · Light, atmosphere & how we built it  (Graphics, Display & Transformation Design)
Title: "Candlelight, rain and dust — from first principles." Layout: **place the finished
`interrogation_lighting.png` large (numbered callouts + legend already baked in)**, plus short
method notes:
- **Radial additive lighting** (`applyLighting`): for each pixel within radius R, brightness =
  `intensity × (1 − d/R)²` (quadratic falloff) added to the pixel — the warm **lamp pool** and
  the flickering **candle sconce**.
- **Vignette** (`applyVignette`): pixels beyond a radius are darkened by `(d − R)/R × strength`
  to pull the eye to the centre.
- **Particle systems** (Euler integration + source-over alpha): **rain** (slanted streaks),
  floating **dust motes** in the beam (sine sway), rising **cigarette smoke**, and ceiling
  drips — each particle steps `position += speed·dt` and respawns off-screen.
- **Dithered gradients** (Bayer 4×4): smooth sky/wall/wood ramps with no banding and no blur.
- **Colour ramps + a two-key lighting model:** cool moonlight through the window, warm lamp key
  light, near-black occlusion — composited every frame.
Callouts on the image: **lamp glow = radial lighting**; **dust in the beam = particles + alpha**;
**window = dithered gradient + rain particles**; **cigarette = ember light + smoke particles**;
**edges of frame = vignette.**

### 12 · Evaluation, grounded in human data  (Benchmarking)
Title: "We cite people, not made-up numbers." Three large-number rows:
- **~20–40 %** of people accept misleading post-event details as memories (Loftus
  misinformation paradigms; the exact rate depends on the paradigm), and **~40–55 %** falsely
  recall the never-shown "critical lure" word in the DRM task (Roediger & McDermott 1995) — the
  human ranges our source-monitoring and interference mechanisms are calibrated against.
- **~human-level** believability of persistent agents (Park et al., *Generative Agents*, 2023),
  and a VR user study where players felt deeply immersed with believable GenAI NPCs but lost
  immersion when responses were incoherent (Zargham et al., 2026) — our identity-persistence and
  "designed-not-random-error" benchmarks.
- **ON vs OFF** — the planned ablation (memory layer on/off): hypothesised detective solve-rate
  ↓ and turns-to-solve ↑. We present protocol + hypotheses; no fabricated chart.

### 13 · Applications  (Applications)
Title: "Where this is useful — and where we're honest." Lead with games; be candid about
maturity elsewhere. Emphasise the first block (it is the real one).
- **Games — the real application.** LLM-driven NPCs are already shipping (Inworld, NVIDIA ACE,
  Ubisoft "NEO" NPCs, Convai). Our layer adds **memory-driven relationships and per-player
  branching outcomes** — the *same* case can end differently depending on how the suspects come
  to remember and react to you, so no two playthroughs are alike. A user study of GenAI NPCs in
  a VR game found players felt **deeply immersed when NPCs responded believably** — but that
  **inconsistent, incoherent responses broke immersion** (Zargham et al., *Intl. J.
  Human–Computer Interaction*, 2026), which is exactly why our error must be *designed and
  cognitively grounded, not random*. Persistent, reactive agents were also rated believably
  human by Park et al. (*Generative Agents*, UIST 2023). *(Highlight this block — red side panel
  or large treatment.)*
- **Training simulators — emerging.** Medical "standardized-patient" bots, negotiation and
  interrogation practice with a witness who genuinely misremembers. A real but modest niche.
- **Human-behaviour / persona modelling — cautious.** Simulating how a real operator or witness
  would plausibly recall and act. *(We do NOT claim "digital twins of people" — that term is
  industrial, for machines and processes; keep this modest.)*
- **Bridge to a computer-graphics research topic → next slide:** traffic & crowd simulation.

### 14 · Our contribution & a research bridge  (Research Direction)
Title: "Our contribution, and where it connects." Make the distinction explicit: **our research
is fallible, persistent identities — crowd simulation is only a connection, not our claim.**
- **What we contribute (state plainly, red-highlighted):** we take human-inspired memory
  mechanisms that prior work built for *efficiency* and turn them toward *fidelity*: a persistent
  character whose episodic memory decays, blends and misattributes sources at **human-calibrated
  rates** (checked against classic forgetting, DRM and misinformation results) while its **core
  identity stays stable**, evaluated adversarially in a game where honest false memories and lies
  come from separate, labelled mechanisms. Forgetting is **loss of access, not deletion.** In one
  line: **believable, fallible, persistent identities.**
- **Roadmap:** an autonomy loop (characters that live between interactions); fine-tuned persona
  voices (identity in the weights); cognitive-fidelity validation against human false-memory
  rates; the culprit weaponising other suspects' false memories to frame someone.
- **A bridge to a taught CG research topic — crowd / data-driven agent behaviour (NOT our
  contribution):** crowd and traffic models give agents their *motion* (steering, social-force);
  our layer gives an agent *believable cognition*. They are complementary — a possible future
  combination, and an application direction, not what we built.

### 15 · Gallery  (Presentation)
Title: "Ravenswood — rendered entirely from code." A clean 3×2 grid of the six game renders
(`cutscene_1..5` + `interrogation`), edge-aligned, generous gutters, no borders.

### 16 · Summary (dark)
Ink background. Red eyebrow `A PERSISTENT DIGITAL PERSON`. Title "Two fronts, honestly built."
- **Computer graphics:** a from-scratch software rasterizer (point/line/ellipse scan conversion,
  Bayer dithering, radial lighting, alpha compositing, Cohen–Sutherland clipping) and a real 3-D
  pipeline with 4×4 homogeneous matrices and perspective projection (demonstrated on the title
  screen) — the syllabus in our own code.
- **Research:** NPCs with a persistent identity and a designed human-fallible memory, evaluated
  adversarially with a human detective; forgetting modelled as loss of access, not deletion.
- **Status:** playable now; the memory backend swaps in behind a clean interface without touching
  the game.
"Thank you — questions welcome." Footer.

---

## The one honest contribution sentence (use where a thesis line is needed)
> We repurpose human-inspired memory mechanisms — previously built to make agent memory more
> efficient — toward cognitive fidelity: a persistent LLM character whose episodic memory decays,
> blends and misattributes sources at human-calibrated rates while its core identity stays stable,
> evaluated adversarially in an interrogation game where players must tell honest false memories
> from lies.

*(Full decision log, literature check and sources: `PROJECT_CONTEXT.md` at the repo root.)*

## Build & QA (if producing a .pptx)
13.33×7.5in; hex without `#`; safe fonts (Arial/Helvetica) for reliable text-fit. Give every
table clear clearance below its title. Render each slide to an image and check: no title/table
overlap, no text overflow, ≥0.5in margins, images cropped (not stretched), and every slide
substantively full. Fix, re-render, done.
