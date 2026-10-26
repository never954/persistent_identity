/*
 * VerdictScreen — the reveal and the thesis payoff. Beyond "were you
 * right", it does the thing the whole project is about: it shows which
 * of the suspects' contradictions were deliberate LIES and which were
 * honest FALSE MEMORIES. That distinction — invisible during play — is
 * the point of building fallible memory into the suspects.
 */

import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { verdict } from '../game/services/session';
import type { Ending } from '../game/types';
import { Atmosphere } from '../components/graphics/Atmosphere';
import { SUSPECTS_BY_ID } from '../game/case/suspects';
import { CASE_META, SOLUTION } from '../game/case/caseData';
import { computeScore, rankFor } from '../game/scoring';
import './verdict.css';

interface Reveal {
  suspectId: string;
  tag: string;
  truth: string;
}

/** How each suspect's "off" testimony should really be read. */
const REVEALS: Reveal[] = [
  {
    suspectId: 'vivian',
    tag: 'The Lie',
    truth:
      'Every calm denial was deliberate. Her memory was never the problem — her honesty was. This is deception.',
  },
  {
    suspectId: 'agnes',
    tag: 'The Honest Mistake',
    truth:
      SOLUTION.redHerrings.agnes +
      ' She was not lying. She truly believed it — a genuine false memory, and the red herring most detectives chase.',
  },
  {
    suspectId: 'julian',
    tag: 'The Unrelated Secret',
    truth:
      SOLUTION.redHerrings.julian +
      ' A real lie — but about his debts, not the murder. Guilty of something; innocent of this.',
  },
  {
    suspectId: 'thomas',
    tag: 'The Suggestible Witness',
    truth:
      'He truly saw a woman in a dark gown — but would "remember" whoever you named. Trust only the detail he volunteered himself.',
  },
  {
    suspectId: 'vance',
    tag: 'The Reliable One',
    truth:
      'Her account held because her memory is sound. She anchored the timeline you reasoned from.',
  },
];

export function VerdictScreen() {
  const { state, dispatch } = useGame();
  // How the case closes depends on the whole day — bribes, flight, a body on the
  // back stairs, a shot fired — not only on the name you gave (backend world.py).
  const [ending, setEnding] = useState<Ending | null>(null);
  useEffect(() => {
    verdict(state.accusedId, state.attachedEvidence).then(setEnding);
  }, [state.accusedId, state.attachedEvidence]);
  const correct = state.accusedId === SOLUTION.killerId;
  const good = ending ? ending.good : correct;
  const accused = state.accusedId ? SUSPECTS_BY_ID[state.accusedId] : null;
  const killer = SUSPECTS_BY_ID[SOLUTION.killerId];

  const score = computeScore({
    cluesFound: state.cluesFound.length,
    notebook: state.notebook,
    accusedId: state.accusedId,
    killerId: SOLUTION.killerId,
    attachedEvidence: state.attachedEvidence,
    difficulty: state.difficulty,
  });
  const rank = rankFor(score.total, correct);

  return (
    <div className="verdict screen-enter">
      <Atmosphere
        rain
        dust
        intensity={0.9}
        candles={[
          { x: 0.5, y: 0.1, radius: 0.4, rgb: good ? '125,138,106' : '163,49,43' },
        ]}
      />

      <div className="verdict__inner">
        <span className="eyebrow">Case Closed · {CASE_META.title}</span>
        <h1 className={'verdict__head ' + (good ? 'is-right' : 'is-wrong')}>
          {ending ? ending.title : correct ? 'Case Solved' : 'The Wrong Suspect'}
        </h1>

        <p className="verdict__lede">
          {ending ? (
            ending.text
          ) : (
            <>
              You accused <b>{accused?.name ?? 'no one'}</b>.{' '}
              {correct
                ? 'You saw through the calm and named the killer.'
                : `The true murderer was ${killer.name}, and they walked free.`}
            </>
          )}
        </p>
        {ending && ending.epilogue.length > 0 && (
          <ul className="verdict__epilogue">
            {ending.epilogue.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}

        <div className="verdict__truth panel">
          <span className="eyebrow">What really happened</span>
          <p>{SOLUTION.because}</p>
        </div>

        {/* ---- The thesis payoff -------------------------------- */}
        <div className="verdict__reckon">
          <h2 className="verdict__reckon-title">The Memory Reckoning</h2>
          <p className="verdict__reckon-sub">
            The hardest part was never spotting a contradiction — it was knowing
            what a contradiction <em>meant</em>. Here is the truth behind each one:
          </p>
          <div className="verdict__cards">
            {REVEALS.map((r) => {
              const s = SUSPECTS_BY_ID[r.suspectId];
              const isKiller = r.suspectId === SOLUTION.killerId;
              return (
                <div
                  key={r.suspectId}
                  className={'reveal-card' + (isKiller ? ' reveal-card--killer' : '')}
                  style={{ '--accent': s.accent } as React.CSSProperties}
                >
                  <span className="reveal-card__tag">{r.tag}</span>
                  <span className="reveal-card__name">{s.name}</span>
                  <p className="reveal-card__truth">{r.truth}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ---- Score ------------------------------------------- */}
        <div className="verdict__score panel">
          <div className="verdict__rank">
            <span className="eyebrow">Detective Rating</span>
            <span className="verdict__rank-name">{rank}</span>
            <span className="verdict__rank-num">{score.total} pts</span>
          </div>
          <ul className="verdict__breakdown">
            <li><span>Evidence gathered</span><b>{score.clues}</b></li>
            <li><span>Instincts on testimony</span><b>{score.flags >= 0 ? '+' : ''}{score.flags}</b></li>
            <li><span>Accusation</span><b>{score.accusation >= 0 ? '+' : ''}{score.accusation}</b></li>
            <li><span>Evidence for your case</span><b>+{score.evidence}</b></li>
            <li className="verdict__breakdown-mult">
              <span>Difficulty ({state.difficulty}) ×{score.multiplier}</span>
              <b>{score.total}</b>
            </li>
          </ul>
        </div>

        <div className="verdict__actions">
          <button
            className="btn btn--accent"
            onClick={() => dispatch({ type: 'RESTART' })}
          >
            Play a New Night
          </button>
        </div>
      </div>
    </div>
  );
}
