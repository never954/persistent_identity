/*
 * Toasts — "Thomas will remember that." and "Meanwhile…" pop-ups.
 * ------------------------------------------------------------------
 * The game's consequences made visible: a deed the victim will carry in
 * memory, or something that happened elsewhere in the house while you were
 * busy (off-screen life, backend world.py). Each fades on its own.
 */

import { useEffect } from 'react';
import { useGame, type Toast } from '../../game/store';
import './toasts.css';

const LIFE_MS: Record<Toast['kind'], number> = { remember: 4200, event: 7000, alert: 9000 };

function ToastItem({ t }: { t: Toast }) {
  const { dispatch } = useGame();
  useEffect(() => {
    const id = window.setTimeout(() => dispatch({ type: 'DISMISS_TOAST', id: t.id }), LIFE_MS[t.kind]);
    return () => window.clearTimeout(id);
  }, [t.id, t.kind, dispatch]);
  return (
    <button
      className={`toast toast--${t.kind}`}
      onClick={() => dispatch({ type: 'DISMISS_TOAST', id: t.id })}
    >
      {t.kind === 'event' && <span className="toast__eyebrow">Meanwhile…</span>}
      {t.kind === 'alert' && <span className="toast__eyebrow">Urgent</span>}
      <span className="toast__text">{t.text}</span>
    </button>
  );
}

export function Toasts() {
  const { state } = useGame();
  if (state.toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {state.toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
