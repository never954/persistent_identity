/*
 * CandleFlame — a small, purely-CSS candle used to dress the UI.
 * The flame is two stacked radial-gradient teardrops with an offset
 * flicker animation and a soft halo. Decorative, cheap, and on-theme.
 */

import './candleFlame.css';

export function CandleFlame({ scale = 1 }: { scale?: number }) {
  return (
    <span
      className="candle"
      style={{ '--candle-scale': scale } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="candle__halo" />
      <span className="candle__flame" />
      <span className="candle__stick" />
    </span>
  );
}
