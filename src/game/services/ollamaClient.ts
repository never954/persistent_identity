/*
 * ollamaClient.ts — the character's voice, served by a local model.
 * ---------------------------------------------------------------------------
 * Talks to a local Ollama server (qwen2.5-coder:3b) through the Vite dev proxy
 * at /ollama, so there is no CORS to fight in development. Responses are cached
 * per (system, user) so re-asking is instant and deterministic within a session.
 * Every call is defensive: on timeout, a non-OK status, or malformed JSON it
 * returns null and the service falls back to the authored line, so the game
 * never hangs or breaks when Ollama is not running.
 */

const BASE = '/ollama';
const MODEL = 'qwen2.5-coder:3b';
const cache = new Map<string, string>();

export interface ChatOpts { timeoutMs?: number; seed?: number; }

export async function chat(system: string, user: string, opts: ChatOpts = {}): Promise<string | null> {
  const key = `${MODEL}|${system}|${user}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 13000);
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0.7, seed: opts.seed ?? 7, num_predict: 170 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.message?.content ?? '';
    cache.set(key, text);
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the spoken line out of the model's JSON reply. */
export function extractAnswer(text: string | null): string | null {
  if (!text) return null;
  try {
    const slice = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const obj = JSON.parse(slice);
    const a = obj.answer ?? obj.reply ?? obj.response;
    return typeof a === 'string' && a.trim() ? a.trim() : null;
  } catch {
    return null;
  }
}

let availability: boolean | null = null;
/** Is a local Ollama reachable? Cached after the first probe. */
export async function ollamaAvailable(): Promise<boolean> {
  if (availability !== null) return availability;
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
    availability = res.ok;
  } catch {
    availability = false;
  }
  return availability;
}
