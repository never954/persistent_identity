/*
 * Core domain types for Ravenswood.
 * ------------------------------------------------------------------
 * These types are the contract between the game shell (this frontend)
 * and the future fallible-memory backend. The `SuspectService` interface
 * at the bottom is the single seam: today it is answered by scripted
 * data; later the same signature is answered by the ChromaDB + LLM
 * memory pipeline. Nothing else in the UI needs to change.
 */

/* ---- Ground truth (owned by the Game Engine, never invented by AI) -- */

export type RoomId =
  | 'foyer'
  | 'study'
  | 'library'
  | 'dining'
  | 'kitchen'
  | 'conservatory'
  | 'cellar'
  | 'quarters';

export interface Room {
  id: RoomId;
  name: string;
  /** Position on the mansion map, in map-space coordinates (0..100). */
  x: number;
  y: number;
  w: number;
  h: number;
  blurb: string;
  /** Clue ids discoverable by examining this room. */
  clues: string[];
}

export interface Clue {
  id: string;
  title: string;
  /** What the detective literally observes — a hard, engine-owned fact. */
  detail: string;
  room: RoomId;
  /** Optional tag linking a clue to the suspect it implicates/clears. */
  relatesTo?: string[];
}

/* ---- Suspects ------------------------------------------------------- */

/**
 * A suspect's memory profile. In the frontend slice these values only
 * flavour the scripted dialogue and drive difficulty; in the backend
 * they become the actual decay / interference / source-amnesia dials.
 */
export interface MemoryProfile {
  /** 0..1 — how fast ordinary memories fade (Ebbinghaus decay rate). */
  decay: number;
  /** 0..1 — tendency to blend similar events together (interference). */
  interference: number;
  /** 0..1 — tendency to adopt suggested details as own (source amnesia). */
  sourceAmnesia: number;
  /** Human-readable note for the viva / design doc. */
  note: string;
}

export interface Suspect {
  id: string;
  name: string;
  role: string;
  age: number;
  /** One-line persona used as the LLM system-prompt seed later. */
  persona: string;
  /** Colour used for their portrait frame + notebook tab. */
  accent: string;
  /** Where they claim to have been at the time of death. */
  statedAlibi: string;
  motive: string;
  memory: MemoryProfile;
  /** True for exactly one suspect — engine ground truth, never shown. */
  isKiller: boolean;
}

/* ---- Dialogue ------------------------------------------------------- */

export type StatementKind =
  | 'plain' // ordinary answer
  | 'lie' // a deliberate falsehood (only the killer, really)
  | 'false-memory' // an honest error — the thesis's core ambiguity
  | 'evasion'; // dodging without committing

export interface Statement {
  suspectId: string;
  question: string;
  answer: string;
  kind: StatementKind;
  /** If this statement contradicts a clue or another statement, id it. */
  contradicts?: string;
  /** Discovering this statement can unlock a notebook clue. */
  revealsClue?: string;
}

/* ---- Player-facing game data --------------------------------------- */

export interface NotebookEntry {
  id: string;
  suspectId: string;
  question: string;
  answer: string;
  kind: StatementKind;
  flaggedContradiction: boolean;
  timestamp: number;
}

export type Difficulty = 'rookie' | 'detective' | 'inspector';

/**
 * The finite set of top-level game states. Making this explicit is a
 * rubric requirement ("game states are clearly designed") and keeps the
 * flow debuggable.
 */
export type GamePhase =
  | 'title'
  | 'cutscene'
  | 'prologue'
  | 'investigation'
  | 'explore'
  | 'interrogation'
  | 'accusation'
  | 'verdict';

/* ---- The seam ------------------------------------------------------- */

export interface AskResult {
  statement: Statement;
  /** Latency (ms) to simulate "thinking"; real backend fills this too. */
  thinkMs: number;
  /**
   * A difficulty-gated hint ("tell") the detective might notice. Present
   * on easier difficulties, withheld on Inspector. This is the concrete
   * mechanism by which the difficulty levels change play.
   */
  observation?: string;
}

/**
 * THE SEAM. Implemented today by `scriptedSuspectService`; tomorrow by a
 * memory-backed service that hits the Python engine. The UI depends only
 * on this interface.
 */
export interface SuspectService {
  ask(
    suspectId: string,
    question: string,
    difficulty: Difficulty,
  ): Promise<AskResult>;
  /** Suggested opening questions to guide the player. */
  suggestions(suspectId: string): string[];
}
