/*
 * Wireframe3D — renders the rotating 3D wireframe manor on a small canvas
 * via the from-scratch 3D pipeline (wireframe3d.ts). A live, on-screen
 * demonstration of homogeneous-matrix 3D transforms + perspective
 * projection + Bresenham edge rasterization.
 */

import { useEffect, useRef } from 'react';
import { PixelCanvas } from './pixelRenderer';
import { drawWireframeManor } from './transforms3d';

export function Wireframe3D({
  size = 110,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const RES = 64;
    canvas.width = RES;
    canvas.height = RES;
    ctx.imageSmoothingEnabled = false;

    const pc = new PixelCanvas(RES, RES);
    let raf = 0;
    const frame = () => {
      const t = performance.now() / 1000;
      // Transparent background: only the wireframe edges are opaque.
      pc.imageData.data.fill(0);
      drawWireframeManor(pc, t, RES / 2, RES / 2 + 2, 20, [244, 184, 96]);
      pc.flush(ctx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, imageRendering: 'pixelated', ...style }}
    />
  );
}
