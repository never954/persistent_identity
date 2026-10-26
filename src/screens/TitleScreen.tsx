/*
 * TitleScreen — the front door. Sets the mood (heavy atmosphere) and lets the
 * player choose a difficulty, which gates how many "tells" the game shows.
 * Each suspect's memory itself comes from their own profile on the backend.
 * Starting a game creates a save on the suspect backend (every suspect's
 * memory stream is seeded there); Continue resumes the save in this browser.
 */

import { useEffect, useState } from 'react';
import { loadSaved, useGame, type GameState } from '../game/store';
import type { Difficulty } from '../game/types';
import { newSession, sessionExists, SERVER_HINT, BackendError } from '../game/services/session';
import { Atmosphere } from '../components/graphics/Atmosphere';
import { CandleFlame } from '../components/graphics/CandleFlame';
import { Wireframe3D } from '../components/pixel/Wireframe3D';
import { CASE_META } from '../game/case/caseData';
import './title.css';

const DIFFICULTIES: {
  id: Difficulty;
  label: string;
  memory: string;
  detail: string;
}[] = [
  {
    id: 'rookie',
    label: 'Rookie',
    memory: 'Every tell shown',
    detail: 'The game whispers every tell — when someone lies, misremembers, or talks around a question. For learning the ropes.',
  },
  {
    id: 'detective',
    label: 'Detective',
    memory: 'Strong tells only',
    detail: 'You are told only when a statement is a lie or an honest false memory — not which one.',
  },
  {
    id: 'inspector',
    label: 'Inspector',
    memory: 'No tells',
    detail: 'No tells at all. The suspects forget and misremember exactly as before — trust nothing, verify everything.',
  },
];

export function TitleScreen() {
  const { dispatch } = useGame();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<GameState | null>(null);

  // Offer Continue only if this browser has a game AND the server still has its save.
  useEffect(() => {
    const s = loadSaved();
    if (s?.saveId) sessionExists(s.saveId).then((ok) => setSaved(ok ? s : null));
  }, []);

  const start = async (difficulty: Difficulty) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = await newSession(difficulty);
      dispatch({ type: 'START', difficulty, saveId: s.save_id, clockLabel: s.clock_label });
    } catch (e) {
      setError(
        e instanceof BackendError && e.problem === 'offline'
          ? `The suspects’ memory server is not running. ${SERVER_HINT}`
          : `Could not open the case: ${(e as Error).message}`,
      );
      setBusy(false);
    }
  };

  return (
    <div className="title screen-enter">
      <Atmosphere
        rain
        dust
        intensity={1}
        candles={[
          { x: 0.12, y: 0.2, radius: 0.5 },
          { x: 0.88, y: 0.28, radius: 0.45 },
          { x: 0.5, y: 0.85, radius: 0.6, rgb: '200,120,60' },
        ]}
      />

      <div className="title__content">
        <div className="title__crest">
          <CandleFlame scale={1.1} />
          <span className="eyebrow">A Fallible Memory Mystery</span>
          <CandleFlame scale={1.1} />
        </div>

        <div className="title__wire">
          <Wireframe3D size={104} />
        </div>

        <h1 className="title__name">RAVENSWOOD</h1>
        <p className="title__tag">
          {CASE_META.year} · {CASE_META.title}
        </p>
        <p className="title__blurb">
          Five suspects. One murder. But these witnesses <em>forget</em>, <em>blur</em>,
          and come to believe things that never happened. The question is no longer
          "who has the perfect alibi" — it is <strong>can you tell a lie from an
          honest mistake?</strong>
        </p>

        {saved && (
          <button
            type="button"
            className="btn btn--accent title__continue"
            onClick={() => dispatch({ type: 'RESUME', state: saved })}
          >
            Continue the investigation · {saved.clockLabel ?? ''} · {saved.cluesFound.length} clues
          </button>
        )}

        {error && <p className="title__error" role="alert">{error}</p>}

        <div className="title__diff">
          <span className="eyebrow title__diff-label">
            {busy ? 'Opening the case file…' : saved ? 'Or begin a new case' : 'Choose a difficulty to begin'}
          </span>
          <div className="title__diff-grid">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className="diff-card"
                disabled={busy}
                onClick={() => start(d.id)}
              >
                <span className="diff-card__label">{d.label}</span>
                <span className="diff-card__memory">{d.memory}</span>
                <span className="diff-card__detail">{d.detail}</span>
                <span className="diff-card__go">Enter the Manor →</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
