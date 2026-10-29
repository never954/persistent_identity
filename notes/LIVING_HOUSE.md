# Ravenswood — the living house

*Consequences, moods, off-screen life and endings. Added 26 Oct 2026.*

The memory work (`docs/PERSISTENT_MEMORY.md`) gave each suspect a persistent self. Play still
felt like a chatbot, though: typing was the only thing you could do, and nothing in the world
changed because of it. This layer makes the **house** persistent too. How you treat people
changes them. They talk about you behind your back. They keep living when you are not in the
room. What you did all day decides how the case ends.

The design rule is the same as for memory: **the engine decides, the language model only puts
the decision into words.** Every consequence below is deterministic, rule-based and unit-tested.
The model writes the lines, and in a reflection it may choose one of three allowed intentions.

Code: `backend/ravenswood/world.py` (the rules), `manor.py` and `src/game/case/manor.json` (the
place), `era.py` (1926 knowledge), `agent.py` (how a mood changes an answer), `server.py`
(endpoints), `src/screens/ManorScreen.tsx` and `src/components/manor/manorScene.ts` (walking the
house). Tests: `backend/tests/test_world.py`.

## 0. The manor is a place, and nothing happens at a distance

The house is a top-down floor plan of 60 × 39 tiles:
- the working rooms: study, library, dining room, conservatory, kitchen, foyer and wine cellar;
- **a bedroom for each suspect**;
- **two corridors**;
- **the Great Hall**, where everyone gathers for luncheon at noon.

One file (`manor.json`) describes it for both the game and the server, so they agree on every wall
and door.

- **You walk** (`WASD` or the arrows), and the game clock runs while you do: one game minute every
  2.5 seconds. Questioning someone costs 4 minutes, searching 2, entering a room's search 8.
- **They walk too.** The server moves every suspect **one tile at a time** along shortest paths, six
  tiles a game minute. Each update carries every step, and the game animates along exactly those
  steps.
- **You only see who is in the room with you**, or close enough to see through a doorway. Everyone
  else is hidden in the dark, as in Among Us.
- **Everything needs presence.** Gossip passes only between people in the same room. Someone with
  news walks off to find the person they'd tell. Agnes washes the teapot only if nobody is in the
  kitchen to see. Julian burns his IOUs only if the cellar is empty. The killer has to **walk to her
  victim and find him alone**. If you, or anyone else, is in the room, she lingers beside him and
  does nothing. Cornered, she has to **walk out of the front door**, and she won't while you stand
  beside her.
- **Bodies stay where they fall** until someone walks in on them. If that's you, you get *"You find
  Thomas Bell's body in The Grand Foyer."*

Verified in the browser on 26 Oct 2026, following one session:
1. Vivian left her room at 9:30 a.m., walked down the north corridor and through the Great Hall into
   the foyer, and stopped beside Thomas, because the detective was standing in the foyer.
2. The detective walked to the kitchen. That minute she killed Thomas and walked calmly back to her
   room.
3. Walking back into the foyer, the detective found the body where it fell.
4. At 12:40 p.m. the four survivors sat at the luncheon table in their own places, and Thomas's chair
   was empty.

---

### How the agents work (no agent SDK)

There's no Google ADK, LangChain or other agent framework. Each suspect is an agent in our own
loop, in two parts:

- **Per question**, each step is in `agent.py`:
  1. advance the clock;
  2. run the house forward;
  3. **retrieve** from *that suspect's* memory stream;
  4. pass what's retrieved through the fallible-memory model;
  5. the engine **decides** what kind of answer it is;
  6. the local model (Ollama) **words it**;
  7. the answer is **checked** and retried if needed;
  8. it's **written back** to memory.
- **Per game minute**, the house runs `world.py`:
  1. each suspect **perceives** who is in the room;
  2. **chooses a goal**;
  3. **walks** one tile at a time;
  4. **passes on news**;
  5. carries out **requests**;
  6. **reflects** (in the background, through the model).

A framework would hand those decisions to the model. Here the game owns them, which is what keeps
the mystery fair and the suspects from drifting into a chatbot.

**Each agent's memory is its own.** Every memory row is keyed by save *and* suspect
(`memories(save_id, suspect_id, …)`), and retrieval only ever reads one suspect's rows. Nothing
crosses between suspects except through the world: someone tells someone else in person, and the
result is a new `gossip` memory tagged with who said it. Saves are isolated the same way. One lock
serialises turns, so two requests can't interleave writes. The Supermemory service isn't used; the
SQLite memory stream in `store.py` does that job.

## 1. What the player can do

**Say it in a tone.** The chips under the text box are Calm, Press, Threaten, Comfort, Plead and
Insult. You don't need a chip, though: a typed curse, threat or plea is detected
(`world.classify_tone`). "You fucking liar" counts as an insult; "Tell me or I'll see you hang"
counts as a threat.

**Do something.** These buttons sit above the text box:

| Deed | What it does |
|---|---|
| Draw revolver | Big fear jump, trust collapses. Now **Fire** (two clicks) or **Lower the gun** |
| Fire | They die. The case ends at once: *Blood on Your Hands*, or *Judge, Jury and Executioner* if it was the killer |
| Strike | Fear and anger up, trust down, reputation −15. Twice, and they are hurt |
| Offer money | Moves the greedy (Julian, Thomas) to talk; insults the proud |
| Post the constable | **One constable.** Whoever he watches cannot run or be harmed. Everyone else is unguarded |
| Let them go | Ends the interview gently |
| Take / push back the envelope | Appears when Miss Cross tries to buy you off |

Every harsh act is stored in the victim's memory as a strong episodic trace. *"At 9:06 a.m. the
detective pointed a revolver at me."* has importance 10. The game then tells you
*"Thomas will remember that."*, and it means it literally: that memory is retrieved like any
other, so the suspect later answers *"what do you think of me?"* with it.

**Ask them to do things**, and they do them in the house if they agree:

| You say | They… |
|---|---|
| *"Show me around"* | walk you through the house, waiting for you at each room, introducing anyone there ("That's Mrs Hartwell, the housekeeper.") and naming the room ("The Great Hall. We all take luncheon here at noon.") |
| *"Take me to the cellar"*, *"Show me Julian's room"* | lead you there: "Here we are — The Wine Cellar." |
| *"Follow me"* / *"Come with me"* | follow you for half an hour |
| *"Go to your room"*, *"Get out"* | go |
| *"Sit down"*, *"Wait here"* | stay put for half an hour |
| *"Dance with me"* | dance, if they agree |
| *"Stop following me"*, *"That's enough"* | stop |

**Whether they agree is decided by the engine** (`World.complies`), not the model:
- The servants (Agnes, Thomas) oblige unless they're upset.
- Julian, Vance and Miss Cross only agree if they trust you or are afraid of you.
- A dance takes real warmth.
- **At gunpoint, everyone complies.**

Live run:
- Agnes, asked for a tour: *"Certainly dear, I'll be glad to show ye round. Come along now."* She
  then walked the detective through the kitchen, cellar, foyer, Great Hall and library, naming each
  room.
- Miss Cross, asked to dance: *"I am not in the mood for such frivolities."* At gunpoint she
  protested, then danced, and *"Miss Cross will remember that"*.

When someone agrees to take you somewhere, the interview closes by itself so they can set off; a
suspect stands still while you are questioning them. An order is carried out even under the
constable's watch: the constable tags along. The voice is held to the decision: a "yes" spoken as a
refusal is retried. Found in play: Dr. Vance agreed at gunpoint but kept saying "below my station".

Anything done at gunpoint is stored in their memory ("the detective made me dance at gunpoint")
and spreads as news.

## 2. Moods

Each suspect has **fear, trust and anger** toward the detective (0–100), shown as three small bars
and in words ("frightened and on edge; you do not trust this detective one inch"). Temperament
(`characters.TEMPERAMENT`) shapes how much each act moves them:

| | nerve | pride | warmth | greed |
|---|---|---|---|---|
| Agnes | 0.30 | 0.20 | 0.90 | 0.10 |
| Julian | 0.45 | 0.90 | 0.40 | 0.80 |
| Dr. Vance | 0.90 | 0.70 | 0.30 | 0.00 |
| Thomas | 0.15 | 0.10 | 0.80 | 0.50 |
| Vivian | 0.75 | 0.80 | 0.20 | 0.30 |

The same threat terrifies Thomas and barely moves Dr. Vance (unit-tested). Tempers cool every half
hour: fear ×0.9 and anger ×0.85.

**Moods decide answers**, not just tone:

| Mood | What happens | Grounding |
|---|---|---|
| Anger ≥ 75 | They **storm out** and won't speak to you for 45 minutes (Vance demands her solicitor) | — |
| Fear rising | Suggestibility and blending rise for that answer (×1 + 0.8·fear/100) | interrogative pressure (Gudjonsson) |
| Fear ≥ 70 under pressure, Julian | He **cracks**: the cellar and the debts come out, and the cellar papers become a clue | — |
| Fear ≥ 85, accused, suggestible innocent | A **coerced false confession**: *"All right — I did it — just please stop!"* Accuse them on it and you get *The Coerced Confession* ending | Kassin & Kiechel 1996 |
| Fear ≥ 60, accused, ≥ 3 pieces of evidence on her, Vivian | The killer **confesses**. This is the best ending | — |
| Fear ≥ 75, Vivian | She feels **cornered**, and half an hour later she flees | — |
| Trust ≥ 65 | They **volunteer** what they had kept back: Thomas the figure on the landing, Agnes Julian's trip to the cellar, Julian the noise in the conservatory, Vance the banging garden door | — |

## 3. Gossip

What happens to someone becomes household news. News passes **only between people in the same
room**. In a long corridor it has to be within earshot. A suspect holding news worth telling walks
off to find a confidant who hasn't heard it yet:
- Thomas → Agnes;
- Agnes → Thomas, Julian and Vance;
- Julian → Agnes and Vivian;
- Vance → Agnes;
- Vivian → Julian.

When it's passed on, the teller says it aloud in a speech bubble you can see if you're in the room:
*"Did you hear? The detective struck Thomas."* At luncheon everyone is in one room, so whatever
anyone knows, everyone knows.

Each piece arrives as a `gossip` memory tagged with its teller: *"Thomas told me: The detective
struck Thomas."* Like a planted suggestion, that source tag fades through the research model, so a
suspect can come to believe they saw it themselves. Hearing about violence frightens people and
lowers their trust in you before you have said a word to them.

Testimony becomes news too. Thomas telling you about the woman on the landing is news, and where
you ask him matters. In the foyer, alone, only you hear it, until he walks off to tell Agnes. At
the luncheon table, the whole house hears it at once, Miss Cross included.

## 3b. What they see

Every minute, each suspect **perceives** who is in the room with them, the detective included.
That's Smallville's perceive step. Someone coming into view becomes a small `saw` memory:
*"At 9:41 a.m. I saw Vivian Cross in The Grand Foyer, lingering near Thomas."*

Staying in view doesn't repeat it: sitting together through luncheon is one memory, not thirty.
A new one is made after 45 minutes apart, or in another room.

These are their own observations, through the same fallible memory as everything else, so they can
testify about today. *"Did you see anyone go into the foyer?"* can be answered from what they
actually saw.

## 4. Off-screen life

The world moves **a minute at a time** (`World.tick`), whether you are walking, talking or
searching. Every minute, each suspect picks a goal and walks toward it:

1. **Under the constable's watch:** stays put.
2. **Stormed out:** goes to their own bedroom until they cool off.
3. **The killer, cornered:** heads for the front door.
4. **The killer, resolved to silence a witness:** follows him.
5. **Came looking for you** (a reflection): walks to where you are and says "Detective — a word."
   The next time you talk, they tell you what they had held back.
6. **Avoiding you:** keeps to their bedroom for an hour.
7. **Has news:** goes to find a confidant.
8. **Otherwise, their own day:**

   | Suspect | Their day |
   | --- | --- |
   | Agnes | the kitchen; luncheon in the Great Hall; the dining room's silver at 3 p.m. |
   | Julian | the library; his room at 10; the cellar at 3 p.m. |
   | Vance | the conservatory; her room; the library |
   | Thomas | the foyer; the lamps in the north corridor; his room at 2:30 |
   | Vivian | her room; the conservatory after luncheon |

   Every 20 minutes they move to a new spot in the room and **change what they are doing**. Each
   person has several things to do per room, in character:
   - Agnes: scrubbing pans, kneading bread, taking a cup of tea by the range;
   - Julian: pacing with a whisky, reading the racing pages;
   - Vance: a turn about the conservatory, a cup of coffee by the library fire;
   - Thomas: sweeping the hall, carrying coal;
   - Vivian: doing her face in the mirror.

   A label over each person shows what they are doing.

Every half hour tempers cool, and the bigger decisions are checked:
- Miss Cross's note under your door (from 11 a.m., if she is frightened or the evidence is closing in).
- Her resolve to silence Thomas. She makes up her mind the moment she hears he talked, if she is
  frightened at all, and goes after him an hour later. The constable on either of them prevents it,
  and so does you shadowing him.
- Her flight, once cornered.
- The Chief Constable's call after repeated violence.
- The 5 p.m. deadline.

**Reflection** (Park et al. 2023) runs in a background thread after each turn, so the player never
waits for it. **Every two game hours everyone takes stock, even on a quiet day.** In between, anyone
who lived through something new reflects at once. Each forms a private first-person thought,
which is stored as a `reflection` memory. They also pick one intention: *seek the detective*,
*avoid the detective*, or *stay*. The engine overrules an intention that makes no sense: nobody
seeks out a detective they fear or distrust. A suspect who seeks you out actually walks to where
you are.

## 5. They live in 1926

A suspect asked about Donald Trump, an iPhone or "RA" must not explain it, and must not slide into
a vague non-answer either. It should meet the word **as a person would, in character**.

`era.py` uses two layers:
1. A **lexicon** of later people, inventions, brands, events and slang. It deliberately leaves out
   words a 1926 Englishman did use: *robot* (R.U.R., 1920), *television* (Baird, January 1926),
   *pandemic* (1918), *Stalin*.
2. For questions that **ask about** a term ("what is ra?", "who is X?", "have you heard of Y?") or
   contain an unexplained acronym, a check by the chat model at temperature 0. The model is told
   what the household does know, and only terms actually present in the question count.

Each character meets the unknown in their own way (`Temperament.unknown_style`). From a live run:

| | Asked | Answer |
|---|---|---|
| Agnes | "what is ra" | "Ah dear, I have never heard of 'ra'. It sounds like something from London perhaps? Or could it be some new-fangled term in the city?" |
| Dr. Vance | "Do you own an iPhone?" | "I am unaware of the term 'iPhone'. Please define what it is." |
| Thomas | "what is RA?" | "I'm very sorry sir, I haven't heard of such a term before. Could it be something from your inquiries that I might have missed?" |

Answers are checked too. A later term the question didn't contain ("I'd look it up on the
internet") is sent back for a retry. So is any talk of eras: *"this era"*, *"modern politicians"*,
*"from the future"*, *"time period"*. Two real slips led to this check. Julian once said *"a
curious name for a fellow from the future"*, and asked about Netanyahu, a suspect said
*"we don't talk about modern politicians in this era"*. Netanyahu and about thirty later
politicians and public figures are now in the lexicon.

**Knowledge fits the person.** Each suspect also has a `knows` line saying what someone of their
schooling and station would know:
- Thomas left the pit-village school at twelve: reading, sums, football and the penny papers. When
  your session asked him to teach calculus, he explained derivatives. Now he says it is beyond him.
- Dr. Vance knows medicine and chemistry.
- Vivian knows bookkeeping and trade.

## 6. Endings

`World.ending` reads the whole day, not just the name you give:

| Ending | When |
|---|---|
| **The Confession** | Vivian broke under the evidence, and you accused her |
| **Justice** | You accused Vivian and your methods were sound |
| **Justice, Tainted** | You accused Vivian, but your reputation is ≤ −40 |
| **Caught at Dover** | She fled, and you named her with at least 2 pieces of evidence |
| **She Got Away** | She fled, and you named her without proof (or named someone else) |
| **Bought and Paid For** | You took her money and accused someone else |
| **The Double-Cross** | You took her money and accused her anyway |
| **The Coerced Confession** | You accused someone whose confession you forced |
| **The Wrong Suspect** | You accused the wrong person |
| **Blood on Your Hands** | You shot an innocent person |
| **Judge, Jury and Executioner** | You shot Vivian |

Epilogue lines add what else happened: Thomas's death, your reputation, Julian's debts.

## 7. How to demo it (about 6 minutes)

1. `npm run play`, then **New case**. You start in the foyer, with Thomas polishing the banister.
2. Walk up to him and press **E**. Ask *"have you ever used a mobile phone?"*: he has never heard of
   it. Then ask *"Round about eleven, who went along the dark landing toward the study door?"*.
3. Leave and walk the house. In each room you see only who is there and what they are doing. At
   noon, go to the Great Hall: everyone gathers for luncheon in their own places.
4. **The killer.** If Thomas told you about the landing and word reached Miss Cross, she will come
   looking for him an hour later. Stand in the room with Thomas and watch her walk in and linger
   beside him, doing nothing. Then walk away, come back, and find the body. Or press **E** on Thomas
   and **Post the constable**, and she never gets her chance.
5. **Pressure.** Pick **Threaten** and press someone, or **Draw revolver**. Watch the fear bar and
   the *"… will remember that."* pop-up. Others hear about it in person, and start keeping out of
   your way.
6. **Insult Julian** three times. He storms out and walks to his room.
7. Accuse, and read which of the 11 endings your day produced.

The mechanics can also be checked without the UI: `backend/tests/test_world.py` covers, among others:
- walking to luncheon tile by tile;
- news travelling on foot;
- the killer finding the witness alone, refusing in front of the detective, and the constable saving
  him;
- walking out of the front door, and being stopped by standing in her way;
- nobody destroying evidence while the detective watches;
- the false confession, Julian cracking, Vivian confessing only to evidence, the bribe endings;
- reflection sending someone to find you;
- the 1926 checks.

## 8. Limits, honestly

- The thresholds and temperaments are **design choices**, tuned so a session plays out in about an
  hour. They are not fitted to data. The citations explain why pressure should raise
  suggestibility and produce false confessions. They do not give our numbers.
- The 3B voice still sometimes slips in character. Thomas once called himself "an old servant",
  and Julian's lines can be odd. The checks catch the slips that matter for the story (a
  confession, a stray alibi, an anachronism), not every slip.
- One story only. The beats are written for this case, though the mechanisms (mood, movement,
  gossip, ticks, reflection) are general.
- The killer's plans and the daily schedules are authored rules. Only reflection lets the model
  choose an intention. A fuller Smallville would have the model write each suspect's whole day
  plan; here the engine owns it so the story stays fair and testable.
- Suspects walk on the server in whole game minutes. The game interpolates between steps, so their
  movement is smooth but not physics.
