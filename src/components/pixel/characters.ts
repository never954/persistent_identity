/*
 * characters.ts — the pixel-art cast, generated procedurally.
 * ------------------------------------------------------------------
 * Rather than hand-plot every pixel, each suspect is a small CONFIG
 * (skin / hair / coat colours + a hair style + accessories). `buildBust`
 * assembles a 26x32 pixel bust from that config using pixel-space drawing
 * primitives (ellipse fill, trapezoid body) and then traces a 1px outline
 * around the whole silhouette — the classic pixel-art look. This keeps
 * every character aligned and consistent while reading distinctly.
 */

import type { Palette } from './PixelSprite';

export interface CharConfig {
  skin: [string, string]; // light, shadow
  hair: [string, string]; // base, highlight
  coat: [string, string]; // base, shadow
  accent: string;
  style: 'bun' | 'slick' | 'bob' | 'cap' | 'wave' | 'short';
  glasses?: boolean;
  earring?: boolean;
}

export interface Bust {
  rows: string[];
  talkRows: string[];
  blinkRows: string[];
  palette: Palette;
}

const W = 26;
const H = 32;
const CX = 13;

export const CHAR_CONFIG: Record<string, CharConfig> = {
  agnes: {
    skin: ['#ad8068', '#5d4140'],
    hair: ['#878b96', '#c0bdad'],
    coat: ['#303b47', '#121923'],
    accent: '#bda77e',
    style: 'bun',
    glasses: true,
  },
  julian: {
    skin: ['#ad7b60', '#593c3b'],
    hair: ['#241a18', '#4b3025'],
    coat: ['#293542', '#101821'],
    accent: '#793536',
    style: 'slick',
  },
  vance: {
    skin: ['#a97860', '#593e3d'],
    hair: ['#302820', '#59432d'],
    coat: ['#3d5b5d', '#17282c'],
    accent: '#b9b99c',
    style: 'bob',
    glasses: true,
  },
  thomas: {
    skin: ['#b08065', '#5e403c'],
    hair: ['#493725', '#76603a'], // used as flat-cap colour
    coat: ['#5b4b35', '#211c1c'],
    accent: '#b09c78',
    style: 'cap',
  },
  vivian: {
    skin: ['#b17e66', '#60403e'],
    hair: ['#17151a', '#3c2930'],
    coat: ['#8f3536', '#351b27'],
    accent: '#c29b56',
    style: 'wave',
    earring: true,
  },
};

export function buildBust(cfg: CharConfig): Bust {
  const g: string[][] = Array.from({ length: H }, () => Array(W).fill('.'));
  const put = (x: number, y: number, ch: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch;
  };

  // --- coat / shoulders (trapezoid, widening downward) ---
  for (let y = 22; y < H; y++) {
    const t = (y - 22) / (H - 1 - 22);
    const half = Math.round(6 + t * 6);
    for (let x = CX - half; x <= CX + half; x++) put(x, y, 'c');
  }
  // coat shadow on the right
  for (let y = 22; y < H; y++)
    for (let x = CX + 2; x < W; x++) if (g[y][x] === 'c') g[y][x] = 'C';
  // a lit collar accent
  for (let x = CX - 3; x <= CX + 3; x++) put(x, 22, 'a');

  // --- neck ---
  for (let y = 19; y < 23; y++) for (let x = CX - 1; x <= CX + 1; x++) put(x, y, 's');

  // --- head (ellipse) ---
  const ell = (ecx: number, ecy: number, rx: number, ry: number, ch: string) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x - ecx) / rx;
        const dy = (y - ecy) / ry;
        if (dx * dx + dy * dy <= 1) put(x, y, ch);
      }
  };
  ell(CX, 11, 7, 9, 's');
  // skin shadow: right side + lower jaw
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (g[y][x] === 's' && (x > CX + 2 || y > 15)) g[y][x] = 'S';

  // Small grouped occlusion pixels keep the face from reading as a flat split.
  for (let x = CX - 5; x <= CX - 2; x++) put(x, 14, 'S');
  put(CX + 2, 9, 'S');
  put(CX - 4, 16, 'S');

  // --- hair / hat ---
  drawHair(g, cfg);

  // --- face features ---
  put(CX - 3, 10, 'e'); put(CX - 3, 11, 'e'); // left eye
  put(CX + 3, 10, 'e'); put(CX + 3, 11, 'e'); // right eye
  put(CX, 12, 'S'); put(CX, 13, 'S'); put(CX - 1, 13, 'S'); // nose
  const mouth: [number, number][] = [];
  for (let x = CX - 2; x <= CX + 1; x++) {
    put(x, 15, 'S');
    mouth.push([x, 15]);
  }

  if (cfg.glasses) {
    put(CX - 4, 11, 'K'); put(CX - 2, 11, 'K'); put(CX - 3, 12, 'K');
    put(CX + 2, 11, 'K'); put(CX + 4, 11, 'K'); put(CX + 3, 12, 'K');
    put(CX - 1, 11, 'K'); put(CX + 1, 11, 'K');
    put(CX - 3, 10, 'g'); put(CX + 3, 10, 'g');
  }
  if (cfg.earring) put(CX + 7, 13, 'a');

  outline(g);

  const rows = g.map((r) => r.join(''));
  // talk frame: open the mouth
  const talk = g.map((r) => r.slice());
  mouth.forEach(([x, y]) => (talk[y][x] = 'e'));
  put2(talk, CX - 1, 16, 'e'); put2(talk, CX, 16, 'e');
  const talkRows = talk.map((r) => r.join(''));
  // blink frame: close the eyes (replace eye pixels with skin + a lid line)
  const blink = g.map((r) => r.slice());
  [
    [CX - 3, 10], [CX - 3, 11], [CX + 3, 10], [CX + 3, 11],
  ].forEach(([x, y]) => (blink[y][x] = 's'));
  put2(blink, CX - 3, 11, 'S'); put2(blink, CX + 3, 11, 'S');
  const blinkRows = blink.map((r) => r.join(''));

  const palette: Palette = {
    '.': '',
    K: '#140d09',
    s: cfg.skin[0],
    S: cfg.skin[1],
    h: cfg.hair[0],
    H: cfg.hair[1],
    c: cfg.coat[0],
    C: cfg.coat[1],
    a: cfg.accent,
    e: '#140d09',
    w: '#fff7e6',
    g: '#a9c2d0',
  };
  return { rows, talkRows, blinkRows, palette };
}

function put2(g: string[][], x: number, y: number, ch: string) {
  if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = ch;
}

function drawHair(g: string[][], cfg: CharConfig) {
  const put = (x: number, y: number, ch: string) => put2(g, x, y, ch);
  const rowSpan = (y: number) => {
    const dy = (y - 11) / 9;
    const rx = 7 * Math.sqrt(Math.max(0, 1 - dy * dy));
    return [Math.round(CX - rx), Math.round(CX + rx)] as const;
  };

  if (cfg.style === 'cap') {
    // flat cap covering the crown + a brim to the left
    for (let y = 1; y <= 6; y++) {
      const [x0, x1] = rowSpan(y);
      for (let x = x0 - 1; x <= x1 + 1; x++) put(x, y, 'h');
    }
    for (let x = CX - 9; x <= CX - 3; x++) put(x, 6, 'h');
    put(CX - 2, 3, 'H');
    return;
  }

  // base crown for every hairstyle
  for (let y = 2; y <= 6; y++) {
    const [x0, x1] = rowSpan(y);
    for (let x = x0; x <= x1; x++) put(x, y, 'h');
  }
  put(CX - 3, 3, 'H'); put(CX - 2, 2, 'H'); // highlight (lamp side)

  if (cfg.style === 'bun') {
    for (let y = -1; y <= 2; y++)
      for (let x = CX - 2; x <= CX + 2; x++)
        if ((x - CX) ** 2 + (y - 0) ** 2 <= 4) put(x, y, 'h');
  }
  if (cfg.style === 'bob') {
    for (let y = 6; y <= 15; y++) {
      put(CX - 6, y, 'h'); put(CX - 7, y, 'h');
      put(CX + 6, y, 'h'); put(CX + 7, y, 'h');
    }
  }
  if (cfg.style === 'wave') {
    for (let y = 6; y <= 13; y++) {
      put(CX - 6, y, 'h'); put(CX + 6, y, 'h');
    }
    put(CX - 5, 6, 'h'); put(CX + 5, 6, 'h'); put(CX + 4, 5, 'h');
  }
  if (cfg.style === 'slick') {
    // receded: clear the very front row a touch, add sheen
    put(CX, 2, 'H'); put(CX + 1, 3, 'H');
  }
}

/** Trace a 1px dark outline around the whole silhouette. */
function outline(g: string[][]) {
  const isFill = (x: number, y: number) =>
    x >= 0 && x < W && y >= 0 && y < H && g[y][x] !== '.' && g[y][x] !== 'K';
  const marks: [number, number][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (g[y][x] === '.') {
        if (isFill(x - 1, y) || isFill(x + 1, y) || isFill(x, y - 1) || isFill(x, y + 1)) {
          marks.push([x, y]);
        }
      }
  marks.forEach(([x, y]) => (g[y][x] = 'K'));
}

/** Prebuilt busts for every suspect id. */
export const BUSTS: Record<string, Bust> = Object.fromEntries(
  Object.entries(CHAR_CONFIG).map(([id, cfg]) => [id, buildBust(cfg)]),
);
