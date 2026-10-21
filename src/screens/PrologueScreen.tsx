/*
 * PrologueScreen — sets up the case in a few narrative beats that fade
 * in one after another (typewriter font, candlelit ground). Ends by
 * handing the player into the Investigation Hub.
 */

import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { Atmosphere } from '../components/graphics/Atmosphere';
import { CASE_META } from '../game/case/caseData';
import './prologue.css';

const BEATS: string[] = [
  `The storm reached Ravenswood Manor a little after ten.`,
  `By eleven the power was gone, and the great house ran on candlelight.`,
  `At dawn, ${CASE_META.victim} was found dead in his locked study — a sedative in his glass, a blow to the temple, his watch stopped at ${CASE_META.timeOfDeath}.`,
  `The bridge to the village is flooded. No one has left. No one can.`,
  `Five people remained under this roof tonight. One of them is a murderer — but the others do not remember the evening the way it happened.`,
  `You are the detective. Separate the lies from the honest mistakes. Name the guilty before the water falls.`,
];

export function PrologueScreen() {
  const { dispatch } = useGame();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= BEATS.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : 1700);
    return () => clearTimeout(t);
  }, [shown]);

  const done = shown >= BEATS.length;

  return (
    <div className="prologue screen-enter" onClick={() => setShown(BEATS.length)}>
      <Atmosphere
        rain
        dust
        intensity={0.9}
        candles={[
          { x: 0.5, y: 0.5, radius: 0.55 },
          { x: 0.2, y: 0.8, radius: 0.35, rgb: '200,120,60' },
        ]}
      />
      <div className="prologue__scroll">
        <span className="eyebrow">Case File · {CASE_META.title}</span>
        <div className="prologue__beats">
          {BEATS.slice(0, shown).map((b, i) => (
            <p key={i} className="prologue__beat">
              {b}
            </p>
          ))}
        </div>

        {done ? (
          <button
            className="btn btn--accent prologue__go"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'SET_PHASE', phase: 'investigation' });
            }}
          >
            Begin the Investigation
          </button>
        ) : (
          <span className="prologue__hint">click to skip</span>
        )}
      </div>
    </div>
  );
}
