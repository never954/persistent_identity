/*
 * roomScene.ts — composes one explorable room frame.
 * ---------------------------------------------------------------------------
 * drawRoom paints the themed walls + floor, every hotspot prop, the room's
 * ambient light and vignette, a highlight over the prop the player is near,
 * and the walking detective avatar. Everything is one 384×216 frame; the
 * React screen owns the player x, facing and motion and passes them in.
 */

import { PixelCanvas } from '../pixel/pixelRenderer';
import { damask, speckle } from '../pixel/textures';
import { CANDLE_RAMP } from '../pixel/palettes';
import { ROOM_LAYOUTS } from '../../game/case/roomLayouts';
import type { RoomId } from '../../game/types';
import { PROP_DRAWERS } from './props';

export interface PlayerState {
  x: number;
  facing: 1 | -1;
  moving: boolean;
}

export interface DrawRoomOpts {
  player: PlayerState;
  nearHotspotId: string | null;
  examinedIds: string[];
}

export function drawRoom(c: PixelCanvas, time: number, roomId: RoomId, opts: DrawRoomOpts): void {
  const layout = ROOM_LAYOUTS[roomId];
  const t = layout.theme;
  const w = c.width;
  const h = c.height;
  const floorY = layout.floorY;

  // ---- Walls ----
  c.fillGradient(0, 0, w, floorY, t.wall);
  damask(c, 0, 0, w, floorY, t.wallAccent, 16, 26);
  speckle(c, 0, 0, w, floorY, [8, 6, 8], 0.012, 36, roomId.length * 97);
  // Picture rail + baseboard.
  c.drawHLine(0, 24, w, t.wood[4][0], t.wood[4][1], t.wood[4][2], 120);
  c.fillDithered(0, floorY - 10, w, 10, t.wood[1], t.wood[2], 6);
  c.drawHLine(0, floorY - 10, w, t.wood[4][0], t.wood[4][1], t.wood[4][2]);

  // ---- Floor ----
  c.fillGradient(0, floorY, w, h - floorY, t.floor);
  // Floorboards receding toward the player.
  for (let i = 0; i < 7; i++) {
    const by = floorY + 4 + i * Math.floor((h - floorY) / 7);
    c.drawHLine(0, by, w, t.floor[0][0], t.floor[0][1], t.floor[0][2], 90);
  }
  for (let bx = 24; bx < w; bx += 48) {
    c.drawLine(bx, floorY, bx + (bx - w / 2) / 6, h, t.floor[0][0], t.floor[0][1], t.floor[0][2], 70);
  }
  speckle(c, 0, floorY, w, h - floorY, [10, 8, 6], 0.02, 40, 31);

  // ---- Props ----
  for (const hs of layout.hotspots) {
    const draw = PROP_DRAWERS[hs.kind];
    if (draw) draw(c, hs, t, time);
  }

  // ---- Ambient key light (warm candle / cool moon) ----
  c.applyLighting(w / 2, floorY - 40, w * 0.7, t.ambient[0], t.ambient[1], t.ambient[2], t.ambientStrength);

  // ---- Examined ticks + the "examine" highlight ----
  for (const hs of layout.hotspots) {
    if (hs.decor) continue;
    const cx = hs.standX ?? hs.x + hs.w / 2;
    const found = opts.examinedIds.includes(hs.id);
    if (found) {
      // A small amber tick floating over a searched prop.
      c.fillEllipse(cx, hs.y - 8, 2, 2, CANDLE_RAMP[6][0], CANDLE_RAMP[6][1], CANDLE_RAMP[6][2]);
    }
    if (opts.nearHotspotId === hs.id) {
      const bob = Math.round(Math.sin(time * 4) * 1);
      drawMarker(c, cx, hs.y - 14 + bob, found);
    }
  }

  // ---- Detective avatar ----
  drawDetective(c, opts.player.x, floorY + 24, opts.player.facing, opts.player.moving, time);

  // ---- Vignette ----
  c.applyVignette(w / 2, h / 2, Math.min(w, h) * 0.62, 0.5);
}

/** A floating chevron/magnifier marker over the nearest prop. */
function drawMarker(c: PixelCanvas, x: number, y: number, found: boolean): void {
  const col = found ? CANDLE_RAMP[5] : [236, 224, 196] as [number, number, number];
  // Little magnifier glyph.
  c.drawCircle(x, y, 3, col[0], col[1], col[2]);
  c.drawLine(x + 2, y + 2, x + 5, y + 5, col[0], col[1], col[2]);
  c.putPixel(x, y, col[0], col[1], col[2], 160);
}

/**
 * The detective avatar: a compact trench-coated figure with a fedora and a
 * two-frame walk. Feet sit at `baseY`; `facing` flips the silhouette.
 */
export function drawDetective(c: PixelCanvas, x: number, baseY: number, facing: 1 | -1, moving: boolean, time: number): void {
  const coat: [number, number, number] = [26, 24, 30];
  const coatHi: [number, number, number] = [46, 44, 52];
  const coatSh: [number, number, number] = [14, 12, 16];
  const skin: [number, number, number] = [150, 112, 90];
  const px = Math.round(x);
  const top = baseY - 34;

  // Contact shadow.
  c.fillEllipse(px, baseY + 1, 10, 3, 0, 0, 0, 120);

  // Legs (2-frame walk).
  const phase = moving ? Math.floor(time * 8) % 2 : 0;
  const legSpread = moving ? (phase === 0 ? 3 : 1) : 2;
  c.fillRect(px - legSpread - 1, baseY - 10, 3, 10, coatSh[0], coatSh[1], coatSh[2]);
  c.fillRect(px + legSpread - 1, baseY - 10, 3, 10, coatSh[0], coatSh[1], coatSh[2]);
  c.fillRect(px - legSpread - 1, baseY - 1, 4, 2, 10, 8, 8); // shoes
  c.fillRect(px + legSpread - 1, baseY - 1, 4, 2, 10, 8, 8);

  // Coat body (tapered).
  c.fillRect(px - 7, top + 10, 14, 16, coat[0], coat[1], coat[2]);
  c.fillRect(px - 6, top + 24, 12, 4, coat[0], coat[1], coat[2]);
  c.drawVLine(px - 7 + (facing > 0 ? 0 : 13), top + 10, 16, coatHi[0], coatHi[1], coatHi[2]); // lit edge
  c.drawVLine(px - 7 + (facing > 0 ? 13 : 0), top + 10, 16, coatSh[0], coatSh[1], coatSh[2]);
  c.fillRect(px - 3, top + 12, 6, 12, coatSh[0], coatSh[1], coatSh[2], 120); // coat seam

  // Shoulders + collar.
  c.fillRect(px - 8, top + 8, 16, 4, coatHi[0], coatHi[1], coatHi[2]);
  c.fillRect(px - 3, top + 7, 6, 3, coat[0], coat[1], coat[2]);

  // Head + fedora.
  c.fillEllipse(px, top + 4, 4, 4, skin[0], skin[1], skin[2]);
  c.putPixel(px + facing * 1, top + 4, 40, 28, 24); // eye hint
  c.fillRect(px - 5, top - 1, 10, 3, coatSh[0], coatSh[1], coatSh[2]); // brim
  c.fillRect(px - 3, top - 4, 6, 3, coat[0], coat[1], coat[2]);        // crown
  c.drawHLine(px - 3, top - 1, 6, coatHi[0], coatHi[1], coatHi[2]);    // hat band highlight

  // A faint warm rim where the room light catches the coat.
  c.drawVLine(px + facing * 7, top + 10, 14, 90, 70, 50, 70);
}
