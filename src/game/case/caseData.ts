/*
 * THE CASE FILE — ground truth for "A Storm at Ravenswood".
 * ------------------------------------------------------------------
 * Everything here is engine-owned fact. The AI suspects speak *about*
 * this world but can never change it. Keeping the truth in code (not in
 * the model) is the single decision that keeps the mystery solvable.
 */

import type { Clue, Room, RoomId } from '../types';

export const CASE_META = {
  title: 'A Storm at Ravenswood',
  year: 1926,
  victim: 'Lord Alistair Ravenswood',
  timeOfDeath: '11:14 p.m.',
  method: 'A blow from the brass candlestick — after a sedative in his brandy.',
  setup:
    'A thunderstorm has cut the power to Ravenswood Manor. By candlelight, ' +
    'the master of the house is found dead in his locked study. The bridge ' +
    'to the village is flooded; no one has left. One of the five guests and ' +
    'servants under this roof is a murderer.',
} as const;

/**
 * The rooms of the manor, positioned in map-space (0..100 on both axes).
 * The Investigation Hub renders these with a pan/zoom camera, so these
 * numbers are literally a 2D coordinate system the CG viva can point to.
 */
export const ROOMS: Room[] = [
  {
    id: 'library',
    name: 'The Library',
    x: 6, y: 8, w: 24, h: 22,
    blurb: 'Floor-to-ceiling shelves, a cold hearth, one reading chair still warm.',
    clues: [],
  },
  {
    id: 'study',
    name: "The Study",
    x: 36, y: 6, w: 27, h: 24,
    blurb: 'Where Lord Ravenswood was found. The air still smells of brandy and smoke.',
    clues: ['candlestick-missing', 'burned-ledger', 'crimson-thread', 'stopped-watch', 'wine-residue'],
  },
  {
    id: 'quarters',
    name: 'The Guest Quarters',
    x: 69, y: 8, w: 25, h: 22,
    blurb: 'A corridor of shut doors. Vivian Cross claims she never left hers.',
    clues: [],
  },
  {
    id: 'dining',
    name: 'The Dining Room',
    x: 6, y: 36, w: 24, h: 20,
    blurb: 'Dinner was cleared at ten. Five chairs, one now empty forever.',
    clues: [],
  },
  {
    id: 'foyer',
    name: 'The Grand Foyer',
    x: 37, y: 36, w: 24, h: 20,
    blurb: 'A drowned chandelier hangs dark. Rain hammers the tall doors.',
    clues: [],
  },
  {
    id: 'conservatory',
    name: 'The Conservatory',
    x: 68, y: 34, w: 27, h: 24,
    blurb: 'Glass walls, dripping ferns, and a garden door that does not lock.',
    clues: ['muddy-prints'],
  },
  {
    id: 'kitchen',
    name: 'The Kitchen',
    x: 6, y: 62, w: 24, h: 20,
    blurb: 'Agnes Hartwell keeps it spotless. A teapot sits, its contents stone cold.',
    clues: ['cold-teapot'],
  },
  {
    id: 'cellar',
    name: 'The Wine Cellar',
    x: 40, y: 62, w: 28, h: 20,
    blurb: 'Damp stone and dusty vintages. Someone has been down here recently.',
    clues: ['gambling-papers'],
  },
];

export const CLUES: Clue[] = [
  {
    id: 'candlestick-missing',
    title: 'The Missing Candlestick',
    detail:
      'One of the matched brass candlesticks is gone from the study mantel. ' +
      'The surviving twin is heavy enough to kill. It is the murder weapon.',
    room: 'study',
  },
  {
    id: 'burned-ledger',
    title: 'A Half-Burned Ledger Page',
    detail:
      'In the study grate: a scorched page from the Ravenswood–Cross business ' +
      'ledger. The surviving figures show sums quietly moved out of the company.',
    room: 'study',
    relatesTo: ['vivian'],
  },
  {
    id: 'crimson-thread',
    title: 'A Crimson Thread',
    detail:
      'Caught on the splintered edge of the study desk: a single thread of deep ' +
      'crimson silk, the shade of an evening gown.',
    room: 'study',
    relatesTo: ['vivian'],
  },
  {
    id: 'stopped-watch',
    title: "The Stopped Pocket-Watch",
    detail:
      "Lord Ravenswood's watch shattered in the fall. Its hands are frozen at " +
      '11:14 — the moment of death.',
    room: 'study',
  },
  {
    id: 'wine-residue',
    title: 'Cloudy Residue in the Glass',
    detail:
      'The brandy glass holds a chalky residue. He was sedated before the blow — ' +
      'this was no sudden quarrel but something planned.',
    room: 'study',
  },
  {
    id: 'muddy-prints',
    title: 'Muddy Footprints',
    detail:
      'A trail of garden mud leads from the unlocked conservatory door toward the ' +
      'study. Someone came in from the storm and doubled back.',
    room: 'conservatory',
    relatesTo: ['vivian'],
  },
  {
    id: 'gambling-papers',
    title: 'Hidden Gambling Debts',
    detail:
      'Stuffed behind a wine rack: a bundle of unpaid IOUs in Julian Ravenswood’s ' +
      'hand. A ruinous sum — and a reason to lie about where he was.',
    room: 'cellar',
    relatesTo: ['julian'],
  },
  {
    id: 'cold-teapot',
    title: 'The Cold, Full Teapot',
    detail:
      'The nightly tea was brewed but never served — the pot is full and cold. ' +
      'Whatever Agnes remembers about carrying it up, it never happened tonight.',
    room: 'kitchen',
    relatesTo: ['agnes'],
  },
];

export const CLUES_BY_ID: Record<string, Clue> = Object.fromEntries(
  CLUES.map((c) => [c.id, c]),
);

export const ROOMS_BY_ID: Record<RoomId, Room> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
) as Record<RoomId, Room>;

/** The engine's private answer. Revealed only on the verdict screen. */
export const SOLUTION = {
  killerId: 'vivian',
  because:
    'Alistair discovered Vivian Cross had been draining their company and swore ' +
    'to ruin her by morning. She slipped in through the conservatory in the storm, ' +
    'sedated his brandy, and struck him with the candlestick — then burned the ' +
    'ledger page that proved her theft. The crimson thread is from her gown.',
  redHerrings: {
    agnes: 'Her "memory" of serving tea is a genuine false memory — the pot is cold and full.',
    julian: 'He lied about the library only to hide his gambling debts in the cellar.',
  },
} as const;
