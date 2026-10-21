/*
 * CutsceneScreen — the cinematic intro sequence.
 * ------------------------------------------------------------------
 * Plays a ~25-second sequence of five pixel-art scenes before the
 * prologue. Each scene is rendered to a 384×216 canvas with
 * image-rendering: pixelated, producing crisp, lo-fi pixel art.
 *
 * The player can click or press Space to advance to the next scene,
 * or click "Skip" (or press Escape) to jump straight to the prologue.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { PixelCanvas, PX_WIDTH, PX_HEIGHT } from '../components/pixel/pixelRenderer';
import {
  drawExteriorApproach,
  drawDetectiveWalking,
  drawEntranceDoors,
  drawFoyerInterior,
  drawCaseBegins,
} from './cutscene/sceneCompositions';
import './cutscene.css';

/** Each scene definition: a draw function, a subtitle, and a duration. */
interface SceneDef {
  draw: (canvas: PixelCanvas, time: number) => void;
  subtitle: string;
  duration: number; // seconds
}

const SCENES: SceneDef[] = [
  {
    draw: drawExteriorApproach,
    subtitle: 'The storm reached Ravenswood Manor a little after ten.',
    duration: 5,
  },
  {
    draw: drawDetectiveWalking,
    subtitle:
      'By eleven the power was gone, and the great house ran on candlelight.',
    duration: 5,
  },
  {
    draw: drawEntranceDoors,
    subtitle:
      'At dawn, Lord Alistair Ravenswood was found dead in his locked study.',
    duration: 5,
  },
  {
    draw: drawFoyerInterior,
    subtitle: 'The bridge to the village is flooded. No one has left. No one can.',
    duration: 5,
  },
  {
    draw: drawCaseBegins,
    subtitle: 'You are the detective.',
    duration: 5,
  },
];

export function CutsceneScreen() {
  const { dispatch } = useGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pxCanvas = useRef<PixelCanvas | null>(null);
  const rafRef = useRef(0);
  const sceneStartRef = useRef(0);

  const [sceneIndex, setSceneIndex] = useState(0);
  const [fading, setFading] = useState(false);

  /** Advance to the next scene with a brief fade. */
  const advanceScene = useCallback(() => {
    if (fading) return;
    const nextIndex = sceneIndex + 1;
    if (nextIndex >= SCENES.length) {
      // Cutscene complete → go to prologue
      dispatch({ type: 'SET_PHASE', phase: 'prologue' });
      return;
    }
    setFading(true);
    setTimeout(() => {
      setSceneIndex(nextIndex);
      sceneStartRef.current = performance.now() / 1000;
      setFading(false);
    }, 500); // match CSS transition duration
  }, [sceneIndex, fading, dispatch]);

  /** Skip the entire cutscene. */
  const skipAll = useCallback(() => {
    dispatch({ type: 'SET_PHASE', phase: 'prologue' });
  }, [dispatch]);

  // Auto-advance when scene duration expires.
  useEffect(() => {
    const scene = SCENES[sceneIndex];
    if (!scene) return;
    const timer = setTimeout(() => advanceScene(), scene.duration * 1000);
    return () => clearTimeout(timer);
  }, [sceneIndex, advanceScene]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipAll();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        advanceScene();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advanceScene, skipAll]);

  // The main render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set the canvas buffer to our internal pixel resolution.
    canvas.width = PX_WIDTH;
    canvas.height = PX_HEIGHT;
    // Disable image smoothing so putImageData renders crisp.
    ctx.imageSmoothingEnabled = false;

    if (!pxCanvas.current) {
      pxCanvas.current = new PixelCanvas();
    }

    sceneStartRef.current = performance.now() / 1000;

    const frame = () => {
      const now = performance.now() / 1000;
      const sceneTime = now - sceneStartRef.current;
      const scene = SCENES[sceneIndex];

      if (scene && pxCanvas.current) {
        scene.draw(pxCanvas.current, sceneTime);
        pxCanvas.current.flush(ctx);
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sceneIndex]);

  const scene = SCENES[sceneIndex];

  return (
    <div className="cutscene" onClick={advanceScene}>
      <canvas
        ref={canvasRef}
        className={'cutscene__canvas' + (fading ? ' is-fading' : '')}
      />

      {/* Subtitle bar */}
      {scene && (
        <div className="cutscene__subtitle-bar">
          <p className="cutscene__subtitle" key={sceneIndex}>
            {scene.subtitle}
          </p>
        </div>
      )}

      {/* Scene progress dots */}
      <div className="cutscene__dots">
        {SCENES.map((_, i) => (
          <span
            key={i}
            className={
              'cutscene__dot' +
              (i === sceneIndex ? ' is-active' : '') +
              (i < sceneIndex ? ' is-past' : '')
            }
          />
        ))}
      </div>

      {/* Skip button */}
      <div className="cutscene__controls">
        <button
          className="cutscene__skip"
          onClick={(e) => {
            e.stopPropagation();
            skipAll();
          }}
        >
          Skip ▸
        </button>
      </div>
    </div>
  );
}
