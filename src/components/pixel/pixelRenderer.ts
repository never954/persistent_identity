/*
 * pixelRenderer.ts — low-level pixel drawing engine.
 * ------------------------------------------------------------------
 * All scene art is drawn to a small ImageData buffer (384×216) and
 * then displayed on a <canvas> with `image-rendering: pixelated` so
 * every logical pixel becomes a crisp 2–4 screen-pixel block.
 *
 * Every drawing primitive works in integer pixel coordinates with no
 * anti-aliasing — this is the foundation of the "Pixel Chill" look.
 */

/** RGB triple, each component 0–255. */
export type Color = [number, number, number];

/** The standard internal resolution for all pixel-art scenes. */
export const PX_WIDTH = 384;
export const PX_HEIGHT = 216;

/*
 * 4×4 Bayer ordered-dither threshold matrix, normalised to 0–15.
 * Used by `fillDithered` to smoothly transition between two colours
 * without introducing random noise — the classic pixel-art dithering
 * pattern you see in Pixel Chill style scenes.
 */
const BAYER4: number[][] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * A pixel canvas backed by raw ImageData. All drawing goes through
 * putPixel, which writes directly to the data buffer. Call `flush`
 * to push the buffer to a real canvas 2D context.
 */
export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly imageData: ImageData;
  private readonly data: Uint8ClampedArray;

  constructor(width = PX_WIDTH, height = PX_HEIGHT) {
    this.width = width;
    this.height = height;
    this.imageData = new ImageData(width, height);
    this.data = this.imageData.data;
  }

  /** Clear the entire buffer to a solid colour (default: black). */
  clear(r = 0, g = 0, b = 0): void {
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }

  /** Write a single pixel. Out-of-bounds writes are silently ignored. */
  putPixel(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    if (a >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    } else if (a > 0) {
      // Alpha-blend over the existing pixel (source-over).
      const af = a / 255;
      const inv = 1 - af;
      this.data[i] = Math.round(r * af + this.data[i] * inv);
      this.data[i + 1] = Math.round(g * af + this.data[i + 1] * inv);
      this.data[i + 2] = Math.round(b * af + this.data[i + 2] * inv);
      this.data[i + 3] = Math.min(255, this.data[i + 3] + a);
    }
  }

  /** Read the colour of a pixel. Returns [0,0,0,0] for out-of-bounds. */
  getPixel(x: number, y: number): [number, number, number, number] {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  /** Solid-filled axis-aligned rectangle (clipped). */
  fillRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.putPixel(px, py, r, g, b, a);
      }
    }
  }

  /**
   * Fill a rectangle with Bayer-dithered blend between two colours.
   * `level` ranges 0–16: 0 = all c1, 16 = all c2.
   * Fractional levels are rounded.
   */
  fillDithered(
    x: number, y: number, w: number, h: number,
    c1: Color, c2: Color, level: number,
  ): void {
    const lvl = Math.round(Math.max(0, Math.min(16, level)));
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w);
    const y1 = Math.min(this.height, y + h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const threshold = BAYER4[py & 3][px & 3];
        const useC2 = lvl > threshold;
        const c = useC2 ? c2 : c1;
        this.putPixel(px, py, c[0], c[1], c[2]);
      }
    }
  }

  /**
   * Fill a rectangle with a vertical dithered gradient through a
   * colour ramp (array of colours). Each row picks two adjacent
   * colours and a dither level based on vertical position.
   */
  fillGradient(x: number, y: number, w: number, h: number, ramp: Color[]): void {
    if (ramp.length < 2 || h <= 0) return;
    for (let row = 0; row < h; row++) {
      const t = row / (h - 1);
      const seg = t * (ramp.length - 1);
      const idx = Math.min(Math.floor(seg), ramp.length - 2);
      const frac = seg - idx;
      const level = Math.round(frac * 16);
      this.fillDithered(x, y + row, w, 1, ramp[idx], ramp[idx + 1], level);
    }
  }

  /** Horizontal line, 1 pixel tall. */
  drawHLine(x: number, y: number, len: number, r: number, g: number, b: number, a = 255): void {
    for (let i = 0; i < len; i++) this.putPixel(x + i, y, r, g, b, a);
  }

  /** Vertical line, 1 pixel wide. */
  drawVLine(x: number, y: number, len: number, r: number, g: number, b: number, a = 255): void {
    for (let i = 0; i < len; i++) this.putPixel(x, y + i, r, g, b, a);
  }

  /** 1-pixel-border rectangle outline. */
  strokeRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
    this.drawHLine(x, y, w, r, g, b, a);
    this.drawHLine(x, y + h - 1, w, r, g, b, a);
    this.drawVLine(x, y, h, r, g, b, a);
    this.drawVLine(x + w - 1, y, h, r, g, b, a);
  }

  /**
   * Cohen–Sutherland outcode for a point against the buffer rectangle.
   * bit 1 = left, 2 = right, 4 = top (y<0), 8 = bottom (y>=h).
   */
  private outcode(x: number, y: number): number {
    let code = 0;
    if (x < 0) code |= 1;
    else if (x > this.width - 1) code |= 2;
    if (y < 0) code |= 4;
    else if (y > this.height - 1) code |= 8;
    return code;
  }

  /**
   * Cohen–Sutherland line clipping against the buffer rectangle.
   * Returns the clipped integer endpoints, or null if fully outside.
   */
  clipLine(
    x0: number, y0: number, x1: number, y1: number,
  ): [number, number, number, number] | null {
    const xMax = this.width - 1;
    const yMax = this.height - 1;
    let c0 = this.outcode(x0, y0);
    let c1 = this.outcode(x1, y1);
    for (;;) {
      if ((c0 | c1) === 0) return [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
      if ((c0 & c1) !== 0) return null; // both share an outside zone → reject
      const c = c0 !== 0 ? c0 : c1;
      let x = 0;
      let y = 0;
      if (c & 8) { x = x0 + ((x1 - x0) * (yMax - y0)) / (y1 - y0); y = yMax; }
      else if (c & 4) { x = x0 + ((x1 - x0) * (0 - y0)) / (y1 - y0); y = 0; }
      else if (c & 2) { y = y0 + ((y1 - y0) * (xMax - x0)) / (x1 - x0); x = xMax; }
      else { y = y0 + ((y1 - y0) * (0 - x0)) / (x1 - x0); x = 0; }
      if (c === c0) { x0 = x; y0 = y; c0 = this.outcode(x0, y0); }
      else { x1 = x; y1 = y; c1 = this.outcode(x1, y1); }
    }
  }

  /**
   * Bresenham line — integer decision variable, no floating point in the
   * inner loop. Clipped to the buffer with Cohen–Sutherland first.
   */
  drawLine(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255): void {
    const clipped = this.clipLine(x0, y0, x1, y1);
    if (!clipped) return;
    let [cx0, cy0] = clipped;
    const [, , cx1, cy1] = clipped;
    const dx = Math.abs(cx1 - cx0);
    const dy = Math.abs(cy1 - cy0);
    const sx = cx0 < cx1 ? 1 : -1;
    const sy = cy0 < cy1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.putPixel(cx0, cy0, r, g, b, a);
      if (cx0 === cx1 && cy0 === cy1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx0 += sx; }
      if (e2 < dx) { err += dx; cy0 += sy; }
    }
  }

  /**
   * DDA line — floating-point incremental stepping. Kept alongside
   * Bresenham to demonstrate both classic line-scan-conversion methods.
   */
  drawLineDDA(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, a = 255): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) { this.putPixel(Math.round(x0), Math.round(y0), r, g, b, a); return; }
    const xInc = dx / steps;
    const yInc = dy / steps;
    let x = x0;
    let y = y0;
    for (let i = 0; i <= steps; i++) {
      this.putPixel(Math.round(x), Math.round(y), r, g, b, a);
      x += xInc;
      y += yInc;
    }
  }

  /** Midpoint circle (8-way symmetry). A circle is the rx==ry ellipse. */
  drawCircle(cx: number, cy: number, rad: number, r: number, g: number, b: number, a = 255): void {
    let x = rad;
    let y = 0;
    let err = 1 - rad;
    const plot8 = (px: number, py: number) => {
      this.putPixel(cx + px, cy + py, r, g, b, a);
      this.putPixel(cx - px, cy + py, r, g, b, a);
      this.putPixel(cx + px, cy - py, r, g, b, a);
      this.putPixel(cx - px, cy - py, r, g, b, a);
      this.putPixel(cx + py, cy + px, r, g, b, a);
      this.putPixel(cx - py, cy + px, r, g, b, a);
      this.putPixel(cx + py, cy - px, r, g, b, a);
      this.putPixel(cx - py, cy - px, r, g, b, a);
    };
    while (x >= y) {
      plot8(x, y);
      y++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }

  /**
   * Bresenham midpoint filled ellipse. Pixel-perfect, no AA.
   */
  fillEllipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a = 255): void {
    if (rx <= 0 || ry <= 0) return;
    let x = 0;
    let y = ry;
    let rx2 = rx * rx;
    let ry2 = ry * ry;
    let px = 0;
    let py = 2 * rx2 * y;
    let p: number;

    // Plot initial point + symmetric spans.
    const hline = (lx: number, rx_: number, ly: number) => {
      for (let px_ = lx; px_ <= rx_; px_++) this.putPixel(px_, ly, r, g, b, a);
    };

    hline(cx - x, cx + x, cy + y);
    hline(cx - x, cx + x, cy - y);

    // Region 1
    p = Math.round(ry2 - rx2 * ry + 0.25 * rx2);
    while (px < py) {
      x++;
      px += 2 * ry2;
      if (p < 0) {
        p += ry2 + px;
      } else {
        y--;
        py -= 2 * rx2;
        p += ry2 + px - py;
      }
      hline(cx - x, cx + x, cy + y);
      hline(cx - x, cx + x, cy - y);
    }

    // Region 2
    p = Math.round(ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2);
    while (y > 0) {
      y--;
      py -= 2 * rx2;
      if (p > 0) {
        p += rx2 - py;
      } else {
        x++;
        px += 2 * ry2;
        p += rx2 - py + px;
      }
      hline(cx - x, cx + x, cy + y);
      hline(cx - x, cx + x, cy - y);
    }
  }

  /**
   * Stamp a small sprite defined as an array of row strings with a
   * palette mapping characters to colours.
   * Transparent character (usually '.') should map to `null`.
   */
  blitSprite(
    rows: string[],
    x: number,
    y: number,
    palette: Record<string, Color | null>,
  ): void {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const col = palette[row[c]];
        if (col) this.putPixel(x + c, y + r, col[0], col[1], col[2]);
      }
    }
  }

  /**
   * Additive radial light effect. Brightens existing pixels within a
   * circle, tinted by (r, g, b), falling off from `intensity` at the
   * centre to 0 at `radius`.
   */
  applyLighting(cx: number, cy: number, radius: number, r: number, g: number, b: number, intensity: number): void {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const falloff = 1 - Math.sqrt(d2) / radius;
        const strength = falloff * falloff * intensity; // quadratic falloff
        const i = (py * this.width + px) * 4;
        this.data[i] = Math.min(255, this.data[i] + Math.round(r * strength));
        this.data[i + 1] = Math.min(255, this.data[i + 1] + Math.round(g * strength));
        this.data[i + 2] = Math.min(255, this.data[i + 2] + Math.round(b * strength));
      }
    }
  }

  /**
   * Darken pixels outside a radial region — a vignette or occlusion
   * shadow. `strength` is 0–1 (0 = no darkening, 1 = fully black outside).
   */
  applyVignette(cx: number, cy: number, radius: number, strength: number): void {
    const r2 = radius * radius;
    for (let py = 0; py < this.height; py++) {
      for (let px = 0; px < this.width; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) continue;
        const excess = (Math.sqrt(d2) - radius) / radius;
        const dark = Math.min(1, excess * strength);
        const i = (py * this.width + px) * 4;
        this.data[i] = Math.round(this.data[i] * (1 - dark));
        this.data[i + 1] = Math.round(this.data[i + 1] * (1 - dark));
        this.data[i + 2] = Math.round(this.data[i + 2] * (1 - dark));
      }
    }
  }

  /** Push the ImageData buffer to a canvas 2D context. */
  flush(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(this.imageData, 0, 0);
  }
}

/**
 * Interpolate through a multi-stop colour ramp at position `t` (0–1).
 * Returns the blended [r, g, b].
 */
export function colorRamp(ramp: Color[], t: number): Color {
  const clamped = Math.max(0, Math.min(1, t));
  if (ramp.length < 2) return ramp[0] ?? [0, 0, 0];
  const seg = clamped * (ramp.length - 1);
  const idx = Math.min(Math.floor(seg), ramp.length - 2);
  const frac = seg - idx;
  const a = ramp[idx];
  const b = ramp[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

/**
 * Linearly interpolate between two colours.
 */
export function lerpColor(a: Color, b: Color, t: number): Color {
  const c = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * c),
    Math.round(a[1] + (b[1] - a[1]) * c),
    Math.round(a[2] + (b[2] - a[2]) * c),
  ];
}
