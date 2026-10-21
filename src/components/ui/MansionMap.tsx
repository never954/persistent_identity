/*
 * MansionMap — an interactive cutaway of the manor (a "dollhouse").
 * ------------------------------------------------------------------
 * Rooms live in a 2D map-space coordinate system (0..100, see caseData
 * ROOMS). A camera (translate + scale) pans by dragging and zooms by
 * wheel/buttons; clicking a room eases the camera to centre on it.
 * Each room is drawn as a small warm-lit interior; the suspects stand in
 * their rooms as the SAME procedural pixel busts (characters.ts) that the
 * interrogation scene rasterizes, so the whole game reads as one piece.
 *
 * CG story: rooms are an abstract coordinate space; the whole board is
 * that space pushed through an affine transform (pan = translation,
 * zoom = scale) — a window-to-viewport (viewing) transformation.
 */

import { useCallback, useRef, useState } from 'react';
import { ROOMS } from '../../game/case/caseData';
import { SUSPECTS_BY_ID } from '../../game/case/suspects';
import type { Room, RoomId } from '../../game/types';
import { PixelSprite } from '../pixel/PixelSprite';
import { BUSTS } from '../pixel/characters';
import './mansionMap.css';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.85;
const MAX_ZOOM = 2.4;

/** Which suspect is found in which room (their stated whereabouts). */
export const SUSPECT_ROOMS: Partial<Record<RoomId, string>> = {
  kitchen: 'agnes',
  library: 'julian',
  conservatory: 'vance',
  foyer: 'thomas',
  quarters: 'vivian',
};

export function MansionMap({
  selectedRoom,
  examinedRooms,
  onSelectRoom,
  onQuestionSuspect,
}: {
  selectedRoom: RoomId | null;
  examinedRooms: Set<RoomId>;
  onSelectRoom: (id: RoomId) => void;
  onQuestionSuspect: (suspectId: string) => void;
}) {
  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const moved = useRef(false);

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  const onWheel = useCallback((e: React.WheelEvent) => {
    setCam((c) => ({ ...c, zoom: clampZoom(c.zoom - e.deltaY * 0.0016) }));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, ox: cam.x, oy: cam.y };
    moved.current = false;
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
    setCam((c) => ({ ...c, x: drag.current!.ox + dx, y: drag.current!.oy + dy }));
  };

  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const focusRoom = (room: Room) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const zoom = 1.6;
    const rcx = ((room.x + room.w / 2) / 100) * rect.width;
    const rcy = ((room.y + room.h / 2) / 100) * rect.height;
    setCam({ zoom, x: rect.width / 2 - rcx * zoom, y: rect.height / 2 - rcy * zoom });
  };

  const reset = () => setCam({ x: 0, y: 0, zoom: 1 });

  return (
    <div className="map">
      <div
        ref={viewportRef}
        className={'map__viewport' + (dragging ? ' is-dragging' : '')}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className={'map__stage' + (dragging ? ' no-ease' : '')}
          style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}
        >
          <svg className="map__lines" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path
              d="M49 18 L49 46 M18 46 L82 46 M49 46 L49 72 M18 46 L18 72 M82 46 L54 72"
              stroke="rgba(120,96,64,0.35)"
              strokeWidth="0.6"
              fill="none"
              strokeDasharray="1.4 1.4"
            />
          </svg>

          {ROOMS.map((room) => {
            const examined = examinedRooms.has(room.id);
            const hasClues = room.clues.length > 0;
            const suspectId = SUSPECT_ROOMS[room.id];
            const suspect = suspectId ? SUSPECTS_BY_ID[suspectId] : null;
            return (
              <div
                key={room.id}
                className={
                  'room' +
                  (selectedRoom === room.id ? ' room--selected' : '') +
                  (examined ? ' room--examined' : '')
                }
                style={{
                  left: `${room.x}%`,
                  top: `${room.y}%`,
                  width: `${room.w}%`,
                  height: `${room.h}%`,
                }}
                onClick={() => {
                  if (moved.current) return;
                  onSelectRoom(room.id);
                  focusRoom(room);
                }}
              >
                <span className="room__floor" />
                {hasClues && !examined && <span className="room__candle" />}
                <span className="room__name">{room.name}</span>

                {hasClues && !examined && (
                  <span className="room__marker" title="Something to examine">✦</span>
                )}
                {examined && hasClues && (
                  <span className="room__marker room__marker--done">✓</span>
                )}

                {suspect && (
                  <button
                    type="button"
                    className="room__suspect"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuestionSuspect(suspect.id);
                    }}
                    aria-label={`Question ${suspect.name}`}
                  >
                    <PixelSprite
                      rows={BUSTS[suspect.id]?.rows ?? []}
                      palette={BUSTS[suspect.id]?.palette ?? {}}
                      scale={3}
                      className="room__fig"
                    />
                    <span className="room__suspect-name">{suspect.name.split(' ')[0]}</span>
                    <span className="room__suspect-cta">Question ▸</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="map__controls">
          <button className="map__ctrl" onClick={() => setCam((c) => ({ ...c, zoom: clampZoom(c.zoom + 0.3) }))} aria-label="Zoom in">+</button>
          <button className="map__ctrl" onClick={() => setCam((c) => ({ ...c, zoom: clampZoom(c.zoom - 0.3) }))} aria-label="Zoom out">−</button>
          <button className="map__ctrl" onClick={reset} aria-label="Reset view">⟳</button>
        </div>

        <p className="map__hint">drag to pan · scroll to zoom · click a room to search · click a person to question</p>
      </div>
    </div>
  );
}
