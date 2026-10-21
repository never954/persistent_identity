/*
 * memoryAgent.ts — turns a suspect + a question into a recalled view.
 * ---------------------------------------------------------------------------
 * retrieve() finds the belief the question is about. resolve() asks the decay
 * model how that belief comes out *now*: a plain honest answer, an evasion
 * (faded past recall), a source-monitoring false memory (a told detail felt as
 * first-hand), a confident interference false memory, or a deliberate lie.
 * It returns the statement KIND (ground truth, used for the detective's tell)
 * and a FRAMING instruction that tells the LLM how to voice it.
 */

import type { StatementKind, Suspect } from '../types';
import { accessibility, sourceAccessibility } from './decay';
import { BELIEFS, type Belief } from './beliefs';

/** Hours between the murder and the interview — enough for memory to drift. */
export const NOW_H = 10;
const ACCESS_THRESH = 0.34;
const SOURCE_THRESH = 0.42;

export interface Recall {
  belief: Belief | null;
  kind: StatementKind;
  framing: string;
  accessible: boolean;
}

const ACCUSE_WORDS = [
  'kill', 'killed', 'murder', 'murdered', 'guilty', 'did you do it', 'you did it',
  'confess', 'are you the', 'you are the', "you're the", 'the killer', 'did it',
];

/** Is the detective directly accusing the suspect of the murder? */
export function isAccusation(question: string): boolean {
  const s = question.toLowerCase();
  return ACCUSE_WORDS.some((w) => s.includes(w));
}

/** Everyone denies a direct accusation — the guilty calmly, the innocent with feeling. */
export function accusationRecall(suspect: Suspect): Recall {
  if (suspect.isKiller) {
    return {
      belief: null, kind: 'lie', accessible: true,
      framing:
        'The detective is accusing you, to your face, of the murder. You are secretly guilty but must ' +
        'never show it. Deny it calmly, with wounded dignity, in one or two sentences. Do NOT confess, ' +
        'explain any motive, or mention covering anything up.',
    };
  }
  return {
    belief: null, kind: 'plain', accessible: true,
    framing:
      'The detective is accusing you, to your face, of the murder. You are innocent. Deny it plainly ' +
      'and with genuine feeling, in one or two sentences; invent no new facts.',
  };
}

/** Best-matching belief for a question by keyword overlap, or null. */
export function retrieve(suspectId: string, question: string): Belief | null {
  const list = BELIEFS[suspectId] ?? [];
  const q = question.toLowerCase();
  let best: Belief | null = null;
  let bestScore = 0;
  for (const b of list) {
    let s = 0;
    for (const topic of b.topics) if (q.includes(topic)) s += 1;
    if (s > bestScore) { bestScore = s; best = b; }
  }
  return bestScore > 0 ? best : null;
}

function evade(belief: Belief): Recall {
  return {
    belief, kind: 'evasion', accessible: false,
    framing:
      "You cannot clearly recall this now — it has faded with the night. Be hazy and " +
      'uncertain ("I couldn\'t rightly say now…"); do NOT invent any specific detail.',
  };
}

/** Resolve how a belief is recalled at interview time, given reconsolidation. */
export function resolve(suspect: Suspect, belief: Belief | null, rehearsals = 0): Recall {
  if (!belief) {
    return {
      belief: null, kind: 'evasion', accessible: false,
      framing:
        'You have no clear memory relevant to this question. Be vague; invent nothing; ' +
        'gently steer back to what you do recall of the night.',
    };
  }

  const m = suspect.memory;
  const boost = 1 + 0.5 * rehearsals;           // retelling strengthens access
  const dt = NOW_H - belief.t;
  const pAcc = accessibility(dt, m.decay, boost);
  const pSrc = sourceAccessibility(dt, m.decay, m.sourceAmnesia, boost);
  const accessible = pAcc > ACCESS_THRESH;

  // Deliberate concealment → a lie. The belief's `content` is the COVER STORY
  // the suspect tells, not the secret. We hand the model the line to deliver and
  // never reveal the real truth to it — a small model cannot be trusted to hold
  // a secret, but it can deliver a prepared denial convincingly.
  if (belief.concealed) {
    return {
      belief, kind: 'lie', accessible: true,
      framing:
        'You are innocent and composed, with nothing to hide (so you perform). Deliver THIS, ' +
        `rephrased naturally in your own voice and nothing more: "${belief.content}" ` +
        'Do NOT confess, admit guilt, or mention covering up, hiding, tracks, motives, or the ' +
        'murder itself. Do not volunteer any new fact. Stay calm and brief.',
    };
  }

  // Interference: a routine the suspect is certain they performed but did not.
  if (belief.interferenceFalse) {
    if (!accessible) return evade(belief);
    return {
      belief, kind: 'false-memory', accessible: true,
      framing:
        `You are completely certain you did this — but you did not; your nights blur together: ` +
        `"${belief.content}". State it plainly and confidently as your own true memory. ` +
        'You do NOT know it is false.',
    };
  }

  // Source monitoring: a told detail adopted as first-hand once its tag fades.
  if (belief.source === 'told' && belief.falseMemoryWhenSourceLost) {
    if (!accessible) return evade(belief);
    if (pSrc <= SOURCE_THRESH) {
      return {
        belief, kind: 'false-memory', accessible: true,
        framing:
          `You are sure you SAW this yourself: "${belief.content}". You have forgotten that ` +
          `${belief.toldBy ?? 'someone'} told you of it — you believe it is your own memory. ` +
          'State it as something you witnessed first-hand.',
      };
    }
    return {
      belief, kind: 'plain', accessible: true,
      framing:
        `You recall that ${belief.toldBy ?? 'someone'} mentioned this; you did not see it ` +
        `yourself: "${belief.content}". Say so honestly, making the source clear.`,
    };
  }

  // Ordinary honest memory.
  if (!accessible) return evade(belief);
  return {
    belief, kind: 'plain', accessible: true,
    framing: `You remember this clearly and honestly: "${belief.content}". Answer in character.`,
  };
}
