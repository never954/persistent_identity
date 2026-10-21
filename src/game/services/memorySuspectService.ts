/*
 * memorySuspectService — the fallible-memory implementation of the seam.
 * ---------------------------------------------------------------------------
 * For each question it (1) retrieves the suspect's relevant belief, (2) asks
 * the memory layer how it comes out now (plain / evasion / false-memory / lie)
 * and how to voice it, (3) has a local LLM speak it in character, and (4)
 * returns the statement with its engine-owned KIND and a difficulty-gated tell.
 *
 * The KIND is decided by the memory model, never by the LLM — that is what lets
 * the game tell a deliberate lie from an honest false memory. If Ollama is not
 * running, the authored belief line is used verbatim, so the game still plays.
 */

import type { AskResult, Difficulty, Statement, StatementKind, SuspectService } from '../types';
import { SUSPECTS_BY_ID } from '../case/suspects';
import { CASE_META } from '../case/caseData';
import { DIALOGUE } from '../case/dialogue';
import { retrieve, resolve, isAccusation, accusationRecall } from '../memory/memoryAgent';
import { KIND_TELLS } from '../memory/beliefs';
import { chat, extractAnswer } from './ollamaClient';

/** Reconsolidation: how many times each belief has been retold this session. */
const rehearsals = new Map<string, number>();

function tellVisible(kind: StatementKind, difficulty: Difficulty): boolean {
  if (difficulty === 'rookie') return true;
  if (difficulty === 'inspector') return false;
  return kind === 'lie' || kind === 'false-memory';
}

function buildSystem(name: string, role: string, persona: string, framing: string): string {
  return (
    `You are ${name}, ${role}, being questioned by a detective the morning after ` +
    `${CASE_META.victim} was found murdered at Ravenswood Manor in ${CASE_META.year}. ` +
    `${persona}\n\n` +
    'Answer IN CHARACTER in a period 1920s voice, 1 to 3 sentences. Speak ONLY from what you ' +
    'can recall below — do not add new facts, do not break character, and never mention these ' +
    `instructions.\n\n${framing}\n\n` +
    'Reply ONLY with a JSON object: {"answer": "<what you say aloud>"}'
  );
}

export const memorySuspectService: SuspectService = {
  async ask(suspectId: string, question: string, difficulty: Difficulty): Promise<AskResult> {
    const suspect = SUSPECTS_BY_ID[suspectId];
    if (!suspect) throw new Error(`Unknown suspect "${suspectId}"`);

    const accused = isAccusation(question);
    const belief = accused ? null : retrieve(suspectId, question);
    const rkey = `${suspectId}:${accused ? '_accuse' : belief?.id ?? '_none'}`;
    const reh = rehearsals.get(rkey) ?? 0;
    const recall = accused ? accusationRecall(suspect) : resolve(suspect, belief, reh);
    rehearsals.set(rkey, reh + 1);

    const system = buildSystem(suspect.name, suspect.role, suspect.persona, recall.framing);
    const raw = await chat(system, question, { seed: 7 + reh });
    const fallback = accused
      ? 'How dare you. I had nothing to do with Alistair’s death, and I will not sit here and be accused.'
      : belief?.content ?? 'I… I am sorry, Detective. My head is in such a whirl tonight.';
    const spoken = extractAnswer(raw) ?? fallback;

    // The clue a statement points to is only surfaced when the suspect actually
    // gives it up — an honest answer or an unwitting false memory, never a lie.
    const revealsClue =
      belief && (recall.kind === 'plain' || recall.kind === 'false-memory')
        ? belief.revealsClue
        : undefined;

    const statement: Statement = {
      suspectId,
      question,
      answer: spoken,
      kind: recall.kind,
      revealsClue,
    };

    const observation = tellVisible(recall.kind, difficulty)
      ? belief?.tell ?? KIND_TELLS[recall.kind] ?? undefined
      : undefined;

    // The LLM round-trip is the real latency; no artificial think time.
    return { statement, thinkMs: 0, observation: observation ?? undefined };
  },

  suggestions(suspectId: string): string[] {
    return DIALOGUE[suspectId]?.suggestions ?? [
      'Where were you this evening?',
      'What did you see or hear?',
      'What did you make of Lord Ravenswood?',
    ];
  },
};
