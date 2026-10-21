/*
 * textures.ts — reusable procedural surface detail on top of the pixel engine.
 * ---------------------------------------------------------------------------
 * The pixelRenderer draws flat shapes; these helpers add the grain, grime and
 * pattern that make a surface read as "lived-in" wood, papered wall, veined
 * marble, etc. Everything is deterministic (seeded) so renders are stable, and
 * everything is additive — call after laying down a base fill.
 *
 * Shared by the cutscene compositions and the explorable room scenes.
 */

import { PixelCanvas, type Color, lerpColor } from './pixelRenderer';

/** Small, fast seeded PRNG (mulberry32). Returns a 0–1 generator. */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scatter faint specks over a region — dust, grime, gravel, soot. */
export function speckle(
  c: PixelCanvas, x: number, y: number, w: number, h: number,
  col: Color, density: number, alpha: number, seed: number,
): void {
  const rand = rng(seed);
  const n = Math.floor(w * h * density);
  for (let i = 0; i < n; i++) {
    const px = x + Math.floor(rand() * w);
    const py = y + Math.floor(rand() * h);
    c.putPixel(px, py, col[0], col[1], col[2], Math.round(alpha * (0.5 + rand() * 0.5)));
  }
}

/**
 * Vertical wood grain: streaks of darker/lighter fibre plus occasional knots.
 * Lay a base fill first (e.g. fillDithered with a wood ramp), then call this.
 */
export function woodGrain(
  c: PixelCanvas, x: number, y: number, w: number, h: number,
  ramp: Color[], seed: number,
): void {
  const rand = rng(seed);
  const dark = ramp[Math.max(0, Math.floor(ramp.length * 0.15))];
  const light = ramp[Math.min(ramp.length - 1, Math.floor(ramp.length * 0.7))];
  for (let col = 0; col < w; col++) {
    if (rand() < 0.34) {
      const streak = rand() < 0.5 ? dark : light;
      const a = 40 + Math.floor(rand() * 70);
      // A streak wanders slightly as it runs down the plank.
      let drift = 0;
      for (let row = 0; row < h; row++) {
        if (rand() < 0.08) drift += rand() < 0.5 ? -1 : 1;
        c.putPixel(x + col + drift, y + row, streak[0], streak[1], streak[2], a);
      }
    }
  }
  // A couple of knots.
  const knots = 1 + Math.floor(rand() * 2);
  for (let k = 0; k < knots; k++) {
    const kx = x + 2 + Math.floor(rand() * (w - 4));
    const ky = y + 2 + Math.floor(rand() * (h - 4));
    c.fillEllipse(kx, ky, 2, 3, dark[0], dark[1], dark[2], 150);
    c.putPixel(kx, ky, light[0], light[1], light[2], 120);
  }
}

/**
 * Damask / brocade wallpaper motif: a diamond lattice of faint ogee shapes
 * over an existing wallpaper gradient. `scale` is the lattice cell size.
 */
export function damask(
  c: PixelCanvas, x: number, y: number, w: number, h: number,
  accent: Color, scale: number, alpha = 36,
): void {
  const half = scale / 2;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // Offset every other row to make a diamond lattice.
      const row = Math.floor((y + py) / scale);
      const ox = row % 2 === 0 ? 0 : half;
      const cx = (((x + px + ox) % scale) + scale) % scale - half;
      const cy = (((y + py) % scale) + scale) % scale - half;
      const d = Math.abs(cx) / half + Math.abs(cy) / half; // diamond distance
      // Thin diamond outline + a central dot = a simple brocade node.
      const onDiamond = d > 0.78 && d < 0.94;
      const onNode = Math.abs(cx) <= 1 && Math.abs(cy) <= 1;
      if (onDiamond || onNode) {
        c.putPixel(x + px, y + py, accent[0], accent[1], accent[2], alpha);
      }
    }
  }
}

/** Soft marbling: diagonal veins over an existing light base. */
export function marbleVein(
  c: PixelCanvas, x: number, y: number, w: number, h: number,
  vein: Color, seed: number,
): void {
  const rand = rng(seed);
  const veins = 2 + Math.floor(rand() * 3);
  for (let v = 0; v < veins; v++) {
    let vx = x + rand() * w;
    let vy = y + rand() * h;
    const steps = Math.floor(h * (0.6 + rand() * 0.8));
    const slope = (rand() - 0.5) * 1.4;
    for (let s = 0; s < steps; s++) {
      vx += slope + (rand() - 0.5) * 1.2;
      vy += 1;
      c.putPixel(Math.round(vx), Math.round(vy), vein[0], vein[1], vein[2], 40 + Math.floor(rand() * 40));
    }
  }
}

/**
 * A balustrade: a top rail, a bottom rail and evenly spaced turned balusters
 * between them. Used for the stair gallery and landing edges.
 */
export function balustrade(
  c: PixelCanvas, x: number, y: number, w: number, railH: number,
  spacing: number, ramp: Color[],
): void {
  const dark = ramp[2];
  const mid = ramp[4] ?? ramp[ramp.length - 2];
  const light = ramp[ramp.length - 1];
  // Top rail (with a lit top edge) and base rail.
  c.fillRect(x, y, w, 3, mid[0], mid[1], mid[2]);
  c.drawHLine(x, y, w, light[0], light[1], light[2]);
  c.fillRect(x, y + railH - 2, w, 2, dark[0], dark[1], dark[2]);
  // Balusters.
  for (let bx = x + 2; bx < x + w - 1; bx += spacing) {
    c.drawVLine(bx, y + 3, railH - 5, mid[0], mid[1], mid[2]);
    c.putPixel(bx - 1, y + 3 + Math.floor((railH - 5) / 2), dark[0], dark[1], dark[2], 120);
    c.putPixel(bx + 1, y + 4, light[0], light[1], light[2], 150);
  }
}

/** A gilt-framed portrait with a faint figure inside. All integer coords. */
export function portrait(
  c: PixelCanvas, x: number, y: number, w: number, h: number,
  frame: Color[], seed: number,
): void {
  const rand = rng(seed);
  const gilt = frame[frame.length - 1];
  const giltDim = frame[Math.max(0, frame.length - 3)];
  // Outer gilt frame with a bevel (dim base, bright top-left edge).
  c.fillRect(x - 2, y - 2, w + 4, h + 4, giltDim[0], giltDim[1], giltDim[2]);
  c.strokeRect(x - 2, y - 2, w + 4, h + 4, gilt[0], gilt[1], gilt[2]);
  c.strokeRect(x - 1, y - 1, w + 2, h + 2, frame[1][0], frame[1][1], frame[1][2]);
  // Canvas ground: a dim vertical wash, light at the top.
  for (let row = 0; row < h; row++) {
    const t = row / Math.max(1, h - 1);
    const col = lerpColor([42, 34, 36], [16, 12, 16], t);
    c.fillRect(x, y + row, w, 1, col[0], col[1], col[2]);
  }
  // Shoulders then head: a shadowy sitter.
  const cx = Math.round(x + w / 2);
  const headR = Math.max(2, Math.round(w * 0.2));
  const headCy = Math.round(y + h * 0.42);
  c.fillEllipse(cx, Math.round(y + h * 0.95), Math.max(3, Math.round(w * 0.42)), Math.max(3, Math.round(h * 0.3)), 22, 17, 24);
  const skin = lerpColor([58, 46, 42], [92, 74, 62], rand());
  c.fillEllipse(cx, headCy, headR, headR + 1, skin[0], skin[1], skin[2]);
  // Brow shadow + a catch-light on one cheek.
  c.drawHLine(cx - headR, headCy - 1, headR * 2, 20, 14, 16, 120);
  c.putPixel(cx - Math.round(headR * 0.4), headCy, 140, 128, 116, 90);
}
