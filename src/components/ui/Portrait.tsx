/*
 * Portrait — a stylised, procedural suspect portrait (no art assets).
 * A gilt frame around a cand-lit SVG bust tinted with the suspect's
 * accent colour, with a distinguishing silhouette per character. Hover
 * applies a 2D scale transform + warm glow; the active suspect gets a
 * lit frame. Swappable for real portrait art later without touching
 * anything else.
 */

import type { Suspect } from '../../game/types';
import './portrait.css';

/** A distinguishing head/hair silhouette path per suspect. */
const ADORNMENT: Record<string, string> = {
  agnes: 'M32 34 q0 -16 18 -16 q18 0 18 16 q6 -2 6 6 q0 8 -8 8 l-32 0 q-8 0 -8 -8 q0 -8 6 -6 z', // bun + kerchief
  julian: 'M31 30 q2 -14 19 -14 q17 0 19 14 q1 6 -3 9 l-32 0 q-4 -3 -3 -9 z', // slicked back
  vance: 'M30 33 q0 -17 20 -17 q20 0 20 17 l-4 3 l-32 0 z', // bob
  thomas: 'M28 30 l44 0 l-2 -6 q-2 -8 -20 -8 q-18 0 -20 8 z', // flat cap
  vivian: 'M30 32 q-2 -18 20 -18 q22 0 20 18 q-6 -4 -12 0 q-8 -6 -16 0 q-6 -4 -12 0 z', // waved hair
};

export function Portrait({
  suspect,
  size = 132,
  active = false,
  accused = false,
  actionLabel = 'Interrogate',
  onClick,
}: {
  suspect: Suspect;
  size?: number;
  active?: boolean;
  accused?: boolean;
  /** Verb used in the accessible label when the portrait is a button. */
  actionLabel?: string;
  onClick?: () => void;
}) {
  const rgb = hexToRgb(suspect.accent);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={
        'portrait' +
        (active ? ' portrait--active' : '') +
        (accused ? ' portrait--accused' : '')
      }
      style={
        {
          width: size,
          '--accent': suspect.accent,
          '--accent-rgb': `${rgb.r},${rgb.g},${rgb.b}`,
        } as React.CSSProperties
      }
      onClick={onClick}
      aria-label={onClick ? `${actionLabel} ${suspect.name}` : suspect.name}
      type={onClick ? 'button' : undefined}
    >
      <div className="portrait__frame">
        <svg viewBox="0 0 100 120" className="portrait__art" aria-hidden="true">
          <defs>
            <radialGradient id={`lit-${suspect.id}`} cx="32%" cy="30%" r="80%">
              <stop offset="0%" stopColor={`rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`} />
              <stop offset="45%" stopColor="rgba(20,17,16,0.9)" />
              <stop offset="100%" stopColor="#0b0a09" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="100" height="120" fill={`url(#lit-${suspect.id})`} />
          {/* Bust: shoulders + neck + head */}
          <g fill="#0d0b0a" stroke={suspect.accent} strokeWidth="1.4" strokeOpacity="0.55">
            <path d="M14 120 q0 -30 36 -30 q36 0 36 30 z" />
            <rect x="44" y="70" width="12" height="18" rx="5" />
            <circle cx="50" cy="52" r="22" />
          </g>
          {/* Distinguishing hair/hat silhouette */}
          <path
            d={ADORNMENT[suspect.id] ?? ADORNMENT.vance}
            fill="#0a0908"
            stroke={suspect.accent}
            strokeWidth="1.2"
            strokeOpacity="0.5"
          />
          {/* A single warm catch-light in the eye area */}
          <circle cx="43" cy="50" r="1.6" fill="rgba(244,184,96,0.8)" />
        </svg>
      </div>
      <span className="portrait__plate">{suspect.name}</span>
    </Tag>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
