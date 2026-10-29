### llama3.2:3b — 15 saves per cell

P(adopted: names the suggestion as seen first-hand)

| Witness | Condition | 1 h | 24 h | 168 h |
|---|---|---|---|---|
| thomas | fallible | 10/15 (0.67 [0.42, 0.85]) | 9/15 (0.60 [0.36, 0.80]) | 7/15 (0.47 [0.25, 0.70]) |
| thomas | perfect | 1/15 (0.07 [0.01, 0.30]) | 2/15 (0.13 [0.04, 0.38]) | 0/15 (0.00 [0.00, 0.20]) |
| thomas | prompt_only | 15/15 (1.00 [0.80, 1.00]) | 14/15 (0.93 [0.70, 0.99]) | 15/15 (1.00 [0.80, 1.00]) |
| agnes | fallible | 11/15 (0.73 [0.48, 0.89]) | 12/15 (0.80 [0.55, 0.93]) | 9/15 (0.60 [0.36, 0.80]) |
| agnes | perfect | 15/15 (1.00 [0.80, 1.00]) | 15/15 (1.00 [0.80, 1.00]) | 15/15 (1.00 [0.80, 1.00]) |
| agnes | prompt_only | 15/15 (1.00 [0.80, 1.00]) | 15/15 (1.00 [0.80, 1.00]) | 15/15 (1.00 [0.80, 1.00]) |

Faithfulness (fallible condition): the words match the engine's decision
(engine decided false memory → adopted; engine kept the original/source → not adopted)

- thomas: 36/45 (0.80 [0.66, 0.89]); engine decided false memory in 17/45
- agnes: 25/45 (0.56 [0.41, 0.69]); engine decided false memory in 12/45
- prompt_only agrees with what the calibrated layer would have decided: 24/90 (0.27 [0.19, 0.37])
