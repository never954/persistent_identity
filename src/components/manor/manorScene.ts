/*
 * manorScene.ts — the whole manor, top-down, drawn with the software rasterizer.
 * ------------------------------------------------------------------
 * Same engine as every other scene (pixelRenderer): each frame the visible
 * part of the 60×39-tile floor plan is scan-converted into the 384×216 frame
 * buffer — floors, walls, doorways, furniture — then the people, then the
 * light. A camera follows the detective (a 2D translation, clamped to the
 * map). Rooms you are not in are in darkness, and the people in them are
 * hidden: you only see who is in the room with you, or near enough to see
 * through a doorway. That is what makes it possible to *watch* someone walk
 * past — or not to see them at all.
 */

import { PixelCanvas, PX_WIDTH, PX_HEIGHT, type Color } from '../pixel/pixelRenderer';
import { AREA_BY_ID, MAP_H, MAP_W, TILE, areaAt, propAt, type Prop } from '../../game/case/manor';

export interface Figure {
  id: string;
  x: number; // tile units (float — interpolated along the walk)
  y: number;
  moving: boolean;
  dead?: boolean;
  /** Twirling on the spot (asked to — or made to). */
  dancing?: boolean;
}

export interface ManorFrame {
  px: number; // detective, tile units
  py: number;
  facing: 1 | -1;
  walking: boolean;
  /** The area the detective is in (doorways count as the room they came from). */
  here: string;
  figures: Figure[];
  /** Search spots still worth searching: [x, y]. */
  sparkles: [number, number][];
}

/** Camera top-left in pixels, centred on the detective and clamped to the map. */
export function camera(px: number, py: number): [number, number] {
  const cx = Math.round(px * TILE - PX_WIDTH / 2);
  const cy = Math.round(py * TILE - PX_HEIGHT / 2);
  return [
    Math.max(0, Math.min(MAP_W * TILE - PX_WIDTH, cx)),
    Math.max(0, Math.min(MAP_H * TILE - PX_HEIGHT, cy)),
  ];
}

/** Can the detective see a point? Same room, or close enough to see through a doorway. */
export function sees(f: ManorFrame, x: number, y: number, area?: string): boolean {
  const a = area ?? areaAt(x, y);
  return a === f.here || Math.hypot(x - f.px, y - f.py) <= 4;
}

const FLOORS: Record<string, [Color, Color]> = {
  wood: [[92, 62, 38], [84, 56, 34]],
  carpet: [[96, 34, 38], [88, 30, 34]],
  runner: [[70, 50, 34], [64, 46, 30]],
  flags: [[86, 84, 80], [76, 74, 70]],
  checker: [[196, 190, 176], [44, 40, 38]],
  tiles: [[70, 96, 84], [62, 86, 76]],
  boards: [[122, 94, 62], [112, 86, 56]],
  marble: [[190, 182, 166], [176, 168, 152]],
  stone: [[58, 56, 54], [50, 48, 46]],
};

/** How the detective and each suspect look from above: hair, coat, trim. */
const LOOKS: Record<string, [Color, Color, Color]> = {
  detective: [[44, 36, 30], [116, 94, 62], [70, 56, 38]],
  agnes: [[196, 196, 200], [58, 72, 104], [235, 232, 222]],
  julian: [[66, 44, 26], [98, 88, 54], [170, 150, 90]],
  vance: [[128, 128, 134], [56, 98, 92], [40, 70, 66]],
  thomas: [[156, 92, 42], [32, 32, 36], [230, 230, 230]],
  vivian: [[22, 18, 22], [168, 46, 42], [230, 190, 120]],
};
const SKIN: Color = [226, 186, 150];

function fill(c: PixelCanvas, x: number, y: number, w: number, h: number, col: Color, a = 255): void {
  c.fillRect(x, y, w, h, col[0], col[1], col[2], a);
}

function drawProp(c: PixelCanvas, p: Prop, tx: number, ty: number, sx: number, sy: number, t: number): void {
  const [px, py, , ph] = p.rect;
  const edgeL = tx === px;
  const edgeT = ty === py;
  const edgeB = ty === py + ph - 1;
  switch (p.type) {
    case 'bookshelf': {
      fill(c, sx, sy, 8, 8, [60, 38, 22]);
      const books: Color[] = [[120, 40, 36], [44, 70, 110], [150, 120, 50], [60, 100, 60]];
      for (let i = 0; i < 4; i++) fill(c, sx + 1 + i * 2, sy + 1, 1, 6, books[(tx + i) % 4]);
      break;
    }
    case 'desk': case 'table': case 'longtable': case 'sideboard': case 'dresser': case 'bench':
      fill(c, sx, sy, 8, 8, p.type === 'longtable' ? [104, 70, 40] : [112, 76, 44]);
      if (edgeT) c.drawHLine(sx, sy, 8, 150, 108, 66);
      if (edgeB) c.drawHLine(sx, sy + 7, 8, 60, 40, 24);
      if (p.type === 'longtable' && (tx + ty) % 3 === 0) fill(c, sx + 3, sy + 3, 2, 2, [230, 226, 214]); // plates
      break;
    case 'bed':
      fill(c, sx, sy, 8, 8, edgeT ? [236, 232, 220] : [110, 40, 46]);
      if (edgeT) fill(c, sx + 1, sy + 2, 6, 4, [250, 248, 240]);
      break;
    case 'wardrobe':
      fill(c, sx, sy, 8, 8, [70, 46, 28]);
      c.drawVLine(sx + 4, sy, 8, 40, 26, 16);
      break;
    case 'hearth': {
      fill(c, sx, sy, 8, 8, [40, 34, 32]);
      const flick = Math.sin(t * 9 + tx) * 0.5 + 0.5;
      fill(c, sx + 2, sy + 4, 4, 3, [230, 120 + Math.round(flick * 60), 40]);
      break;
    }
    case 'range':
      fill(c, sx, sy, 8, 8, [36, 36, 40]);
      c.fillEllipse(sx + 4, sy + 4, 2, 2, 70, 70, 76);
      break;
    case 'sink':
      fill(c, sx, sy, 8, 8, [150, 150, 150]);
      fill(c, sx + 1, sy + 1, 6, 5, [110, 120, 130]);
      break;
    case 'armchair':
      fill(c, sx, sy, 8, 8, [120, 40, 40]);
      if (edgeT) fill(c, sx, sy, 8, 3, [90, 28, 30]);
      break;
    case 'rug':
      fill(c, sx, sy, 8, 8, (tx + ty) % 2 ? [120, 46, 40] : [104, 38, 34], 230);
      if (edgeL || edgeT) c.strokeRect(sx, sy, 8, 8, 170, 130, 60, 140);
      break;
    case 'plant':
      c.fillEllipse(sx + 4, sy + 4, 4, 4, 46, 92, 50);
      c.fillEllipse(sx + 3, sy + 3, 2, 2, 74, 130, 70);
      break;
    case 'staircase':
      fill(c, sx, sy, 8, 8, ty % 2 ? [110, 74, 44] : [130, 90, 54]);
      c.drawHLine(sx, sy + 7, 8, 70, 46, 28);
      break;
    case 'rack':
      fill(c, sx, sy, 8, 8, [62, 40, 24]);
      for (let i = 0; i < 3; i++) c.fillEllipse(sx + 2 + i * 2, sy + 4, 1, 1, 60, 20, 30);
      break;
    case 'barrels':
      c.fillEllipse(sx + 4, sy + 4, 4, 4, 100, 66, 36);
      c.drawCircle(sx + 4, sy + 4, 3, 60, 50, 40);
      break;
    default:
      fill(c, sx, sy, 8, 8, [90, 70, 50]);
  }
}

/** Figures are drawn at 2× the tile grid's pixel size, chunky and readable, like Among Us. */
const S = 2;

/** A suspect (or the detective) seen from above: 6×10 "pixels", each S×S. */
function drawFigure(c: PixelCanvas, look: [Color, Color, Color], x: number, y: number, t: number,
  moving: boolean, fedora = false): void {
  const [hair, coat, trim] = look;
  const step = moving ? Math.floor(t * 8) % 2 : 0;
  const px = (dx: number, dy: number, w: number, h: number, col: Color) => fill(c, x + dx * S, y + dy * S, w * S, h * S, col);
  c.fillEllipse(x + 3 * S, y + 10 * S, 3 * S, S, 0, 0, 0, 90); // shadow
  px(1, 9, 1, 1, [30, 26, 24]);
  px(4, 9, 1, 1, [30, 26, 24]);
  if (step) px(1, 8, 1, 1, [30, 26, 24]);
  else px(4, 8, 1, 1, [30, 26, 24]);
  px(0, 4, 6, 5, coat);
  px(2, 4, 2, 2, trim);
  px(1, 1, 4, 3, SKIN);
  px(1, 0, 4, 2, hair);
  c.fillRect(x + 2 * S, y + 2 * S + 1, 1, 1, 30, 24, 20); // eyes
  c.fillRect(x + 4 * S - 1, y + 2 * S + 1, 1, 1, 30, 24, 20);
  if (fedora) px(0, 1, 6, 1, hair);
}

function drawBody(c: PixelCanvas, look: [Color, Color, Color], x: number, y: number): void {
  c.fillEllipse(x + 6 * S, y + 6 * S, 7 * S, 3 * S, 110, 14, 14, 200); // blood
  fill(c, x, y + 4 * S, 4 * S, 4 * S, SKIN);
  fill(c, x + 4 * S, y + 4 * S, 7 * S, 4 * S, look[1]);
  fill(c, x, y + 4 * S, 2 * S, 4 * S, look[0]);
}

export function drawManor(c: PixelCanvas, t: number, f: ManorFrame): void {
  const [camX, camY] = camera(f.px, f.py);
  c.clear(14, 11, 10);
  const tx0 = Math.floor(camX / TILE);
  const ty0 = Math.floor(camY / TILE);
  const seen: boolean[] = [];

  for (let ty = ty0; ty <= ty0 + PX_HEIGHT / TILE + 1 && ty < MAP_H; ty++) {
    for (let tx = tx0; tx <= tx0 + PX_WIDTH / TILE + 1 && tx < MAP_W; tx++) {
      const sx = tx * TILE - camX;
      const sy = ty * TILE - camY;
      const area = areaAt(tx, ty);
      if (area === undefined) {
        // Wall: dark, with a lit top edge where it faces a floor below.
        fill(c, sx, sy, 8, 8, [34, 26, 22]);
        if (areaAt(tx, ty + 1) !== undefined) fill(c, sx, sy + 5, 8, 3, [66, 50, 40]);
        continue;
      }
      if (area === 'door') {
        fill(c, sx, sy, 8, 8, [78, 54, 34]);
        c.strokeRect(sx, sy, 8, 8, 120, 84, 48);
      } else {
        const [a, b] = FLOORS[AREA_BY_ID[area].floor] ?? FLOORS.wood;
        fill(c, sx, sy, 8, 8, (tx + ty) % 2 ? a : b);
        if (AREA_BY_ID[area].floor === 'runner' && ty === 11) fill(c, sx, sy + 1, 8, 6, [110, 34, 36]);
      }
      const prop = propAt[ty * MAP_W + tx];
      if (prop) drawProp(c, prop, tx, ty, sx, sy, t);
      const vis = sees(f, tx + 0.5, ty + 0.5, area === 'door' ? undefined : area);
      seen[(ty - ty0) * 64 + (tx - tx0)] = vis;
    }
  }

  // Search spots that still hold something: a glint.
  for (const [x, y] of f.sparkles) {
    if (!sees(f, x + 0.5, y + 0.5)) continue;
    const g = 0.5 + 0.5 * Math.sin(t * 4 + x);
    const sx = x * TILE - camX + 4;
    const sy = y * TILE - camY + 4;
    c.putPixel(sx, sy, 255, 230, 140);
    c.putPixel(sx - 1, sy, 255, 210, 120, Math.round(200 * g));
    c.putPixel(sx + 1, sy, 255, 210, 120, Math.round(200 * g));
    c.putPixel(sx, sy - 1, 255, 210, 120, Math.round(200 * g));
    c.putPixel(sx, sy + 1, 255, 210, 120, Math.round(200 * g));
  }

  // People — only those you can see. Drawn back to front.
  const people = f.figures.filter((p) => sees(f, p.x + 0.5, p.y + 0.5)).sort((a, b) => a.y - b.y);
  // A suspect stands on a tile (x, y = its top-left); the detective's (px, py) is a point.
  for (const p of people) {
    const sx = Math.round((p.x + 0.5) * TILE - camX - 3 * S);
    const sy = Math.round((p.y + 0.5) * TILE - camY - 8 * S);
    if (p.dead) drawBody(c, LOOKS[p.id] ?? LOOKS.thomas, sx - 2, sy);
    else if (p.dancing) {
      // A little box-step: sway side to side and bob, feet moving.
      const sway = Math.round(Math.sin(t * 6) * 3);
      const bob = Math.round(Math.abs(Math.sin(t * 6)) * -2);
      drawFigure(c, LOOKS[p.id] ?? LOOKS.thomas, sx + sway, sy + bob, t * 1.5, true);
    } else drawFigure(c, LOOKS[p.id] ?? LOOKS.thomas, sx, sy, t, p.moving);
  }
  drawFigure(c, LOOKS.detective, Math.round(f.px * TILE - camX - 3 * S), Math.round(f.py * TILE - camY - 9 * S), t,
    f.walking, true);

  // Darkness over everything you cannot see from here.
  for (let ty = ty0; ty <= ty0 + PX_HEIGHT / TILE + 1 && ty < MAP_H; ty++) {
    for (let tx = tx0; tx <= tx0 + PX_WIDTH / TILE + 1 && tx < MAP_W; tx++) {
      if (areaAt(tx, ty) === undefined) continue;
      if (!seen[(ty - ty0) * 64 + (tx - tx0)]) fill(c, tx * TILE - camX, ty * TILE - camY, 8, 8, [6, 5, 8], 175);
    }
  }

  // Candlelight: the detective's lamp and the hearths.
  const lx = f.px * TILE - camX;
  const ly = f.py * TILE - camY;
  c.applyLighting(lx, ly, 70, 255, 200, 130, 0.22 + Math.sin(t * 7) * 0.02);
  for (const a of ['study', 'great_hall']) {
    for (const p of AREA_BY_ID[a].props) {
      if (p.type !== 'hearth' || a !== f.here) continue;
      c.applyLighting((p.rect[0] + p.rect[2] / 2) * TILE - camX, (p.rect[1] + 1) * TILE - camY, 60, 255, 150, 60,
        0.25 + Math.sin(t * 9) * 0.04);
    }
  }
  c.applyVignette(lx, ly, 260, 0.55);
}
