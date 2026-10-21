/*
 * NotebookPanel — the detective's case book. A slide-in overlay with two
 * sections: Evidence (physical clues discovered by examining rooms) and
 * Testimony (statements captured from interrogations). The player can
 * flag any statement as a contradiction — a judgement the scoring system
 * rewards when it's a real lie/false-memory and penalises when it's an
 * honest, plain statement. This flagging log is also the raw data the
 * research experiment will read later.
 */

import { useGame } from '../../game/store';
import { CLUES_BY_ID } from '../../game/case/caseData';
import { SUSPECTS_BY_ID } from '../../game/case/suspects';
import './notebook.css';

const KIND_LABEL: Record<string, string> = {
  plain: 'Statement',
  lie: 'Statement',
  'false-memory': 'Statement',
  evasion: 'Statement',
};

export function NotebookPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useGame();

  return (
    <>
      <div
        className={'notebook__scrim' + (open ? ' is-open' : '')}
        onClick={onClose}
      />
      <aside className={'notebook' + (open ? ' is-open' : '')} aria-hidden={!open}>
        <header className="notebook__head">
          <h2 className="notebook__title">Case Book</h2>
          <button className="notebook__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="notebook__body">
          {/* --- Evidence -------------------------------------------- */}
          <section className="notebook__section">
            <span className="eyebrow">Evidence · {state.cluesFound.length}</span>
            {state.cluesFound.length === 0 ? (
              <p className="notebook__empty">
                Examine the rooms of the manor to gather physical evidence.
              </p>
            ) : (
              <ul className="notebook__clues">
                {state.cluesFound.map((id) => {
                  const clue = CLUES_BY_ID[id];
                  if (!clue) return null;
                  return (
                    <li key={id} className="clue-card">
                      <span className="clue-card__title">{clue.title}</span>
                      <span className="clue-card__detail">{clue.detail}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* --- Testimony ------------------------------------------- */}
          <section className="notebook__section">
            <span className="eyebrow">Testimony · {state.notebook.length}</span>
            {state.notebook.length === 0 ? (
              <p className="notebook__empty">
                Question the suspects. Their answers are recorded here for you to
                weigh against the evidence.
              </p>
            ) : (
              <ul className="notebook__statements">
                {state.notebook.map((e) => {
                  const s = SUSPECTS_BY_ID[e.suspectId];
                  return (
                    <li
                      key={e.id}
                      className={
                        'stmt' + (e.flaggedContradiction ? ' stmt--flagged' : '')
                      }
                      style={{ '--accent': s?.accent } as React.CSSProperties}
                    >
                      <div className="stmt__who">
                        <span className="stmt__name">{s?.name}</span>
                        <span className="stmt__kind">{KIND_LABEL[e.kind]}</span>
                      </div>
                      <p className="stmt__q">“{e.question}”</p>
                      <p className="stmt__a">{e.answer}</p>
                      <button
                        className="stmt__flag"
                        onClick={() =>
                          dispatch({ type: 'TOGGLE_FLAG', entryId: e.id })
                        }
                      >
                        {e.flaggedContradiction
                          ? '⚑ Flagged as suspicious'
                          : '⚐ Flag as suspicious'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
