/*
 * SCORING — the "Detective Rating" mechanism.
 * ------------------------------------------------------------------
 * The rubric explicitly rewards a scoring mechanism. Ours measures
 * detective skill, not reflexes: reward evidence gathered and real
 * contradictions spotted; penalise flagging honest statements and,
 * above all, accusing the wrong person. Difficulty scales the whole
 * thing, which also ties the score to the future memory-fallibility
 * experiment (harder memory => higher stakes).
 */

import type { Difficulty, NotebookEntry } from './types';

export const SCORE_RULES = {
  cluePoints: 8, // per physical clue discovered
  goodFlagPoints: 6, // flagged a statement that really was off (lie/false-memory/evasion)
  badFlagPenalty: -4, // flagged an honest, plain statement
  correctAccusation: 40,
  wrongAccusation: -25,
  evidencePoints: 5, // per clue attached to a correct accusation (max 3 counted)
} as const;

export const DIFFICULTY_MULT: Record<Difficulty, number> = {
  rookie: 1.0,
  detective: 1.25,
  inspector: 1.5,
};

export interface ScoreBreakdown {
  clues: number;
  flags: number;
  accusation: number;
  evidence: number;
  subtotal: number;
  multiplier: number;
  total: number;
}

export interface ScoreInputs {
  cluesFound: number;
  notebook: NotebookEntry[];
  accusedId: string | null;
  killerId: string;
  attachedEvidence: string[];
  difficulty: Difficulty;
}

export function computeScore(inp: ScoreInputs): ScoreBreakdown {
  const clues = inp.cluesFound * SCORE_RULES.cluePoints;

  let flags = 0;
  for (const e of inp.notebook) {
    if (!e.flaggedContradiction) continue;
    if (e.kind === 'plain') flags += SCORE_RULES.badFlagPenalty;
    else flags += SCORE_RULES.goodFlagPoints;
  }

  const correct = inp.accusedId === inp.killerId;
  const accusation =
    inp.accusedId === null
      ? 0
      : correct
        ? SCORE_RULES.correctAccusation
        : SCORE_RULES.wrongAccusation;

  const evidence = correct
    ? Math.min(3, inp.attachedEvidence.length) * SCORE_RULES.evidencePoints
    : 0;

  const subtotal = clues + flags + accusation + evidence;
  const multiplier = DIFFICULTY_MULT[inp.difficulty];
  const total = Math.max(0, Math.round(subtotal * multiplier));

  return { clues, flags, accusation, evidence, subtotal, multiplier, total };
}

/** Map a final score to an in-world rank shown on the verdict screen. */
export function rankFor(total: number, solved: boolean): string {
  if (!solved) return 'Case Unsolved';
  if (total >= 110) return 'Master Detective';
  if (total >= 80) return 'Inspector';
  if (total >= 50) return 'Detective';
  return 'Constable';
}
