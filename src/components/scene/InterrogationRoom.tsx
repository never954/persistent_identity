/*
 * InterrogationRoom — now rendered with the software rasterizer.
 * ------------------------------------------------------------------
 * Instead of CSS/DOM layers, the whole scene is drawn every frame into a
 * 384×216 ImageData buffer by `drawInterrogationRoom` (see
 * interrogationScene.ts) and flushed to a <canvas> upscaled with
 * nearest-neighbour. Same engine and loop as the cutscene, so the
 * interactive scene is genuine computer graphics, not layout.
 *
 * The dialogue box, input and top bar are drawn as DOM on top of this
 * canvas by InterrogationScreen (UI belongs in the DOM).
 */

import { useEffect, useRef } from 'react';
import { PixelCanvas, PX_WIDTH, PX_HEIGHT } from '../pixel/pixelRenderer';
import { drawInterrogationRoom } from './interrogationScene';
import type { Suspect } from '../../game/types';

export function InterrogationRoom({
  suspect,
  speaking = false,
}: {
  suspect: Suspect;
  speaking?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Live values the animation loop reads without re-subscribing.
  const optsRef = useRef({ suspectId: suspect.id, speaking });
  optsRef.current = { suspectId: suspect.id, speaking };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = PX_WIDTH;
    canvas.height = PX_HEIGHT;
    ctx.imageSmoothingEnabled = false;

    const pc = new PixelCanvas();
    let raf = 0;
    const frame = () => {
      const t = performance.now() / 1000;
      drawInterrogationRoom(pc, t, optsRef.current);
      pc.flush(ctx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        imageRendering: 'pixelated',
        objectFit: 'cover',
        background: '#0a0a10',
      }}
    />
  );
}
