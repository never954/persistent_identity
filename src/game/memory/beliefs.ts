/*
 * beliefs.ts — what each suspect knows, and how it can go wrong.
 * ---------------------------------------------------------------------------
 * Each belief is one thing a suspect can be asked about. The memory layer
 * decides, at interview time, how it comes out:
 *   - a `self` memory that is still accessible → a plain, honest answer;
 *   - a `told` detail whose source tag has faded → stated as first-hand (an
 *     honest FALSE MEMORY);
 *   - an `interferenceFalse` routine the suspect is sure they performed but
 *     did not → a confident false memory;
 *   - a `concealed` truth the killer/liar is hiding → a deliberate LIE;
 *   - anything no longer accessible → an EVASION ("I can't quite recall…").
 *
 * `content` is the underlying fact (fed to the LLM and used as the offline
 * fallback answer). Ground truth lives in caseData; nothing here contradicts it.
 */

import type { StatementKind } from '../types';

export interface Belief {
  id: string;
  topics: string[];          // keywords matched against the player's question
  content: string;           // the underlying fact / fallback spoken line
  source: 'self' | 'told';
  toldBy?: string;
  /** Hours before the interview this was encoded (0 = the night of the murder). */
  t: number;
  /** The killer/liar is hiding the truth here → a deliberate lie. */
  concealed?: boolean;
  /** A told detail adopted as first-hand once its source tag fades. */
  falseMemoryWhenSourceLost?: boolean;
  /** A routine the suspect is certain they performed but did not. */
  interferenceFalse?: boolean;
  /** Overrides the generic per-kind "tell". */
  tell?: string;
  revealsClue?: string;
}

export const BELIEFS: Record<string, Belief[]> = {
  /* -------- Agnes: heavy decay + interference (the honest red herring) ---- */
  agnes: [
    { id: 'ag-tea', topics: ['tea', 'serve', 'carry', 'upstairs', 'night', 'routine', 'do'], t: 0,
      source: 'self', interferenceFalse: true, revealsClue: 'cold-teapot',
      content: 'I carried his lordship his late tea up to the study, same as every night of forty-one years.',
      tell: 'She says it by rote, the way she has a thousand times — not like a thing she is recalling, but reciting.' },
    { id: 'ag-where', topics: ['where', 'evening', 'kitchen', 'time', 'death'], t: 0,
      source: 'self', content: 'In my kitchen, dear, where else? Scrubbing the pans down after dinner was cleared.' },
    { id: 'ag-noise', topics: ['hear', 'noise', 'sound', 'scream', 'anything'], t: 0,
      source: 'self', content: 'The storm was that loud I heard nothing but thunder. Perhaps a door, late on — or I imagined it.' },
    { id: 'ag-family', topics: ['alistair', 'lord', 'victim', 'master', 'family', 'like'], t: 400,
      source: 'self', content: 'A hard man but a fair one. Forty-one years I kept his house. My heart is quite broken.' },
    { id: 'ag-vivian', topics: ['vivian', 'cross', 'guest', 'woman', 'red', 'crimson'], t: 0,
      source: 'self', content: 'Miss Cross? A fine lady. Kept to herself with her headache. I did not see her after dinner.' },
  ],

  /* -------- Julian: clear memory, but lies about the library -------------- */
  julian: [
    { id: 'ju-alibi', topics: ['where', 'evening', 'library', 'reading', 'time', 'death'], t: 0,
      source: 'self', concealed: true, revealsClue: 'gambling-papers',
      content: 'I was in the library all evening, reading. Alone. I heard nothing until the house woke.',
      tell: 'His answer is a touch too rehearsed, and his eyes go to the door as he gives it.' },
    { id: 'ju-money', topics: ['debt', 'money', 'gambling', 'inherit', 'heir', 'will', 'cellar'], t: 2,
      source: 'self', concealed: true,
      content: 'Debts? Vicious rumour. I have no notion what you mean by the cellar.',
      tell: 'The sneer tightens. This is the one subject that makes him stop performing and start calculating.' },
    { id: 'ju-uncle', topics: ['alistair', 'lord', 'uncle', 'victim', 'like', 'relationship'], t: 300,
      source: 'self', content: 'My uncle and I were not close. He thought me frivolous. He was not entirely wrong.' },
    { id: 'ju-noise', topics: ['hear', 'noise', 'sound', 'see', 'anything'], t: 0,
      source: 'self', content: 'Nothing. The storm swallowed the whole house. I kept to my book and my brandy.' },
  ],

  /* -------- Vance: near-perfect memory, anchors the timeline -------------- */
  vance: [
    { id: 'va-time', topics: ['time', 'death', 'when', 'died', 'watch', 'clock'], t: 0,
      source: 'self', revealsClue: 'stopped-watch',
      content: 'Eleven-fourteen. His pocket-watch stopped in the fall, and the hall clock agrees. I am certain of it.' },
    { id: 'va-sedative', topics: ['sedative', 'drug', 'brandy', 'glass', 'poison', 'how', 'method'], t: 0,
      source: 'self', revealsClue: 'wine-residue',
      content: 'He was sedated before the blow — there was chloral in the brandy glass. No sudden quarrel; this was prepared.' },
    { id: 'va-where', topics: ['where', 'evening', 'conservatory', 'reading'], t: 0,
      source: 'self', content: 'In the conservatory with my book until the valet raised the alarm. I came at once; there was nothing to be done.' },
    { id: 'va-vivian', topics: ['vivian', 'cross', 'suspect', 'who', 'think', 'guest'], t: 0,
      source: 'self', content: 'I speculate only from evidence. Miss Cross retired early, she says. I did not see her — but a sedative is a patient, planning sort of weapon.' },
  ],

  /* -------- Thomas: extreme source-amnesia (the crown jewel) -------------- */
  thomas: [
    { id: 'th-woman', topics: ['see', 'saw', 'woman', 'red', 'crimson', 'landing', 'study', 'anyone'], t: 0,
      source: 'told', toldBy: 'the detective', falseMemoryWhenSourceLost: true, revealsClue: 'crimson-thread',
      content: 'A woman in a red dress, near the study on the landing, round about eleven.',
      tell: 'He offers it as his own sighting — but you planted that detail yourself not an hour ago.' },
    { id: 'th-where', topics: ['where', 'evening', 'lamps', 'hall', 'upstairs'], t: 0,
      source: 'self', content: 'Turning down the lamps along the upstairs hall, sir, like I was told. I never go in the study.' },
    { id: 'th-noise', topics: ['hear', 'noise', 'sound', 'crash', 'thunder'], t: 0,
      source: 'self', content: 'A crash from the library way, round midnight — or was it the study? I… I think it was the study, now you say it.' },
    { id: 'th-fear', topics: ['afraid', 'nervous', 'job', 'position', 'lie'], t: 0,
      source: 'self', content: 'I only want to help, sir. I cannot lose this place — it is the only one I have ever had.' },
  ],

  /* -------- Vivian: the killer. Low fallibility; motivated lies ----------- */
  vivian: [
    { id: 'vi-alibi', topics: ['where', 'evening', 'quarters', 'room', 'headache', 'time', 'death'], t: 0,
      source: 'self', concealed: true, revealsClue: 'muddy-prints',
      content: 'I retired early to my quarters with a headache and saw no one until morning.',
      tell: 'Every word lands exactly where she wants it. It is a performance, not a memory.' },
    { id: 'vi-ledger', topics: ['ledger', 'money', 'business', 'embezzle', 'company', 'partner', 'steal'], t: 0,
      source: 'self', concealed: true, revealsClue: 'burned-ledger',
      content: 'Our accounts were in perfect order. Alistair and I never had a cross word about money.',
      tell: 'A flicker — gone instantly. She smiles a half-second too soon.' },
    { id: 'vi-dress', topics: ['dress', 'red', 'crimson', 'gown', 'wear', 'thread'], t: 0,
      source: 'self', concealed: true,
      content: 'My gown last night was crimson, yes. A great many women own red dresses, Detective.',
      tell: 'She answers the question you did not quite ask, and watches to see what you know.' },
    { id: 'vi-alistair', topics: ['alistair', 'lord', 'victim', 'relationship', 'like'], t: 200,
      source: 'self', content: 'Alistair was my partner and my friend of twenty years. I am devastated. Truly.' },
    { id: 'vi-conservatory', topics: ['conservatory', 'garden', 'door', 'mud', 'outside', 'storm'], t: 0,
      source: 'self', concealed: true,
      content: 'The conservatory? I have scarcely set foot in it. Why would I go out into a storm?',
      tell: 'The deflection is smooth, but you noticed she asked why you brought it up.' },
  ],
};

/** The generic "tell" the detective might notice, by statement kind. */
export const KIND_TELLS: Record<StatementKind, string | null> = {
  plain: null,
  lie: 'A half-beat of calculation behind the eyes before the answer comes out smooth.',
  'false-memory': 'Stated with complete, serene certainty — far more than a months-old detail should earn.',
  evasion: 'They talk all around the question and never once land on it.',
};
