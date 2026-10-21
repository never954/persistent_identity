/*
 * serviceProvider — the one place the app chooses which SuspectService
 * implementation is live. Swapping the scripted mock for the real
 * memory-backed service is a one-line change here.
 */

import type { SuspectService } from '../types';
import { memorySuspectService } from './memorySuspectService';

// The live service. memorySuspectService runs the fallible-memory layer and a
// local LLM (Ollama) for the suspect's voice; when Ollama is not running it
// falls back to each belief's authored line, so the game always plays.
// The scripted keyword service is still available for a pure-offline build:
//   import { scriptedSuspectService } from './scriptedSuspectService';
export const suspectService: SuspectService = memorySuspectService;
