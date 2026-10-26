/*
 * play.mjs — one command for the whole game:  npm run play
 * ---------------------------------------------------------------------------
 * The game needs two processes running AT THE SAME TIME: the suspects' memory
 * server (Python, port 8000) and the game itself (Vite, port 5173). This starts
 * both, prefixes their output, reuses a suspect server that is already running,
 * checks Ollama, prints the one address to open, and stops everything on Ctrl+C.
 */

import { spawn } from 'node:child_process';

const SERVER_HEALTH = 'http://127.0.0.1:8000/api/health';
const OLLAMA_TAGS = 'http://localhost:11434/api/tags';
const children = [];

const paint = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const say = (msg) => console.log(paint('1;33', '[play] ') + msg);

async function up(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

function start(name, script, color, onLine) {
  const child = spawn('npm', ['run', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        console.log(paint(color, `[${name}] `) + line);
        onLine?.(stripAnsi(line));
      }
    });
  }
  child.on('exit', (code) => {
    say(`${name} stopped${code ? ` (exit ${code})` : ''} — shutting everything down.`);
    stopAll(code ?? 0);
  });
  children.push(child);
  return child;
}

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGINT');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

if (!(await up(OLLAMA_TAGS))) {
  say(paint('31', 'Ollama is not running.') + ' The suspects need it — open the Ollama app (or run `ollama serve`), then try again.');
  process.exit(1);
}

if (await up(SERVER_HEALTH)) {
  say('A suspect server is already running on port 8000 — reusing it.');
} else {
  start('suspects', 'server', '35');
}

let gameUrl = null;
start('game', 'dev', '36', (line) => {
  const m = line.match(/Local:\s+(http\S+)/);
  if (m) gameUrl = m[1];
});

// Announce the address once both halves are actually up.
for (let i = 0; i < 120 && !stopping; i++) {
  if (gameUrl && (await up(SERVER_HEALTH))) {
    say(paint('1;32', `Ready — open ${gameUrl} in your browser.`) + '  (Port 8000 is the suspects’ API, not the game.)  Ctrl+C stops both.');
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}
