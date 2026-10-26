/*
 * ExploreRoomScreen — walk a manor room and search it for clues.
 * ---------------------------------------------------------------------------
 * The detective is a sprite you move left/right (←/→ or A/D). Approach a
 * prop and its magnifier marker lights; press E / Space to examine it. A
 * clue hotspot reveals an engine-owned clue (dispatched to the store and
 * recorded in the Case Book); a decor hotspot just prints flavour. If a
 * suspect waits in the room you can open the interrogation from here. The
 * frame is the same 384×216 software-rasterised canvas as everywhere else.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { PixelCanvas, PX_WIDTH, PX_HEIGHT } from '../components/pixel/pixelRenderer';
import { drawRoom, type PlayerState } from '../components/room/roomScene';
import { ROOM_LAYOUTS, type Hotspot } from '../game/case/roomLayouts';
import { ROOMS_BY_ID, CLUES_BY_ID } from '../game/case/caseData';
import { SUSPECTS_BY_ID } from '../game/case/suspects';
import { advance, noteClue, worldView } from '../game/services/session';
import type { RoomId } from '../game/types';
import './explore.css';

const REACH = 26;      // how close (px) you must stand to examine a prop
const SPEED = 78;      // px / second
// Searching takes time, and the suspects' memories age while it passes.
export const MINUTES_TO_ENTER = 8;
const MINUTES_TO_EXAMINE = 2;

interface Finding { label: string; text: string; isClue: boolean; }

/** What you find instead, when someone in the house tidied the evidence away. */
const LOST_TEXT: Record<string, string> = {
  'cold-teapot': 'The tea things have been washed and put away. Whatever the pot could have told you, Agnes has scrubbed it clean.',
  'gambling-papers': 'A gap behind the wine rack, and fresh scuffs in the dust. Something was hidden here — and someone has taken it.',
};

export function ExploreRoomScreen() {
  const { state, dispatch } = useGame();
  const roomId = (state.activeRoomId ?? 'study') as RoomId;
  const layout = ROOM_LAYOUTS[roomId];
  const room = ROOMS_BY_ID[roomId];
  // Who is here NOW: people keep their own day (backend world.py), so the room's
  // usual occupant may be at lunch, and others may have wandered in.
  const hereIds = state.world
    ? Object.entries(state.world.npcs)
        .filter(([, n]) => n.room === roomId && (n.status === 'present' || n.status === 'refusing'))
        .map(([id]) => id)
    : layout.suspectId ? [layout.suspectId] : [];
  const suspect = hereIds.length ? SUSPECTS_BY_ID[hereIds[0]] : null;
  const others = hereIds.slice(1).map((id) => SUSPECTS_BY_ID[id]);
  const lost = state.world?.lost_clues ?? [];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useRef<PlayerState>({ x: layout.spawnX, facing: 1, moving: false });
  const keys = useRef<Set<string>>(new Set());
  const nearRef = useRef<string | null>(null);
  const rafRef = useRef(0);
  const lastT = useRef(0);

  const [nearHotspot, setNearHotspot] = useState<Hotspot | null>(null);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [examinedLocal, setExaminedLocal] = useState<string[]>([]);

  // Which hotspots count as "searched": clue props once their clue is found,
  // flavour props once examined locally.
  const examinedIds = useMemo(() => {
    const ids = new Set(examinedLocal);
    for (const hs of layout.hotspots) {
      if (hs.clueId && state.cluesFound.includes(hs.clueId)) ids.add(hs.id);
    }
    return [...ids];
  }, [examinedLocal, state.cluesFound, layout.hotspots]);
  const examinedRef = useRef(examinedIds);
  examinedRef.current = examinedIds;

  // Walking in is charged by the hub's "Enter" click, not here: an effect would
  // fire twice under React StrictMode and double-charge the clock.
  const passTime = (minutes: number) =>
    advance(minutes, state.player ? [Math.floor(state.player[0]), Math.floor(state.player[1])] : undefined).then((r) => {
      if (!r) return;
      dispatch({ type: 'SET_CLOCK', clockLabel: r.clock_label });
      if (r.world) dispatch({ type: 'SET_WORLD', world: { ...r.world, clock_label: r.clock_label } });
    });

  const examine = () => {
    const id = nearRef.current;
    if (!id) return;
    const hs = layout.hotspots.find((h) => h.id === id);
    if (!hs || hs.decor) return;
    passTime(MINUTES_TO_EXAMINE);
    if (hs.clueId && lost.includes(hs.clueId) && !state.cluesFound.includes(hs.clueId)) {
      // Someone got to it first (off-screen life).
      setFinding({ label: hs.label, text: LOST_TEXT[hs.clueId] ?? 'Whatever was here is gone.', isClue: false });
    } else if (hs.clueId) {
      dispatch({ type: 'DISCOVER_CLUE', clueId: hs.clueId });
      // The house reacts to what you know (the killer's nerve, above all).
      noteClue(hs.clueId).then(() => worldView().then((w) => w && dispatch({ type: 'SET_WORLD', world: w })));
      const clue = CLUES_BY_ID[hs.clueId];
      setFinding({ label: clue.title, text: clue.detail, isClue: true });
    } else {
      setFinding({ label: hs.label, text: hs.flavor, isClue: false });
    }
    setExaminedLocal((prev) => (prev.includes(hs.id) ? prev : [...prev, hs.id]));
  };
  const examineRef = useRef(examine);
  examineRef.current = examine;

  // ---- Input ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'a', 'd', ' '].includes(k)) e.preventDefault();
      if (k === 'escape') { leave(); return; }
      if (k === 'e' || k === ' ' || k === 'enter') { examineRef.current(); return; }
      if (k === 'q' && suspect) { openInterrogation(); return; }
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspect]);

  // ---- Render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = PX_WIDTH;
    canvas.height = PX_HEIGHT;
    ctx.imageSmoothingEnabled = false;
    const px = new PixelCanvas();
    lastT.current = performance.now() / 1000;

    const frame = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - lastT.current);
      lastT.current = now;

      // Movement.
      const left = keys.current.has('arrowleft') || keys.current.has('a');
      const right = keys.current.has('arrowright') || keys.current.has('d');
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      const p = player.current;
      if (dir !== 0) {
        p.x = Math.max(layout.walkMinX, Math.min(layout.walkMaxX, p.x + dir * SPEED * dt));
        p.facing = dir as 1 | -1;
        p.moving = true;
      } else {
        p.moving = false;
      }

      // Nearest examinable prop.
      let near: Hotspot | null = null;
      let best = REACH;
      for (const hs of layout.hotspots) {
        if (hs.decor) continue;
        const sx = hs.standX ?? hs.x + hs.w / 2;
        const d = Math.abs(p.x - sx);
        if (d < best) { best = d; near = hs; }
      }
      if ((near?.id ?? null) !== nearRef.current) {
        nearRef.current = near?.id ?? null;
        setNearHotspot(near);
      }

      drawRoom(px, now, roomId, {
        player: p,
        nearHotspotId: nearRef.current,
        examinedIds: examinedRef.current,
      });
      px.flush(ctx);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const leave = () => dispatch({ type: 'SET_PHASE', phase: 'investigation' });
  const openInterrogation = () => {
    if (suspect) dispatch({ type: 'OPEN_INTERROGATION', suspectId: suspect.id });
  };

  const roomClues = room.clues;
  const foundHere = roomClues.filter((c) => state.cluesFound.includes(c)).length;

  return (
    <div className="explore screen-enter">
      <header className="explore__bar">
        <button className="btn" onClick={leave}>◂ Back</button>
        <div className="explore__title">
          <span className="eyebrow">{room.name}</span>
          <span className="explore__progress">
            {roomClues.length > 0 && `${foundHere}/${roomClues.length} clues found`}
            {roomClues.length > 0 && state.clockLabel && ' · '}
            {state.clockLabel}
          </span>
        </div>
        <div className="explore__bar-right">
          {suspect && (
            <button className="btn btn--accent" onClick={openInterrogation}>
              Question {suspect.name.split(' ')[0]} <kbd>Q</kbd>
            </button>
          )}
          {others.map((p) => (
            <button key={p.id} className="btn" onClick={() => dispatch({ type: 'OPEN_INTERROGATION', suspectId: p.id })}>
              Question {p.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </header>

      <div className="explore__stage">
        <canvas ref={canvasRef} className="explore__canvas" />

        {/* Examine prompt */}
        {nearHotspot && !finding && (
          <div className="explore__prompt">
            <kbd>E</kbd> Examine {nearHotspot.label}
          </div>
        )}

        {/* Suspect presence hint */}
        {suspect && (
          <div className="explore__who">
            {[suspect, ...others].map((p) => p.name).join(', ')} {others.length ? 'are' : 'is'} here.
          </div>
        )}
      </div>

      {/* Finding popup */}
      {finding && (
        <div className="explore__finding" onClick={() => setFinding(null)}>
          <div className="finding-card" onClick={(e) => e.stopPropagation()}>
            <span className={'finding-card__tag' + (finding.isClue ? ' is-clue' : '')}>
              {finding.isClue ? 'Clue found' : 'You observe'}
            </span>
            <h3 className="finding-card__title">{finding.label}</h3>
            <p className="finding-card__text">{finding.text}</p>
            {finding.isClue && <p className="finding-card__note">Added to your Case Book.</p>}
            <button className="btn btn--accent" onClick={() => setFinding(null)}>Continue</button>
          </div>
        </div>
      )}

      <footer className="explore__hint">
        <span><kbd>←</kbd><kbd>→</kbd> move</span>
        <span><kbd>E</kbd> examine</span>
        {suspect && <span><kbd>Q</kbd> question</span>}
        <span><kbd>Esc</kbd> back to the house</span>
      </footer>
    </div>
  );
}
