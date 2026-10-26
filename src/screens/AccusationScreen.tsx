/*
 * AccusationScreen — the commitment. The player names one suspect and
 * attaches the evidence they believe proves it. Both feed the score:
 * naming the true killer is the big swing; attached evidence rewards a
 * well-argued case (only when the accusation is correct).
 */

import { useState } from 'react';
import { useGame } from '../game/store';
import { Atmosphere } from '../components/graphics/Atmosphere';
import { Portrait } from '../components/ui/Portrait';
import { SUSPECTS } from '../game/case/suspects';
import { CLUES_BY_ID } from '../game/case/caseData';
import './accusation.css';

export function AccusationScreen() {
  const { state, dispatch } = useGame();
  const [selected, setSelected] = useState<string | null>(state.accusedId);
  const deadline = state.world?.deadline ?? false;

  const confirm = () => {
    if (!selected) return;
    dispatch({ type: 'ACCUSE', suspectId: selected });
    dispatch({ type: 'SET_PHASE', phase: 'verdict' });
  };

  return (
    <div className="accuse screen-enter">
      <Atmosphere
        rain
        dust
        intensity={0.8}
        candles={[{ x: 0.5, y: 0.12, radius: 0.4, rgb: '163,49,43' }]}
      />

      <div className="accuse__inner">
        <span className="eyebrow">The Drawing Room · Final Accusation</span>
        <h1 className="accuse__title">Name the Murderer</h1>
        <p className="accuse__sub">
          {deadline
            ? 'The Chief Constable is in the drawing room, and he will not wait. Name the murderer — now.'
            : 'Choose the one you believe killed Lord Ravenswood — and pin the evidence that makes your case. Be certain. You accuse only once.'}
        </p>

        <div className="accuse__suspects">
          {SUSPECTS.map((s) => (
            <div key={s.id} className="accuse__pick">
              <Portrait
                suspect={s}
                size={128}
                accused={selected === s.id}
                actionLabel="Accuse"
                onClick={() => setSelected(s.id)}
              />
              {state.world?.npcs[s.id]?.status === 'dead' && <span className="accuse__fate">dead</span>}
              {state.world?.npcs[s.id]?.status === 'fled' && <span className="accuse__fate">fled</span>}
            </div>
          ))}
        </div>

        <div className="accuse__evidence">
          <span className="eyebrow">Attach your evidence</span>
          {state.cluesFound.length === 0 ? (
            <p className="accuse__noev">
              You gathered no physical evidence. You may still accuse — but on
              instinct alone.
            </p>
          ) : (
            <div className="accuse__chips">
              {state.cluesFound.map((id) => (
                <button
                  key={id}
                  className={
                    'evchip' +
                    (state.attachedEvidence.includes(id) ? ' evchip--on' : '')
                  }
                  onClick={() => dispatch({ type: 'TOGGLE_EVIDENCE', clueId: id })}
                >
                  {CLUES_BY_ID[id].title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="accuse__actions">
          {!deadline && (
            <button
              className="btn"
              onClick={() => dispatch({ type: 'SET_PHASE', phase: 'investigation' })}
            >
              ← Keep investigating
            </button>
          )}
          <button
            className="btn btn--danger accuse__confirm"
            disabled={!selected}
            onClick={confirm}
          >
            {selected
              ? `Accuse ${SUSPECTS.find((s) => s.id === selected)!.name}`
              : 'Select a suspect'}
          </button>
        </div>
      </div>
    </div>
  );
}
