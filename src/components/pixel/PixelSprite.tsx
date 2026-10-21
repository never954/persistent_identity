/*
 * PixelSprite — renders a pixel-art sprite from a compact data format:
 * `rows` is an array of equal-length strings, each character a palette
 * key; `palette` maps those keys to CSS colours ('.' / ' ' = transparent).
 * It draws 1 canvas pixel per cell, then CSS-upscales with
 * `image-rendering: pixelated`, so the art stays crisp at any size.
 *
 * Keeping sprites as data (not images) means zero asset pipeline and the
 * whole cast lives in one small file the student can read and explain.
 */

import { useEffect, useRef } from 'react';

export type Palette = Record<string, string>;

export function PixelSprite({
  rows,
  palette,
  scale = 6,
  className,
  style,
}: {
  rows: string[];
  palette: Palette;
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const height = rows.length;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = cols;
    canvas.height = height;
    ctx.clearRect(0, 0, cols, height);
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const key = row[x];
        const color = palette[key];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }, [rows, palette, cols, height]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{
        width: cols * scale,
        height: height * scale,
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
}
