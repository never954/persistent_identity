/*
 * interrogationScene.ts — the interrogation room, drawn with the software
 * rasterizer (pixelRenderer) instead of CSS/DOM.
 * ------------------------------------------------------------------
 * Same engine and pattern as the cutscene: everything below is rasterized
 * into a 384×216 ImageData frame buffer with our own primitives — filled
 * rectangles/ellipses (scan conversion), sprite blitting through a
 * palette, radial additive lighting with quadratic falloff, and a
 * vignette — then flushed to a <canvas> scaled up with nearest-neighbour.
 *
 * This is the interactive scene rendered as real computer graphics, so it
 * maps onto the same syllabus topics as the cutscene (raster scan, scan
 * conversion, colour models, lighting) rather than being DOM/CSS layout.
 */

import { PixelCanvas, type Color } from '../pixel/pixelRenderer';
import { BUSTS } from '../pixel/characters';
import {
  WALLPAPER_RAMP,
  WOOD_DARK_RAMP,
  WOOD_LIGHT_RAMP,
  GLASS_DARK_RAMP,
  BRASS_RAMP,
  CANDLE_RAMP,
  WARM_GLOW_RAMP,
  IRON_RAMP,
  TRENCHCOAT_RAMP,
  RAIN_COL,
  PARCHMENT_COL,
  MARBLE_RAMP,
} from '../pixel/palettes';

export interface RoomOpts {
  suspectId: string;
  speaking: boolean;
  /** 0..100 — fear makes them tremble, anger flushes them red (backend world.py). */
  fear?: number;
  anger?: number;
  /** The detective's revolver is out and pointed at them. */
  gun?: boolean;
  /** They walked out or fled: an empty chair. */
  absent?: boolean;
  dead?: boolean;
  /** Muzzle flash this frame. */
  flash?: boolean;
}

/** Convert a bust's hex palette to the RGB-tuple palette blitSprite wants. */
const paletteCache: Record<string, Record<string, Color | null>> = {};
function colorPalette(id: string): Record<string, Color | null> {
  if (paletteCache[id]) return paletteCache[id];
  const src = BUSTS[id]?.palette ?? {};
  const out: Record<string, Color | null> = {};
  for (const k of Object.keys(src)) {
    const hex = src[k];
    out[k] = hex ? hexToRgb(hex) : null;
  }
  paletteCache[id] = out;
  return out;
}
function hexToRgb(hex: string): Color {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Blit a sprite scaled by an integer factor (each cell → s×s block). */
function blitScaled(
  c: PixelCanvas,
  rows: string[],
  pal: Record<string, Color | null>,
  x: number,
  y: number,
  s: number,
): void {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let col = 0; col < row.length; col++) {
      const p = pal[row[col]];
      if (p) c.fillRect(x + col * s, y + r * s, s, s, p[0], p[1], p[2]);
    }
  }
}

export function drawInterrogationRoom(
  c: PixelCanvas,
  time: number,
  opts: RoomOpts,
): void {
  const w = c.width;
  const h = c.height;
  const deskTop = 150;

  // ---- Walls (cool ambient) + wallpaper texture --------------------
  c.clear(16, 18, 26);
  c.fillGradient(0, 0, w, deskTop, WALLPAPER_RAMP);
  // darken the whole wall so the lamp reads warm against shadow
  c.fillRect(0, 0, w, deskTop, 6, 8, 14, 150);
  // dado rail
  c.drawHLine(0, deskTop - 10, w, WOOD_DARK_RAMP[4][0], WOOD_DARK_RAMP[4][1], WOOD_DARK_RAMP[4][2]);

  // ---- Moonlit window (left) with rain -----------------------------
  const wx = 20;
  const wy = 26;
  const wW = 66;
  const wH = 92;
  c.fillGradient(wx, wy, wW, wH, GLASS_DARK_RAMP);
  // distant lightning-lit rooftops
  c.fillRect(wx + 6, wy + wH - 20, 54, 20, 12, 20, 34);
  c.strokeRect(wx - 3, wy - 3, wW + 6, wH + 6, 10, 8, 7);
  c.drawVLine(wx + wW / 2, wy, wH, 10, 8, 7); // mullion
  c.drawHLine(wx, wy + wH / 2, wW, 10, 8, 7);
  // rain streaks inside the window
  for (let i = 0; i < 26; i++) {
    const speed = 90 + (i % 5) * 22;
    const rx = wx + ((i * 37) % (wW - 2)) + 1;
    const ry = wy + ((time * speed + i * 40) % wH);
    for (let k = 0; k < 4; k++) {
      c.putPixel(Math.round(rx - k), Math.round(ry - k * 3), RAIN_COL[0], RAIN_COL[1], RAIN_COL[2], 150);
    }
  }

  // ---- Bookshelf (right, in shadow) --------------------------------
  const sx = 300;
  c.fillDithered(sx, 60, 66, 88, WOOD_DARK_RAMP[2], WOOD_DARK_RAMP[3], 6);
  c.strokeRect(sx, 60, 66, 88, WOOD_DARK_RAMP[5][0], WOOD_DARK_RAMP[5][1], WOOD_DARK_RAMP[5][2]);
  for (let shelf = 0; shelf < 4; shelf++) {
    const sy = 74 + shelf * 20;
    c.drawHLine(sx + 2, sy, 62, WOOD_DARK_RAMP[5][0], WOOD_DARK_RAMP[5][1], WOOD_DARK_RAMP[5][2]);
    for (let bk = 0; bk < 9; bk++) {
      const bx = sx + 4 + bk * 7;
      const bh = 12 + ((bk * 5 + shelf) % 5);
      const shade = IRON_RAMP[2 + (bk % 3)];
      c.fillRect(bx, sy - bh, 5, bh, shade[0], shade[1], shade[2]);
    }
  }

  // ---- Crooked portraits on the back wall --------------------------
  drawPortrait(c, 120, 30, 20, 26);
  drawPortrait(c, 250, 26, 18, 24);

  // ---- Wall sconce with flickering flame ---------------------------
  const scx = 200;
  const scy = 44;
  c.fillRect(scx - 1, scy, 3, 12, BRASS_RAMP[4][0], BRASS_RAMP[4][1], BRASS_RAMP[4][2]);
  const scFlick = 0.7 + Math.sin(time * 13) * 0.3;
  c.putPixel(scx, scy - 2, CANDLE_RAMP[7][0], CANDLE_RAMP[7][1], CANDLE_RAMP[7][2]);
  c.putPixel(scx, scy - 3, CANDLE_RAMP[6][0], CANDLE_RAMP[6][1], CANDLE_RAMP[6][2]);
  c.applyLighting(scx, scy, 46, WARM_GLOW_RAMP[4][0], WARM_GLOW_RAMP[4][1], WARM_GLOW_RAMP[4][2], 0.3 * scFlick);

  // ---- Floorboards -------------------------------------------------
  c.fillGradient(0, deskTop, w, h - deskTop, WOOD_DARK_RAMP.slice(1, 5));

  // ---- Suspect (scaled sprite blit), seated behind the desk --------
  const bust = BUSTS[opts.suspectId] ?? BUSTS.vivian;
  const blink = time % 4 < 0.13;
  const mouthOpen = opts.speaking && Math.floor(time * 6) % 2 === 0;
  const s = 3;
  const spriteW = 26 * s;
  const suspX0 = Math.round(w / 2 - spriteW / 2) + 30;
  if (opts.absent && !opts.dead) {
    // An empty chair: they walked out (or ran).
    const cx = suspX0 + 20;
    c.fillRect(cx, deskTop - 58, 38, 58, WOOD_DARK_RAMP[2][0], WOOD_DARK_RAMP[2][1], WOOD_DARK_RAMP[2][2]);
    c.strokeRect(cx, deskTop - 58, 38, 58, WOOD_DARK_RAMP[5][0], WOOD_DARK_RAMP[5][1], WOOD_DARK_RAMP[5][2]);
    c.fillRect(cx + 6, deskTop - 50, 26, 30, WOOD_DARK_RAMP[3][0], WOOD_DARK_RAMP[3][1], WOOD_DARK_RAMP[3][2]);
  } else {
    const frame = opts.dead ? bust.blinkRows : mouthOpen ? bust.talkRows : blink ? bust.blinkRows : bust.rows;
    const fear = opts.fear ?? 0;
    // Fear shows as a tremble; the worse it is, the more they shake.
    const tremble = !opts.dead && fear >= 55 ? Math.round(Math.sin(time * 40) * (fear >= 80 ? 2 : 1)) : 0;
    const bob = opts.dead ? 0 : Math.round(Math.sin(time * 1.4) * 2);
    const lean = opts.speaking ? Math.round(Math.sin(time * 3) * 2) - 3 : 0;
    const cower = !opts.dead && (opts.gun || fear >= 80) ? 6 : 0; // shrinking back from the gun
    const slump = opts.dead ? 34 : 0;
    const suspX = suspX0 + tremble;
    const suspY = deskTop - 32 * s + 14 + bob + lean + cower + slump;
    blitScaled(c, frame, colorPalette(opts.suspectId), suspX, suspY, s);
    // Anger flushes the face.
    const anger = opts.anger ?? 0;
    if (anger >= 25 && !opts.dead) {
      c.applyLighting(suspX + spriteW / 2, suspY + 30, 26, 220, 40, 30, Math.min(0.5, anger / 160));
    }
    if (opts.dead) {
      c.applyLighting(suspX + spriteW / 2, deskTop - 4, 40, 120, 10, 10, 0.6);
    }
  }

  // ---- Desk (foreground table) -------------------------------------
  c.fillGradient(0, deskTop, w, 22, WOOD_LIGHT_RAMP.slice(2, 5));
  c.fillDithered(0, deskTop + 22, w, h - deskTop - 22, WOOD_DARK_RAMP[3], WOOD_DARK_RAMP[4], 7);
  c.drawHLine(0, deskTop, w, WOOD_LIGHT_RAMP[5][0], WOOD_LIGHT_RAMP[5][1], WOOD_LIGHT_RAMP[5][2]);

  // scattered case papers + teacup with steam
  c.fillRect(230, deskTop + 6, 22, 15, PARCHMENT_COL[0], PARCHMENT_COL[1], PARCHMENT_COL[2]);
  c.fillRect(236, deskTop + 3, 22, 15, MARBLE_RAMP[5][0], MARBLE_RAMP[5][1], MARBLE_RAMP[5][2]);
  const cupX = 268;
  const cupY = deskTop + 4;
  c.fillRect(cupX, cupY, 12, 9, PARCHMENT_COL[0], PARCHMENT_COL[1], PARCHMENT_COL[2]);
  c.strokeRect(cupX, cupY, 12, 9, WOOD_DARK_RAMP[5][0], WOOD_DARK_RAMP[5][1], WOOD_DARK_RAMP[5][2]);
  for (let i = 0; i < 3; i++) {
    const sy = (time * 16 + i * 9) % 26;
    const swx = cupX + 6 + Math.round(Math.sin(time * 2 + i) * 3);
    c.putPixel(swx, cupY - Math.round(sy), 220, 216, 206, Math.max(0, 120 - sy * 4));
  }

  // ---- The banker's lamp -------------------------------------------
  const lx = 120;
  const lampBaseY = deskTop + 2;
  c.fillRect(lx - 2, lampBaseY, 20, 5, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]); // base
  c.fillRect(lx + 6, lampBaseY - 22, 4, 22, IRON_RAMP[2][0], IRON_RAMP[2][1], IRON_RAMP[2][2]); // stem
  c.fillEllipse(lx + 8, lampBaseY - 26, 15, 7, BRASS_RAMP[4][0], BRASS_RAMP[4][1], BRASS_RAMP[4][2]); // shade
  c.fillEllipse(lx + 8, lampBaseY - 20, 12, 4, CANDLE_RAMP[7][0], CANDLE_RAMP[7][1], CANDLE_RAMP[7][2]); // glow under shade

  // ---- Detective silhouette (foreground, back to us) ---------------
  const dcx = 78;
  // coat / shoulders
  c.fillEllipse(dcx, h + 6, 62, 60, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  // head
  c.fillEllipse(dcx, deskTop - 6, 20, 22, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  // fedora
  c.fillRect(dcx - 18, deskTop - 26, 36, 10, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  c.fillRect(dcx - 30, deskTop - 18, 60, 5, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  // warm rim light on the lamp-facing edge
  c.drawVLine(dcx + 20, deskTop - 6, 40, TRENCHCOAT_RAMP[2][0], TRENCHCOAT_RAMP[2][1], TRENCHCOAT_RAMP[2][2]);

  // ---- The revolver, levelled at the suspect -----------------------
  if (opts.gun || opts.flash) {
    const gx = dcx + 20;
    const gy = deskTop - 14;
    // Lit by the lamp, so brighter than the silhouette holding it.
    c.fillRect(gx, gy, 9, 6, 92, 92, 102);           // cylinder
    c.fillRect(gx + 9, gy + 1, 16, 3, 120, 120, 130); // barrel
    c.fillRect(gx - 3, gy + 5, 5, 8, WOOD_DARK_RAMP[4][0], WOOD_DARK_RAMP[4][1], WOOD_DARK_RAMP[4][2]); // grip
    c.drawHLine(gx + 9, gy + 1, 16, 190, 190, 200);  // glint
  }

  // ---- The detective's cigarette (occasional drag + smoke) ---------
  const drag = Math.max(0, Math.sin(time * 0.8)); // slow flare
  const embX = dcx + 20;
  const embY = deskTop - 2;
  c.fillRect(embX, embY, 2, 2, 255, 120 + Math.round(drag * 90), 40);
  c.applyLighting(embX, embY, 8 + drag * 6, 200, 70, 20, 0.4 + drag * 0.4);
  for (let i = 0; i < 6; i++) {
    const sy = (time * 20 + i * 10) % 60;
    const smx = embX + Math.round(Math.sin(time * 1.6 + i) * (2 + sy * 0.25));
    c.putPixel(smx, embY - Math.round(sy), 200, 198, 190, Math.max(0, 90 - sy * 1.5));
  }

  // ---- Lamp key light: warm pool over desk + suspect ---------------
  const lampFlick = 0.85 + Math.sin(time * 7) * 0.1 + Math.sin(time * 17.3) * 0.05;
  c.applyLighting(lx + 8, deskTop - 6, 150, 250, 180, 90, 0.55 * lampFlick);
  c.applyLighting(lx + 8, deskTop - 6, 70, 255, 210, 130, 0.4 * lampFlick);

  // ---- Dust motes drifting in the beam -----------------------------
  for (let i = 0; i < 10; i++) {
    const dx = 100 + ((i * 53) % 160);
    const dy = 40 + ((-(time * 12) + i * 30) % 110 + 110) % 110;
    c.putPixel(dx + Math.round(Math.sin(time + i) * 3), Math.round(dy), 255, 220, 160, 90);
  }

  // ---- Vignette focuses attention on the interrogation -------------
  c.applyVignette(w / 2 - 40, deskTop - 30, 150, 0.7);

  // ---- Muzzle flash ----------------------------------------------------
  if (opts.flash) {
    c.applyLighting(dcx + 46, deskTop - 13, 240, 255, 236, 190, 1.0);
    c.fillEllipse(dcx + 48, deskTop - 12, 7, 4, 255, 240, 200);
  }
}

function drawPortrait(c: PixelCanvas, x: number, y: number, pw: number, ph: number): void {
  c.strokeRect(x, y, pw, ph, BRASS_RAMP[3][0], BRASS_RAMP[3][1], BRASS_RAMP[3][2]);
  c.fillDithered(x + 1, y + 1, pw - 2, ph - 2, WALLPAPER_RAMP[2], WALLPAPER_RAMP[3], 9);
  c.fillEllipse(x + pw / 2, y + ph / 2 - 1, 3, 4, IRON_RAMP[4][0], IRON_RAMP[4][1], IRON_RAMP[4][2]);
}
