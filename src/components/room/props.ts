/*
 * props.ts — the furniture of the explorable rooms.
 * ---------------------------------------------------------------------------
 * One drawer per PropKind. Each takes the hotspot footprint and the room's
 * theme and paints a detailed, themed piece of furniture with the pixel
 * engine + the shared texture helpers. roomScene dispatches through
 * PROP_DRAWERS; nothing here knows about game state.
 */

import { PixelCanvas, type Color, lerpColor } from '../pixel/pixelRenderer';
import { woodGrain, speckle, rng } from '../pixel/textures';
import { CANDLE_RAMP, WARM_GLOW_RAMP, BRASS_RAMP, IRON_RAMP, PARCHMENT_COL } from '../pixel/palettes';
import type { Hotspot, RoomTheme } from '../../game/case/roomLayouts';

type Drawer = (c: PixelCanvas, hs: Hotspot, t: RoomTheme, time: number) => void;

const BOOK_COLORS: Color[] = [
  [96, 40, 34], [52, 66, 46], [40, 54, 86], [110, 84, 40],
  [70, 44, 64], [44, 72, 72], [120, 70, 36], [58, 50, 44],
];

/* ------------------------------------------------------------- bookshelf -- */
const bookshelf: Drawer = (c, hs, t) => {
  const { x, y, w, h } = hs;
  c.fillDithered(x, y, w, h, t.wood[1], t.wood[2], 6);
  woodGrain(c, x, y, w, h, t.wood, x * 7 + y);
  c.strokeRect(x, y, w, h, t.wood[4][0], t.wood[4][1], t.wood[4][2]);
  const shelves = Math.max(3, Math.floor(h / 24));
  const rand = rng(x * 13 + 7);
  for (let s = 0; s < shelves; s++) {
    const sy = y + 6 + Math.floor((h - 10) * (s / shelves));
    const shelfBottom = y + 6 + Math.floor((h - 10) * ((s + 1) / shelves)) - 2;
    c.fillRect(x + 2, shelfBottom, w - 4, 2, t.wood[0][0], t.wood[0][1], t.wood[0][2]);
    c.drawHLine(x + 2, sy - 2, w - 4, t.wood[3][0], t.wood[3][1], t.wood[3][2]);
    // Books of varied height + colour, with a lit top edge.
    let bx = x + 4;
    while (bx < x + w - 5) {
      const bw = 3 + Math.floor(rand() * 3);
      const bh = Math.min(shelfBottom - sy - 1, 10 + Math.floor(rand() * 8));
      const col = BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)];
      const by = shelfBottom - bh;
      c.fillRect(bx, by, bw, bh, col[0], col[1], col[2]);
      c.drawHLine(bx, by, bw, Math.min(255, col[0] + 40), Math.min(255, col[1] + 40), Math.min(255, col[2] + 40));
      c.drawVLine(bx, by, bh, Math.max(0, col[0] - 24), Math.max(0, col[1] - 24), Math.max(0, col[2] - 24));
      if (rand() < 0.4) c.putPixel(bx + Math.floor(bw / 2), by + 3, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]); // gilt title
      bx += bw + 1;
    }
  }
};

/* -------------------------------------------------------------- fireplace -- */
const fireplace: Drawer = (c, hs, t, time) => {
  const { x, y, w, h } = hs;
  const lit = t.warm;
  // Brick surround.
  c.fillDithered(x, y, w, h, [34, 22, 18], [52, 34, 26], 7);
  for (let by = y; by < y + h; by += 5) {
    c.drawHLine(x, by, w, 20, 14, 12, 140);
    const off = ((by - y) / 5) % 2 === 0 ? 0 : 6;
    for (let bx = x + off; bx < x + w; bx += 12) c.drawVLine(bx, by, 5, 20, 14, 12, 120);
  }
  // Firebox.
  const fx = x + 10, fw = w - 20, fy = y + h - 44, fh = 40;
  c.fillRect(fx, fy, fw, fh, 8, 6, 8);
  if (lit) {
    for (let i = 0; i < fw; i += 2) {
      const flame = 6 + Math.floor((Math.sin(time * 6 + i) * 0.5 + 0.5) * 16);
      const col = CANDLE_RAMP[Math.min(7, 2 + Math.floor(flame / 4))];
      c.drawVLine(fx + i, fy + fh - flame, flame, col[0], col[1], col[2], 220);
    }
    c.applyLighting(fx + fw / 2, fy + fh - 6, 60, WARM_GLOW_RAMP[5][0], WARM_GLOW_RAMP[5][1], WARM_GLOW_RAMP[5][2], 0.3);
  } else {
    speckle(c, fx, fy + fh - 14, fw, 14, [40, 38, 36], 0.3, 120, 55); // cold ash
  }
  // Mantel shelf + a pair of candlesticks (one may be "missing" by story).
  c.fillRect(x - 3, y - 4, w + 6, 5, t.wood[3][0], t.wood[3][1], t.wood[3][2]);
  c.drawHLine(x - 3, y - 4, w + 6, t.wood[5][0], t.wood[5][1], t.wood[5][2]);
  c.fillRect(x + 10, y - 12, 2, 8, BRASS_RAMP[5][0], BRASS_RAMP[5][1], BRASS_RAMP[5][2]);
  c.fillEllipse(x + 11, y - 12, 2, 1, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);
};

/* ------------------------------------------------------------------- desk -- */
const desk: Drawer = (c, hs, t) => {
  const { x, y, w, h } = hs;
  c.fillDithered(x, y + 6, w, h - 6, t.wood[1], t.wood[3], 6);
  woodGrain(c, x, y + 6, w, h - 6, t.wood, x + 3);
  // Top surface (lighter) + splintered front edge.
  c.fillRect(x - 2, y, w + 4, 7, t.wood[4][0], t.wood[4][1], t.wood[4][2]);
  c.drawHLine(x - 2, y, w + 4, t.wood[5][0], t.wood[5][1], t.wood[5][2]);
  for (let i = 0; i < 5; i++) c.putPixel(x + w - 8 + i, y + 6 + (i % 2), t.wood[5][0], t.wood[5][1], t.wood[5][2]);
  // Legs.
  c.fillRect(x + 2, y + h - 2, 5, 4, t.wood[0][0], t.wood[0][1], t.wood[0][2]);
  c.fillRect(x + w - 7, y + h - 2, 5, 4, t.wood[0][0], t.wood[0][1], t.wood[0][2]);
  // Scattered papers + inkwell + a thread catching the light on the edge.
  c.fillRect(x + 12, y - 4, 20, 10, PARCHMENT_COL[0], PARCHMENT_COL[1], PARCHMENT_COL[2]);
  c.fillRect(x + 18, y - 6, 18, 9, 214, 206, 188);
  c.drawHLine(x + 20, y - 2, 12, 120, 110, 92);
  c.fillRect(x + w - 26, y - 5, 8, 7, IRON_RAMP[2][0], IRON_RAMP[2][1], IRON_RAMP[2][2]); // inkwell
  c.putPixel(x + w - 22, y - 6, 20, 30, 60);
  c.putPixel(x + w - 3, y + 7, 150, 30, 36); // crimson thread glint
};

/* ----------------------------------------------------------------- window -- */
const windowProp: Drawer = (c, hs, _t, time) => {
  const { x, y, w, h } = hs;
  // Cold night glass.
  c.fillGradient(x, y, w, h, [[8, 12, 22], [16, 22, 40], [26, 34, 56], [18, 24, 40]]);
  // Moon haze.
  c.applyLighting(x + w * 0.5, y + h * 0.3, Math.min(w, h), 120, 140, 180, 0.1);
  // Mullions + frame.
  c.strokeRect(x - 2, y - 2, w + 4, h + 4, 24, 20, 18);
  for (let mx = x + 12; mx < x + w; mx += 14) c.drawVLine(mx, y, h, 20, 16, 14);
  for (let my = y + 14; my < y + h; my += 16) c.drawHLine(x, my, w, 20, 16, 14);
  // Rain on the glass.
  for (let i = 0; i < Math.floor(w * 0.5); i++) {
    const rx = x + ((i * 29) % (w - 1)) + 1;
    const ry = y + (((time * 70) + i * 23) % h);
    c.putPixel(rx, Math.round(ry), 150, 170, 200, 120);
    c.putPixel(rx, Math.round(ry) + 1, 120, 140, 170, 80);
  }
};

/* ---------------------------------------------------------------- painting -- */
const painting: Drawer = (c, hs) => {
  const { x, y, w, h } = hs;
  // Gilt frame + dim sitter (kept simple + integer coords).
  c.fillRect(x - 3, y - 3, w + 6, h + 6, BRASS_RAMP[3][0], BRASS_RAMP[3][1], BRASS_RAMP[3][2]);
  c.strokeRect(x - 3, y - 3, w + 6, h + 6, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);
  c.strokeRect(x - 1, y - 1, w + 2, h + 2, BRASS_RAMP[1][0], BRASS_RAMP[1][1], BRASS_RAMP[1][2]);
  for (let row = 0; row < h; row++) {
    const col = lerpColor([44, 36, 34], [14, 12, 16], row / Math.max(1, h - 1));
    c.fillRect(x, y + row, w, 1, col[0], col[1], col[2]);
  }
  const cx = Math.round(x + w / 2);
  c.fillEllipse(cx, Math.round(y + h * 0.95), Math.round(w * 0.4), Math.round(h * 0.3), 24, 18, 24);
  c.fillEllipse(cx, Math.round(y + h * 0.42), Math.round(w * 0.2), Math.round(w * 0.22), 80, 64, 54);
  c.putPixel(cx - 2, Math.round(y + h * 0.42), 140, 126, 112, 90);
};

/* ---------------------------------------------------------------- cabinet -- */
const cabinet: Drawer = (c, hs, t) => {
  const { x, y, w, h } = hs;
  c.fillDithered(x, y, w, h, t.wood[1], t.wood[2], 6);
  woodGrain(c, x, y, w, h, t.wood, x * 5 + 11);
  c.strokeRect(x, y, w, h, t.wood[4][0], t.wood[4][1], t.wood[4][2]);
  // Doors + brass knobs.
  const mid = x + Math.floor(w / 2);
  c.drawVLine(mid, y + 2, h - 4, t.wood[0][0], t.wood[0][1], t.wood[0][2]);
  c.strokeRect(x + 4, y + 4, Math.floor(w / 2) - 6, h - 8, t.wood[3][0], t.wood[3][1], t.wood[3][2]);
  c.strokeRect(mid + 2, y + 4, Math.floor(w / 2) - 6, h - 8, t.wood[3][0], t.wood[3][1], t.wood[3][2]);
  c.fillEllipse(mid - 3, y + Math.floor(h / 2), 1, 2, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);
  c.fillEllipse(mid + 4, y + Math.floor(h / 2), 1, 2, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);
  // A decanter + glass on top.
  c.fillRect(x + 8, y - 10, 6, 10, 70, 44, 30, 200);
  c.fillRect(x + 8, y - 6, 6, 6, 90, 58, 36, 180);
  c.fillRect(x + 18, y - 6, 4, 6, 120, 120, 130, 150);
};

/* --------------------------------------------------------------- armchair -- */
const armchair: Drawer = (c, hs) => {
  const { x, y, w, h } = hs;
  const leather: Color = [78, 40, 32];
  c.fillRect(x, y + 6, w, h - 6, leather[0], leather[1], leather[2]);
  c.fillRect(x - 3, y + 10, 8, h - 10, 58, 28, 22);        // arm
  c.fillRect(x + w - 5, y + 10, 8, h - 10, 58, 28, 22);     // arm
  c.fillRect(x + 2, y, w - 4, 14, 92, 50, 40);             // back
  c.drawHLine(x + 2, y, w - 4, 120, 70, 56);               // highlight
  c.fillRect(x + 4, y + 14, w - 8, 4, 40, 20, 16);         // seat shadow
  c.fillRect(x + 4, y + h - 3, 3, 4, 30, 18, 12);          // legs
  c.fillRect(x + w - 7, y + h - 3, 3, 4, 30, 18, 12);
};

/* -------------------------------------------------------------------- fern -- */
const fern: Drawer = (c, hs) => {
  const { x, y, w, h } = hs;
  const potY = y + h - 16;
  c.fillDithered(x + w / 2 - 10, potY, 20, 16, [70, 40, 28], [96, 58, 36], 6);
  c.drawHLine(x + w / 2 - 10, potY, 20, 120, 80, 50);
  const rand = rng(x + 3);
  for (let f = 0; f < 10; f++) {
    const fx = x + 4 + Math.floor(rand() * (w - 8));
    const topY = y + Math.floor(rand() * 10);
    const g: Color = [20 + Math.floor(rand() * 30), 50 + Math.floor(rand() * 40), 28 + Math.floor(rand() * 20)];
    c.drawLine(x + w / 2, potY, fx, topY, g[0], g[1], g[2]);
    for (let lf = topY; lf < potY; lf += 3) {
      const sway = Math.round((lf - topY) / 6);
      c.putPixel(fx + sway, lf, g[0], Math.min(255, g[1] + 20), g[2], 200);
    }
  }
};

/* --------------------------------------------------------------- wineRack -- */
const wineRack: Drawer = (c, hs, t) => {
  const { x, y, w, h } = hs;
  c.fillDithered(x, y, w, h, t.wood[0], t.wood[1], 6);
  c.strokeRect(x, y, w, h, t.wood[3][0], t.wood[3][1], t.wood[3][2]);
  const cell = 12;
  const rand = rng(x + 17);
  for (let gy = y + 4; gy < y + h - cell; gy += cell) {
    c.drawHLine(x + 2, gy, w - 4, t.wood[2][0], t.wood[2][1], t.wood[2][2]);
    for (let gx = x + 4; gx < x + w - cell; gx += cell) {
      c.drawVLine(gx, gy, cell, t.wood[2][0], t.wood[2][1], t.wood[2][2]);
      // Bottle end in most cells.
      if (rand() < 0.78) {
        const dusty: Color = rand() < 0.5 ? [28, 34, 26] : [36, 24, 22];
        c.fillEllipse(gx + cell / 2 + 1, gy + cell / 2 + 1, 3, 3, dusty[0], dusty[1], dusty[2]);
        c.putPixel(gx + cell / 2, gy + cell / 2, 70, 80, 70, 120);
      }
    }
  }
  speckle(c, x, y, w, h, [120, 120, 110], 0.02, 60, x); // cobweb dust
};

/* ------------------------------------------------------------ diningTable -- */
const diningTable: Drawer = (c, hs, t) => {
  const { x, y, w, h } = hs;
  // Chairs behind.
  for (let i = 0; i < 5; i++) {
    const chx = x + 12 + i * Math.floor((w - 20) / 5);
    c.fillRect(chx, y - 16, 10, 18, t.wood[2][0], t.wood[2][1], t.wood[2][2]);
    c.drawHLine(chx, y - 16, 10, t.wood[4][0], t.wood[4][1], t.wood[4][2]);
  }
  // Table top + cloth.
  c.fillRect(x, y, w, 10, t.wood[3][0], t.wood[3][1], t.wood[3][2]);
  c.drawHLine(x, y, w, t.wood[5][0], t.wood[5][1], t.wood[5][2]);
  c.fillDithered(x + 4, y + 10, w - 8, h - 10, [120, 112, 96], [150, 142, 124], 8); // tablecloth
  // Place settings; the empty one is dark.
  for (let i = 0; i < 5; i++) {
    const px = x + 18 + i * Math.floor((w - 28) / 5);
    const empty = i === 2;
    c.fillEllipse(px, y + 6, 5, 2, empty ? 60 : 160, empty ? 56 : 156, empty ? 52 : 148);
    if (!empty) c.putPixel(px + 6, y + 5, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);
  }
};

/* ------------------------------------------------------------------- stove -- */
const stove: Drawer = (c, hs, t, time) => {
  const { x, y, w, h } = hs;
  c.fillDithered(x, y, w, h, IRON_RAMP[1], IRON_RAMP[2], 6);
  c.strokeRect(x, y, w, h, IRON_RAMP[4][0], IRON_RAMP[4][1], IRON_RAMP[4][2]);
  // Doors + fire glow through the grate.
  c.strokeRect(x + 6, y + 10, w - 12, h - 20, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
  const g = 0.6 + Math.sin(time * 5) * 0.2;
  c.fillRect(x + 10, y + h - 16, w - 20, 5, 180, 70, 24, Math.round(160 * g));
  c.applyLighting(x + w / 2, y + h - 12, 24, 200, 90, 30, 0.2 * g);
  // Kettle on top.
  c.fillEllipse(x + w / 2, y - 4, 8, 6, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
  c.fillRect(x + w / 2 - 2, y - 12, 4, 4, IRON_RAMP[4][0], IRON_RAMP[4][1], IRON_RAMP[4][2]);
  void t;
};

/* ------------------------------------------------------------- bodyOutline -- */
const bodyOutline: Drawer = (c, hs) => {
  const { x, y, w } = hs;
  const chalk: Color = [190, 196, 200];
  // Head loop + torso + splayed limbs, drawn on the floor.
  c.drawCircle(x + 14, y + 2, 6, chalk[0], chalk[1], chalk[2], 180);
  c.drawLine(x + 20, y + 4, x + 54, y + 8, chalk[0], chalk[1], chalk[2], 160);
  c.drawLine(x + 20, y + 8, x + 52, y + 12, chalk[0], chalk[1], chalk[2], 160);
  c.drawLine(x + 30, y + 6, x + 40, y - 4, chalk[0], chalk[1], chalk[2], 140); // flung arm
  c.drawLine(x + 54, y + 8, x + w, y + 4, chalk[0], chalk[1], chalk[2], 150);  // leg
  c.drawLine(x + 52, y + 12, x + w - 4, y + 12, chalk[0], chalk[1], chalk[2], 150);
  // Shattered pocket-watch beside the outline.
  c.fillEllipse(x + 60, y + 10, 3, 3, BRASS_RAMP[5][0], BRASS_RAMP[5][1], BRASS_RAMP[5][2]);
  c.putPixel(x + 60, y + 10, 220, 60, 50);
};

/* ------------------------------------------------------------------ barrel -- */
const barrel: Drawer = (c, hs, t) => {
  const { x, y, h } = hs;
  const drawOne = (bx: number, by: number, bw: number, bh: number) => {
    c.fillDithered(bx, by, bw, bh, t.wood[1], t.wood[3], 6);
    c.fillEllipse(bx + bw / 2, by, bw / 2, 3, t.wood[2][0], t.wood[2][1], t.wood[2][2]);
    c.drawHLine(bx, by + Math.floor(bh * 0.25), bw, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
    c.drawHLine(bx, by + Math.floor(bh * 0.7), bw, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
    c.drawVLine(bx + bw / 2, by, bh, t.wood[4][0], t.wood[4][1], t.wood[4][2], 120);
  };
  drawOne(x, y + h - 30, 30, 30);
  drawOne(x + 32, y + h - 34, 32, 34);
  drawOne(x + 14, y + h - 58, 30, 28);
};

/* --------------------------------------------------------------------- bed -- */
const bed: Drawer = (c, hs, t) => {
  const { x, y, w, h } = hs;
  c.fillRect(x, y + 6, 6, h - 6, t.wood[2][0], t.wood[2][1], t.wood[2][2]);       // headboard post
  c.fillRect(x + w - 6, y + 10, 6, h - 10, t.wood[1][0], t.wood[1][1], t.wood[1][2]); // foot post
  c.fillRect(x, y, w, 14, t.wood[3][0], t.wood[3][1], t.wood[3][2]);              // headboard
  c.fillDithered(x + 6, y + 14, w - 12, h - 16, [40, 36, 54], [64, 58, 84], 7);  // turned-down cover
  c.fillRect(x + 8, y + 10, 22, 10, 180, 176, 170);                              // pillow
  c.drawHLine(x + 6, y + 14, w - 12, 90, 84, 110);                               // cover fold
};

/* -------------------------------------------------------------------- door -- */
const door: Drawer = (c, hs, t) => {
  const { x, y, w, h } = hs;
  // Frame + a door ajar on darkness (or garden night).
  c.fillRect(x - 3, y - 3, w + 6, h + 6, t.wood[1][0], t.wood[1][1], t.wood[1][2]);
  c.fillGradient(x, y, w, h, [[6, 8, 12], [12, 16, 24], [8, 10, 16]]);           // night gap
  // The door leaf, swung partly open.
  c.fillDithered(x + Math.floor(w * 0.45), y, Math.ceil(w * 0.55), h, t.wood[2], t.wood[3], 6);
  woodGrain(c, x + Math.floor(w * 0.45), y, Math.ceil(w * 0.55), h, t.wood, x + 9);
  c.fillEllipse(x + Math.floor(w * 0.5), y + Math.floor(h / 2), 1, 2, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);
  // Mud tracked in across the threshold.
  speckle(c, x - 6, y + h - 6, w + 12, 8, [40, 28, 16], 0.5, 170, x + 1);
};

/* -------------------------------------------------------------------- crate -- */
// Used for the study fire-grate: a low iron grate with ash + scorched paper.
const crate: Drawer = (c, hs) => {
  const { x, y, w, h } = hs;
  c.fillRect(x, y + h - 10, w, 10, 10, 8, 8);
  for (let i = x + 2; i < x + w; i += 4) c.drawVLine(i, y + h - 12, 12, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
  speckle(c, x, y + h - 10, w, 10, [60, 56, 52], 0.4, 140, x + 5); // ash
  // Scorched page corner, edges charred.
  c.fillRect(x + w / 2 - 4, y + h - 14, 9, 7, 210, 198, 170);
  c.drawHLine(x + w / 2 - 4, y + h - 8, 9, 40, 28, 20);
  c.putPixel(x + w / 2 + 4, y + h - 13, 30, 20, 16);
};

/* --------------------------------------------------------------- mantelClock -- */
const mantelClock: Drawer = (c, hs, t, time) => {
  const { x, y, w, h } = hs;
  c.fillDithered(x, y, w, h, t.wood[2], t.wood[3], 6);
  woodGrain(c, x, y, w, h, t.wood, x + 2);
  c.strokeRect(x, y, w, h, t.wood[5][0], t.wood[5][1], t.wood[5][2]);
  // Face stopped at 11:14.
  c.fillEllipse(x + w / 2, y + 14, 9, 9, PARCHMENT_COL[0], PARCHMENT_COL[1], PARCHMENT_COL[2]);
  c.strokeRect(x + w / 2 - 10, y + 4, 20, 20, BRASS_RAMP[5][0], BRASS_RAMP[5][1], BRASS_RAMP[5][2]);
  c.drawLine(x + w / 2, y + 14, x + w / 2 - 4, y + 9, 20, 16, 14); // hour → ~11
  c.drawLine(x + w / 2, y + 14, x + w / 2 + 2, y + 7, 20, 16, 14); // minute → ~14
  // Pendulum, swinging.
  const px = x + w / 2 + Math.round(Math.sin(time * Math.PI) * 5);
  c.drawVLine(x + w / 2, y + 26, h - 34, BRASS_RAMP[3][0], BRASS_RAMP[3][1], BRASS_RAMP[3][2]);
  c.fillEllipse(px, y + h - 8, 4, 4, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);
};

/* ------------------------------------------------------------------ teaCart -- */
const teaCart: Drawer = (c, hs, t, time) => {
  const { x, y, w, h } = hs;
  c.fillRect(x, y + 10, w, 4, t.wood[3][0], t.wood[3][1], t.wood[3][2]);          // top
  c.fillRect(x + 2, y + 14, 3, h - 18, t.wood[2][0], t.wood[2][1], t.wood[2][2]); // legs
  c.fillRect(x + w - 5, y + 14, 3, h - 18, t.wood[2][0], t.wood[2][1], t.wood[2][2]);
  c.fillEllipse(x + 5, y + h - 2, 3, 3, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]); // wheels
  c.fillEllipse(x + w - 5, y + h - 2, 3, 3, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
  // The full, cold teapot + a cup.
  c.fillEllipse(x + w / 2, y + 4, 9, 7, 206, 206, 210);
  c.fillRect(x + w / 2 - 9, y + 2, 18, 5, 214, 214, 216);
  c.putPixel(x + w / 2 + 10, y + 2, 230, 230, 232); // spout
  c.drawHLine(x + w / 2 - 6, y - 3, 12, 180, 180, 184); // lid
  c.fillRect(x + w / 2 + 12, y + 7, 5, 4, 220, 220, 222); // cup
  // No steam — it is stone cold. A faint cool sheen instead.
  c.putPixel(x + w / 2, y - 1, 150, 160, 170, 90);
  void time;
};

export const PROP_DRAWERS: Record<string, Drawer> = {
  bookshelf, fireplace, desk, window: windowProp,
  painting, cabinet, armchair, fern, wineRack, diningTable, stove,
  bodyOutline, barrel, bed, door, crate, mantelClock, teaCart,
  globe: cabinet, rug: cabinet,
};
