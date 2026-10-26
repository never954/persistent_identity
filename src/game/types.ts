/*
 * Core domain types for Ravenswood.
 * ------------------------------------------------------------------
 * These types are the contract between the game shell (this frontend)
 * and the fallible-memory suspect backend (backend/). The `SuspectService`
 * interface at the bottom is the single seam the UI talks through.
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

/** One memory the suspect's backend considered for an answer (Memory Inspector). */
export interface RecallTrace {
  id: string;
  kind: string;            // identity | episodic | habit | concealed | heard | said | self_fact | planted
  text: string;
  source: string;          // "self" | "told:detective"
  relevance: number;
  state: 'detail' | 'gist' | 'forgotten';
  source_known: boolean;
  p_detail: number;
  p_gist: number;
  p_source: number;
  used: boolean;
  age_h: number;
}

/** Why the suspect answered the way they did — engine-owned, a spoiler tool. */
export interface MemoryTrace {
  clock_label: string;
  case_question: boolean;
  accused: boolean;
  decision: { kind: StatementKind; rule: string };
  recalls: RecallTrace[];
  prompt_focus: string[];
  prompt_background: string[];
  planted_now?: string[];
  llm_ok: boolean;
  tone?: Tone;
  mood?: { fear: number; trust: number; anger: number };
}

/* ---- The living house (backend/ravenswood/world.py) ---------------- */

/** How a line is said. Typed curses, threats and pleas are detected too. */
export type Tone = 'calm' | 'press' | 'threaten' | 'comfort' | 'beg' | 'insult';

/** Something the detective DOES rather than says. */
export type Deed =
  | 'strike' | 'draw' | 'holster' | 'shoot' | 'bribe' | 'watch'
  | 'accept_bribe' | 'refuse_bribe' | 'release';

export interface NpcView {
  fear: number;
  trust: number;
  anger: number;
  status: 'present' | 'refusing' | 'fled' | 'dead';
  /** Where they are in the manor (an area of manor.json) and on which tile. */
  area: string;
  pos: [number, number];
  /** Every tile walked since the last update, to animate along. */
  trail: [number, number][];
  /** "polishing the banister", "walking to The Great Hall"… */
  doing: string;
  /** A line said aloud just now (gossip), if any. */
  say: string | null;
  /** The clue room they are in, if any. */
  room: RoomId | null;
  /** In words, e.g. "frightened and on edge; resentful and prickly". */
  mood: string;
  /** While refusing: when they will speak again. */
  until: string | null;
  watched: boolean;
}

export interface WorldEvent {
  t: number;
  text: string;
  kind: 'story' | 'deed' | 'offscreen' | 'police' | string;
  who: string | null;
}

export interface WorldView {
  npcs: Record<string, NpcView>;
  honour: number;
  events: WorldEvent[];
  watch: string | null;
  gun: string | null;
  /** Miss Cross's envelope is on the table. */
  offer: boolean;
  lost_clues: string[];
  /** A forced ending (you shot someone). */
  ended: string | null;
  deadline: boolean;
  deadline_label: string;
  clock_label?: string;
  /** Game minutes since 11 p.m. — changes when the world has moved. */
  minute: number;
  /** A body that has been found. */
  body: { cid: string; area: string; t: number; found: boolean } | null;
}

export interface ActResult {
  line: string | null;
  notices: string[];
  world: WorldView;
  clock_label: string;
  ended: string | null;
}

export interface Ending {
  id: string;
  title: string;
  text: string;
  good: boolean;
  epilogue: string[];
}

export interface AskResult {
  statement: Statement;
  /** Extra delay (ms) before showing the answer; the real model's latency is already spent. */
  thinkMs: number;
  /**
   * A difficulty-gated hint ("tell") the detective might notice. Present
   * on easier difficulties, withheld on Inspector. This is the concrete
   * mechanism by which the difficulty levels change play.
   */
  observation?: string;
  /** The game clock after this exchange, e.g. "9:24 a.m.". */
  clockLabel?: string;
  /** The memory layer's reasoning for this answer (Memory Inspector). */
  trace?: MemoryTrace;
  /** "Thomas will remember that." */
  notices?: string[];
  /** The house after this turn. */
  world?: WorldView;
}

/**
 * THE SEAM. Implemented by `backendSuspectService`, which asks the Python
 * suspect backend (backend/): a persistent memory stream per suspect, the
 * research memory model deciding what is recalled, and an LLM voice. The UI
 * depends only on this interface.
 */
export interface SuspectService {
  ask(
    suspectId: string,
    question: string,
    difficulty: Difficulty,
    tone?: Tone,
  ): Promise<AskResult>;
  /** Suggested opening questions to guide the player. */
  suggestions(suspectId: string): string[];
}
