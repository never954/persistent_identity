/*
 * serviceProvider — the one place the app chooses which SuspectService is live.
 *
 * The suspects are answered by the Python backend (backend/, `npm run server`):
 * persistent memory per suspect, fallible recall, an LLM voice. There is no
 * offline imitation: if the server is down, the game says so and how to start it.
 */

import type { SuspectService } from '../types';
import { backendSuspectService } from './backendSuspectService';

export const suspectService: SuspectService = backendSuspectService;
