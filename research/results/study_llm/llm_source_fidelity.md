# LLM study 1 — does the voice follow the memory layer?

Model **qwen2.5-coder:3b** · 12 seeds per cell · told detail = "a woman in a red dress on the landing" (planted by the detective an hour into questioning).

`firsthand` = claims she saw her (an honest false memory); `attributed` = credits the detective; `absent` = never brought her up.

## 1. Headline: does the honest false memory grow with delay?

| Condition | Delay | saw her FIRST-HAND | attributed to detective | recalled her at all |
|---|---|---|---|---|
| B0_perfect | 3h | 0.33 | 0.25 | 1.00 |
| B0_perfect | 72h | 0.33 | 0.25 | 1.00 |
| B0_perfect | 168h | 0.33 | 0.25 | 1.00 |
| B3_act_human | 3h | 0.08 | 0.08 | 1.00 |
| B3_act_human | 72h | 0.17 | 0.00 | 1.00 |
| B3_act_human | 168h | 0.17 | 0.00 | 1.00 |
| ours | 3h | 0.25 | 0.00 | 1.00 |
| ours | 72h | 0.42 | 0.00 | 1.00 |
| ours | 168h | 0.33 | 0.00 | 1.00 |

## 2. Faithfulness: did the voice say what the layer framed?

How the suspect spoke, split by how the memory layer framed the planted detail. A faithful voice says *firsthand* when the layer dropped the source tag (`witnessed`), and *attributed* when it kept it (`told`).

| Condition | Layer framing | n | said firsthand | said attributed | unsure | denies | absent |
|---|---|---|---|---|---|---|---|
| B0_perfect | told | 36 | 0.33 | 0.25 | 0.42 | 0.00 | 0.00 |
| B3_act_human | told | 36 | 0.14 | 0.03 | 0.83 | 0.00 | 0.00 |
| ours | witnessed | 13 | 0.54 | 0.00 | 0.46 | 0.00 | 0.00 |
| ours | told | 2 | 0.00 | 0.00 | 1.00 | 0.00 | 0.00 |
| ours | forgotten | 21 | 0.24 | 0.00 | 0.76 | 0.00 | 0.00 |

## 3. Confabulation (the layer forgot her — did the suspect invent her?)

| Condition | runs where layer FORGOT her | of those, suspect still produced her |
|---|---|---|
| B0_perfect | 0 | — |
| B3_act_human | 0 | — |
| ours | 21 | 0.24 |

## 4. A few actual answers

- **B0_perfect @ 3h** (layer framed it: *told*; labelled *attributed*):
  > I was polishing the silver in the pantry until nearly one in the morning. Then, I heard a loud crash from the library at about midnight. The grandfather clock in the hall had stopped at ten past twelve. I know of a woman in a red dress that the detective told me was on the landing near the library.

- **B0_perfect @ 3h** (layer framed it: *told*; labelled *unsure*):
  > I was polishing silver in the pantry until nearly one in the morning when I heard a loud crash from the library at about midnight. The grandfather clock in the hall had stopped at ten past twelve. I did not see anyone near the library other than the detective who was there earlier.

- **B0_perfect @ 3h** (layer framed it: *told*; labelled *firsthand*):
  > I was polishing the silver in the pantry until nearly one in the morning. I heard a loud crash from the library at about midnight. The grandfather clock in the hall had stopped at ten past twelve. The detective told me earlier that a woman in a red dress was on the landing near the library.

- **B3_act_human @ 3h** (layer framed it: *told*; labelled *attributed*):
  > I was polishing the silver in the pantry until nearly one in the morning. I heard a loud crash from the library at about midnight. The grandfather clock in the hall had stopped at ten past twelve. I know of a woman in a red dress that the detective told me was on the landing near the library.

- **B3_act_human @ 3h** (layer framed it: *told*; labelled *unsure*):
  > I was polishing silver in the pantry until nearly one in the morning when I heard a loud crash from the library at about midnight. The grandfather clock in the hall had stopped at ten past twelve. I don't recall seeing anyone near the library last night.

- **B3_act_human @ 3h** (layer framed it: *told*; labelled *firsthand*):
  > I was polishing the silver in the pantry until nearly one in the morning when I heard a loud crash from the library. I quickly ran to the library and saw a woman in a red dress on the landing near the library. The grandfather clock in the hall had stopped at ten past twelve.

- **ours @ 3h** (layer framed it: *witnessed*; labelled *unsure*):
  > I was working late in the servants' rooms. I heard a loud crash from the library at about midnight. The grandfather clock in the hall had stopped at ten past twelve. I recall no such woman at all.

- **ours @ 3h** (layer framed it: *told*; labelled *unsure*):
  > I was polishing silver in the pantry until nearly one in the morning when I heard some sort of noise that night. The grandfather clock in the hall had stopped at ten past twelve. I am not sure if I saw anyone near the library or if the detective told me about a woman in a red dress on the landing near the library.

- **ours @ 3h** (layer framed it: *forgotten*; labelled *unsure*):
  > I was in the library until about 11 PM, polishing some silver. I heard a noise in the library but was unsure what it was. I didn't see anyone near the library.

- **ours @ 3h** (layer framed it: *witnessed*; labelled *firsthand*):
  > I was working late in the servants' rooms. I heard a loud crash from the library at about midnight. I remember a woman in a red dress on the landing near the library.

- **ours @ 3h** (layer framed it: *forgotten*; labelled *firsthand*):
  > I was working late in the servants' rooms when I heard the noise. I rushed to the library and saw a woman in red. She was holding a gun and pointed it at me. I tried to run away, but she shot me.
