/*
 * manor.ts — Ravenswood Manor as a place you can walk around.
 * ------------------------------------------------------------------
 * The floor plan (manor.json) is shared with the suspects' server
 * (backend/ravenswood/manor.py), so the tile the server says Thomas is
 * standing on is the tile drawn here. Everything not inside an area, a
 * door or the front door is wall.
 */

import plan from './manor.json';
import type { RoomId } from '../types';

export const TILE = 8; // pixels per tile in the 384×216 frame buffer
export const MAP_W: number = plan.width;
export const MAP_H: number = plan.height;

export interface Prop {
  type: string;
  rect: [number, number, number, number];
}

export interface Area {
  id: string;
  name: string;
  kind: 'room' | 'bedroom' | 'corridor' | 'hall';
  rect: [number, number, number, number];
  search?: RoomId;
  floor: string;
  owner?: string;
  props: Prop[];
  searchAt?: [number, number];
}

export const AREAS = plan.areas as unknown as Area[];
export const AREA_BY_ID: Record<string, Area> = Object.fromEntries(AREAS.map((a) => [a.id, a]));
export const EXIT = plan.exit as [number, number];
export const PLAYER_START = plan.playerStart as [number, number];

/** Area id per tile ('door' for doorways); undefined = wall. */
const areaGrid: (string | undefined)[] = new Array(MAP_W * MAP_H);
/** Furniture you cannot walk through (rugs excepted). */
const blocked = new Uint8Array(MAP_W * MAP_H);
/** The prop occupying a tile, for drawing. */
export const propAt: (Prop | undefined)[] = new Array(MAP_W * MAP_H);

for (const a of AREAS) {
  const [x0, y0, w, h] = a.rect;
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) areaGrid[y * MAP_W + x] = a.id;
  for (const p of a.props) {
    const [px, py, pw, ph] = p.rect;
    for (let x = px; x < px + pw; x++)
      for (let y = py; y < py + ph; y++) {
        propAt[y * MAP_W + x] = p;
        if (p.type !== 'rug') blocked[y * MAP_W + x] = 1;
      }
  }
}
for (const [x, y] of plan.doors as [number, number][]) areaGrid[y * MAP_W + x] = 'door';
areaGrid[EXIT[1] * MAP_W + EXIT[0]] = 'door';

export function areaAt(x: number, y: number): string | undefined {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return undefined;
  return areaGrid[ty * MAP_W + tx];
}

export function walkable(x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  return areaGrid[ty * MAP_W + tx] !== undefined && !blocked[ty * MAP_W + tx];
}

export function isDoor(x: number, y: number): boolean {
  return areaAt(x, y) === 'door';
}
