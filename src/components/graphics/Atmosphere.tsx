/*
 * Atmosphere — the reusable computer-graphics layer.
 * ------------------------------------------------------------------
 * One <canvas> driven by a single requestAnimationFrame loop renders,
 * in draw order:
 *   1. a warm ambient candle-light field (radial gradients, additive
 *      "lighter" blending, flicker from summed sine waves) — a simple
 *      point-light model;
 *   2. drifting dust motes (particle system, sinusoidal sway);
 *   3. slanted rain (particle system with a wind translation).
 * On top, CSS adds a vignette and animated film grain.
 *
 * CG concepts on show for the viva: a device-pixel-ratio coordinate
 * transform, particle systems, alpha/additive compositing, and
 * trigonometric animation. Counts are modest so it stays 60fps.
 */

import { useEffect, useRef } from 'react';

export interface CandlePoint {
  /** Fractional position across the canvas, 0..1. */
  x: number;
  y: number;
  /** Base glow radius as a fraction of the canvas diagonal. */
  radius: number;
  /** Warm hue, e.g. '244,184,96'. */
  rgb?: string;
}

interface AtmosphereProps {
  rain?: boolean;
  dust?: boolean;
  candles?: CandlePoint[];
  /** 0..1 overall strength of the effects. */
  intensity?: number;
  grain?: boolean;
  vignette?: boolean;
}

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}
interface Mote {
  x: number;
  y: number;
  r: number;
  drift: number;
  phase: number;
  alpha: number;
}

export function Atmosphere({
  rain = true,
  dust = true,
  candles = [],
  intensity = 1,
  grain = true,
  vignette = true,
}: AtmosphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let drops: Drop[] = [];
    let motes: Mote[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      // Set the coordinate system to CSS pixels regardless of DPR.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const area = width * height;
      const dropCount = rain ? Math.round((area / 9000) * intensity) : 0;
      drops = Array.from({ length: dropCount }, () => spawnDrop(width, height));
      const moteCount = dust ? Math.round((area / 26000) * intensity) : 0;
      motes = Array.from({ length: moteCount }, () => spawnMote(width, height));
    };

    const spawnDrop = (w: number, h: number): Drop => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 8 + Math.random() * 16,
      speed: 480 + Math.random() * 420,
      alpha: 0.08 + Math.random() * 0.16,
    });
    const spawnMote = (w: number, h: number): Mote => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.6 + Math.random() * 1.8,
      drift: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.05 + Math.random() * 0.18,
    });

    let raf = 0;
    let last = performance.now();
    const wind = 0.28; // rain slant

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, width, height);

      // --- 1. Ambient candle-light field (additive point lights) ------
      if (candles.length) {
        ctx.globalCompositeOperation = 'lighter';
        const diag = Math.hypot(width, height);
        for (let i = 0; i < candles.length; i++) {
          const c = candles[i];
          // Flicker: sum of two out-of-phase sines + a little noise.
          const flicker =
            0.82 +
            0.12 * Math.sin(t * 7 + i) +
            0.06 * Math.sin(t * 17.3 + i * 2.1);
          const cx = c.x * width;
          const cy = c.y * height;
          const r = c.radius * diag * flicker * intensity;
          const rgb = c.rgb ?? '244,184,96';
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, `rgba(${rgb},${0.22 * flicker})`);
          g.addColorStop(0.5, `rgba(${rgb},${0.07 * flicker})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      // --- 2. Dust motes (slow float + sine sway) ---------------------
      for (const m of motes) {
        m.y -= m.drift * dt;
        const sway = Math.sin(t * 0.6 + m.phase) * 0.4;
        m.x += sway;
        if (m.y < -4) {
          m.y = height + 4;
          m.x = Math.random() * width;
        }
        ctx.fillStyle = `rgba(244,214,160,${m.alpha})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- 3. Rain (particle streaks with wind translation) ----------
      if (drops.length) {
        ctx.strokeStyle = 'rgba(180,200,220,1)';
        ctx.lineWidth = 1;
        for (const d of drops) {
          d.y += d.speed * dt;
          d.x += d.speed * wind * dt;
          if (d.y > height) {
            d.y = -d.len;
            d.x = Math.random() * width;
          }
          ctx.globalAlpha = d.alpha;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.len * wind, d.y - d.len);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [rain, dust, candles, intensity]);

  return (
    <>
      <canvas ref={canvasRef} className="layer" aria-hidden="true" />
      {vignette && <div className="layer atmo-vignette" aria-hidden="true" />}
      {grain && <div className="layer atmo-grain" aria-hidden="true" />}
    </>
  );
}
