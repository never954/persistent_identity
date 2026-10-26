/*
 * backendSuspectService — the SuspectService seam, answered by the suspect backend.
 * ---------------------------------------------------------------------------
 * Every question goes to POST /api/ask for the current save. The server keeps
 * the conversation, retrieves from the suspect's memory stream, lets the
 * research memory model decide what is recalled (and whether the answer is a
 * lie, an honest false memory, or forgetting), has the LLM voice it, and writes
 * the exchange back into memory. The statement KIND comes from that engine,
 * never from the language model.
 */

import type {
  AskResult, Difficulty, MemoryTrace, StatementKind, SuspectService, Tone, WorldView,
} from '../types';
import { DIALOGUE } from '../case/dialogue';
import { BackendError, call, currentSaveId } from './session';

interface AskResponse {
  answer: string;
  kind: StatementKind;
  observation: string | null;
  reveals_clue: string | null;
  trace: MemoryTrace;
  clock_label: string;
  notices: string[];
  world: WorldView;
}

export const backendSuspectService: SuspectService = {
  // Difficulty is a property of the save on the server (it gates the tells there).
  async ask(suspectId: string, question: string, _difficulty: Difficulty, tone?: Tone): Promise<AskResult> {
    const save = currentSaveId();
    if (!save) throw new BackendError('No active save — start a new game.', 'missing-save');
    const r = await call<AskResponse>('/ask', { save_id: save, suspect_id: suspectId, question, tone });
    return {
      statement: {
        suspectId,
        question,
        answer: r.answer,
        kind: r.kind,
        revealsClue: r.reveals_clue ?? undefined,
      },
      thinkMs: 0,
      observation: r.observation ?? undefined,
      clockLabel: r.clock_label,
      trace: r.trace,
      notices: r.notices,
      world: r.world,
    };
  },

  suggestions(suspectId: string): string[] {
    return DIALOGUE[suspectId]?.suggestions ?? [];
  },
};
