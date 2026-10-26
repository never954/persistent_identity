# Living Characters / MysteryXMystery — Project Context & Decision Log

**Single source of truth for the project.** Every decision we have agreed, why we made it, what
is built, what is next, the research design, and every source. When the code or another document
disagrees with this file, fix one of them — this file is meant to stay true.

- **Last updated:** 21 Oct 2026
- **Owner:** Vedant Ghule — TY B.Tech Computer Engineering, PCCoE (SPPU), Computer Graphics &
  Gaming (BCE25PE01)
- **Supersedes:** `docs/RESEARCH_PLAN.md` (merged here) and, where they conflict, the external
  planning docs listed in §10.

---

## 0. Document map

| File | What it is for |
|---|---|
| **`PROJECT_CONTEXT.md`** (this file) | Decisions, status, research design, sources — read first |
| `README.md` | Developer handoff: how to run the game, code contracts, extension rules |
| `docs/VIVA_GUIDE.md` | Technical explainer for the viva: memory design, every graphics algorithm (how + why), syllabus coverage map, likely questions |
| `docs/DECK_PROMPT.md` | Paste-ready prompt that makes Claude Design build the FA presentation |
| `docs/shots/*.png` | Real renders from the game's own rasterizer (+ two annotated versions) used in the deck |
| **`docs/PERSISTENT_MEMORY.md`** | The persistent, fallible suspect backend: every feature, every failure fixed, results, and how to demo it |
| `backend/` | The suspect server (FastAPI + SQLite memory stream, reusing `research/lcmem`); `demo.py`, `eval_fidelity.py`, tests |
| `research/` | Memory model (`lcmem/`), experiments, human reference data, results — see `research/README.md` |
| `paper/ravenswood.tex` | The research paper, IEEE conference format (preliminary draft); compile on Overleaf — see `paper/README.md` |
| **`docs/RESULTS_EXPLAINED.md`** | Every result so far in plain language: question, method, numbers, meaning, weak points, viva answers — updated as new results arrive |
| `research/results/study1/summary.md` | Auto-generated Study 1 numbers (never hand-edited) |
| `scripts/` | Headless render (`renderEntry.ts`, `runRender.mjs`) and screenshot annotation (`annotate.py`) |

---

## 1. The project in one page

**Living Characters** is the research idea: NPCs that *are someone* (a persistent identity) and
remember *like a person* (a designed, human-fallible memory). **MysteryXMystery** is the project
codename. **Ravenswood — "A Storm at Ravenswood"** is the demo game: a pixel-art interrogation
mystery where the player must tell a deliberate lie from an honest false memory.

It is defended on **two fronts**, kept separate in every deliverable:
1. **Computer graphics (the FA course):** a from-scratch software rasterizer that draws the
   cutscene and the interactive interrogation scene, plus a real 3-D transformation pipeline.
2. **AI research:** a persistent-identity agent with a human-memory-distortion layer, evaluated
   against human memory data and in an adversarial player study.

**Design maxim:** *The persistent self is the person. The fallible memory makes it human. The LLM is
only the voice.*

**Status (20 Oct 2026):** the game is fully playable end-to-end with scripted suspects; the graphics
engine is complete; the FA deck prompt, viva guide and screenshots are done.
**Status (21 Oct 2026):** the memory model runs and **Study 1 at the memory level is done** (§6.9) —
real numbers, compared with published human data.
**Status (23 Oct 2026):** the suspect backend runs and the game uses it — a persistent memory stream
per suspect, the research model deciding recall, leading-question planting, write-back, Memory
Inspector; 30 backend tests; voice↔decision agreement 29/30 on 5 saves (`docs/PERSISTENT_MEMORY.md`).
**Next:** a chat-tuned voice model (`qwen2.5:3b`) and its evaluation, Studies 2–3, the player pilot.

---

## 2. Decision log

Status: ✅ done · 🔜 agreed, not built yet · ⏸ deferred · ❌ dropped

### A. Product and game
| # | Decision | Why | Status |
|---|---|---|---|
| A1 | Web app: React 18 + TypeScript + Vite; no game engine | Fast iteration, explainable, easy to wire to a Python backend | ✅ |
| A2 | **The engine owns ground truth** (`src/game/case/caseData.ts`); the AI never invents or changes facts | Free-generating agents would make the mystery incoherent and unsolvable | ✅ |
| A3 | All suspect replies go through one seam, **`SuspectService.ask()`**; swap implementations in `serviceProvider.ts` | Backend drops in without touching any screen | ✅ (scripted today) |
| A4 | **Text-only** interaction — type a question, read a reply; no voice / TTS | Simpler, nothing extra to justify | ✅ |
| A5 | Case "A Storm at Ravenswood", 1926; killer **Vivian Cross**; five suspects, each built around one memory phenomenon (§4) | The honest false memory (Agnes) is the red herring — the thesis in miniature | ✅ |
| A6 | Explicit finite-state flow: title → cutscene → prologue → investigation → interrogation → accusation → verdict | Rubric asks for clear game states; easy to debug | ✅ |
| A7 | **Difficulty = the memory-fallibility dial** (Rookie / Detective / Inspector); today it gates "tells", later it sets memory strengths | Ties gameplay difficulty to the research variable | ✅ / 🔜 |
| A8 | Detective Rating scoring (§4) | Rubric asks for scoring | ✅ |
| A9 | Title screen: clicking a difficulty card starts the game; layout fits a laptop without scrolling | Users got stuck on a two-step start | ✅ |
| A10 | Investigation hub = a walkable top-down manor (rooms, corridors, a bedroom each, the Great Hall); suspects walk tile by tile; camera follows the detective; you only see who is in your room (26 Oct 2026, replacing the pan/zoom "dollhouse" map) | Persistence must be visible: you can watch someone walk past, or not see them at all | ✅ |
| A11 | Interrogation scene: wide film-noir shot — detective silhouette (with cigarette + smoke), suspect across the desk, banker's lamp, rainy window, portraits, sconce, bookshelf, papers, steaming cup, dust | "The whole room should feel alive" | ✅ |

### B. Graphics engine (CGG front)
| # | Decision | Why | Status |
|---|---|---|---|
| B1 | **Pixel-art aesthetic**; pixel web fonts Press Start 2P / Pixelify Sans / VT323 | Painterly SVG faces read as "bad drawings"; at low resolution simple *is* the style | ✅ |
| B2 | **Scenes are drawn by our own software rasterizer** (`pixelRenderer.ts`) into a 384×216 `ImageData` buffer, nearest-neighbour upscaled; **UI stays in the DOM** | Makes the project genuinely computer graphics; "the canvas carries the art, the DOM carries the words" | ✅ |
| B3 | The interrogation room is rasterized (`interrogationScene.ts`), not CSS | Was CSS/DOM; converted so the interactive scene is real CG too | ✅ |
| B4 | Implemented syllabus algorithms: point plotting, **DDA + Bresenham** lines, **Cohen–Sutherland** clipping, **midpoint circle + ellipse**, rectangle scan-fill, **Bayer 4×4** dithering, radial additive lighting, vignette, source-over alpha, particle systems, sprite blitting, bitmap font, 2-D transforms + viewing transform (map camera), **3-D MVP + perspective divide** | Every syllabus box we claim is backed by a function (see `docs/VIVA_GUIDE.md` Part V) | ✅ |
| B5 | **Not implemented, deliberately:** flood/boundary fill, general polygon scan-fill, polygon clipping, reflection, OpenGL/WebGL, filled 3-D faces | The game doesn't need them; we explain how we'd add them instead of faking | ✅ (decision) |
| B6 | **3-D:** keep the real pipeline as the rotating wireframe manor on the **title screen**, and present it honestly as a *dedicated demonstration* — the game is 2-D | Picked over adding a cutscene fly-in now: backend work is the priority, and honesty beats overclaiming | ✅ (fly-in ⏸) |
| B7 | **Text:** in-engine 5×7 bitmap font for the cutscene title; DOM pixel fonts for everything readable | Bitmap fonts suit a title, the browser suits paragraphs | ✅ |
| B8 | Characters are procedural 26×32 pixel busts (`characters.ts`) with normal / blink / talk frames | Zero art assets, consistent cast, reused everywhere | ✅ |

### C. FA deliverables (deck, viva, screenshots)
| # | Decision | Why | Status |
|---|---|---|---|
| C1 | The deck is built by pasting **`docs/DECK_PROMPT.md` into Claude Design**, not generated by code | The coded decks used boxes everywhere and lacked image sense | ✅ (prompt ready) |
| C2 | Deck style = the team's Keynote: light off-white `F3F2EF`, ink `1A1917`, single red accent `DA3E28`, heavy black lower-case titles ending in a period, gray masthead + hairline + red page number | Matches the established look | ✅ |
| C3 | 16 slides, ordered: title → problem & scope → identity + human memory → architecture → related work → positioning table → the game → 4 CGG slides (pipeline · scan conversion · transformations · light & atmosphere) → evaluation → applications → contribution & research bridge → gallery → summary | Memory and architecture sit together up front; CGG is a coherent block | ✅ |
| C4 | Dense written content on every slide; **academic titles** (no "money slide", no jokey lines); clean diagrams (architecture, render pipeline, FSM, annotated screenshots) | Sparse slides looked empty | ✅ |
| C5 | Real imagery: our renders + Skyrim / RDR2, NVIDIA ACE / Inworld, Generative Agents "Smallville", crowd-sim stills | Images placed as design elements make the deck look good | ✅ |
| C6 | **Pre-annotated screenshots** (`interrogation_algorithms.png`, `interrogation_lighting.png`) — numbered markers + legend mapping each element to its algorithm | Guarantees clean, consistent callouts | ✅ |
| C7 | Performance-only slide **dropped**; its one useful line (0 assets, ~64 KB, ~60 fps) folded into the pipeline slide | Weak on its own | ✅ |
| C8 | **Applications, honestly:** games lead (memory-driven relationships, **per-player branching endings**); training simulators "emerging"; **no "digital twins of people" claim**; traffic/crowd simulation only as the bridge | "Digital twin" is an industrial term; an examiner would ask "name one" | ✅ |
| C9 | **Crowd simulation is a connection, not our research.** Crowd models give agents *motion*; our layer gives *cognition* — complementary | Our research is fallible persistent identities | ✅ |
| C10 | Player-preference evidence = **Zargham et al. 2026** (immersion when believable; incoherent errors break it) + **Park et al. 2023** | Verified, real citations; supports "designed, not random, error" | ✅ |
| C11 | `docs/VIVA_GUIDE.md` is the single technical explainer (the old `TECHNICAL_DOCUMENTATION.md` was merged into it) | One accurate document instead of two conflicting ones | ✅ |

### D. Research and backend
| # | Decision | Why | Status |
|---|---|---|---|
| D1 | **Novelty claim** = objective inversion + calibration + game evaluation (§6.3) — *not* a new algorithm, *not* "first human-like memory" | Every individual mechanism is already published (§6.2) | ✅ (decision) |
| D2 | Target **game / HCI venues** + arXiv first; the same preliminary draft doubles as the FA "additional marks" paper | These venues accept mechanic + system + player-study papers | 🔜 |
| D3 | Backend: Python **FastAPI** game service (`backend/`) with a **SQLite memory stream** (timestamped rows + stored embeddings, exact cosine search) — revised from ChromaDB because each row carries mutable recall state (last access, rehearsals, source tag) and retrieval uses a custom Smallville score. Embeddings: `all-MiniLM-L6-v2` (384-d) via **Ollama** (`all-minilm`) | Simple, free, CPU-friendly; one transparent file per installation; ChromaDB can sit behind `MemoryStore` later | ✅ 23 Oct 2026 — see `docs/PERSISTENT_MEMORY.md` |
| D4 | **Local models via Ollama** for all runs on this machine: **`qwen2.5-coder:3b` primary** (clean JSON every field, stays first-person and grounded), **`gemma3:1b` for the cross-model check** (different family). A hosted Claude model stays the quality option if an `ANTHROPIC_API_KEY` is added | Results shouldn't be one model's quirk; the 3b/1b models were already on the machine, so no 4.7 GB download on 8 GB RAM; a 7B thrashes | ◐ 3b wired + first LLM study run; gemma cross-check 🔜 |
| D5 | **Memories are structured slots** (who / what / where / when / details + strengths + source + salience + core) | Makes blending, labelling and every metric exact | 🔜 |
| D6 | **Four mechanisms in v1:** power-law decay (detail before gist), interference (slot blending + lures), source-monitoring failure (incl. leading questions), reconsolidation (retelling drift); **core identity exempt** | The minimum set that creates the lie-vs-mistake ambiguity and maps to classic paradigms | 🔜 |
| D7 | Confirmation-biased reconsolidation = optional 5th mechanism; stress narrowing and group conformity = future work | No benchmark found for the first; conformity overlaps MANBENCH | ⏸ |
| D8 | **Lies come from a separate deception policy**, not the memory layer; every claim labelled true / lie / false memory / gist-forgotten / evasion | Turns "lie vs honest mistake" into a measurement | 🔜 |
| D9 | **Simulated game clock** (night of the murder → interrogation next morning; benchmark delays are simulated) | Decay needs time; real time is impractical | 🔜 |
| D10 | Evaluation = Study 1 (cognitive fidelity), Study 2 (selective fallibility), Study 3 (AI-detective dose-response + small player pilot), baselines B0–B3 + ablations (§6.6) | Automated studies give numbers fast; the pilot gives the game claim | ◐ Study 1 (memory level) ✅ |
| D11 | **Memory Inspector** overlay in the game (toggle) showing retrieved memories, strengths, distortions | Demo, viva and paper figure in one | ✅ in "Read memory" (spoiler toggle) |
| D12 | RAG + prompting only; **no fine-tuning** in v1 | Feasible, controllable, auditable; fine-tuning is future work | ✅ (decision) |
| D13 | **Study 1 runs at two levels:** first the memory layer alone (its probabilities, no LLM — deterministic, fast, free), then end-to-end with the LLM voice | Isolates the mechanism from LLM noise; gives numbers before any API spend | ✅ memory level |
| D14 | **DRM protocol (fixed before any lure result was seen):** calibrate on Roediger & McDermott 1995 Exp 2 *studied-item* data only (remember .41, know .24, unrelated-word FA .11); critical-lure rates are **predictions, never fitted**. Any later change (e.g. mean-centred embeddings) is reported as **post-hoc sensitivity** | Prevents fitting the result we claim to predict | ✅ |
| D15 | **Recognition is dual-process:** "old" = recollection OR familiarity; familiarity is MINERVA-2 global matching over gist traces (`Σ g·max(0,cos)^3`, decision `Φ((F−c)/σ)`). Misinformation 2AFC = Luce choice in which a rival discounts itself only if its source tag is still reachable. Replaces the earlier `σ(k·(cos(cue, centroid) − τ))` lure rule | Standard, citable models (Hintzman 1988; Yonelinas 2002; Luce 1959); lures emerge from similarity instead of a hand-made rule | ✅ |
| D16 | **Exp 1c (misinformation) and 1d (source monitoring) are demonstrations**, not calibrations: κ (how much faster source fades than content) is an assumption and is swept 1–3; the misinformation human figure is secondary-source | No primary data extracted yet for these paradigms | ✅ (labelled) |

### E. Honesty rules (non-negotiable)
1. Never fabricate numbers, charts or citations. Where we have no data, show the protocol and
   hypotheses, or cite human studies.
2. Say "the memory backend is designed, not running yet" until it runs.
3. Say "3-D is a title-screen demonstration; the game is 2-D."
4. Claim composition + objective inversion + evaluation — not new mechanisms, not "belief".
5. Hedge novelty with "to our knowledge" and keep the literature check (§6.2) current.

### F. Dropped or superseded (and where the files went)
Removed files were moved to the macOS Trash on 20 Oct 2026, in
`~/.Trash/cggz-ogame-cleanup-2026-10-20/` — restore from there if ever needed.
| Item | Replaced by |
|---|---|
| Voice / TTS | Never added — text only (A4) |
| Painterly SVG characters (`SuspectFigure.tsx`, `figure.css`) | Pixel sprites (B1, B8) |
| CSS/DOM interrogation room (`room.css`) and `TalkingBust.tsx` | Rasterized scene with frame swaps in `interrogationScene.ts` (B3) |
| Dark noir deck + editorial deck generated in code (`scripts/buildDeck.mjs`, `Ravenswood_CGG_FA.pptx/.pdf`, `slide-*.jpg`, `pptxgenjs` dependency) | `docs/DECK_PROMPT.md` → Claude Design (C1) |
| Hand-tuned Monte-Carlo ablation (`scripts/eval/ablation.mjs`) | Published human data + real automated studies (D10) |
| `docs/TECHNICAL_DOCUMENTATION.md` | `docs/VIVA_GUIDE.md` (C11) |
| `docs/RESEARCH_PLAN.md` | This file |
| Generated leftovers (`scripts/_bundle.mjs`, `vite.config.js`, `vite.config.d.ts`) | Regenerated on demand / emitted under `node_modules/.tmp` |
| Performance slide; neural-animation and narrative-visualisation research tangents; "digital twins of people" | C7, C9, C8 |

---

## 3. What runs today vs what's next

**Runs today:** full game loop with **persistent, fallible LLM suspects** served by `backend/`
(`npm run server` + `npm run dev`; see `docs/PERSISTENT_MEMORY.md`), rasterized cutscene,
interrogation scene and eight explorable rooms, pixel dollhouse map with pan/zoom camera, case
book, accusation, verdict and scoring, 3-D wireframe on the title; saves survive a refresh and a
server restart.
**Research, runs today:** the memory model (`research/lcmem/`, 9 unit tests) and all of Study 1 at the
memory level — `cd research && .venv/bin/python experiments/run_study1.py` regenerates every number
and figure in §6.9.

**Next (in order):** see the timeline in §6.7.

---

## 4. The game

**Case:** "A Storm at Ravenswood", 1926. The storm cuts the power, the bridge floods, nobody can
leave. Lord Alistair Ravenswood is found dead in his study; time of death **11:14 p.m.**
(stopped watch); a sedative in his brandy, then a blow from a brass candlestick. **Killer: Vivian
Cross** — Alistair had found her embezzling; she came in through the conservatory, drugged him,
struck him, and burned the ledger page.

| Suspect | Role | Built around | Memory profile (decay / interference / source amnesia) | Truth |
|---|---|---|---|---|
| Agnes Hartwell | Housekeeper, 63 | Decay + interference | 0.75 / 0.85 / 0.30 | Innocent — sincerely "remembers" serving tea she never served (red herring) |
| Julian Ravenswood | Nephew and heir | Low fallibility, a real lie | 0.20 / 0.20 / 0.15 | Innocent of murder — lies about the library to hide gambling debts |
| Dr. Eleanor Vance | Family physician | Reliable anchor | 0.10 / 0.10 / 0.05 | Innocent — establishes time of death and the sedative |
| Thomas Bell | Young valet | Source amnesia / suggestibility | 0.40 / 0.45 / 0.90 | Innocent — saw "a woman in a dark gown"; adopts whoever you name |
| Vivian Cross | Business partner | Clean memory, strategic lies | 0.15 / 0.15 / 0.10 | **The killer** |

**Rooms (8):** library, study, guest quarters, dining room, grand foyer, conservatory, kitchen,
wine cellar. **Clues (8):** missing candlestick, half-burned ledger page, crimson thread, stopped
watch, cloudy residue in the glass (study); muddy footprints (conservatory); gambling IOUs
(cellar); cold full teapot (kitchen).

**Scoring:** +8 per clue; +6 per correctly flagged off statement; −4 per flagged honest statement;
+40 / −25 for a right / wrong accusation; +5 per attached clue on a correct accusation (max 3);
× difficulty (1.0 / 1.25 / 1.5). Ranks: Case Unsolved · Constable · Detective · Inspector ·
Master Detective.

---

## 5. The graphics engine (summary — details in `docs/VIVA_GUIDE.md`)

- **Raster model:** 384×216 `ImageData` (RGBA bytes, index `(y·W + x)·4`), filled each
  `requestAnimationFrame`, flushed with `putImageData`, upscaled with `image-rendering: pixelated`.
- **Primitives:** `putPixel` (+ source-over alpha), `fillRect`, `drawHLine/VLine`, `drawLineDDA`,
  `drawLine` (Bresenham, clipped by Cohen–Sutherland `clipLine`), `drawCircle` (midpoint),
  `fillEllipse` (midpoint, span fill), `blitSprite`.
- **Colour & light:** Bayer 4×4 dithering and dithered gradients through colour ramps; radial
  additive lighting `(1 − d/R)²·intensity`; vignette.
- **Motion:** particle systems with Euler steps (rain, dust, cigarette smoke, steam, drips);
  sprite frame swaps (blink / talk); flicker and sway with `sin(t)`.
- **Transformations:** map camera = viewing transform (translate + scale); 3-D wireframe manor =
  4×4 homogeneous MVP + perspective divide + viewport + Bresenham edges.
- **Text:** 5×7 bitmap font blitted for the cutscene title; DOM pixel fonts elsewhere.
- **Not implemented (on purpose):** flood/boundary fill, polygon scan-fill and clipping,
  reflection, OpenGL/WebGL, filled 3-D faces.

---

## 6. Research design

### 6.1 Smallville in one paragraph (and the nuance we exploit)
Generative Agents (Park et al., UIST 2023) store every observation in a timestamped memory stream
(the seed persona becomes the first memories). Retrieval ranks memories by **recency**
(`0.995^(game-hours since last retrieval)`), **importance** (a 1–10 score the LLM assigns) and
**relevance** (embedding cosine similarity), min-max normalised and summed; the top-k go into the
prompt. Agents also write **reflections** back into the stream and **plan** their days; identity
emerges from seed + stream + reflections. **The nuance:** recency only changes *rank*. A Smallville
agent can fail to mention something; it can never misremember it, blend two events, or forget who
told it. That is our opening.

### 6.2 Literature check (Oct 2026)

**Taken — cite, don't claim:**
| Piece | Who has it | Their objective |
|---|---|---|
| Persistent agents; recency / importance / relevance; reflection | Generative Agents (2023) | Believable, *accurate* agents |
| Ebbinghaus decay on agent memory | MemoryBank (2023); open tools (YourMemory) | Better recall / efficiency |
| Human-like forgetting for game NPCs | MemoryRepository for AI NPC (IEEE 2024) | Longer conversations |
| ACT-R activation decay | ACT-R-inspired memory (HAI 2025) | Human-like remembering/forgetting |
| Interference forgetting, reconsolidation, sleep consolidation | *Human-Inspired Memory Architecture for LLM Agents* (May 2026) | **Efficiency** (LongMemEval, issue tracking); no human data, no games |
| Reconsolidation on retrieval | *Retrieval-Driven Memory Reconsolidation* (Sep 2026) | Better long-term memory |
| Human memory **capacity** vs human data | COMPACTOR (May 2026) | Working-memory fidelity (digit span, N-back…); **does not model false memory or distortion** |
| LLMs show DRM false recall | *Analyzing Memory Effects in LLMs* (2025); *The Geometry of Forgetting* (2026) | Probing native behaviour |
| Group false memory | Mandela effect / MANBENCH (ICLR 2026) | A problem to defend against |
| False memory as attack; source-monitoring analogy | Memory-security surveys (2026) | A vulnerability |
| LLM interrogation / detective games | Knowledge-tree detective game (2026: −64.78% critical hallucinations), *The Interview*, Verbal Verdict | **Reliability** |
| Player study of GenAI NPCs | Zargham et al. (2026) | Immersion when believable; incoherence breaks it |

**Open — what we claim (hedged "to our knowledge"):**
1. **Fidelity, not efficiency:** the same mechanisms, aimed at making a persistent character fail
   the way people fail, **calibrated against human data across several paradigms** (forgetting
   curve, DRM, misinformation, source monitoring).
2. **Selective fallibility:** stable core identity *and* human-like episodic error, measured
   together.
3. **Persistent suggestibility vs transient sycophancy:** planted details are stored with a
   decaying source tag and resurface later as the character's own memory — measurable across
   sessions.
4. **Game contribution:** lies (policy) and honest false memories (memory layer) come from separate,
   labelled mechanisms; the player's leading questions contaminate testimony; a player study
   measures lie-vs-mistake discrimination. Foil: *the 2026 detective game made suspects reliable;
   we make them reliably unreliable.*
5. *(Stretch)* belief-consistent (confirmation-biased) reconsolidation — no benchmark found.

### 6.3 Claims
**We claim (one line):**
> We repurpose human-inspired memory mechanisms — previously built to make agent memory more
> efficient — toward cognitive fidelity: a persistent LLM character whose episodic memory decays,
> blends and misattributes sources at human-calibrated rates while its core identity stays stable,
> evaluated adversarially in an interrogation game where players must tell honest false memories
> from lies.

**We do not claim:** a new algorithm; that the model "believes" anything; inventing human-like agent
memory; consciousness; that crowd simulation is our research.

### 6.4 Scope v1
**In:** FastAPI backend; per-suspect ChromaDB store; embeddings; LLM adapter; four mechanisms; core
protection; deception policy; ground-truth guard; structured labelled output; full logging; frontend
swap + Memory Inspector; Studies 1–3; the paper.
**Out (future):** fine-tuning, autonomy loop, group conformity, stress narrowing, voice, a large
human study.

### 6.5 Architecture
```
 Player question ──► FastAPI /ask
   1. Embed the cue
   2. Leading-question check → presupposed details stored as memories (source = "detective")
   3. Candidate retrieval (Smallville score)                 ← baseline B1 stops here
   4. MEMORY LAYER: a. accessibility (verbatim / gist / unreachable)
                    b. interference (slot blending, lures)
                    c. source monitoring (misattribution)
                    d. core-identity memories exempt
   5. DECEPTION POLICY (conceal set + motive)                ← lies come from here
   6. LLM voice → JSON {answer, claims[], cited_memory_ids, concealed}
   7. Reconsolidation: write the retold version back; rehearsals++
   8. Label each claim; log everything
 → {answer} to the player · {labels, trace} to logs / Memory Inspector
```

**Memory schema (structured slots):**
```
{ id, who, what, where, when, details{...},
  verbatim_strength, gist_strength, source, source_strength,
  salience (1–10), t_encoded (sim-time), last_access, rehearsals,
  core: bool, history[] }
```
Seed memories are authored per suspect *from their viewpoint*, consistent with `caseData.ts`.

**Mechanisms (with cognitive basis):**
- **Accessibility decay — power law, verbatim vs gist** (Ebbinghaus; Wixted & Ebbesen; fuzzy-trace
  theory). *As implemented:* `p_verbatim = min(1, a · strength · (1 + ρ·rehearsals) · (1 + Δt/τ)^(−d))`,
  gist uses `d · gist_ratio` (slower). A memory is never deleted — only its probability of being
  reached falls.
- **Interference** (Bartlett; DRM; *Geometry of Forgetting*): weak memories with cosine > τ swap
  detail slots (planned for the LLM level). *As implemented for recognition:* familiarity is global
  matching (D15), so a never-seen word close to many stored ones feels "old" — the DRM lure.
- **Source-monitoring failure** (Johnson et al.; Loftus): source tag decays faster than content
  (*as implemented:* exponent `κ·d`, κ swept 1–3); if content is reached but the tag is not, the
  character defaults to "I saw it". Leading questions plant
  presuppositions with `source = detective`.
- **Reconsolidation** (Nader et al.): retold version written back and strengthened.
- **Core protection:** `core = true` items never decay, blend or lose their source.

**Deception policy:** knowledge K, conceal set C ⊂ K with a motive; for questions touching C the
policy denies / fabricates / deflects. **Labelling:** each structured claim is compared with its
cited memory and with ground truth → true · lie · false memory · gist/forgotten · evasion.

**Frontend:** `serviceProvider.ts` → `backendSuspectService` (HTTP via the Vite `/api` proxy); labels
hidden from the player; Memory Inspector overlay behind a toggle. *As built (23 Oct 2026): see
`docs/PERSISTENT_MEMORY.md` — it supersedes the sketch above where they differ.*

### 6.6 Evaluation and the paper
- **RQ1 fidelity** — does the layer move a persistent agent from superhuman to human-calibrated
  error? **RQ2 selective fallibility** — core stable, episodic periphery degrading? **RQ3 play** —
  does it change solve rate, turns, and players' ability to tell a lie from an honest mistake; is it
  more believable?
- **Baselines (same LLM, same seed memories):** B0 stateless "perfect witness" · B1 Smallville-style
  retrieval · B2 decay-only (MemoryBank/ACT-R style) · B3 prompted "act human with imperfect memory"
  · **Ours** + ablations (minus each mechanism).
- **Study 1 — cognitive fidelity (automated):**
  | Paradigm | On the agent | Human reference (extract exact values from the primary source) |
  |---|---|---|
  | Forgetting curve | Encode details; probe at 20 min, 1 h, 9 h, 1 d, 2 d, 6 d, 31 d (sim time) | Ebbinghaus savings 58.2, 44.2, 35.8, 33.7, 27.8, 25.4, 21.1% (from Murre & Dros 2015, Table 3) — a *shape* reference (savings ≠ recall); Murre & Dros replication as held-out test |
  | DRM | Word lists as experiences; test studied items, critical lures, foils | R&M 1995 Exp 2 recognition: studied .65, lure .72, unrelated .11, lure of unstudied list .16; recall: studied .62, lure .55 (values checked against the paper) |
  | Misinformation | Event → misleading post-event info → test | Acceptance commonly ~20–40%, paradigm-dependent |
  | Source monitoring | Plant via leading questions → "saw it or told?" | Johnson et al. paradigms |
  Expected: B0/B1 superhuman; B2 forgets but never errs; B3 inconsistent; ours inside human ranges.
  Caveat to report: native LLMs already false-recall some DRM lures in-context — our claim is control,
  persistence, time dynamics and source decay.
- **Study 2 — selective fallibility (automated):** 100–200-turn sessions, simulated days apart; probe
  core vs peripheral facts; core consistency, peripheral accuracy curve, contradiction rate.
- **Study 3 — play:** (a) AI-detective proxy sweeps fallibility → solve-rate dose-response +
  false statements per leading question; (b) player pilot, N ≈ 12–24, within-subjects ON vs OFF,
  counterbalanced: solve rate, turns, lie-vs-mistake discrimination (label 10 statements),
  believability/engagement questionnaires, comments; informed consent.
- **Figures:** forgetting curves (human vs baselines vs ours) · DRM / misinformation bars with
  human bands · selective-fallibility 2-D plot · dose-response · contamination per leading question
  · discrimination confusion matrix · Memory Inspector screenshot · architecture diagram.
- **Paper outline (IEEE conference format):** Introduction · Related work (with comparison matrix)
  · System · Study 1 · Study 2 · Study 3 · Discussion (fallibility as a mechanic; fairness — physical
  evidence always suffices; ethics; limitations) · Conclusion.

### 6.7 Venues and timeline
**Venues (check each 2027 CFP for exact dates):** arXiv first · IEEE CoG (short/full) · AIIDE or its
workshops (EXAG, INT) · FDG · CHI PLAY (full or Work-in-Progress) · ICIDS · IVA · Wordplay workshop.
Realistic first target: a workshop or short/WiP paper.

| Weeks from 20 Oct 2026 | Milestone |
|---|---|
| 1–2 | FastAPI + ChromaDB + LLM adapter; structured seed memories for 5 suspects; **B1 end-to-end in the game** |
| 3–4 | Four mechanisms + deception policy + labelling + logging + unit tests; Memory Inspector |
| 5 | Study 1 harness + runs → first plots |
| 6 | Study 2 + AI-detective dose-response |
| 7–8 | Player pilot + analysis |
| 9–10 | Paper draft → arXiv; choose venue |

### 6.8 Reviewer objections to pre-empt
- *Mechanisms are borrowed* → the contribution is the objective inversion, multi-paradigm calibration,
  selective fallibility and the game evaluation.
- *LLMs already false-recall DRM lures* → in-context and uncontrolled; we add time, persistence,
  source decay and a dial.
- *Suggestibility is just sycophancy* → sycophancy is transient; we show stored planted details persist.
- *Small N* → framed as a pilot; automated studies carry the numbers.
- *LLM randomness* → fixed temperature/seeds, repeated runs, confidence intervals, two models.
- *Fallibility makes it unfair* → ground truth + physical evidence always suffice; difficulty dial.

### 6.9 Study 1 results — memory level (run 21 Oct 2026, preliminary)
All numbers come from `research/experiments/run_study1.py`; the full auto-generated tables (with
95% bootstrap CIs) are in `research/results/study1/summary.md`, the figures next to them. **No LLM is
involved yet** — these are the memory layer's own probabilities.

**Exp 1a — forgetting curve.** Fitted to Ebbinghaus, then used to predict the Murre & Dros
replication without refitting:

| Model | R² (fit) | RMSE (fit) | AICc | RMSE on held-out curve |
|---|---|---|---|---|
| Ours — power law (a = 1.0, τ ≈ 0.004 h, d = 0.130) | .974 | .019 | −41.7 | .094 |
| B2 — exponential (MemoryBank-style) | .397 | .091 | −26.6 | .112 |
| B1 — no forgetting (Smallville-style) | — | .659 | — | .743 |

The power law wins in fit and in prediction (also the other direction: .096 vs .122). Caveats: `a` sits
at its upper bound and τ is ≈ 13 s, so in practice this is a pure power law; savings ≠ recall.

**Exp 1b — DRM false recognition** (R&M 1995 Exp 2 design: 24 lists, 3 counterbalanced groups).

| | Studied | **Lure, studied list** | Unrelated | **Lure, unstudied list** |
|---|---|---|---|---|
| Human | .65 | **.72** | .11 | **.16** |
| Ours — primary (pre-registered) | .62 | **.59** [.43, .74] | .13 | .12 |
| Ours — post-hoc, mean-centred embeddings | .65 | **.27** [.23, .31] | .11 | .11 |
| Ours − familiarity · B2 · B1 | .65 · .65 · 1.0 | **0** | 0 | 0 |

- Only our model produces critical-lure false alarms; every baseline and the no-familiarity ablation
  produce none. Which lists make lures is predicted by lure-to-list similarity (Spearman ρ = .69, p = 2e-4;
  post-hoc ρ = .92).
- **Honest limits:** both runs fall **below** the human .72, and the magnitude depends on the embedding
  geometry (.27–.59). In the primary run the calibration targets were **not jointly reachable**
  (max "know" .20 vs .24) because raw MiniLM vectors are anisotropic (all cosines high); mean-centring
  fixes the calibration but was decided after seeing that, so it is labelled post-hoc. Our lures are all
  "know", never "remember" (humans: .38 / .34) — the model has no phantom recollection.

**Exp 1c — misinformation (demonstration, κ = 2).** P(choose the original) after misleading info,
control in brackets: 30 min early .57 (.76) · 30 min late .56 (.76) · 1 week early .51 (.62) ·
**1 week late .41 (.62)**. The effect is largest when misinformation arrives late in a long interval and
smallest when it arrives early in a long interval — the qualitative human pattern; at 30 min timing
barely matters. B1, B2 and the no-source-decay ablation are **immune** (misleading = control). The
effect grows with κ (1-week-late: .14 at κ = 1 → .27 at κ = 3).

**Exp 1d — source monitoring (demonstration).** Of "told" details still recalled, the share recalled as
*witnessed* rises with delay: κ = 2 → .71 (20 min), .90 (1 day), .96 (31 days); κ = 1 → .47 → .81.
B1/B2: 0 at every delay. Core identity memories stay at 1.0 (selective fallibility by design).

**What this supports:** standard agent memories are superhuman (B1) or forget without ever erring
(B2); the composed layer produces the human error *types* with the right shape and direction, and
each error type disappears when its mechanism is ablated. **What it does not yet support:** exact human
magnitudes (DRM is low), anything about the LLM's actual answers, or anything about players.

---

## 7. Repo map and commands
```
src/
  game/           store.tsx (FSM) · types.ts (contracts) · scoring.ts
    case/         caseData.ts (ground truth) · suspects.ts · dialogue.ts (greetings + suggested questions)
                  · roomLayouts.ts (explorable rooms)
    services/     session.ts · backendSuspectService.ts · serviceProvider.ts (the swap point)
  components/
    pixel/        pixelRenderer.ts · palettes.ts · characters.ts · PixelSprite.tsx
                  transforms3d.ts · Wireframe3D.tsx
    scene/        interrogationScene.ts · InterrogationRoom.tsx
    graphics/     Atmosphere.tsx · CandleFlame.tsx
    manor/        manorScene.ts (the walkable top-down manor)
    ui/           NotebookPanel.tsx · Portrait.tsx · Toasts.tsx
  screens/        Title · Cutscene (+ cutscene/sceneCompositions.ts) · Prologue · Manor
                  · Interrogation · Accusation · Verdict
docs/             VIVA_GUIDE.md · DECK_PROMPT.md · shots/
backend/          ravenswood/ (suspect server: store · agent · fallible · characters · server) · tests/
                  · demo.py · eval_fidelity.py · data/ (saves, gitignored)
research/         lcmem/ (memory model) · experiments/ (Study 1) · data/ (human reference values)
                  · tests/ · results/study1/ · README.md
scripts/          renderEntry.ts · runRender.mjs · annotate.py
```
| Command | Does |
|---|---|
| `npm run play` | Everything at once: suspect backend + game; open http://localhost:5173 |
| `npm run server` | Suspect backend (http://127.0.0.1:8000; needs Ollama) |
| `npm run dev` | Dev server (http://localhost:5173; proxies `/api` to the backend) |
| `npm run build` | Type-check + production build |
| `npm run render:shots` | Re-render the game scenes headlessly into `docs/shots/` |
| `npm run annotate:shots` | Rebuild the two annotated screenshots (needs Python + Pillow) |
| `cd research && .venv/bin/python experiments/run_study1.py` | Re-run Study 1; rewrites `results/study1/` (needs Ollama with `all-minilm` on a cold cache) |
| `cd research && .venv/bin/python -m pytest -q` | Memory-model unit tests |

---

## 8. Open items
1. ✅ First LLM run done (voice-follows-layer, `research/results/study_llm/`): qwen2.5-coder:3b
   via Ollama; honest-false-memory shows end-to-end but the 3B voice is noisy (source confusion,
   confabulation). Next: game-clock τ, an LLM judge for stance labels, the gemma3:1b cross-check,
   then Study 2 (long-session selective fallibility) and Study 3 (AI-detective dose-response).
2. Human reference values: Ebbinghaus / Murre & Dros and Roediger & McDermott ✅ extracted;
   Loftus, Miller & Burns 1978 still secondary-source; source-monitoring data not yet extracted.
3. Build the game service (FastAPI + ChromaDB + LLM adapter) and swap it in via `serviceProvider.ts`.
4. Pick the first venue once the 2027 CFP dates are out.
5. Build the deck from `docs/DECK_PROMPT.md` in Claude Design.
6. Deferred: 3-D cutscene fly-in; confirmation-bias mechanism; automated tests and lint.

---

## 9. Corrections log (what earlier documents got wrong)
| Earlier claim | Correction | Where fixed |
|---|---|---|
| "COMPACTOR explicitly leaves false memory / distortion to future work" | COMPACTOR never mentions false memory, distortion, DRM or misinformation; its future work only says "additional types of human memory". It studies **capacity**. | VIVA_GUIDE, DECK_PROMPT, here |
| "25–35% implanted false memory (Loftus / DRM)" | Two different paradigms: misinformation acceptance ~20–40% (paradigm-dependent); DRM critical-lure recall ~40–55% | VIVA_GUIDE, DECK_PROMPT |
| "To our knowledge, the first to unite a persistent identity with a memory-distortion layer" | Too broad after the Oct 2026 check; replaced by the objective-inversion claim (§6.3) | DECK_PROMPT, VIVA_GUIDE |
| "DDA, Bresenham, 3-D transforms, Cohen–Sutherland not implemented"; "interrogation room is CSS/DOM"; "SVG figures in the interrogation" | All now implemented / rasterized; SVG figures removed | TECHNICAL_DOCUMENTATION merged into VIVA_GUIDE |
| Memory stored as `{fact, source, salience, timestamp}` with `R = exp(−t/(k·salience))` | Structured slots with verbatim/gist power-law decay (§6.5) | VIVA_GUIDE |
| "Lost in the Middle" listed as arXiv 2510.10276 in the study pack | The original paper is arXiv 2307.03172 (Liu et al., 2023) | Sources below |
| Applications included "digital twins of people" | Dropped — industrial term, can't be defended | DECK_PROMPT |
| Exp 1d first reported P(told detail recalled AND felt witnessed), which *falls* with delay | That joint figure falls only because content fades; the source-amnesia index is the conditional P(felt witnessed \| recalled), which rises. Both are now reported | `research/experiments/exp1d_source.py`, §6.9 |
| §6.5 lure rule `σ(k·(cos(cue, centroid) − τ))` | Replaced by global-matching familiarity (D15) | §6.5 |

---

## 10. Sources

**Verified during this project's searches (Sep–Oct 2026):**
- Park et al. 2023, *Generative Agents: Interactive Simulacra of Human Behavior* (UIST) — https://arxiv.org/abs/2304.03442
- *Simulating Human Memory with Language Models* (COMPACTOR, NYU, 2026) — https://arxiv.org/abs/2605.25680 · NYU write-up: https://nyudatascience.medium.com/forcing-ai-to-forget-constraining-memory-improves-human-simulation-d41718feaf7d
- *Human-Inspired Memory Architecture for LLM Agents* (2026) — https://arxiv.org/abs/2605.08538
- *Retrieval-Driven Memory Reconsolidation for Long-Term LLM Agents* (2026) — https://arxiv.org/pdf/2609.16053
- *Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers* (2026) — https://arxiv.org/html/2603.07670v1
- *Memory is Reconstructed, Not Retrieved: Graph Memory for LLM Agents* (2026) — https://arxiv.org/html/2606.06036
- *HiMem: Hierarchical Long-Term Memory for LLM Long-Horizon Agents* (2026) — https://arxiv.org/pdf/2601.06377
- *Memory Contagion* (2026) — https://arxiv.org/pdf/2606.23195
- *Analyzing Memory Effects in LLMs through the Lens of Cognitive Psychology* (2025) — https://arxiv.org/html/2509.17138v1
- *The Geometry of Forgetting* (2026) — https://arxiv.org/pdf/2604.06222
- *Exploring the Mandela Effect in LLM-based Multi-Agent Systems* (MANBENCH, ICLR 2026) — https://arxiv.org/pdf/2602.00428
- *A Survey on the Security of Long-Term Memory in LLM Agents* (2026) — https://arxiv.org/html/2604.16548v1
- *From Untrusted Input to Trusted Memory: Memory Poisoning Attacks in LLM Agents* (2026) — https://arxiv.org/html/2606.04329v1
- *Memory as an Attack Surface in LLM Agents* (2026) — https://arxiv.org/pdf/2606.29030
- *Useful Memories Become Faulty When Continuously Updated by LLMs* (2026) — https://arxiv.org/pdf/2605.12978
- *Always-On Agents: A Survey of Persistent Memory, State, and Governance* (2026) — https://arxiv.org/pdf/2606.30306
- *A Survey of Agent Memory in the Second Half* (2026) — https://arxiv.org/pdf/2602.06052
- *Control-Plane Placement Shapes Forgetting* (2026) — https://arxiv.org/pdf/2606.15903
- *Belief Memory: Agent Memory Under Partial Observability* (2026) — https://arxiv.org/pdf/2605.05583
- *Novel Memory Forgetting Techniques for Autonomous AI Agents* (2026) — https://arxiv.org/pdf/2604.02280
- *DREAM: Dynamic Role-playing via Event-Aware Memory Graph* (2026) — https://arxiv.org/pdf/2608.05170
- *MineNPC-Task* (2026) — https://arxiv.org/pdf/2601.05215
- *Human-inspired Perspectives: A Survey on AI Long-term Memory* (2024) — https://arxiv.org/pdf/2411.00489
- *MemoryRepository for AI NPC* (IEEE, 2024) — https://ieeexplore.ieee.org/document/10508558/
- *Human-Like Remembering and Forgetting in LLM Agents: An ACT-R-Inspired Memory Architecture* (HAI 2025) — https://dl.acm.org/doi/10.1145/3765766.3765803
- *AI for Games in the Foundation Model Era* (2026) — https://arxiv.org/pdf/2609.16679
- *Enforcing Narrative Reliability and Epistemic Pacing in LLM-Driven Detective Games* (2026) — https://arxiv.org/html/2609.23043v1
- *Symbolically Scaffolded Play* (*The Interview*, 2025) — https://arxiv.org/html/2510.25820v1
- Zargham, Tonini, Alexandrovsky, Ruthven, Friehs, Dratzidis, Dänekas, Bikas, Nacke, Zebel & Malaka (2026), *Dialogs with GenAI NPCs: Exploring Player Interactions with Speech Agents in a VR Game*, Int. J. Human–Computer Interaction — https://www.tandfonline.com/doi/abs/10.1080/10447318.2026.2620647
- *Exploring Presence in Interactions with LLM-Driven NPCs* (ACM VRST 2024) — https://dl.acm.org/doi/10.1145/3641825.3687716
- EM-LLM — https://em-llm.github.io/ · YourMemory — https://github.com/sachitrafa/yourmemory
- Verbal Verdict — https://digialps.com/verbal-verdict-a-game-that-incorporated-local-llm-in-gameplay-using-llmunity/ · Unreliable Witness — https://barney25052.itch.io/unreliable-witness
- DRM background — https://link.springer.com/article/10.3758/s13421-020-01016-6 · https://link.springer.com/article/10.3758/s13421-022-01298-y · https://pmc.ncbi.nlm.nih.gov/articles/PMC13232424/
- Secondary (practitioner blog, lower weight) — https://thenuancedperspective.substack.com/p/designing-agentic-memory-in-2026

**Carried over from earlier project docs (cited there; IDs not re-checked in the Oct search — verify before the paper):**
- MemoryBank (Zhong et al.) — https://arxiv.org/abs/2305.10250
- FadeMem — https://arxiv.org/html/2601.18642v2
- *Forgetful but Faithful* — https://arxiv.org/abs/2512.12856
- *Slip Through the Chat* (IUI 2025) — https://doi.org/10.1145/3708359.3712112
- PLAYER* (murder-mystery agents) — https://arxiv.org/abs/2404.17662
- *Deciphering Digital Detectives* (Jubensha) — https://arxiv.org/abs/2312.00746
- CoALA — https://arxiv.org/abs/2309.02427 · MemGPT — https://arxiv.org/abs/2310.08560 · A-MEM — https://arxiv.org/abs/2502.12110 · Mem0 — https://arxiv.org/abs/2504.19413
- Surveys: https://arxiv.org/abs/2404.13501 · https://arxiv.org/abs/2602.19320 · https://arxiv.org/abs/2602.05665 · Preprints 202601.0618
- *Serial Position Effects of LLMs* — https://arxiv.org/abs/2406.15981 · *Lost in the Middle* (Liu et al. 2023) — https://arxiv.org/abs/2307.03172
- OpenCharacter — https://arxiv.org/abs/2501.15427 · Persona-aware contrastive learning — https://arxiv.org/abs/2503.17662 · Persona-driven role-playing framework — https://arxiv.org/abs/2406.17962
- *Exploring Prosocial Irrationality for LLM Agents* — https://arxiv.org/abs/2405.14744
- MIT Media Lab work on AI-induced false memories in humans (Chan, Pataranutaporn, Loftus et al., 2024)
- Industry references: Inworld AI, NVIDIA ACE, Ubisoft "NEO" NPCs, Convai. Comparison games: Ace Attorney, Return of the Obra Dinn, Disco Elysium.

**Cognitive science (cite the primary sources):** Ebbinghaus 1885 (*Über das Gedächtnis*); Murre &
Dros 2015 (replication of the forgetting curve; its Table 3 is our source for Ebbinghaus's values); Wixted & Ebbesen 1991 (form of forgetting); Bartlett
1932 (*Remembering*); Deese 1959 and Roediger & McDermott 1995 (DRM); Loftus & Palmer 1974 and Loftus
2005 (misinformation); Johnson, Hashtroudi & Lindsay 1993 (source monitoring); Brainerd & Reyna
(fuzzy-trace theory); Nader, Schafe & LeDoux 2000 (reconsolidation); Yerkes & Dodson 1908; Asch 1956. Models used in
the implementation (standard references; check exact citation details before the paper): Hintzman 1988
(MINERVA 2, global matching); Yonelinas 2002 (dual-process recognition); Luce 1959 (choice rule);
Loftus, Miller & Burns 1978 (misinformation timing); Burnham & Anderson 2002 (AICc); Reimers &
Gurevych 2019 (Sentence-BERT) and Wang et al. 2020 (MiniLM) for the embedding model; Ethayarajh 2019
(anisotropy of contextual embeddings).

**External documents (outside this folder):** `~/Downloads/Fallible-Memory-Game_Project-Reference_1.md`
(original concept — novelty framing superseded here); `Literature-Study-Pack_Human-Memory-in-LLMs.md`
(reading method still useful; see the ID correction above); `Living-Characters_Team-Source-of-Truth.md`
(vision and workstreams still valid; novelty claims refined here); the FA rubric PDF; `CGG_FA (1).key`
(deck style reference).
