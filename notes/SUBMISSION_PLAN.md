> **Status, 29 Oct 2026.** Sections 1, 5 and 8 below were written before the full experiment run
> and are partly out of date. Done since: the check ablation, the prompt-only baseline, a second model
> family (llama3.2:3b), held-out probes, memory conformity, interrogative pressure (a negative
> result), schema intrusion and selective fallibility (`analysis/`). Still open: a player study, an
> independent second scorer, verifying the references marked VERIFY.

# Submission plan: *Reliably Unreliable*

This document goes with `paper/main.tex`, the draft paper, and `paper/main.pdf`, its compiled
copy. It covers:
- whether the work can be published, and where;
- what is new in it, and the story the paper tells;
- what reviewers will attack;
- the experiments that still have to be run;
- everything to fix before you press submit.

Build the paper on Overleaf: upload the `paper/` folder. Or build it locally with
`tectonic -X compile main.tex`.

---

## 1. Can this be published?

**Yes, but not as it stands for a full paper at a strong venue.** What exists today is a solid
system paper with a real cognitive-modelling component.

| Part | Status | What a reviewer will say |
|---|---|---|
| Memory model calibrated against human data (Study 1) | Done, reproducible | The strongest part. It's novel in its *objective*, not its maths. |
| Decide-then-voice architecture, with checks | Done, unit-tested | Convincing as engineering. It needs an **ablation** to count as a finding. |
| Voice fidelity (Study 2) | Small: 45 probes per model, scored by word rules we wrote; Exp. 2a ran on an old prototype | "Too small, scored by the authors." |
| Player evidence | **None** | For a games venue, the biggest gap. |

Realistic outcomes:
- **As it is now:** a workshop paper (EXAG at AIIDE), an auxiliary or short paper at IEEE CoG, or a
  late-breaking/demo paper at FDG or CHI PLAY. Post it on arXiv first.
- **With the four "must" experiments in §5:** a credible **full paper at IEEE Conference on Games
  (CoG) 2027**. That is the target the draft is written for: IEEE format, a games-AI audience that
  values both a working system and an evaluation.

## 2. Where, and when

The 2027 calls are not out yet. The dates below are **last year's**, so plan on the same windows and
check each official site.

| Venue | Fit | Last cycle | Notes |
|---|---|---|---|
| **IEEE CoG 2027** (main target) | Games AI and systems with evaluation; IEEE two-column | 2026: full papers due **17 Mar**, auxiliary papers 14 May, conference 1–4 Sep | The draft already uses `IEEEtran`. Check the 2027 page limit and whether review is double-blind. |
| **AIIDE 2027** | AI for interactive entertainment (AAAI) | 2026: abstracts 19 Jun, full papers 26 Jun | Strong fit. Switch to the AAAI template. |
| **EXAG workshop @ AIIDE** (fallback) | Experimental AI in games; welcomes systems without big studies | 2026: about **28 Aug** (from a community deadline list; verify on exag.org) | Good home for the current version. |
| **FDG 2027** | Game design and technology | 2026: papers due **15 Dec 2025**; late-breaking 30 Mar | Next deadline is probably mid-December 2026: too soon for a player study. |
| **CHI PLAY 2027** | Player experience | usually spring | Only once a real player study is done. |
| **CogSci 2027** (alternative angle) | The memory model and its human calibration | usually early February | Would need a cognitive framing: Study 1 plus the source-fidelity results. |
| **arXiv** | Timestamp and visibility | any time | Post once the must-do experiments are in. |

**Recommendation.**
1. Run the four must-do experiments over November to February.
2. Submit to **CoG 2027** (deadline probably mid-March).
3. Post on arXiv at the same time.
4. If it's rejected, revise for AIIDE in June.
5. If the player study slips, submit the current version to EXAG in August.

## 3. The story the paper tells

This is the narrative your teacher asked for. Every section serves this chain:

1. **Standard.** Persistent LLM agents use the Generative Agents memory stream: recency, importance
   and relevance. Later work adds forgetting and other human-inspired mechanisms.
2. **Gap.** All of that work aims to make agents remember *better*. In it, recency only changes rank:
   an agent can omit something but never *misremember* it. No agent memory has been calibrated
   against human *error* data. Game work on LLM suspects aims to make them *reliable*. And when the
   LLM itself decides what a character says, the game cannot tell a lie from an honest error from a
   hallucination.
3. **Idea.** Make characters *reliably unreliable*.
   - A cognitive memory model, fitted to human data, decides what can be recalled.
   - A rule-based policy decides the kind of statement.
   - The LLM only words it, and a check enforces the decision.
4. **Experiments.** Each one answers one doubt:
   - Study 1: are the errors human-like, and caused by the intended mechanisms? (Human data plus
     ablations.)
   - Study 2: does the voice actually say what was decided? (Fidelity, two models, a prototype that
     shows why prompting alone fails.)
   - Play: what goes wrong in real use, and what did it teach us? (A failure catalogue.)
   - *To add:* a player study (does it matter to players?) and a check ablation (does the
     architecture matter?).
5. **Findings.**
   - The error types appear, in the right shape, only with their mechanisms.
   - The voice follows the decision in 43 or 44 of 45 probes.
   - Every failure seen in play came from leaving a decision to the LLM.
6. **Limits, honestly.** These are in the paper's discussion section.

## 4. What is new, and what is not

**New, hedged as "to our knowledge":**
- The *objective*: human-calibrated memory **errors** for persistent characters, rather than
  accuracy or efficiency.
- **Calibration across four paradigms**, with ablations showing each error depends on its mechanism.
- **Decide-then-voice** with engine-owned statement labels. Lies and honest false memories come from
  separate mechanisms, so a game can be fair about them.
- **Persistent suggestibility.** A planted detail is stored with a source tag that fades, and
  resurfaces later as the character's own memory. That is different from the momentary sycophancy
  of LLMs.
- **Deterministic fading:** one hashed draw per memory, so memories fade at a definite moment and
  every run reproduces from the save id.

**Not new (cite, don't claim):**
- the power-law forgetting curve, MINERVA-style familiarity, source monitoring and Luce choice;
- the Generative Agents retrieval score;
- memory decay in agents;
- LLM murder mysteries.

The paper says this outright in its introduction.

## 5. Experiments still to run

### Must do (before CoG)

**M1. Player study** (the biggest gap).
- *Design:* within-subjects comparison of fallible memory against the perfect-memory baseline, which
  is already a switch in the game (`memory_mode="perfect"`). Counterbalance the order, with the two
  conditions on different days or in different saves.
- *Size:* at least 16 players; aim for 24.
- *Measures:*
  - solve rate;
  - number of turns;
  - **lie / honest mistake / truth labelling** of 10 statements drawn from their own session, scored
    against the engine's labels;
  - believability and engagement questionnaires (use a published scale, and cite it);
  - free comments.
- *Ethics:* consent form and approval from your institution, before you recruit anyone.
- *Analysis:* paired tests with effect sizes. Report everything, including results that go against
  you.

**M2. Rerun Exp. 2a on the final pipeline.**
- The current numbers come from the qwen2.5-coder prototype, before the checks existed.
- Rerun `research/experiments/llm_source_fidelity.py`, adapted to call the real backend.
- Use 30 seeds per cell, qwen2.5:3b, and **one model from a different family** (gemma3 or llama3.2),
  so the result isn't one model's quirk.

**M3. Check ablation.** This turns contribution 2 from a design into a finding.
- Run the fidelity probes with the checks and retry **switched off**, then **on**. Also run a
  "prompt-only" variant, in which the LLM is told the memories and decides for itself.
- If fidelity drops without the checks, the architecture is shown to matter.
- 20 saves per variant.

**M4. Independent scoring.**
- Replace the word rules with two human annotators who don't know the condition, on the M2 and M3
  answers.
- Report Cohen's κ for agreement. An LLM judge is acceptable only if you validate it against the
  human labels first.

### Should do

- **S1. Selective fallibility.** Run long sessions, 100 to 200 turns over several simulated days.
  Ask the same core-identity and peripheral questions repeatedly, and plot core consistency (should
  stay flat) against peripheral accuracy (should fall).
- **S2. Confidence intervals.** Use 20 saves per model for Study 2, so the confidence intervals are
  narrow enough to mean something.
- **S3. Read Loftus, Miller & Burns (1978) in the original.** The .75/.41 figures are from secondary
  sources: `research/data/human_reference.json` marks them "secondary".

### Nice to have

- A second case or setting, to answer "it only works for this one story".
- A larger voice model, if you have access to more memory.

## 6. What reviewers will attack, and the answer

| Attack | Answer, and where it is in the paper |
|---|---|
| "The mechanisms are borrowed." | Yes, on purpose. The contribution is the objective, the calibration and the architecture (Introduction). |
| "LLMs already show DRM effects natively." | Natively the effect is uncontrolled and doesn't persist. Ours adds time, persistence, a dial, and labels (Related Work C). |
| "Suggestibility is just sycophancy." | Sycophancy is momentary. Ours is stored and resurfaces hours later. M2 should show this over delay. |
| "The DRM magnitude is too low." | Reported openly, with the cause (embedding anisotropy) and the post-hoc check (Study 1B). |
| "The authors scored their own system." | M4. |
| "No players." | M1. |
| "3B models are toys." | They were chosen deliberately: local, private, cheap. M2 adds a second model family. |
| "Why should games want worse memory?" | Because the game is about telling honest errors from lies. Physical evidence keeps it fair (design goal G5). The player study answers this. |

## 7. Before you press submit

- [ ] Every `\todo{}` in `main.tex` resolved. Search for "TODO".
- [ ] Every `VERIFY` reference in `references.bib` checked against the actual paper: authors, title,
      venue. Check the page numbers of the classic references too. The 2026 arXiv references are
      the risky ones.
- [ ] Numbers re-checked against `research/results/` and `backend/eval_fidelity.py` after the new
      runs. The paper's comments name the file behind each number.
- [ ] Figures regenerated at print resolution (vector PDF if possible) and readable at one-column
      width.
- [ ] Page limit, template and anonymisation rules checked against the 2027 call. If review is
      double-blind, remove names and self-identifying links, and use an anonymous repository link.
- [ ] **AI-use disclosure.** IEEE and most other venues require you to state where AI tools helped
      with the text or the code, usually in the acknowledgements. Say it plainly: a disclosed tool
      is not a problem, an undisclosed one can be.
- [ ] **Make the text yours.** Read the paper end to end and rewrite anything you couldn't defend in a
      viva, in your own words. That is what keeps the writing honestly yours, and it will also read
      as your voice. Don't run it through "humaniser" or paraphrasing tools to get past detectors:
      they damage technical accuracy, and venues treat evasion more harshly than disclosed help.
      Your git history and these notes are good evidence of authorship if anyone asks.
- [ ] Code and data released (GitHub plus a Zenodo DOI), with a README that reproduces every table.
- [ ] Ethics approval number in the paper if a player study is included.

## 8. A timeline, if CoG 2027 is the target

| When | What |
|---|---|
| Nov 2026 | M2 and M3 runs; draft the player-study protocol; submit it for ethics approval |
| Dec 2026 | M4 annotation; S1 long sessions; verify all references |
| Jan 2027 | Player study (M1) |
| Feb 2027 | Analysis; update Studies 2–3 and the discussion; regenerate figures |
| Early Mar 2027 | Internal review by your teacher; final pass in your own words; arXiv; submit |

## Sources for venue dates

- IEEE CoG 2026 call for papers: https://cog2026.fdi.ucm.es/cfp.html
- IEEE CoG 2026 final call (cigames list): https://groups.google.com/g/cigames/c/294MwVMN1q8
- AIIDE 2026 call for papers: https://sites.google.com/view/aiide2026/calls/call-for-papers
- AIIDE 2026 workshops (EXAG): https://sites.google.com/view/aiide2026/program/workshops
- FDG 2026 call for papers: https://www.jesperjuul.net/ludologist/2025/10/10/foundations-of-digital-games-2026-call-for-papers/
- AAAI-27 main track call: https://aaai.org/conference/aaai/aaai-27/main-technical-track-call/
