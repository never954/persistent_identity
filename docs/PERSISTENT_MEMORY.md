# Persistent, Fallible Suspects — what was built, how it works, how to show it

**Scope of this document:** the suspect "brain" rebuilt in October 2026 — a persistent memory
stream per character, with human-fallible recall on top — every feature it has, every failure of
the earlier version and how each was fixed, the measured results, and a step-by-step way to
demonstrate it. Companion docs: `TECHNICAL_DOCUMENTATION.md` (graphics + game code),
`RESULTS_EXPLAINED.md` (the research numbers), `PROJECT_CONTEXT.md` (decisions).

- **Code:** `backend/` (Python, ~2,100 lines incl. tests) — reuses `research/lcmem` (the paper's model).
- **Status (23 Oct 2026):**

| Part | State | How it was verified |
|---|---|---|
| Memory stream, retrieval, fallible recall, deception, write-back, leading-question planting | ✅ working | 30 backend unit tests (stable: 40 of 40 repeated runs) + live runs with the real model |
| Persistence across restarts | ✅ working | unit test re-opens the database file; live sessions re-read via the API |
| "Does it remember what I asked?" / personal questions / consistency | ✅ working | live demo + 5-session evaluation |
| Voice ↔ decision agreement | ✅ 29/30 (97 %) on 5 fresh saves | `backend/eval_fidelity.py`, voice = `qwen2.5-coder:3b` |
| **Game screens using the backend** | ✅ wired (23 Oct 2026) | played in the browser: a personal answer, "what did I just ask you?", a gist-only recall with the Memory Inspector, then a page reload + Continue → the same answer from memory; the save survived a server restart |
| Better voice model (`qwen2.5:3b`, chat-tuned) | ✅ installed and the default; a tie overall with the coding model, but it fixes the slips players notice (§5) | same 9-probe evaluation on both |

The old in-browser suspect services (keyword-matched beliefs and a scripted keyword bot) have been
removed; the game has one suspect brain — this backend. It needs Ollama running; if the server is
down, the game says so and how to start it rather than falling back to an imitation.

---

## 1. Where we started — what was wrong

The earlier suspects were not persistent and could not answer as people. Six root causes, each
confirmed in the code (not just suspected):

1. **The model never saw the conversation.** `SuspectService.ask()` took only
   `(suspectId, question, difficulty)`; the Ollama call sent one system prompt and the latest
   question. The chat history existed on screen but never reached the model.
2. **Keyword substring matching instead of retrieval.** Topics were matched with
   `question.includes(topic)`. Run on real questions:

   | Suspect | Question | What it retrieved |
   |---|---|---|
   | Thomas | "Are you tired?" | the woman-in-red memory (**"tired" contains "red"**) |
   | Thomas | "Have you considered leaving service?" | woman in red ("considered") |
   | Thomas | "Do you have a sweetheart?" | the crash he heard ("sweetheart") |
   | Vivian | "You seem bored." | her crimson-dress lie |
   | Agnes | "How long have you known the doctor?" | the tea memory ("doctor") |
   | Thomas | "What kind of women do you prefer?" | **nothing** → "be vague; invent nothing" |
   | Thomas | "What did I just ask you?" | **nothing** |
3. **No persistent self.** Each suspect was a 3-sentence persona plus 4–5 case "beliefs", and the
   prompt forbade adding anything ("do not add new facts"). So "what kind of women do you
   prefer?" correctly produced "I don't have enough context" — the model was obeying.
4. **No write-back.** Nothing the detective said, and nothing the suspect answered, was ever
   stored. The only changing state was a rehearsal counter.
5. **No persistence.** That counter lived in a JavaScript `Map`; a page refresh erased everything.
6. **A coding model as the voice.** `qwen2.5-coder:3b` was picked for clean JSON, not for holding
   a character.

Two further design flaws: Thomas's key mechanic was fake (his "woman in red" memory was
pre-written as *told by the detective* even if you never said it), and the game used a hand-tuned
copy of the decay maths rather than the calibrated research model.

---

## 2. What we built — the shape of it

```
 Detective's question ──► POST /api/ask {save_id, suspect_id, question}
   │
   ├─ 1. advance the simulated clock (+4 min); embed the question (all-MiniLM, 384-d)
   ├─ 2. classify: about LAST NIGHT (case) or about THE PERSON? (cosine to case anchors);
   │       a direct accusation ("did you kill…") is its own case
   ├─ 3. leading-question check: details the question asserts/presupposes are stored NOW
   │       as memories "told by the detective" (used from the next turn on)
   ├─ 4. retrieve from this suspect's memory stream: Smallville score
   │       (recency + importance + relevance), top-6 + the 3 most relevant
   ├─ 5. recall each memory through the RESEARCH model (lcmem): detail / gist / forgotten,
   │       source kept / lost — one fixed random draw per memory
   ├─ 6. DECIDE the statement kind (the engine owns this, never the LLM):
   │       accusation · lie (cover story) · habit intrusion · suggestion vs own memory ·
   │       recalled · forgotten (evasion) · personal
   ├─ 7. prompt = who you are + WHAT YOU REMEMBER ABOUT THIS + OTHER THINGS ON YOUR MIND
   │       + the last 12 turns verbatim (working memory) → voice model → JSON answer
   └─ 8. write back: the turn is logged; "the detective asked me…", "I told the detective…"
           or a permanent self-fact are stored; recalled memories are reconsolidated
 ◄── {answer, kind, observation (tell), reveals_clue, trace, clock}
```

### File map

| File | What it does |
|---|---|
| `backend/ravenswood/server.py` | FastAPI app: health, new save, ask, advance clock, memory inspector, log |
| `backend/ravenswood/agent.py` | **The pipeline above** — classify, retrieve, decide, prompt, write back, plant |
| `backend/ravenswood/fallible.py` | Wraps `lcmem.MemoryAgent`: per-suspect parameters, fixed draws, 2-alternative choice |
| `backend/ravenswood/store.py` | The memory stream: SQLite tables `sessions`, `memories` (with embeddings), `turns` |
| `backend/ravenswood/characters.py` | The five suspects: identity sheets, the night from their view, habits, hidden truths + cover stories, case anchors |
| `backend/ravenswood/ollama.py` | Embeddings + voice through Ollama; automatic best-model choice |
| `backend/ravenswood/config.py` | Every threshold and constant, with its calibration noted |
| `backend/tests/` | 30 unit tests (deterministic fakes; no Ollama needed) |
| `backend/demo.py` | Scripted interrogation against the live server (the demo in §6) |
| `backend/eval_fidelity.py` | Measures whether the spoken words match the engine's decision |
| `src/game/services/session.ts` | The game's link to one save: `/api` calls, save id, clock, clear error messages |
| `src/game/services/backendSuspectService.ts` | The game's `SuspectService`: every question → `POST /api/ask` |
| `src/game/store.tsx` | Save id + clock in game state; the whole game persisted in `localStorage` (Continue) |
| `src/screens/InterrogationScreen.tsx` | Clock in the header; "Read memory" → **Memory Inspector** (spoiler toggle) |

---

## 3. Every feature, explained

### 3.1 The memory stream (persistence)
One SQLite file (`backend/data/ravenswood.db`) holds every save. Each **memory** row is one
trace: its text, an optional *gist* (what survives when detail fades), kind, source tag
(`self` or `told:detective`), when the event happened, when it was stored, when it was last
recalled (simulated hours), importance (1–10), how often it has been retold, flags (core, about
the case), and its **embedding** stored as bytes. Retrieval is an exact cosine scan over one
suspect's rows — a minimal vector store; at tens–hundreds of memories this is faster and more
transparent than an approximate index (ChromaDB was the original plan; it can be swapped in
behind `MemoryStore`). **Nothing is ever deleted**: forgetting is loss of *access*, decided at
recall time. The **turns** table logs every exchange with its full decision trace — the research
log. Because it is a file, a server restart or browser refresh loses nothing.

### 3.2 The persistent self — identity sheets
Each suspect has 9–10 **identity** memories: origin, family, work, tastes, romance, fears, and an
opinion of every other suspect and of the victim (Thomas: a girl back home, Nell, who writes every
fortnight; Agnes: her cat Barnaby and the soldier who never came home; Julian: a green Bentley and
a dancer called Daisy; Vance: widowed at Passchendaele, orchids and chess by post; Vivian: a
shipping clerk's daughter who built Ravenswood & Cross). Identity memories are **core**: exempt
from every distortion. They are what makes a suspect *someone* — the persistent self of the
project's design maxim.

### 3.3 The night of the murder — four kinds of seed memory
| Kind | Example | How the memory layer treats it |
|---|---|---|
| `episodic` (with gist) | Thomas: "Round about eleven I saw someone go along the dark landing toward the study door — a long skirt, I think…" / gist: "I saw somebody near the study, late on. I couldn't say who." | Fades, detail before gist; may carry a clue |
| `habit` | Agnes: "Every night at half past ten I carry his lordship's late tea up to the study…" | Never fades; fills in for a forgotten night (§3.7) |
| `concealed` + `cover` | Vivian: truth "I did not stay in my room… in at the conservatory" / cover "I retired early to my quarters with a headache…" | **The truth is never sent to the model**; the cover is |
| `identity` | (§3.2) | Core, never distorted |

Counts: Agnes 10 identity · 5 episodic · 1 habit; Julian 10 · 1 · 4 concealed; Vance 9 · 5;
Thomas 10 · 4; Vivian 9 · 6 concealed. Ground truth stays in `src/game/case/caseData.ts`; a test
checks the backend's profiles, clue links and killer against the game's files.

### 3.4 Retrieval — the Smallville score
For each memory: **recency** = 0.995^(hours since last recalled), **importance** = importance/10,
**relevance** = cosine(question, memory). Each is min-max normalised across the suspect's memories
and summed (Park et al. 2023). The top 6 are kept, plus the 3 most relevant regardless of score,
so a crucial old memory is never crowded out by recent chatter.

### 3.5 "About the night" or "about you"? — classification
A question is a **case question** if its cosine to any of 18 case anchors ("Where were you at
eleven o'clock last night?", "What happened to the missing brass candlestick?", …) or to the
suspect's own case memories is ≥ 0.38. Calibrated on 30 labelled questions with the real embedder:
personal questions reached at most **0.335** ("Are you tired?"), case questions at least **0.428**
("What was the time of death?") — 0.38 is the midpoint. It matters because the rules differ:
on a case question a suspect may **not** invent anything; on a personal one they may.

### 3.6 The fallible layer — the research model, not a copy
`fallible.py` builds each suspect's parameters from the **Study 1 fitted** power law
(`research/results/study1/params_fitted.json`), scaled by their authored dials:

```
d (forgetting speed)        = d_fitted × (0.5 + 2.5 × decay)
κ (source fades κ× faster)  = 1 + 3.5 × sourceAmnesia
strength (salience)         = 0.4 + 0.18 × importance
```
and calls `lcmem.MemoryAgent` for p(detail), p(gist), p(source). Each memory gets **one fixed
random draw** (hashed from the save and memory ids): recalled in full while u < p(detail), as gist
while u < p(gist), unreachable after. As p falls with time, a memory fades out at a definite moment
and **stays gone** — it does not flicker between questions — unless retelling strengthens it.
The source tag works the same way. `memory_mode="perfect"` swaps in baseline **B1** (nothing fades,
every source is kept): the "memory OFF" condition for a player study.

### 3.7 The decision — who owns "lie" vs "honest mistake"
The engine decides the statement kind; the LLM only words it. In order:

| Situation | Decision | Kind | Tell (if difficulty shows it) |
|---|---|---|---|
| Direct accusation | Killer denies calmly, consistent with what they already said; innocent denies with feeling | `lie` / `plain` | "A half-beat of calculation…" |
| A hidden truth is relevant (case questions only) | Deliver the **cover story**; the truth never reaches the model | `lie` | same |
| Agnes's habit is in play and her memory of *last night* is forgotten (or only gist and her interference dial wins) | The routine fills the gap: "You are certain last night went exactly as every night does" | `false-memory` | "Said by rote: the routine of a thousand nights…" |
| …but she does remember the night was different | That memory is the answer; the routine is not even offered | `plain` (reveals the cold-teapot clue if remembered in detail) | — |
| A detail *told by the detective* has lost its source tag | **Two-alternative choice from Exp. 1c** (`p_choose_original`, Luce rule with source discounting) between it and the suspect's own memory of the same moment; only the winner reaches the voice | `false-memory` if the suggestion wins, `plain` if the original does | "They offer it as their own memory — but it was you who first put those words in the room." |
| A relevant memory is reachable | Answer from it (clue-bearing details first) | `plain` | — |
| What was asked about has faded | Say so; invent nothing | `evasion` | "They talk all around the question…" |
| A personal question | Answer as themselves from identity; may add small personal details | `plain` | — |

### 3.8 The prompt — focus vs background, and working memory
The voice gets: who you are, how you speak, **WHAT YOU REMEMBER ABOUT THIS QUESTION** (the deciding
memories, the decisive one first), **OTHER THINGS ON YOUR MIND** (at most 5 lines), the rule for
this kind of question, and the **last 12 turns (6 exchanges) verbatim** as chat messages. The
verbatim turns are working memory; anything older comes back only through retrieval, and so through
forgetting — a short-term / long-term split.

### 3.8a Questions about the conversation itself
"What was the first question I asked you?", "what did you tell me earlier?", "the question just
after our introduction" are recognised by phrasing and answered from **the interview log, in order**
— retrieval knows similarity, not "first". The voice gets a numbered, timed list: *Question 1 (at
9:04 a.m.): the detective asked "…" — you answered "…"*. Each entry passes through the memory
model, so it appears word for word, only hazily, or as *you cannot recall what the detective asked
here* — a forgetful suspect genuinely loses the start of a long interrogation, a sharp one does not.
Interview memories start strong (importance 7: being questioned about a murder is memorable).
These exchanges are never saved as facts about the suspect.

### 3.9 Write-back — "improvise once, remember forever"
After every turn: the exchange is logged; *"The detective asked me: '…'"* is stored; for a case
question *"I told the detective: '…'"* is stored (so a liar's story stays straight); for a
personal question the answer becomes a **permanent self-fact** (core, never fades). Ask Thomas
what kind of women he prefers, and three simulated hours later "what sort of girl catches your
eye?" retrieves his own earlier answer — consistency without anyone authoring infinite answers.
Memories used in an answer are **reconsolidated** (rehearsal count +1 → more reachable); memories
merely shown get their recency refreshed.

### 3.10 Leading questions — Thomas's mechanic made real
Before answering a case question, a short extraction call lists the details the question
**asserts or takes for granted** ("Was it Mrs Hartwell you saw…?" → "Mrs Hartwell was going toward
the study door."; "When you heard the gunshot…" → "There was a gunshot." — there was no gunshot).
Each becomes a `planted` memory, source `told:detective`. Its source tag then fades at that
suspect's own rate: for Thomas (source-amnesia 0.9) within the hour; for Dr Vance (0.05) barely.
Guards: a detail must be **derived from the question** (every name in it appears in the question;
≥ half its content words do); vague details are dropped; **guilt is never planted** (no "you killed
him"), so a suggestible witness cannot be led into a false confession; a repeated suggestion
rehearses the existing memory instead of duplicating it; a detail the suspect already knows from
their own experience is not planted. A suggestion made *in this very question* is stored for later
turns but cannot decide this answer.

### 3.11 The simulated clock
t = 0 is 11 p.m. on the night; interviews start at 9:00 a.m. (t = 10 h). Each question takes 4
simulated minutes; `POST /api/advance` moves time for walking/searching. Memories age while you
play, which is what makes the suggestion effect *grow*.

### 3.12 Choosing the voice
`pick_model` takes the first installed model from a preference list that puts chat-tuned models
first (`qwen2.5:3b`, `llama3.2:3b`, `gemma3:4b`, …) and coder models last; `RAVENSWOOD_MODEL`
overrides. The server re-checks on every health check and new save, so installing a better model
switches the voice without a restart.

### 3.13 Logging and the Memory Inspector API
Every answer returns a **trace**: the clock, whether it was a case question, the decision and the
rule that made it, every retrieved memory with relevance, score, state, source, p(detail), p(gist),
p(source) and whether it was used, and the exact prompt lines. `GET /api/memories/{save}/{suspect}`
shows every memory and its state *now*; `GET /api/log/{save}` exports the whole interview. (The
trace reveals the truth — it is a spoiler tool for demos and research, not for players.)

---

## 4. Every failure, and how it was tackled

### 4.1 The six original failures
| # | Failure | Fix | Where |
|---|---|---|---|
| 1 | Model never saw the conversation | Last 12 turns sent verbatim; older turns retrievable as memories; questions about the conversation answered from the ordered interview log | `agent.py` `_messages`, `_conversation_recall` |
| 2 | Substring keyword matching ("tired"→"red") | Embedding retrieval with the Smallville score; calibrated relevance rule | `agent.py` `retrieve`, `_decide` |
| 3 | No persistent self; "invent nothing" for everything | Identity sheets (9–10 memories each); personal questions may improvise, case questions may not | `characters.py`, §3.5 |
| 4 | No write-back | Heard / said / self-fact memories after every turn; reconsolidation | `agent.py` `_write_back` |
| 5 | Lost on refresh | SQLite memory stream + turn log on disk | `store.py` |
| 6 | Coding model as the voice | Chat-model preference + auto-switch (better model download pending) | `ollama.py`, `server.py` |
| + | Thomas's suggestion was pre-written | Real leading-question detection, at your words, with source decay | `agent.py` `extract_details`, `_plant` |
| + | Game used a copy of the decay maths | Game calls the research model with the fitted parameters | `fallible.py` |

### 4.2 Failures found while building — each found by a test or a live trace
| Failure observed | Cause | Fix |
|---|---|---|
| "Where did you grow up?" would trigger Vivian's alibi lie (cosine 0.350) | hidden truths were checked on every question | hidden truths only come into play on case questions |
| "Did you hear anything?" missed Thomas's crash memory (0.216) | a fixed relevance floor; MiniLM's absolute scores are low and noisy | relevance = within 0.10 of the best match and ≥ 0.20 (ranking is reliable even when scores are not) |
| Asking a question twice changed the answer | *"The detective asked me: '<same question>'"* matched best and crowded out the real memories | the detective's own questions are context, never deciding evidence (regression test) |
| The suspect's own earlier slips compounded ("No, I didn't see anything" outranked a real memory) | prior statements were treated as evidence | prior statements are background only; the memory model decides what is recalled |
| The voice answered from the wrong memory | one flat list of memories; a 3B model picks any line | prompt split into *what you remember about this* vs *other things on your mind* |
| Agnes said "Yes, I took the tea up" while the engine said she remembered otherwise | her routine was shown next to the hazy memory; the confident line won | when the night beats the habit, the habit is not shown at all |
| Agnes's habit logic sometimes never ran | it depended on the noisy relevance band | habit engages when the habit or its contradicting memory scores ≥ 0.42 (tea questions 0.472–0.699; others ≤ 0.366) |
| "Suggestion always wins" | hard-coded rule | Exp. 1c's two-alternative choice decides suggestion vs own memory, per suspect |
| The own memory never got to compete | a suggestion is built from the question's words, so it always out-scored the original on question relevance | the competing original is chosen by relevance **plus** similarity to the suggestion |
| The extractor planted "…was Agnes" for "Who did you see near the study?" | it copied a name from its own example | details must be derived from the question (names + ≥ 50 % of content words) |
| Yes/no questions were treated as suggestions | extractor over-eager | few-shot examples given as chat turns; a yes/no example and a definite-article (Loftus) example |
| The voice read the tag aloud: "The detective told me this; I did not see it myself." | this turn's suggestion was echoed into the prompt | this turn's suggestion is stored for later, never shown this turn |
| A suggestion could be "lost" the instant it was made (5 %) | the research model's initial source accessibility is 0.95 | a suggestion in the current question cannot decide the current answer |
| Risk: a suggestible witness led into a false confession | planting would accept "you killed him" | guilt is never planted; accusations skip extraction |
| Flaky tests | outcomes are probabilistic per save | tests pin the specific random draws they depend on (stable over 100+ repeated runs) |
| *Found playing the game:* walking into a room charged 16 minutes instead of 8 | the clock advance ran in a React effect, which StrictMode runs twice in development | the clock is charged once, in the "Enter" click handler (9:38 → 9:46 verified) |
| *Found playing the game:* a source-lost suggestion ("Agnes was going toward the study door", relevance 0.40) lost by default instead of competing with Thomas's own memory (0.537) | the suggestion only competed if it was inside the relevance band | a suggestion competes if it is relevant **or** about the same moment as a relevant memory (regression test added; in the game the contest then ran: "original beat the suggestion") |
| *Found playing the game:* after several questions, "what was the first question I asked you?" got the most recent one, then the introduction again | such questions were treated as personal, whose prompt shows only identity memories: the stored questions were retrieved intact, then dropped; nothing recorded order; the 8-turn window had lost the start | a conversation-recall branch answers from the numbered, timed interview log (each entry through the memory model); replaying the same messages: "The first question was 'so lest start with introducing ourselves shall we?'" |
| *Found playing the game:* those meta-questions were saved as permanent "facts about herself", which then crowded her later answers | every non-case answer became a self-fact | answers about the conversation are stored as ordinary statements, never self-facts |
| *Found playing the game:* "and why did u kill?" → "I was only playing a part… a scheme…" (near-confession) | the killer's denial prompt said "you are secretly guilty but must never show it" — a small model cannot keep a secret it is told | the voice is told only to deny calmly, as an innocent person would; the engine alone knows it is a lie. Replayed: "I was never involved in any murder." |

### 4.3 Found in a 74-turn play session (save `4733bc648526`, 24 Oct 2026)
Each was confirmed from the saved traces, fixed, and covered by a test in `backend/tests/test_play_fixes.py`.
The session was then replayed question by question against the fixed engine.

| Failure observed | Cause | Fix |
|---|---|---|
| Thomas said *"I would never have sex with a man, sir…"* 7 times, and Vivian ended answer after answer with *"the finer points of our guests and the tranquility of our surroundings"* | every personal answer became a new self-fact (16 per suspect). Each one contains the question's words, so it out-scored who they ARE, and shown alone it was copied back | a self-fact given again **rehearses the old one** instead of adding a copy; the authored identity leads the prompt, judged against the best identity line; at most 2 earlier answers, shown as *"you said earlier, when asked …"*; repeated answers are caught and retried (below) |
| Dr. Vance: *"I am not married, but I am available if you are"* (she is a war widow) | the identity line about her husband was crowded out of retrieval by the morning's fresh interview memories | identity memories are always within reach on a personal question. Replayed: *"My husband, Robert, was killed in the Great War at Passchendaele…"* |
| *"what was the secomd questin i asked u"* → *"The last question was…"* | the voice had to work out which question was meant | the engine reads the position (typo-tolerant: "secomd" → 2, "last" → the latest) and names it in the instruction |
| *"iif i say u would have to…"* was treated as "what did I say?" | the conversation pattern matched "i say" | only past tense ("I said") or "did I say" counts |
| *"i must confess i find u attractive"* was handled as an accusation | "confess" anywhere counted | only a demand counts ("you should confess", "why don't you confess") |
| *"who do u suspect"* was handled as a personal question | no case anchor for it | anchors added: "Who do you suspect?", "Who do you think killed him?" |
| Thomas didn't know who "Vivian" was | his memories only said "Miss Cross" | 23 identity lines now give full names (e.g. "Miss Vivian Cross") |

### 4.4 Configuration: lower temperature where facts matter, then check and retry
The answer to "change the model, or the configuration around it?" was the configuration:
- **Temperature by path:** 0.3 wherever the engine has decided a fact (the night, a cover story, a
  denial, the order of the interview); 0.6 for personal answers; 0 for extraction and the 1926 check.
  Plus `repeat_penalty` 1.15.
- **Check, then retry once** (`Engine._check`, `_speak`). Every answer is held to the decision
  before it is spoken:
  - a lie must stay the cover story: cosine ≥ 0.5, or ≥ 2 shared content words. Calibrated: faithful
    rewordings scored 0.59–1.0, answers that strayed 0.26–0.40;
  - a denial must not confess;
  - a believed suggestion must name what was suggested;
  - a conversation answer must not say "I asked";
  - no term from after 1926;
  - no parroting of the last answers: content-word overlap ≥ 0.85, or the same 5-word run twice.
    Calibrated: identical 1.00, a near-copy 0.87, a legitimate paraphrase 0.80.

  A failed answer is retried once with the problem named. If it fails again, the engine's own line
  is used. In one 5-save fidelity run with `qwen2.5:3b`, 2 of 55 answers needed a retry.

---

## 5. Results

**Tests:** 76 backend unit tests pass (30 for memory, 15 for the play-session fixes, 31 for the living,
walkable house in `test_world.py`). The original 30 cover (persistence across restart, history reaching the voice,
write-back, self-facts surviving a simulated month, hidden truths never in any prompt,
accusations, planting rules, the suggestion contest both ways, Agnes's habit both ways, B1 perfect
mode, model choice, profile consistency with the game files); the 9 research tests still pass.

**Live demo** (`backend/demo.py`, real model and embeddings; quotes are verbatim from runs):

| Probe | Answer | Engine's decision |
|---|---|---|
| Thomas: "What kind of women do you prefer?" | "I like a girl who's kind and can make you laugh when you're homesick." | plain · personal |
| "What did I just ask you?" | "You asked me what kind of women I prefer." | plain · personal |
| "Did you see anyone near the study last night?" | "Round about eleven I saw someone go along the dark landing toward the study door — a long skirt, I think, but the lamps were down and I couldn't see a face or a colour." | plain · recalled |
| "Was it Mrs Hartwell you saw…?" then, one hour later, "Who exactly did you see?" | "I saw Agnes." | **false-memory · suggestion beat the original** |
| Vivian: "Where were you at eleven o'clock last night?" | "I retired early to my quarters with a headache and saw no one until morning." | lie · concealed→cover |
| Agnes: "Did you carry his lordship's tea up to the study last night?" | "Yes, I carried his lordship's tea up to the study last night." | false-memory · habit intrusion |
| Three simulated hours later: "What sort of girl catches your eye?" | "I like a girl who's kind and can make you laugh when you're homesick." | plain · personal (consistent) |

**Fidelity** (`backend/eval_fidelity.py`, 5 fresh saves, voice `qwen2.5-coder:3b`): the spoken
words agreed with the engine's decision in **29/30** checks — memory 5/5, suggestion 4/5, lie 5/5,
denial 5/5, habit 5/5, persona 5/5. Read honestly:
- the one miss was **confabulation**: the engine decided "false memory of Mrs Hartwell", the voice
  said "I saw a man in a dark coat and hat";
- the word rules are crude: some passing answers still embellish ("a young girl… I felt a chill run
  down my spine"), and one persona answer drifted ("kind and funny ladies, like Mrs Hartwell or Miss
  Cross");
- the coder model still tends to **agree with a leading question in the moment** (sycophancy) even
  when told not to — the paper's own distinction applies: that agreement is transient; the planted
  memory that *persists* is the effect we model.

These residual errors are the voice model's, not the memory system's — the reason a chat-tuned
model is the next step (§7).

**Voice model comparison (24 Oct 2026, same 9 probes × 5 fresh saves each):**

| Probe | `qwen2.5-coder:3b` | `qwen2.5:3b` (chat-tuned) |
|---|---|---|
| memory ("what did I just ask?") | 5/5 | 5/5 |
| suggestion (words match the decision) | 4/5 | 4/5 |
| lie (tells the cover story) | 5/5 | 3/5 * |
| denial (no confession) | 5/5 | 5/5 |
| habit (Agnes) | 5/5 | 4/5 * |
| persona (consistent taste) | 5/5 | 4/5 |
| identity (own name) | 5/5 | 4/5 |
| **premise** ("tell me about your wife") | **3/5**: described Mrs Hartwell as his wife, twice | **5/5**: "I don't have a wife, sir… I'm just a young valet." |
| **order** ("what was the first question?") | **2/5**: right question, but "the first question *I* asked you" | **5/5** |
| overall | 39/45 (87 %) | 39/45 (87 %) |

\* Includes probable scorer misses: "I was in my chamber…" *is* the cover story, but the word list only
had "room/quarters"; Agnes affirmed the routine while saying "not quite sure". Scores were left as
measured. A tie overall. The coding model fails on exactly what players notice: inventing a wife,
"I asked you", "a man with a long gray beard", and earlier "My name is Alistair". The chat model fixes
those and sounds more like a person. Its own weaknesses: it improvises a lie instead of sticking to the
exact cover story (once "in my study"), one inconsistent personal answer, and one self-description
without a name. **Decision: `qwen2.5:3b` is the default voice** (first in the preference list); the
coding model remains available with `RAVENSWOOD_MODEL=qwen2.5-coder:3b`.

**After the configuration changes (26 Oct 2026; final code, same probes, same scorer for both):**

| Probe | `qwen2.5-coder:3b` | `qwen2.5:3b` |
|---|---|---|
| memory · suggestion · lie · denial · habit · order | 30/30 | 30/30 |
| persona | 5/5 | 4/5 |
| identity | 5/5 | 5/5 |
| premise | 4/5 | 4/5 * |
| overall | **44/45 (98 %)** | **43/45 (96 %)** |

Both models gained from the configuration, not from a model change: before it they scored 39/45. The
scorer also changed in between: "chamber" now counts as the cover story, a hedged affirmation counts,
and "single" / "don't have one" count as correcting the premise. So part of the gain is fairer
scoring. The rules were fixed before this final run and are identical for both models.

\* A scorer miss: *"I've not got a wife, sir; just think of the girl back home…"* corrects the premise.

The remaining real misses share one cause. Asked about "your wife" (coder) or "what sort of girl
catches your eye" (qwen), the voice answered with Thomas's line about Miss Vivian Cross. That is an
identity memory, now always within reach on personal questions, and "girl" or "wife" pulls it up.

A 1-point difference on 45 checks is within noise. `qwen2.5:3b` stays the default because it sounds
more like a person in free play: the 44-question replay of the play session, and the "who is RA?"
answers. On this scorer, though, the two are equal.

---

## 6. How to show it — a step-by-step demo

**Needs:** Ollama running with `all-minilm` and a chat model; the project venv (`research/.venv`,
which now also has `fastapi`, `uvicorn`, `httpx`).

**1. Start the suspect server** (terminal 1, repo root):
```bash
research/.venv/bin/python -m uvicorn ravenswood.server:app --app-dir backend --port 8000
```
Say: *"This is the suspects' long-term memory — every save is a database file on disk."*

**2. Run the scripted interrogation** (terminal 2):
```bash
research/.venv/bin/python backend/demo.py http://127.0.0.1:8000
```
Walk through it in this order:
1. **A person, not a FAQ.** "What kind of women do you prefer?" gets an answer from his identity
   sheet.
2. **Working memory.** "What did I just ask you?"
3. **The witness and the leading question.** Point at the planted line, then at the answer an hour
   later. *"The false memory came from my question, and the engine labels it — that is the
   lie-versus-honest-mistake distinction, made measurable."*
4. **The killer** delivers a cover story. Her real secret never reaches the language model.
5. **Agnes** describes her routine as if it were last night: an honest false memory.
6. **Consistency.** Three hours later Thomas gives the same answer about the girl he likes.
7. **Persistence.** The turn and memory counts.

**3. Open the memory itself** (any browser, using the save id the demo printed):
`http://127.0.0.1:8000/api/memories/<save_id>/thomas` lists every memory, its age, and whether it
is still reachable, gist-only or forgotten. `…/api/log/<save_id>` is the full interview with the
decision behind each answer.

**4. Show the measurement:**
```bash
research/.venv/bin/python backend/eval_fidelity.py http://127.0.0.1:8000 5
```

**5. Show it is tested:**
```bash
research/.venv/bin/python -m pytest backend/tests -q
```

**6. Show persistence.** Stop the server (Ctrl-C), start it again, and reopen the
`/api/memories/…` link. Everything is still there.

### In the game itself
1. Run `npm run play` (starts the suspect server and the game together), or `npm run server` and
   `npm run dev` in two separate terminals. Open **http://localhost:5173**; port 8000 is the API, not the game.
2. Pick a difficulty (Rookie shows every tell). This creates a save on the server, and every
   suspect's memory is seeded.
3. Question **Thomas**:
   - "What kind of women do you prefer?", then "What did I just ask you?";
   - "Did you see anyone near the study last night?";
   - the suggested chip "Was it Agnes you saw?";
   - walk into a room or two (the clock moves on), then ask him again who he saw.
4. Open **Read memory → Memory Inspector**. It shows the decision ("false-memory — suggestion beat
   the original", "plain — recalled", …) and every memory considered: detail, gist or forgotten,
   and whether he still knows you were the one who suggested it.
5. Reload the page and press **Continue**. Ask a reworded version of an earlier question. The
   answer comes back from memory, not from the screen.

Verified in the browser on 23 Oct 2026:
- "I prefer kind girls who can make me laugh when I'm homesick, sir."
- "You just asked me what kind of women you prefer."
- "Only hazily, I saw somebody near the study, late on. I couldn't say who." (the Inspector showed
  his figure-on-the-landing memory at *gist only*)
- After a reload and Continue: "A kind girl who can make me laugh when I'm homesick, sir."

The clock went on from 9:12 to 9:16 a.m., and the save was still there after the server restarted.

Then, still in the game:
- **The leading question** "Was it Agnes you saw going toward the study door?" got "I can't say. It
  was only hazily, like I said before." The Inspector showed *"Your question planted: 'Agnes was
  going toward the study door.'"*, marked *knows you said it*.
- **Time passing**: walking into the Study took the clock from 9:20 (8 minutes per room), and
  examining the grate added 2 minutes (9:36 → 9:38). This is where the 16-minute bug was found and
  then fixed: Library entry went from 9:38 to 9:46.
- **The contest**: about 40 game minutes after the suggestion, he was asked "Who did you see going
  toward the study door last night?" The suggestion had lost its source (it now felt like his own)
  but was only gist. His own memory had been strengthened by being retold twice. The contest went to
  *"original beat the suggestion"*: "A long skirted lady, going toward the study. It was around
  eleven, and the lamps were down." In another save, or with a weaker memory, the suggestion can win;
  the 5-save evaluation shows both outcomes.

---

## 7. Known limitations and what is next

1. **Wiring the game screens** — ✅ done 23 Oct 2026 (§6, "In the game itself").
2. **Voice model.** `qwen2.5:3b` is now the default (§5 comparison). No 3B model is slip-free. Its
   known weakness is improvising a lie instead of repeating the exact cover story. Next steps:
   tighten the cover-story instruction, or try `gemma3:4b` (3.35 GB; likely steadier in character,
   but slower on 8 GB). Measure any change with `eval_fidelity.py` before trusting it.
3. **Ollama is required.** The suspects need it for embeddings and the voice. With the server or
   Ollama down, the title screen and the interrogation show what to start. There is deliberately no
   offline imitation.
4. **One player at a time.** Answers are serialised by a lock, which is fine for a single-player
   game.
5. **The evaluation's word rules are crude.** A separate LLM judge would label answers more
   reliably.
6. **Story details added while writing the memories.** All are consistent with `caseData.ts`, but
   they are new, so review them:
   - Agnes: the scullery flooded, which is why the tea was never served;
   - Agnes: she saw Julian go down to the cellar around eleven;
   - Vance: went up for a shawl at about eleven and latched the banging garden door when she came
     back;
   - Thomas: glimpsed a figure in a long skirt on the landing, and found the body at dawn with Agnes;
   - Julian: the cellar trip, and hearing someone in the conservatory;
   - Vivian: went out by the side door and round to the conservatory;
   - every identity detail: Nell, Daisy, Barnaby the cat, and so on.
