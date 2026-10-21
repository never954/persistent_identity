/*
 * scriptedSuspectService — the current implementation of the SuspectService
 * seam (see types.ts). It answers questions from the hand-authored
 * dialogue table by keyword matching.
 *
 * >>> THE SWAP POINT <<<
 * When the fallible-memory backend exists, write a `memorySuspectService`
 * with this same interface that (1) embeds the question, (2) retrieves the
 * suspect's memories from ChromaDB, (3) applies decay / interference /
 * source-amnesia, (4) prompts the LLM. Then change the single import in
 * `serviceProvider.ts`. The UI never learns the difference.
 */

import type {
  AskResult,
  Difficulty,
  Statement,
  SuspectService,
} from '../types';
import { DIALOGUE, type DialogueLine } from '../case/dialogue';

/** Score how well a dialogue line matches the player's question. */
function scoreLine(line: DialogueLine, q: string): number {
  let hits = 0;
  for (const t of line.triggers) {
    if (q.includes(t)) hits += 1;
  }
  if (hits === 0) return 0;
  // Weight raw keyword hits by the line's authored priority.
  return hits * 10 + (line.priority ?? 1);
}

/**
 * Should this "tell" be shown at the given difficulty?
 *  - rookie:    always (training wheels on)
 *  - detective: only the strongest tells (those on lies / false memories)
 *  - inspector: never (you are on your own)
 */
function tellVisible(kind: Statement['kind'], difficulty: Difficulty): boolean {
  if (difficulty === 'rookie') return true;
  if (difficulty === 'inspector') return false;
  return kind === 'lie' || kind === 'false-memory';
}

/** Simulated "thinking" latency, so answers don't snap in instantly. */
function thinkTime(answer: string): number {
  return Math.min(1600, 500 + answer.length * 6);
}

export const scriptedSuspectService: SuspectService = {
  async ask(
    suspectId: string,
    question: string,
    difficulty: Difficulty,
  ): Promise<AskResult> {
    const book = DIALOGUE[suspectId];
    if (!book) {
      throw new Error(`No dialogue authored for suspect "${suspectId}"`);
    }

    const q = question.toLowerCase();
    let best: DialogueLine | null = null;
    let bestScore = 0;
    for (const line of book.lines) {
      const s = scoreLine(line, q);
      if (s > bestScore) {
        bestScore = s;
        best = line;
      }
    }

    const matched = best && bestScore > 0;
    const statement: Statement = {
      suspectId,
      question,
      answer: matched ? best!.answer : book.fallback,
      kind: matched ? best!.kind : 'evasion',
      revealsClue: matched ? best!.revealsClue : undefined,
    };

    const observation =
      matched && best!.tell && tellVisible(statement.kind, difficulty)
        ? best!.tell
        : undefined;

    return {
      statement,
      thinkMs: thinkTime(statement.answer),
      observation,
    };
  },

  suggestions(suspectId: string): string[] {
    return DIALOGUE[suspectId]?.suggestions ?? [];
  },
};
