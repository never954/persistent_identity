### qwen2.5:3b — 15 saves per cell

P(adopted: names the suggestion as seen first-hand)

| Witness | Condition | 1 h | 24 h | 168 h |
|---|---|---|---|---|
| thomas | fallible | 8/15 (0.53 [0.30, 0.75]) | 6/15 (0.40 [0.20, 0.64]) | 9/15 (0.60 [0.36, 0.80]) |
| thomas | perfect | 1/15 (0.07 [0.01, 0.30]) | 1/15 (0.07 [0.01, 0.30]) | 2/15 (0.13 [0.04, 0.38]) |
| thomas | prompt_only | 0/15 (0.00 [0.00, 0.20]) | 0/15 (0.00 [0.00, 0.20]) | 0/15 (0.00 [0.00, 0.20]) |
| agnes | fallible | 11/15 (0.73 [0.48, 0.89]) | 8/15 (0.53 [0.30, 0.75]) | 9/15 (0.60 [0.36, 0.80]) |
| agnes | perfect | 1/15 (0.07 [0.01, 0.30]) | 2/15 (0.13 [0.04, 0.38]) | 0/15 (0.00 [0.00, 0.20]) |
| agnes | prompt_only | 10/15 (0.67 [0.42, 0.85]) | 14/15 (0.93 [0.70, 0.99]) | 14/15 (0.93 [0.70, 0.99]) |

Faithfulness (fallible condition): the words match the engine's decision
(engine decided false memory → adopted; engine kept the original/source → not adopted)

- thomas: 40/45 (0.89 [0.77, 0.95]); engine decided false memory in 18/45
- agnes: 31/45 (0.69 [0.54, 0.80]); engine decided false memory in 14/45
- prompt_only agrees with what the calibrated layer would have decided: 41/90 (0.46 [0.36, 0.56])
