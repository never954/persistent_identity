/*
 * sceneCompositions.ts — pixel-art scene drawing functions for the cutscene.
 * --------------------------------------------------------------------------
 * Each function draws one complete frame to a 384×216 PixelCanvas.
 * Called every frame by CutsceneScreen with the current scene elapsed time.
 *
 * Art style target: "Pixel Chill" / lofi loop aesthetic — small pixel grid,
 * dithered textures, rich color ramps, dense environmental detail, layered
 * warm lighting with natural falloff.
 */

import { PixelCanvas, type Color, lerpColor } from '../../components/pixel/pixelRenderer';
import { damask, woodGrain, marbleVein, speckle, balustrade, portrait } from '../../components/pixel/textures';
import {
  SKY_NIGHT_RAMP, CLOUD_RAMP, STONE_RAMP, GLASS_WARM_RAMP, GLASS_DARK_RAMP,
  GRAVEL_RAMP, FOLIAGE_RAMP, CANDLE_RAMP, WARM_GLOW_RAMP, WOOD_DARK_RAMP,
  IRON_RAMP, BRASS_RAMP, MARBLE_RAMP, CARPET_RAMP, WALLPAPER_RAMP,
  TRENCHCOAT_RAMP, RAIN_COL, PUDDLE_RAMP, LIGHTNING_COL, PARCHMENT_COL,
  TITLE_GLOW_COL, BRICK_RAMP,
} from '../../components/pixel/palettes';

/* ================================================================== */
/*  Shared helpers                                                     */
/* ================================================================== */

/** @internal 5×7 pixel font for the title card. */
const FONT: Record<string, string[]> = {
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
};

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  len: number;
  alpha: number;
}

/**
 * Deterministic rain array — seeded per-scene so each scene has its own
 * consistent rain pattern instead of sharing a mutable global.
 */
function makeRain(count: number, w: number, h: number, seed: number): RainDrop[] {
  const drops: RainDrop[] = [];
  // Simple seeded pseudo-random (mulberry32-ish).
  let s = seed | 0;
  const rand = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < count; i++) {
    drops.push({
      x: rand() * w,
      y: rand() * h,
      speed: 120 + rand() * 200,
      len: 3 + rand() * 8,
      alpha: 60 + rand() * 100,
    });
  }
  return drops;
}

/** Draw animated rain streaks (slanted, variable length, variable alpha). */
function drawRain(canvas: PixelCanvas, time: number, drops: RainDrop[]): void {
  const w = canvas.width;
  const h = canvas.height;
  const windSlant = 0.15;
  for (const d of drops) {
    const y = ((d.y + d.speed * time) % (h + d.len * 2)) - d.len;
    const x = ((d.x - d.speed * time * windSlant) % w + w) % w;
    // Draw a multi-pixel streak
    for (let p = 0; p < d.len; p++) {
      const px = Math.floor(x - p * windSlant);
      const py = Math.floor(y - p);
      const fade = p / d.len;
      canvas.putPixel(px, py, RAIN_COL[0], RAIN_COL[1], RAIN_COL[2], Math.round(d.alpha * (1 - fade)));
    }
  }
}

/** Periodic lightning flash — brightens the whole scene briefly. */
function applyLightning(canvas: PixelCanvas, time: number): void {
  const period = 6.5;
  const t = time % period;
  // Double flash pattern
  if ((t > 0.1 && t < 0.18) || (t > 0.28 && t < 0.32)) {
    const intensity = t < 0.2 ? 0.25 : 0.45;
    canvas.applyLighting(
      canvas.width / 2, canvas.height * 0.3, canvas.width * 0.9,
      LIGHTNING_COL[0], LIGHTNING_COL[1], LIGHTNING_COL[2], intensity,
    );
  }
}

/** Draw a simple dithered tree silhouette (for the exterior scenes). */
function drawTree(canvas: PixelCanvas, x: number, baseY: number, height: number): void {
  const trunkW = 3;
  const trunkH = Math.floor(height * 0.35);
  // trunk
  canvas.fillRect(x - 1, baseY - trunkH, trunkW, trunkH, FOLIAGE_RAMP[0][0], FOLIAGE_RAMP[0][1], FOLIAGE_RAMP[0][2]);
  // canopy layers (overlapping ellipses)
  const cy = baseY - trunkH;
  const leafH = height - trunkH;
  canvas.fillEllipse(x, cy - leafH * 0.3, Math.floor(height * 0.28), Math.floor(leafH * 0.5), FOLIAGE_RAMP[1][0], FOLIAGE_RAMP[1][1], FOLIAGE_RAMP[1][2]);
  canvas.fillEllipse(x - 4, cy - leafH * 0.5, Math.floor(height * 0.22), Math.floor(leafH * 0.35), FOLIAGE_RAMP[2][0], FOLIAGE_RAMP[2][1], FOLIAGE_RAMP[2][2]);
  canvas.fillEllipse(x + 3, cy - leafH * 0.65, Math.floor(height * 0.18), Math.floor(leafH * 0.3), FOLIAGE_RAMP[3][0], FOLIAGE_RAMP[3][1], FOLIAGE_RAMP[3][2]);
}

/** Draw a detailed window with frame, mullions, and optional warm glow. */
function drawWindow(canvas: PixelCanvas, x: number, y: number, w: number, h: number, lit: boolean): void {
  const ramp = lit ? GLASS_WARM_RAMP : GLASS_DARK_RAMP;
  // Window glass with gradient
  canvas.fillGradient(x, y, w, h, ramp);
  // Frame
  canvas.strokeRect(x - 1, y - 1, w + 2, h + 2, STONE_RAMP[0][0], STONE_RAMP[0][1], STONE_RAMP[0][2]);
  // Mullion cross
  canvas.drawHLine(x, y + Math.floor(h / 2), w, STONE_RAMP[1][0], STONE_RAMP[1][1], STONE_RAMP[1][2]);
  canvas.drawVLine(x + Math.floor(w / 2), y, h, STONE_RAMP[1][0], STONE_RAMP[1][1], STONE_RAMP[1][2]);
  // Sill
  canvas.fillRect(x - 2, y + h, w + 4, 2, STONE_RAMP[3][0], STONE_RAMP[3][1], STONE_RAMP[3][2]);
  if (lit) {
    canvas.applyLighting(x + w / 2, y + h / 2, 28, WARM_GLOW_RAMP[6][0], WARM_GLOW_RAMP[6][1], WARM_GLOW_RAMP[6][2], 0.25);
  }
}

/* ================================================================== */
/*  Scene 1: The Exterior Approach                                     */
/* ================================================================== */

const RAIN_1 = makeRain(100, 384, 216, 12345);

export function drawExteriorApproach(canvas: PixelCanvas, time: number): void {
  const w = canvas.width;
  const h = canvas.height;

  // --- Sky gradient ---
  canvas.fillGradient(0, 0, w, 100, SKY_NIGHT_RAMP);

  // --- Clouds (layered bumpy silhouettes) ---
  for (let i = 0; i < 7; i++) {
    const cx = ((i * 62 + Math.sin(time * 0.15 + i * 1.3) * 14) % (w + 60)) - 30;
    const cy = 12 + (i % 3) * 18 + Math.cos(time * 0.2 + i * 2.1) * 3;
    const rampIdx = Math.min(i % 3 + 1, CLOUD_RAMP.length - 1);
    canvas.fillEllipse(Math.floor(cx), Math.floor(cy), 45 - i * 2, 12 + (i % 2) * 5, CLOUD_RAMP[rampIdx][0], CLOUD_RAMP[rampIdx][1], CLOUD_RAMP[rampIdx][2]);
    canvas.fillEllipse(Math.floor(cx) + 18, Math.floor(cy) - 4, 30, 10, CLOUD_RAMP[rampIdx + 1] ? CLOUD_RAMP[rampIdx + 1][0] : CLOUD_RAMP[rampIdx][0], CLOUD_RAMP[rampIdx + 1] ? CLOUD_RAMP[rampIdx + 1][1] : CLOUD_RAMP[rampIdx][1], CLOUD_RAMP[rampIdx + 1] ? CLOUD_RAMP[rampIdx + 1][2] : CLOUD_RAMP[rampIdx][2]);
  }

  // --- Distant treeline ---
  for (let x = 0; x < w; x += 12) {
    const th = 18 + Math.sin(x * 0.07) * 6;
    canvas.fillEllipse(x, 94, 8, Math.floor(th / 2), FOLIAGE_RAMP[0][0], FOLIAGE_RAMP[0][1], FOLIAGE_RAMP[0][2]);
  }

  // --- Ground base ---
  canvas.fillGradient(0, 95, w, h - 95, [FOLIAGE_RAMP[0], FOLIAGE_RAMP[1], GRAVEL_RAMP[1], GRAVEL_RAMP[0]]);

  // --- The Manor (centered, ~240px wide) ---
  const mw = 240;
  const mx = (w - mw) / 2;
  const my = 56; // top of the building walls

  // Main walls — dithered stone texture
  canvas.fillDithered(mx + 30, my + 20, mw - 60, 68, STONE_RAMP[2], STONE_RAMP[3], 6);
  // Left wing
  canvas.fillDithered(mx, my + 28, 38, 60, STONE_RAMP[1], STONE_RAMP[2], 8);
  // Right wing
  canvas.fillDithered(mx + mw - 38, my + 28, 38, 60, STONE_RAMP[1], STONE_RAMP[2], 8);

  // Roof — central peaked
  for (let i = 0; i < 90; i++) {
    const roofY = my + 20 - Math.floor(i * 0.35);
    const roofCol = lerpColor(STONE_RAMP[0], STONE_RAMP[1], i / 90);
    canvas.putPixel(mx + 30 + i, roofY, roofCol[0], roofCol[1], roofCol[2]);
    canvas.putPixel(mx + mw - 30 - i, roofY, roofCol[0], roofCol[1], roofCol[2]);
    // Fill below the roof line
    if (roofY < my + 20) {
      canvas.drawVLine(mx + 30 + i, roofY, my + 20 - roofY, STONE_RAMP[0][0], STONE_RAMP[0][1], STONE_RAMP[0][2]);
      canvas.drawVLine(mx + mw - 30 - i, roofY, my + 20 - roofY, STONE_RAMP[0][0], STONE_RAMP[0][1], STONE_RAMP[0][2]);
    }
  }

  // Wing roofs (flat)
  canvas.fillRect(mx - 2, my + 26, 42, 3, STONE_RAMP[0][0], STONE_RAMP[0][1], STONE_RAMP[0][2]);
  canvas.fillRect(mx + mw - 40, my + 26, 42, 3, STONE_RAMP[0][0], STONE_RAMP[0][1], STONE_RAMP[0][2]);

  // Chimneys
  canvas.fillRect(mx + 18, my - 4, 10, 32, BRICK_RAMP[2][0], BRICK_RAMP[2][1], BRICK_RAMP[2][2]);
  canvas.fillRect(mx + 16, my - 6, 14, 3, BRICK_RAMP[3][0], BRICK_RAMP[3][1], BRICK_RAMP[3][2]);
  canvas.fillRect(mx + mw - 28, my, 10, 28, BRICK_RAMP[2][0], BRICK_RAMP[2][1], BRICK_RAMP[2][2]);
  canvas.fillRect(mx + mw - 30, my - 2, 14, 3, BRICK_RAMP[3][0], BRICK_RAMP[3][1], BRICK_RAMP[3][2]);

  // Windows — 3 rows × 5 columns (skipping door position)
  const winW = 12;
  const winH = 14;
  const litPattern = [true, false, true, false, true, false, true, true, false, false, false, true, false, false]; // which windows glow
  let winIdx = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) continue; // entrance arch
      const wx = mx + 46 + col * 36;
      const wy = my + 26 + row * 22;
      drawWindow(canvas, wx, wy, winW, winH, litPattern[winIdx] ?? false);
      winIdx++;
    }
  }

  // Entrance archway
  const doorX = mx + mw / 2;
  const doorY = my + 70;
  canvas.fillEllipse(doorX, doorY - 6, 16, 16, WOOD_DARK_RAMP[1][0], WOOD_DARK_RAMP[1][1], WOOD_DARK_RAMP[1][2]);
  canvas.fillRect(doorX - 16, doorY, 32, 18, WOOD_DARK_RAMP[1][0], WOOD_DARK_RAMP[1][1], WOOD_DARK_RAMP[1][2]);
  // Warm glow from the entrance
  canvas.applyLighting(doorX, doorY + 10, 35, WARM_GLOW_RAMP[5][0], WARM_GLOW_RAMP[5][1], WARM_GLOW_RAMP[5][2], 0.3);

  // Cornice / ledge lines
  canvas.drawHLine(mx + 28, my + 25, mw - 56, STONE_RAMP[4][0], STONE_RAMP[4][1], STONE_RAMP[4][2]);
  canvas.drawHLine(mx + 28, my + 87, mw - 56, STONE_RAMP[0][0], STONE_RAMP[0][1], STONE_RAMP[0][2]);

  // --- Foreground: gravel path ---
  canvas.fillDithered(w / 2 - 35, h - 50, 70, 50, GRAVEL_RAMP[2], GRAVEL_RAMP[4], 7);
  // Puddles
  canvas.fillEllipse(w / 2 - 12, h - 18, 14, 4, PUDDLE_RAMP[2][0], PUDDLE_RAMP[2][1], PUDDLE_RAMP[2][2]);
  canvas.fillEllipse(w / 2 + 20, h - 12, 10, 3, PUDDLE_RAMP[1][0], PUDDLE_RAMP[1][1], PUDDLE_RAMP[1][2]);

  // Iron gate fence across the foreground
  const gateY = h - 52;
  canvas.drawHLine(0, gateY, w, IRON_RAMP[2][0], IRON_RAMP[2][1], IRON_RAMP[2][2]);
  canvas.drawHLine(0, gateY + 18, w, IRON_RAMP[1][0], IRON_RAMP[1][1], IRON_RAMP[1][2]);
  for (let gx = 8; gx < w; gx += 14) {
    canvas.drawVLine(gx, gateY, 20, IRON_RAMP[2][0], IRON_RAMP[2][1], IRON_RAMP[2][2]);
    // Pointed finial
    canvas.putPixel(gx, gateY - 1, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
    canvas.putPixel(gx, gateY - 2, IRON_RAMP[4][0], IRON_RAMP[4][1], IRON_RAMP[4][2]);
  }
  // Gate opening in the centre
  canvas.fillRect(w / 2 - 18, gateY - 2, 36, 24, 0, 0, 0, 0); // clear the gate
  canvas.fillDithered(w / 2 - 18, gateY, 36, 20, GRAVEL_RAMP[2], GRAVEL_RAMP[3], 9);

  // Flanking trees
  drawTree(canvas, mx - 20, h - 50, 55);
  drawTree(canvas, mx + mw + 20, h - 50, 60);
  drawTree(canvas, mx - 45, h - 46, 45);
  drawTree(canvas, mx + mw + 45, h - 46, 50);

  // --- Animated: car headlights approaching ---
  const hx = Math.min(time * 45 - 60, w / 2 - 50);
  if (hx > -30) {
    // Car body (simple dark rectangle)
    canvas.fillRect(Math.floor(hx) - 20, h - 32, 40, 16, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
    canvas.fillRect(Math.floor(hx) - 14, h - 38, 28, 8, TRENCHCOAT_RAMP[1][0], TRENCHCOAT_RAMP[1][1], TRENCHCOAT_RAMP[1][2]);
    // Headlights
    canvas.putPixel(Math.floor(hx) + 20, h - 26, 255, 240, 180);
    canvas.putPixel(Math.floor(hx) + 20, h - 24, 255, 240, 180);
    canvas.applyLighting(Math.floor(hx) + 30, h - 25, 50, 255, 220, 140, 0.5);
    // Tail lights
    canvas.putPixel(Math.floor(hx) - 20, h - 26, 180, 30, 20);
    canvas.putPixel(Math.floor(hx) - 20, h - 24, 180, 30, 20);
  }

  // --- Rain & lightning ---
  drawRain(canvas, time, RAIN_1);
  applyLightning(canvas, time);

  // --- Vignette ---
  canvas.applyVignette(w / 2, h / 2, Math.min(w, h) * 0.55, 0.6);
}

/* ================================================================== */
/*  Scene 2: The Detective Walking                                     */
/* ================================================================== */

const RAIN_2 = makeRain(80, 384, 216, 67890);

export function drawDetectiveWalking(canvas: PixelCanvas, time: number): void {
  const w = canvas.width;
  const h = canvas.height;

  const scrollManor = (time * 8) % 120;
  const scrollHedge = (time * 15) % 80;
  const scrollPath = (time * 20) % 100;

  // --- Sky ---
  canvas.fillGradient(0, 0, w, 90, SKY_NIGHT_RAMP);

  // --- Clouds drifting ---
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 90 + time * 3) % (w + 80)) - 40;
    const cy = 15 + i * 14;
    canvas.fillEllipse(Math.floor(cx), cy, 42, 10, CLOUD_RAMP[i % CLOUD_RAMP.length][0], CLOUD_RAMP[i % CLOUD_RAMP.length][1], CLOUD_RAMP[i % CLOUD_RAMP.length][2]);
  }

  // --- Manor wall (scrolling background) ---
  canvas.fillDithered(0, 50, w, 60, STONE_RAMP[2], STONE_RAMP[3], 7);
  // Roof line
  canvas.fillRect(0, 48, w, 3, STONE_RAMP[0][0], STONE_RAMP[0][1], STONE_RAMP[0][2]);
  // Windows on the manor wall (scrolling)
  for (let i = -scrollManor; i < w + 60; i += 60) {
    drawWindow(canvas, Math.floor(i) + 10, 62, 10, 12, (Math.floor(i / 60) & 1) === 0);
    drawWindow(canvas, Math.floor(i) + 35, 65, 10, 12, (Math.floor(i / 60) & 1) === 1);
  }

  // --- Hedge row (scrolling midground) ---
  for (let i = -scrollHedge; i < w + 40; i += 40) {
    const hx = Math.floor(i);
    canvas.fillEllipse(hx, 115, 22, 14, FOLIAGE_RAMP[1][0], FOLIAGE_RAMP[1][1], FOLIAGE_RAMP[1][2]);
    canvas.fillEllipse(hx + 8, 112, 16, 10, FOLIAGE_RAMP[2][0], FOLIAGE_RAMP[2][1], FOLIAGE_RAMP[2][2]);
  }

  // --- Path / ground (scrolling foreground) ---
  canvas.fillDithered(0, 122, w, h - 122, GRAVEL_RAMP[1], GRAVEL_RAMP[3], 8);
  // Gravel texture noise
  for (let px = 0; px < w; px += 3) {
    for (let py = 125; py < h; py += 4) {
      const noise = ((px * 7 + py * 13) % 17) > 10;
      if (noise) canvas.putPixel(px, py, GRAVEL_RAMP[4][0], GRAVEL_RAMP[4][1], GRAVEL_RAMP[4][2], 60);
    }
  }
  // Puddles (scrolling)
  for (let i = -scrollPath; i < w + 80; i += 80) {
    canvas.fillEllipse(Math.floor(i) + 30, 170, 18, 4, PUDDLE_RAMP[2][0], PUDDLE_RAMP[2][1], PUDDLE_RAMP[2][2]);
    // Puddle reflection shimmer
    const shimmer = Math.sin(time * 4 + i) * 0.3 + 0.5;
    canvas.putPixel(Math.floor(i) + 28, 169, PUDDLE_RAMP[4][0], PUDDLE_RAMP[4][1], PUDDLE_RAMP[4][2], Math.round(shimmer * 150));
  }

  // --- Gas lamps (scrolling with hedge) ---
  for (let i = -scrollHedge - 20; i < w + 150; i += 150) {
    const lx = Math.floor(i);
    // Post
    canvas.fillRect(lx, 90, 3, 32, IRON_RAMP[2][0], IRON_RAMP[2][1], IRON_RAMP[2][2]);
    // Lantern housing
    canvas.fillRect(lx - 2, 86, 7, 6, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
    // Flame
    const flicker = 0.8 + Math.sin(time * 12 + i) * 0.2;
    canvas.putPixel(lx + 1, 87, CANDLE_RAMP[7][0], CANDLE_RAMP[7][1], CANDLE_RAMP[7][2]);
    canvas.putPixel(lx + 1, 88, CANDLE_RAMP[6][0], CANDLE_RAMP[6][1], CANDLE_RAMP[6][2]);
    canvas.applyLighting(lx + 1, 88, 40, WARM_GLOW_RAMP[5][0], WARM_GLOW_RAMP[5][1], WARM_GLOW_RAMP[5][2], 0.35 * flicker);
  }

  // --- The Detective (centered, walking) ---
  const dx = w / 2;
  const dy = 120;
  const walkFrame = Math.floor(time / 0.25) % 4;

  // Trenchcoat body
  canvas.fillDithered(dx - 7, dy, 14, 22, TRENCHCOAT_RAMP[1], TRENCHCOAT_RAMP[2], 6);
  // Coat shadow (right side)
  canvas.fillRect(dx + 2, dy + 2, 5, 18, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2], 100);
  // Collar
  canvas.fillRect(dx - 5, dy - 2, 10, 4, TRENCHCOAT_RAMP[3][0], TRENCHCOAT_RAMP[3][1], TRENCHCOAT_RAMP[3][2]);
  // Head
  canvas.fillRect(dx - 4, dy - 10, 8, 8, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  // Fedora brim
  canvas.drawHLine(dx - 8, dy - 6, 16, TRENCHCOAT_RAMP[2][0], TRENCHCOAT_RAMP[2][1], TRENCHCOAT_RAMP[2][2]);
  canvas.drawHLine(dx - 7, dy - 7, 14, TRENCHCOAT_RAMP[2][0], TRENCHCOAT_RAMP[2][1], TRENCHCOAT_RAMP[2][2]);
  // Fedora crown
  canvas.fillRect(dx - 4, dy - 12, 8, 5, TRENCHCOAT_RAMP[1][0], TRENCHCOAT_RAMP[1][1], TRENCHCOAT_RAMP[1][2]);

  // Walking legs (4 frames)
  const legColor: Color = TRENCHCOAT_RAMP[0];
  if (walkFrame === 0) {
    canvas.fillRect(dx - 4, dy + 22, 3, 10, legColor[0], legColor[1], legColor[2]);
    canvas.fillRect(dx + 1, dy + 22, 3, 10, legColor[0], legColor[1], legColor[2]);
  } else if (walkFrame === 1) {
    canvas.fillRect(dx - 5, dy + 22, 3, 9, legColor[0], legColor[1], legColor[2]);
    canvas.fillRect(dx + 3, dy + 22, 3, 11, legColor[0], legColor[1], legColor[2]);
  } else if (walkFrame === 2) {
    canvas.fillRect(dx - 4, dy + 22, 3, 10, legColor[0], legColor[1], legColor[2]);
    canvas.fillRect(dx + 1, dy + 22, 3, 10, legColor[0], legColor[1], legColor[2]);
  } else {
    canvas.fillRect(dx - 3, dy + 22, 3, 11, legColor[0], legColor[1], legColor[2]);
    canvas.fillRect(dx + 5, dy + 22, 3, 9, legColor[0], legColor[1], legColor[2]);
  }

  drawRain(canvas, time, RAIN_2);
  canvas.applyVignette(w / 2, h / 2 + 10, Math.min(w, h) * 0.52, 0.5);
}

/* ================================================================== */
/*  Scene 3: The Entrance Doors                                        */
/* ================================================================== */

const RAIN_3 = makeRain(50, 384, 216, 24680);

export function drawEntranceDoors(canvas: PixelCanvas, time: number): void {
  const w = canvas.width;
  const h = canvas.height;

  // Dark stone background
  canvas.fillGradient(0, 0, w, h, [STONE_RAMP[0], STONE_RAMP[1], STONE_RAMP[2], STONE_RAMP[1], STONE_RAMP[0]]);

  // --- Stone archway (fills most of the frame) ---
  const archCX = w / 2;
  const archTop = 20;
  const archW = 130;
  const archH = h - 30;

  // Outer stonework
  canvas.fillDithered(archCX - archW - 20, 0, archW * 2 + 40, h, STONE_RAMP[1], STONE_RAMP[2], 5);
  // Inner reveal (darker)
  canvas.fillDithered(archCX - archW, archTop + 40, archW * 2, archH - 40, STONE_RAMP[0], STONE_RAMP[1], 4);

  // Arch curve at top
  canvas.fillEllipse(archCX, archTop + 40, archW, 50, STONE_RAMP[0][0], STONE_RAMP[0][1], STONE_RAMP[0][2]);
  // Keystone
  canvas.fillRect(archCX - 6, archTop + 2, 12, 18, STONE_RAMP[4][0], STONE_RAMP[4][1], STONE_RAMP[4][2]);

  // --- Doors opening ---
  const openT = Math.min(1, Math.max(0, (time - 0.8) * 0.28));
  const gap = Math.floor(openT * archW * 0.55);

  // Interior warm glow visible through gap
  if (gap > 0) {
    canvas.fillGradient(archCX - gap, archTop + 50, gap * 2, archH - 50, WARM_GLOW_RAMP);
    canvas.applyLighting(archCX, h - 40, 40 + gap * 2, WARM_GLOW_RAMP[6][0], WARM_GLOW_RAMP[6][1], WARM_GLOW_RAMP[6][2], 0.4 * openT);
  }

  // Left door
  const ldx = archCX - gap;
  canvas.fillDithered(ldx - archW + 10, archTop + 50, archW - 10, archH - 50, WOOD_DARK_RAMP[2], WOOD_DARK_RAMP[3], 7);
  // Right door
  canvas.fillDithered(archCX + gap, archTop + 50, archW - 10, archH - 50, WOOD_DARK_RAMP[2], WOOD_DARK_RAMP[4], 5);

  // Iron studs on doors
  for (let i = 0; i < 4; i++) {
    const sy = archTop + 70 + i * 28;
    canvas.fillEllipse(ldx - archW / 2 + 10, sy, 3, 3, IRON_RAMP[4][0], IRON_RAMP[4][1], IRON_RAMP[4][2]);
    canvas.fillEllipse(archCX + gap + archW / 2 - 10, sy, 3, 3, IRON_RAMP[4][0], IRON_RAMP[4][1], IRON_RAMP[4][2]);
  }

  // Brass knockers / handles
  canvas.fillEllipse(ldx - 12, h / 2 + 10, 5, 7, BRASS_RAMP[5][0], BRASS_RAMP[5][1], BRASS_RAMP[5][2]);
  canvas.fillEllipse(archCX + gap + 12, h / 2 + 10, 5, 7, BRASS_RAMP[5][0], BRASS_RAMP[5][1], BRASS_RAMP[5][2]);

  // Ivy on archway
  for (let ivy = 0; ivy < 8; ivy++) {
    const ix = archCX - archW - 10 + ivy * 18 + (ivy > 3 ? archW * 2 - 40 : 0);
    const iy = archTop + 20 + (ivy % 3) * 12;
    canvas.putPixel(ix, iy, FOLIAGE_RAMP[3][0], FOLIAGE_RAMP[3][1], FOLIAGE_RAMP[3][2]);
    canvas.putPixel(ix + 1, iy + 1, FOLIAGE_RAMP[2][0], FOLIAGE_RAMP[2][1], FOLIAGE_RAMP[2][2]);
    canvas.putPixel(ix - 1, iy + 2, FOLIAGE_RAMP[4][0], FOLIAGE_RAMP[4][1], FOLIAGE_RAMP[4][2]);
  }

  // --- Detective silhouette (bottom centre, back turned) ---
  canvas.fillRect(archCX - 12, h - 48, 24, 38, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  canvas.fillRect(archCX - 8, h - 58, 16, 12, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  canvas.drawHLine(archCX - 12, h - 50, 24, TRENCHCOAT_RAMP[1][0], TRENCHCOAT_RAMP[1][1], TRENCHCOAT_RAMP[1][2]); // brim

  // Stone floor
  canvas.fillDithered(0, h - 14, w, 14, STONE_RAMP[2], STONE_RAMP[3], 6);

  drawRain(canvas, time, RAIN_3);
  canvas.applyVignette(archCX, h / 2, Math.min(w, h) * 0.48, 0.7);
}

/* ================================================================== */
/*  Scene 4: The Foyer Interior                                        */
/* ================================================================== */

export function drawFoyerInterior(canvas: PixelCanvas, time: number): void {
  const w = canvas.width;
  const h = canvas.height;
  const floorY = h - 50;        // where the ground-floor marble begins
  const landingY = 92;          // top of the staircase / upper gallery level
  const cx = w / 2;

  // --- Back wall with papered gradient + damask + grime ---
  canvas.fillGradient(0, 0, w, floorY, WALLPAPER_RAMP);
  damask(canvas, 0, 0, w, floorY, [92, 80, 70], 16, 30);
  speckle(canvas, 0, 0, w, floorY, [8, 6, 10], 0.015, 40, 9911);

  // --- Upper gallery behind the landing (where the stairs lead) ---
  // Darker recessed wall above the landing so the gallery reads as depth.
  canvas.fillDithered(0, 0, w, landingY, WALLPAPER_RAMP[0], WALLPAPER_RAMP[1], 5);
  damask(canvas, 0, 0, w, landingY, [60, 52, 48], 16, 22);

  // Arched hallway opening at the top of the stairs — a lit corridor beyond.
  const archW = 54;
  canvas.fillRect(cx - archW / 2, landingY - 54, archW, 54, 6, 5, 9);
  canvas.fillEllipse(cx, landingY - 54, archW / 2, 16, 6, 5, 9);
  // Warm light spilling from the corridor.
  canvas.fillGradient(cx - archW / 2 + 3, landingY - 44, archW - 6, 44,
    [[10, 8, 6], [30, 20, 12], [52, 36, 20]]);
  canvas.applyLighting(cx, landingY - 24, 46, WARM_GLOW_RAMP[5][0], WARM_GLOW_RAMP[5][1], WARM_GLOW_RAMP[5][2], 0.3);
  // Runner carpet leading into the corridor.
  canvas.fillDithered(cx - 10, landingY - 40, 20, 40, CARPET_RAMP[1], CARPET_RAMP[2], 7);
  // Arch keystone + stone surround.
  canvas.strokeRect(cx - archW / 2 - 2, landingY - 54, archW + 4, 54, WOOD_DARK_RAMP[4][0], WOOD_DARK_RAMP[4][1], WOOD_DARK_RAMP[4][2]);
  canvas.fillRect(cx - 3, landingY - 56, 6, 8, STONE_RAMP[5][0], STONE_RAMP[5][1], STONE_RAMP[5][2]);

  // Tall moonlit windows flanking the corridor on the upper wall.
  for (const wx of [cx - 70, cx + 58]) {
    drawWindow(canvas, wx, landingY - 48, 12, 34, false);
    canvas.applyLighting(wx + 6, landingY - 30, 22, 120, 140, 180, 0.12);
  }

  // --- Upper gallery walkway + balustrade spanning the width ---
  // Walkway floor slab at landing level.
  canvas.fillDithered(0, landingY, w, 7, WOOD_DARK_RAMP[2], WOOD_DARK_RAMP[3], 5);
  canvas.drawHLine(0, landingY, w, WOOD_DARK_RAMP[5][0], WOOD_DARK_RAMP[5][1], WOOD_DARK_RAMP[5][2]);
  // Gallery railing on the left and right of the stair opening.
  balustrade(canvas, 0, landingY - 16, cx - 52, 16, 6, WOOD_DARK_RAMP);
  balustrade(canvas, cx + 52, landingY - 16, w - (cx + 52), 16, 6, WOOD_DARK_RAMP);

  // --- Wainscot / dado on the lower wall ---
  canvas.fillDithered(0, floorY - 26, w, 26, WOOD_DARK_RAMP[2], WOOD_DARK_RAMP[3], 6);
  woodGrain(canvas, 0, floorY - 26, w, 26, WOOD_DARK_RAMP, 4242);
  canvas.drawHLine(0, floorY - 26, w, WOOD_DARK_RAMP[6][0], WOOD_DARK_RAMP[6][1], WOOD_DARK_RAMP[6][2]);
  canvas.drawHLine(0, floorY - 2, w, WOOD_DARK_RAMP[0][0], WOOD_DARK_RAMP[0][1], WOOD_DARK_RAMP[0][2]);

  // --- Marble chequered floor with veining + candle reflections ---
  for (let py = floorY; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const tileSize = 14;
      const tx = Math.floor(px / tileSize);
      const ty = Math.floor((py - floorY) / tileSize);
      const isLight = (tx + ty) % 2 === 0;
      const depthFade = 1 - (py - floorY) / 50 * 0.3;
      const col = isLight
        ? lerpColor(MARBLE_RAMP[5], MARBLE_RAMP[3], 1 - depthFade)
        : lerpColor(MARBLE_RAMP[1], MARBLE_RAMP[0], 1 - depthFade);
      canvas.putPixel(px, py, col[0], col[1], col[2]);
    }
  }
  marbleVein(canvas, 0, floorY, w, 50, MARBLE_RAMP[6], 7788);
  // Soft vertical reflection of the warm doorway glow on the polished floor.
  for (let py = floorY; py < h; py++) {
    const a = Math.round(40 * (1 - (py - floorY) / 50));
    canvas.putPixel(cx, py, CANDLE_RAMP[4][0], CANDLE_RAMP[4][1], CANDLE_RAMP[4][2], a);
    canvas.putPixel(cx + 1, py, CANDLE_RAMP[3][0], CANDLE_RAMP[3][1], CANDLE_RAMP[3][2], a);
  }

  // --- Grand staircase climbing to the landing ---
  // Drawn top-to-bottom so each nearer (lower) step overlaps the one behind,
  // giving a clear tread/riser read instead of a flat ramp.
  const stepCount = 9;
  const stepH = Math.ceil((floorY - landingY) / stepCount);
  for (let step = stepCount - 1; step >= 0; step--) {
    const t = step / stepCount;
    const sw = Math.round(122 - t * 58);     // narrows toward the top
    const sx = Math.round(cx - sw / 2);
    const sy = floorY - (step + 1) * stepH;
    // Riser (dark vertical face) then tread (lit top) with a bright nosing.
    canvas.fillDithered(sx, sy, sw, stepH, WOOD_DARK_RAMP[2], WOOD_DARK_RAMP[3], 6);
    canvas.fillRect(sx, sy, sw, 2, WOOD_DARK_RAMP[6][0], WOOD_DARK_RAMP[6][1], WOOD_DARK_RAMP[6][2]);
    canvas.drawHLine(sx, sy, sw, WOOD_DARK_RAMP[8][0], WOOD_DARK_RAMP[8][1], WOOD_DARK_RAMP[8][2]);
    canvas.drawHLine(sx, sy + stepH - 1, sw, WOOD_DARK_RAMP[0][0], WOOD_DARK_RAMP[0][1], WOOD_DARK_RAMP[0][2]);
    // Carpet runner with brass stair rods at the nosing.
    canvas.fillDithered(cx - 15, sy, 30, stepH, CARPET_RAMP[2], CARPET_RAMP[4], 9);
    canvas.fillRect(cx - 15, sy, 30, 1, CARPET_RAMP[5][0], CARPET_RAMP[5][1], CARPET_RAMP[5][2]);
    canvas.putPixel(cx - 15, sy, BRASS_RAMP[7][0], BRASS_RAMP[7][1], BRASS_RAMP[7][2]);
    canvas.putPixel(cx + 14, sy, BRASS_RAMP[7][0], BRASS_RAMP[7][1], BRASS_RAMP[7][2]);
  }
  // Raked banisters: a solid handrail following the stair slope, balusters
  // beneath it, and a turned newel post at the foot.
  for (const side of [-1, 1]) {
    const topX = cx + side * 34;
    const botX = cx + side * 62;
    // Handrail (3px thick, lit top edge).
    for (let d = 0; d < 3; d++) {
      canvas.drawLine(botX, floorY - 8 + d, topX, landingY - 6 + d, WOOD_DARK_RAMP[5][0], WOOD_DARK_RAMP[5][1], WOOD_DARK_RAMP[5][2]);
    }
    canvas.drawLine(botX, floorY - 9, topX, landingY - 7, WOOD_DARK_RAMP[8][0], WOOD_DARK_RAMP[8][1], WOOD_DARK_RAMP[8][2]);
    // Balusters dropping from the rail to the steps.
    for (let b = 0; b <= 6; b++) {
      const bt = b / 6;
      const bxp = Math.round(botX + (topX - botX) * bt);
      const byTop = Math.round((floorY - 6) + ((landingY - 4) - (floorY - 6)) * bt);
      const byBot = Math.round((floorY - 2) + (landingY - (floorY - 2)) * bt);
      canvas.drawVLine(bxp, byTop, Math.max(2, byBot - byTop), WOOD_DARK_RAMP[4][0], WOOD_DARK_RAMP[4][1], WOOD_DARK_RAMP[4][2]);
    }
    // Newel post + brass ball finial.
    canvas.fillRect(botX - 2, floorY - 18, 5, 18, WOOD_DARK_RAMP[5][0], WOOD_DARK_RAMP[5][1], WOOD_DARK_RAMP[5][2]);
    canvas.drawVLine(botX - 2, floorY - 18, 18, WOOD_DARK_RAMP[7][0], WOOD_DARK_RAMP[7][1], WOOD_DARK_RAMP[7][2]);
    canvas.fillEllipse(botX, floorY - 20, 3, 3, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);
    canvas.putPixel(botX - 1, floorY - 21, BRASS_RAMP[7][0], BRASS_RAMP[7][1], BRASS_RAMP[7][2]);
  }

  // --- Chandelier (now lit) ---
  canvas.drawVLine(cx, 0, 26, IRON_RAMP[2][0], IRON_RAMP[2][1], IRON_RAMP[2][2]);
  canvas.fillEllipse(cx, 28, 32, 7, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
  canvas.fillEllipse(cx, 28, 22, 4, IRON_RAMP[4][0], IRON_RAMP[4][1], IRON_RAMP[4][2]);
  for (let arm = -3; arm <= 3; arm++) {
    const ax = cx + arm * 10;
    canvas.drawVLine(ax, 28, 7, IRON_RAMP[3][0], IRON_RAMP[3][1], IRON_RAMP[3][2]);
    const flicker = 0.7 + Math.sin(time * 11 + arm * 1.9) * 0.3;
    canvas.putPixel(ax, 34, CANDLE_RAMP[7][0], CANDLE_RAMP[7][1], CANDLE_RAMP[7][2]);
    canvas.putPixel(ax, 35, CANDLE_RAMP[6][0], CANDLE_RAMP[6][1], CANDLE_RAMP[6][2]);
    canvas.applyLighting(ax, 35, 26, WARM_GLOW_RAMP[4][0], WARM_GLOW_RAMP[4][1], WARM_GLOW_RAMP[4][2], 0.14 * flicker);
  }
  canvas.applyLighting(cx, 40, 90, WARM_GLOW_RAMP[5][0], WARM_GLOW_RAMP[5][1], WARM_GLOW_RAMP[5][2], 0.22);

  // --- Framed portraits with sitters (drawn before sconces so the glow
  //     spills softly over the wall between them, not across a face) ---
  portrait(canvas, 26, floorY - 56, 18, 24, BRASS_RAMP, 101);
  portrait(canvas, 96, floorY - 52, 15, 20, BRASS_RAMP, 202);
  portrait(canvas, w - 44, floorY - 54, 16, 22, BRASS_RAMP, 303);
  portrait(canvas, w - 112, floorY - 58, 18, 24, BRASS_RAMP, 404);

  // --- Wall sconces with flickering candles (set between the portraits) ---
  const sconcePositions = [62, w - 62];
  for (let i = 0; i < sconcePositions.length; i++) {
    const sx = sconcePositions[i];
    const sy = floorY - 60;
    canvas.fillRect(sx - 1, sy, 4, 10, BRASS_RAMP[4][0], BRASS_RAMP[4][1], BRASS_RAMP[4][2]);
    canvas.fillEllipse(sx + 1, sy + 10, 4, 2, BRASS_RAMP[3][0], BRASS_RAMP[3][1], BRASS_RAMP[3][2]);
    canvas.fillRect(sx, sy - 6, 2, 6, PARCHMENT_COL[0], PARCHMENT_COL[1], PARCHMENT_COL[2]);
    const flicker = 0.75 + Math.sin(time * 14 + i * 3.7) * 0.25;
    canvas.putPixel(sx, sy - 7, CANDLE_RAMP[7][0], CANDLE_RAMP[7][1], CANDLE_RAMP[7][2]);
    canvas.putPixel(sx + 1, sy - 8, CANDLE_RAMP[6][0], CANDLE_RAMP[6][1], CANDLE_RAMP[6][2]);
    canvas.applyLighting(sx + 1, sy - 4, 34, WARM_GLOW_RAMP[5][0], WARM_GLOW_RAMP[5][1], WARM_GLOW_RAMP[5][2], 0.22 * flicker);
  }

  // --- Grandfather clock (right side) ---
  canvas.fillDithered(w - 45, floorY - 90, 22, 90, WOOD_DARK_RAMP[3], WOOD_DARK_RAMP[5], 6);
  woodGrain(canvas, w - 45, floorY - 90, 22, 90, WOOD_DARK_RAMP, 5151);
  canvas.strokeRect(w - 45, floorY - 90, 22, 90, WOOD_DARK_RAMP[6][0], WOOD_DARK_RAMP[6][1], WOOD_DARK_RAMP[6][2]);
  canvas.fillEllipse(w - 34, floorY - 78, 8, 8, PARCHMENT_COL[0], PARCHMENT_COL[1], PARCHMENT_COL[2]);
  canvas.strokeRect(w - 42, floorY - 86, 16, 16, BRASS_RAMP[5][0], BRASS_RAMP[5][1], BRASS_RAMP[5][2]);
  canvas.putPixel(w - 34, floorY - 82, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  canvas.putPixel(w - 31, floorY - 78, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  const pendX = w - 34 + Math.sin(time * Math.PI) * 6;
  canvas.drawVLine(w - 34, floorY - 66, 22, BRASS_RAMP[3][0], BRASS_RAMP[3][1], BRASS_RAMP[3][2]);
  canvas.fillEllipse(Math.floor(pendX), floorY - 42, 4, 4, BRASS_RAMP[6][0], BRASS_RAMP[6][1], BRASS_RAMP[6][2]);

  // --- Side table with candelabra (left) ---
  canvas.fillRect(w - 80, floorY - 12, 28, 8, WOOD_DARK_RAMP[5][0], WOOD_DARK_RAMP[5][1], WOOD_DARK_RAMP[5][2]);
  canvas.drawVLine(w - 78, floorY - 4, 12, WOOD_DARK_RAMP[3][0], WOOD_DARK_RAMP[3][1], WOOD_DARK_RAMP[3][2]);
  canvas.drawVLine(w - 54, floorY - 4, 12, WOOD_DARK_RAMP[3][0], WOOD_DARK_RAMP[3][1], WOOD_DARK_RAMP[3][2]);
  canvas.drawVLine(w - 66, floorY - 22, 10, BRASS_RAMP[4][0], BRASS_RAMP[4][1], BRASS_RAMP[4][2]);
  canvas.putPixel(w - 66, floorY - 23, CANDLE_RAMP[7][0], CANDLE_RAMP[7][1], CANDLE_RAMP[7][2]);
  canvas.applyLighting(w - 66, floorY - 22, 26, WARM_GLOW_RAMP[4][0], WARM_GLOW_RAMP[4][1], WARM_GLOW_RAMP[4][2], 0.22);

  // --- Detective silhouette in the open doorway (left) ---
  canvas.fillRect(0, floorY - 70, 30, 70, SKY_NIGHT_RAMP[2][0], SKY_NIGHT_RAMP[2][1], SKY_NIGHT_RAMP[2][2]);
  canvas.fillRect(0, floorY - 70, 30, 4, SKY_NIGHT_RAMP[4][0], SKY_NIGHT_RAMP[4][1], SKY_NIGHT_RAMP[4][2]);
  canvas.fillRect(5, floorY - 55, 24, 55, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  canvas.fillRect(9, floorY - 66, 16, 12, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  canvas.drawHLine(6, floorY - 58, 22, TRENCHCOAT_RAMP[1][0], TRENCHCOAT_RAMP[1][1], TRENCHCOAT_RAMP[1][2]);
  canvas.putPixel(3, floorY - 62, 150, 150, 170, 120); // rain-rim light on the coat

  // --- Water drips from ceiling ---
  const drip1Y = ((time * 80) % 60);
  if (drip1Y < 55) canvas.putPixel(cx + 60, 40 + Math.floor(drip1Y), PUDDLE_RAMP[3][0], PUDDLE_RAMP[3][1], PUDDLE_RAMP[3][2]);
  const drip2Y = (((time + 1.3) * 60) % 50);
  if (drip2Y < 45) canvas.putPixel(cx - 54, 36 + Math.floor(drip2Y), PUDDLE_RAMP[2][0], PUDDLE_RAMP[2][1], PUDDLE_RAMP[2][2]);

  canvas.applyVignette(cx, h / 2, Math.min(w, h) * 0.52, 0.6);
}

/* ================================================================== */
/*  Scene 5: The Case Begins (Title Card)                              */
/* ================================================================== */

export function drawCaseBegins(canvas: PixelCanvas, time: number): void {
  const w = canvas.width;
  const h = canvas.height;

  canvas.clear(8, 8, 10);

  // --- Detective close-up (left half, dramatic) ---
  // Coat / body
  canvas.fillDithered(0, 40, 140, h - 40, TRENCHCOAT_RAMP[0], TRENCHCOAT_RAMP[1], 4);
  // Shoulder
  canvas.fillEllipse(80, 60, 60, 30, TRENCHCOAT_RAMP[1][0], TRENCHCOAT_RAMP[1][1], TRENCHCOAT_RAMP[1][2]);
  // Collar
  canvas.fillRect(50, 26, 40, 18, TRENCHCOAT_RAMP[2][0], TRENCHCOAT_RAMP[2][1], TRENCHCOAT_RAMP[2][2]);
  // Head / face (side profile, shadowed)
  canvas.fillEllipse(72, 12, 24, 26, TRENCHCOAT_RAMP[0][0], TRENCHCOAT_RAMP[0][1], TRENCHCOAT_RAMP[0][2]);
  // Fedora
  canvas.fillRect(38, -6, 70, 14, TRENCHCOAT_RAMP[1][0], TRENCHCOAT_RAMP[1][1], TRENCHCOAT_RAMP[1][2]);
  canvas.drawHLine(30, 8, 82, TRENCHCOAT_RAMP[2][0], TRENCHCOAT_RAMP[2][1], TRENCHCOAT_RAMP[2][2]);
  // Eye glint
  canvas.putPixel(84, 8, 180, 180, 200);

  // Gradual darkening: the detective fades as the title appears
  const darken = Math.min(1, time * 0.4);
  canvas.applyVignette(w / 2 + 20, h / 2, w * 0.35, darken * 0.8);

  // --- Title: RAVENSWOOD ---
  if (time > 1.5) {
    const text = 'RAVENSWOOD';
    const spacing = 14;
    const totalW = text.length * spacing;
    const startX = Math.floor(w / 2 - totalW / 2) + 20;
    const startY = Math.floor(h / 2 - 8);

    // Background glow (appears first)
    if (time > 2.0) {
      const glowIntensity = Math.min(0.5, (time - 2.0) * 0.3);
      canvas.applyLighting(w / 2 + 20, h / 2, 90, TITLE_GLOW_COL[0], TITLE_GLOW_COL[1], TITLE_GLOW_COL[2], glowIntensity);
    }

    // Letter-by-letter reveal
    const revealedChars = Math.min(text.length, Math.floor((time - 1.5) * 6));

    for (let i = 0; i < revealedChars; i++) {
      const char = text[i];
      const fontData = FONT[char];
      if (!fontData) continue;
      const cx = startX + i * spacing;
      for (let r = 0; r < fontData.length; r++) {
        for (let c = 0; c < fontData[r].length; c++) {
          if (fontData[r][c] === '1') {
            // Each font pixel is 2×2 for readability
            canvas.fillRect(cx + c * 2, startY + r * 2, 2, 2, PARCHMENT_COL[0], PARCHMENT_COL[1], PARCHMENT_COL[2]);
          }
        }
      }
    }

    // Subtitle line
    if (time > 3.5) {
      const sub = 'A FALLIBLE MEMORY MYSTERY';
      const subStartX = Math.floor(w / 2 - sub.length * 2 + 20);
      // Simple 1px-per-character rendering (too small for real font, just dots)
      for (let i = 0; i < sub.length; i++) {
        if (sub[i] !== ' ') {
          canvas.putPixel(subStartX + i * 4, startY + 22, CANDLE_RAMP[4][0], CANDLE_RAMP[4][1], CANDLE_RAMP[4][2]);
          canvas.putPixel(subStartX + i * 4 + 1, startY + 22, CANDLE_RAMP[4][0], CANDLE_RAMP[4][1], CANDLE_RAMP[4][2]);
        }
      }
    }
  }
}
