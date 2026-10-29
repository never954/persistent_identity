#!/bin/sh
# Runs every study used in the paper, in order, on both voice models.
# Takes about 2-3 hours on an 8 GB Apple M2. Results go to analysis/results/.
set -e
cd "$(dirname "$0")/.."
PY=research/.venv/bin/python
(cd research && ../$PY -m pytest -q && ../$PY experiments/run_study1.py)   # Study 1 (no language model)
$PY analysis/study4_traits.py                                               # Study 4 (no language model)
for MODEL in qwen2.5:3b llama3.2:3b; do
  until ollama list | grep -q "^$MODEL "; do echo "waiting for $MODEL"; sleep 30; done
  $PY analysis/study3_suggestion.py --model "$MODEL" --saves 15
  $PY analysis/study5_selective.py --model "$MODEL" --saves 8
  $PY analysis/study2_fidelity.py --model "$MODEL" --saves 12
done
echo "ALL DONE"
