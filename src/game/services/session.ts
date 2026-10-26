/*
 * session.ts — this browser's link to one save on the suspect backend.
 * ---------------------------------------------------------------------------
 * A save lives on the server (backend/data/ravenswood.db): every suspect's
 * memory stream, the interview log and the game clock. The browser only keeps
 * the save id (in the persisted game state), so a refresh — or a server
 * restart — loses nothing. All calls go through the Vite proxy at /api.
 */

import type { ActResult, Deed, Ending, WorldView } from '../types';

const API = '/api';

let saveId: string | null = null;

/** Set by the game store whenever its save id changes. */
export function setSaveId(id: string | null): void {
  saveId = id;
}

export function currentSaveId(): string | null {
  return saveId;
}

export type BackendProblem = 'offline' | 'missing-save' | 'failed' | 'gone';

export class BackendError extends Error {
  constructor(message: string, readonly problem: BackendProblem) {
    super(message);
  }
}

export const SERVER_HINT = 'Start it in a terminal with: npm run server';

export async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new BackendError('The suspects’ memory server is not running.', 'offline');
  }
  let data: { detail?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    data = null; // the dev proxy answers with an empty error page when the server is down
  }
  if (res.ok && data) return data as T;
  if (res.status === 404 && data?.detail === 'unknown save') {
    throw new BackendError('This save no longer exists on the server.', 'missing-save');
  }
  if (res.status === 409) throw new BackendError(data?.detail ?? 'They are not here.', 'gone');
  if (!data) throw new BackendError('The suspects’ memory server is not running.', 'offline');
  throw new BackendError(data.detail ?? `Server error ${res.status}`, 'failed');
}

export interface Health {
  ok: boolean;
  ollama: boolean;
  model: string | null;
}

/** Null when the server is unreachable. */
export async function health(): Promise<Health | null> {
  try {
    return await call<Health>('/health');
  } catch {
    return null;
  }
}

/** Create a save: the server seeds every suspect's memory stream. */
export async function newSession(difficulty: string): Promise<{ save_id: string; clock_label: string }> {
  return call('/session', { difficulty });
}

export async function sessionExists(id: string): Promise<boolean> {
  try {
    await call(`/session/${id}`);
    return true;
  } catch {
    return false;
  }
}

/* ---- The living house ---------------------------------------------- */

/** The house now: moods, who is where, what has happened. Ticks it forward. */
export async function worldView(): Promise<WorldView | null> {
  if (!saveId) return null;
  try {
    return await call<WorldView>(`/world/${saveId}`);
  } catch {
    return null;
  }
}

/** Do something to a suspect (strike, draw the revolver, offer money…). */
export async function act(suspectId: string, deed: Deed): Promise<ActResult> {
  if (!saveId) throw new BackendError('No active save — start a new game.', 'missing-save');
  return call<ActResult>('/act', { save_id: saveId, suspect_id: suspectId, deed });
}

/** Tell the house a clue was found (the killer's nerve reacts to the evidence). */
export async function noteClue(clueId: string): Promise<WorldView | null> {
  if (!saveId) return null;
  try {
    return await call<WorldView>('/clue', { save_id: saveId, clue_id: clueId });
  } catch {
    return null;
  }
}

/** How the case ends, given everything that happened today. */
export async function verdict(accused: string | null, evidence: string[]): Promise<Ending | null> {
  if (!saveId) return null;
  try {
    return await call<Ending>('/verdict', { save_id: saveId, accused, evidence });
  } catch {
    return null;
  }
}

/**
 * Move the game clock (walking, searching, standing about). `player` is the
 * detective's tile: the house needs to know who is watching. Returns the new
 * clock and the house as it now is, or null.
 */
export async function advance(
  minutes: number,
  player?: [number, number],
): Promise<{ clock_label: string; world: WorldView | null } | null> {
  if (!saveId) return null;
  try {
    return await call<{ clock_label: string; world: WorldView | null }>('/advance', {
      save_id: saveId,
      minutes,
      player,
    });
  } catch {
    return null; // time passing is never worth interrupting play for
  }
}
