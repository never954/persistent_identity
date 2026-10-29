/*
 * ManorScreen — walk the manor while the household lives around you.
 * ------------------------------------------------------------------
 * The detective walks (WASD / arrows) through rooms, corridors and the Great
 * Hall. Time runs while you walk: one game minute every STEP_MS, sent to the
 * suspects' server with your position, which moves everyone else tile by tile
 * along their own day (backend world.py) and returns where they went. Each
 * suspect is then animated along that exact trail.
 *
 * You see only who is in the room with you, or near enough to see through a
 * doorway. So you can watch Miss Cross walk down the corridor after Thomas —
 * and if you are standing there, she will not do it. Press E beside someone to
 * question them, or at a glint to search the room.
 */

import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { PixelCanvas, PX_WIDTH, PX_HEIGHT } from '../components/pixel/pixelRenderer';
import { camera, drawManor, sees, type Figure, type ManorFrame } from '../components/manor/manorScene';
import { AREA_BY_ID, AREAS, PLAYER_START, TILE, areaAt, walkable } from '../game/case/manor';
import { NotebookPanel } from '../components/ui/NotebookPanel';
import { CASE_META, CLUES_BY_ID, ROOMS_BY_ID } from '../game/case/caseData';
import { SUSPECTS_BY_ID } from '../game/case/suspects';
import { advance, worldView } from '../game/services/session';
import { MINUTES_TO_ENTER } from './ExploreRoomScreen';
import type { RoomId } from '../game/types';
import './hub.css';
import './manor.css';

/** Real milliseconds per game minute while you walk about. */
const STEP_MS = 2500;
/** Tiles per second the detective walks. */
const SPEED = 5;
const REACH = 1.7;

interface Overlay {
  labels: { id: string; name: string; doing: string; say: string | null; left: number; top: number; dead: boolean }[];
  prompt: string | null;
  here: string;
}

function shortName(id: string): string {
  return id === 'vance' ? 'Dr. Vance' : id === 'vivian' ? 'Miss Cross' : SUSPECTS_BY_ID[id].name.split(' ')[0];
}

export function ManorScreen() {
  const { state, dispatch } = useGame();
  const world = state.world;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const start = state.player ?? [PLAYER_START[0] + 0.5, PLAYER_START[1] + 0.5];
  const player = useRef({ x: start[0], y: start[1], facing: 1 as 1 | -1, walking: false });
  const lastArea = useRef(areaAt(start[0], start[1]) ?? 'foyer');
  const keys = useRef(new Set<string>());
  const anim = useRef<Record<string, { trail: number[][]; t0: number }>>({});
  const lastMinute = useRef<number | null>(null);
  const worldRef = useRef(world);
  worldRef.current = world;
  const stateRef = useRef(state);
  stateRef.current = state;
  const [overlay, setOverlay] = useState<Overlay>({ labels: [], prompt: null, here: lastArea.current });
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [showDay, setShowDay] = useState(false);
  const interactRef = useRef<() => void>(() => {});

  // Each world update carries every suspect's walk since the last one: animate along it.
  useEffect(() => {
    if (!world) return;
    if (world.minute === lastMinute.current) return;
    lastMinute.current = world.minute;
    const now = performance.now();
    for (const [id, n] of Object.entries(world.npcs)) {
      const trail = n.trail && n.trail.length ? n.trail : [n.pos];
      anim.current[id] = { trail, t0: now };
    }
  }, [world]);

  // Time runs while you are on your feet.
  useEffect(() => {
    let busy = false;
    const pull = () => worldView().then((w) => w && dispatch({ type: 'SET_WORLD', world: w }));
    pull();
    const id = window.setInterval(async () => {
      if (busy || document.hidden || notebookOpen) return;
      busy = true;
      const p = player.current;
      const r = await advance(1, [Math.floor(p.x), Math.floor(p.y)]);
      if (r) {
        dispatch({ type: 'SET_CLOCK', clockLabel: r.clock_label });
        if (r.world) dispatch({ type: 'SET_WORLD', world: { ...r.world, clock_label: r.clock_label } });
      }
      dispatch({ type: 'SET_PLAYER', player: [p.x, p.y] });
      busy = false;
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [dispatch, notebookOpen]);

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
      if (k === 'e' || k === 'enter' || k === ' ') { interactRef.current(); return; }
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Where each suspect is right now, along their trail.
  const figures = (now: number): Figure[] => {
    const w = worldRef.current;
    if (!w) return [];
    return Object.entries(w.npcs)
      .filter(([, n]) => n.status !== 'fled')
      .map(([id, n]) => {
        const a = anim.current[id];
        let x = n.pos[0];
        let y = n.pos[1];
        let moving = false;
        if (a && a.trail.length > 1) {
          // A frame's timestamp can be a moment older than the update that started this walk:
          // clamp, or k goes negative and trail[-1] does not exist (the screen went blank).
          const k = Math.max(0, Math.min(1, (now - a.t0) / STEP_MS)) * (a.trail.length - 1);
          const i = Math.max(0, Math.min(a.trail.length - 2, Math.floor(k)));
          const f = k - i;
          x = a.trail[i][0] + (a.trail[i + 1][0] - a.trail[i][0]) * f;
          y = a.trail[i][1] + (a.trail[i + 1][1] - a.trail[i][1]) * f;
          moving = k < a.trail.length - 1;
        }
        return { id, x, y, moving, dead: n.status === 'dead', dancing: n.doing === 'dancing' };
      });
  };

  // Render + movement loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = PX_WIDTH;
    canvas.height = PX_HEIGHT;
    ctx.imageSmoothingEnabled = false;
    const pc = new PixelCanvas();
    let raf = 0;
    let last = performance.now();
    let lastOverlay = 0;

    const frame = (now: number) => {
      try {
        step(now);
      } catch (err) {
        // One bad frame must never stop the house being drawn.
        // eslint-disable-next-line no-console
        console.error(err);
      }
      raf = requestAnimationFrame(frame);
    };

    const step = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const p = player.current;
      const k = keys.current;
      const dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      const dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
      p.walking = dx !== 0 || dy !== 0;
      if (p.walking) {
        const len = Math.hypot(dx, dy);
        const nx = p.x + (dx / len) * SPEED * dt;
        const ny = p.y + (dy / len) * SPEED * dt;
        const r = 0.28; // the detective's footprint
        const free = (x: number, y: number) =>
          walkable(x - r, y - r) && walkable(x + r, y - r) && walkable(x - r, y + r) && walkable(x + r, y + r);
        if (free(nx, p.y)) p.x = nx;
        else if (dx && !dy) {
          // Slide into a doorway: nudge toward the centre of the nearest open row.
          const cy = Math.floor(p.y) + 0.5;
          for (const ty of [cy, cy - 1, cy + 1]) {
            if (free(nx, ty)) { p.y += Math.sign(ty - p.y) * Math.min(Math.abs(ty - p.y), SPEED * dt); break; }
          }
        }
        if (free(p.x, ny)) p.y = ny;
        else if (dy && !dx) {
          const cx = Math.floor(p.x) + 0.5;
          for (const tx of [cx, cx - 1, cx + 1]) {
            if (free(tx, ny)) { p.x += Math.sign(tx - p.x) * Math.min(Math.abs(tx - p.x), SPEED * dt); break; }
          }
        }
        if (dx) p.facing = dx > 0 ? 1 : -1;
      }
      const a = areaAt(p.x, p.y);
      if (a && a !== 'door') lastArea.current = a;

      const w = worldRef.current;
      const figs = figures(now);
      const sparkles: [number, number][] = AREAS.filter((ar) => {
        if (!ar.search || !ar.searchAt) return false;
        const room = ROOMS_BY_ID[ar.search as RoomId];
        const found = stateRef.current.cluesFound;
        const lost = w?.lost_clues ?? [];
        return room.clues.some((c) => !found.includes(c) && !lost.includes(c));
      }).map((ar) => ar.searchAt!);
      const f: ManorFrame = { px: p.x, py: p.y, facing: p.facing, walking: p.walking, here: lastArea.current, figures: figs, sparkles };
      drawManor(pc, now / 1000, f);
      pc.flush(ctx);

      // DOM overlay (names, what they're doing, speech) ~12 times a second.
      if (now - lastOverlay > 80) {
        lastOverlay = now;
        const [camX, camY] = camera(p.x, p.y);
        const labels: Overlay['labels'] = [];
        let nearest: { kind: 'npc' | 'body' | 'search'; id: string; d: number } | null = null;
        for (const fg of figs) {
          if (!sees(f, fg.x + 0.5, fg.y + 0.5)) continue;
          const n = w!.npcs[fg.id];
          labels.push({
            id: fg.id,
            name: shortName(fg.id),
            doing: fg.dead ? '' : n.status === 'refusing' ? `won't speak to you until ${n.until}` : n.doing,
            say: fg.dead ? null : n.say,
            left: (((fg.x + 0.5) * TILE - camX) / PX_WIDTH) * 100,
            top: (((fg.y + 0.5) * TILE - camY - 17) / PX_HEIGHT) * 100,
            dead: !!fg.dead,
          });
          const d = Math.hypot(fg.x + 0.5 - p.x, fg.y + 0.5 - p.y);
          if (d < REACH && (!nearest || d < nearest.d)) nearest = { kind: fg.dead ? 'body' : 'npc', id: fg.id, d };
        }
        for (const ar of AREAS) {
          if (!ar.searchAt) continue;
          const d = Math.hypot(ar.searchAt[0] + 0.5 - p.x, ar.searchAt[1] + 0.5 - p.y);
          if (d < REACH && (!nearest || d < nearest.d)) nearest = { kind: 'search', id: ar.id, d };
        }
        const prompt = !nearest
          ? null
          : nearest.kind === 'npc'
            ? `E — Question ${SUSPECTS_BY_ID[nearest.id].name}`
            : nearest.kind === 'body'
              ? `E — Look at the body`
              : `E — Search ${AREA_BY_ID[nearest.id].name}`;
        interactRef.current = () => {
          if (!nearest) return;
          dispatch({ type: 'SET_PLAYER', player: [p.x, p.y] });
          if (nearest.kind === 'npc') {
            dispatch({ type: 'OPEN_INTERROGATION', suspectId: nearest.id });
          } else if (nearest.kind === 'body') {
            dispatch({
              type: 'TOAST',
              kind: 'alert',
              texts: [`${SUSPECTS_BY_ID[nearest.id].name} lies where he fell. Someone wanted him silent.`],
            });
          } else {
            const room = AREA_BY_ID[nearest.id].search as RoomId;
            dispatch({ type: 'ENTER_ROOM', roomId: room });
            dispatch({ type: 'SET_PHASE', phase: 'explore' });
            advance(MINUTES_TO_ENTER, [Math.floor(p.x), Math.floor(p.y)]).then((r) => {
              if (r) dispatch({ type: 'SET_CLOCK', clockLabel: r.clock_label });
              if (r?.world) dispatch({ type: 'SET_WORLD', world: { ...r.world, clock_label: r.clock_label } });
            });
          }
        };
        // People standing together: stack their labels instead of printing one over the other.
        labels.sort((a, b) => a.top - b.top || a.left - b.left);
        for (let i = 1; i < labels.length; i++) {
          for (let j = 0; j < i; j++) {
            if (Math.abs(labels[i].left - labels[j].left) < 9 && Math.abs(labels[i].top - labels[j].top) < 6) {
              labels[i].top = labels[j].top - 6;
            }
          }
        }
        setOverlay({ labels, prompt, here: lastArea.current });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalClues = Object.keys(CLUES_BY_ID).length;
  const hereName = AREA_BY_ID[overlay.here]?.name ?? '';

  return (
    <div className="hub manor screen-enter">
      <header className="hub__bar">
        <div className="hub__bar-left">
          <span className="eyebrow">{CASE_META.title} · {hereName}</span>
          <span className="hub__meta">
            {state.clockLabel}
            {world && ` · the Chief Constable arrives at ${world.deadline_label}`}
          </span>
        </div>
        <div className="hub__bar-right">
          <span className="hub__stat"><b>{state.cluesFound.length}</b>/{totalClues} clues</span>
          {world && (
            <span className="hub__stat" title="How the household sees your methods">
              Reputation <b>{world.honour > 0 ? '+' : ''}{world.honour}</b>
            </span>
          )}
          <button className="btn" onClick={() => setShowDay((v) => !v)}>
            The day so far{world && world.events.length > 0 && ` (${world.events.length})`}
          </button>
          <button className="btn" onClick={() => setNotebookOpen(true)}>Case Book</button>
          <button className="btn btn--danger" onClick={() => dispatch({ type: 'SET_PHASE', phase: 'accusation' })}>
            Accuse
          </button>
        </div>
      </header>

      <div className="manor__stage">
        <div className="manor__frame">
          <canvas ref={canvasRef} className="manor__canvas" />
          {overlay.labels.map((l) => (
            <div key={l.id} className={'manor__label' + (l.dead ? ' is-dead' : '')} style={{ left: `${l.left}%`, top: `${l.top}%` }}>
              {l.say && <span className="manor__say">{l.say}</span>}
              <span className="manor__name">{l.dead ? `${l.name} (dead)` : l.name}</span>
              {l.doing && <span className="manor__doing">{l.doing}</span>}
            </div>
          ))}
          {overlay.prompt && <div className="manor__prompt">{overlay.prompt}</div>}
        </div>
        <p className="manor__hint">
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>E</kbd> question / search · time passes as you walk ·
          you only see who is in the room with you
        </p>

        {showDay && (
          <div className="day-log">
            <button className="room-detail__x" onClick={() => setShowDay(false)} aria-label="Close">✕</button>
            <h3 className="room-detail__name">The day so far</h3>
            {!world || world.events.length === 0 ? (
              <p className="room-detail__none">Nothing out of the ordinary — yet. The household goes about its day.</p>
            ) : (
              <ol className="day-log__list">
                {[...world.events].reverse().map((e, i) => (
                  <li key={i} className={`day-log__item is-${e.kind}`}>{e.text}</li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      <NotebookPanel open={notebookOpen} onClose={() => setNotebookOpen(false)} />
    </div>
  );
}
