/*
 * InterrogationScreen — now a rendered scene, not a chat window.
 * ------------------------------------------------------------------
 * The InterrogationRoom fills the view (detective in silhouette, suspect
 * lit by the desk lamp). Dialogue is delivered visual-novel style in a
 * box at the bottom: the suspect's latest line, an optional "tell", and
 * the composer. The suspect visibly leans in and their mouth moves while
 * they answer — a transform state-change on every question.
 *
 * The underlying logic (SuspectService seam, notebook logging, clue
 * reveals) is unchanged; only the presentation is new.
 */

import { useEffect, useRef, useState } from 'react';
import { useGame, type ChatTurn } from '../game/store';
import { suspectService } from '../game/services/serviceProvider';
import { SUSPECTS_BY_ID } from '../game/case/suspects';
import { DIALOGUE } from '../game/case/dialogue';
import { InterrogationRoom } from '../components/scene/InterrogationRoom';
import { NotebookPanel } from '../components/ui/NotebookPanel';
import type { NotebookEntry } from '../game/types';
import './interrogation.css';

let seq = 0;
const uid = (p: string) => `${p}-${Date.now()}-${seq++}`;

function MemoryMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="mem-meter">
      <span className="mem-meter__label">{label}</span>
      <span className="mem-meter__track">
        <span className="mem-meter__fill" style={{ width: `${value * 100}%` }} />
      </span>
    </div>
  );
}

export function InterrogationScreen() {
  const { state, dispatch } = useGame();
  const suspect = state.activeSuspectId
    ? SUSPECTS_BY_ID[state.activeSuspectId]
    : null;

  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const history = suspect ? (state.histories[suspect.id] ?? []) : [];

  useEffect(() => {
    if (!suspect) return;
    if ((state.histories[suspect.id] ?? []).length === 0) {
      dispatch({
        type: 'ADD_TURN',
        suspectId: suspect.id,
        turn: {
          id: `greet-${suspect.id}`,
          role: 'suspect',
          text: DIALOGUE[suspect.id]?.greeting ?? '…',
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspect?.id]);

  useEffect(() => {
    if (showLog) {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    }
  }, [history.length, showLog]);

  if (!suspect) return null;

  const suggestions = suspectService.suggestions(suspect.id);
  const lastSuspect = [...history].reverse().find((t) => t.role === 'suspect');
  const lastAsked = [...history].reverse().find((t) => t.role === 'detective');

  const askQuestion = async (question: string) => {
    const q = question.trim();
    if (!q || thinking) return;
    setInput('');

    dispatch({
      type: 'ADD_TURN',
      suspectId: suspect.id,
      turn: { id: uid('det'), role: 'detective', text: q },
    });
    setThinking(true);

    try {
      const { statement, thinkMs, observation } = await suspectService.ask(
        suspect.id,
        q,
        state.difficulty,
      );
      await new Promise((r) => setTimeout(r, thinkMs));

      const suspectTurn: ChatTurn = {
        id: uid('sus'),
        role: 'suspect',
        text: statement.answer,
        kind: statement.kind,
        observation,
      };
      dispatch({ type: 'ADD_TURN', suspectId: suspect.id, turn: suspectTurn });

      const entry: NotebookEntry = {
        id: uid('nb'),
        suspectId: suspect.id,
        question: q,
        answer: statement.answer,
        kind: statement.kind,
        flaggedContradiction: false,
        timestamp: Date.now(),
      };
      dispatch({ type: 'ADD_NOTEBOOK', entry });

      if (statement.revealsClue) {
        dispatch({ type: 'DISCOVER_CLUE', clueId: statement.revealsClue });
      }

      // Suspect "speaks" — drives the lean-in + mouth transforms.
      setSpeaking(true);
      window.setTimeout(
        () => setSpeaking(false),
        Math.min(3200, 900 + statement.answer.length * 22),
      );
    } catch (err) {
      dispatch({
        type: 'ADD_TURN',
        suspectId: suspect.id,
        turn: {
          id: uid('err'),
          role: 'suspect',
          text: '(They fall silent, unwilling to answer that.)',
        },
      });
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="intg screen-enter">
      {/* ---- The rendered scene fills the view -------------------- */}
      <InterrogationRoom suspect={suspect} speaking={speaking || thinking} />
      <div className="intg__scrim" />

      {/* ---- Top bar --------------------------------------------- */}
      <header className="intg__bar">
        <button
          className="intg__back"
          onClick={() => dispatch({ type: 'CLOSE_INTERROGATION' })}
        >
          ← Back to the manor
        </button>
        <div className="intg__id">
          <span className="intg__id-name">{suspect.name}</span>
          <span className="intg__id-role">{suspect.role}</span>
        </div>
        <div className="intg__bar-actions">
          <button className="btn" onClick={() => setShowMemory((v) => !v)}>
            {showMemory ? 'Hide read' : 'Read memory'}
          </button>
          <button className="btn" onClick={() => setShowLog((v) => !v)}>
            History
          </button>
          <button className="btn" onClick={() => setNotebookOpen(true)}>
            Case Book
          </button>
        </div>
      </header>

      {/* ---- Optional: your "read" on their memory --------------- */}
      {showMemory && (
        <div className="intg__memory panel">
          <span className="eyebrow">Your read on their memory</span>
          <MemoryMeter label="Forgetting" value={suspect.memory.decay} />
          <MemoryMeter label="Blurring" value={suspect.memory.interference} />
          <MemoryMeter label="Suggestibility" value={suspect.memory.sourceAmnesia} />
          <p className="intg__memnote">{suspect.memory.note}</p>
        </div>
      )}

      {/* ---- Optional: full transcript --------------------------- */}
      {showLog && (
        <div className="intg__logwrap panel">
          <div className="intg__log" ref={logRef}>
            {history.map((t) => (
              <div
                key={t.id}
                className={
                  'logline ' + (t.role === 'detective' ? 'logline--det' : 'logline--sus')
                }
              >
                <b>{t.role === 'detective' ? 'You' : suspect.name}:</b> {t.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Speech appears beside the suspect ------------------ */}
      <div className="intg__speech" aria-live="polite">
        <span className="intg__speaker">{suspect.name}</span>
        <p className="intg__line">
          {thinking ? (
            <span className="intg__dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
          ) : (
            lastSuspect?.text
          )}
        </p>
        {!thinking && lastSuspect?.observation && (
          <p className="intg__obs">
            <span>👁</span> {lastSuspect.observation}
          </p>
        )}
      </div>

      <div className="intg__vn">
        {lastAsked && (
          <p className="intg__asked">You asked — “{lastAsked.text}”</p>
        )}

        <div className="intg__composer">
          {suggestions.length > 0 && history.length < 3 && (
            <div className="intg__suggest">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="chip"
                  disabled={thinking}
                  onClick={() => askQuestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="intg__form"
            onSubmit={(e) => {
              e.preventDefault();
              askQuestion(input);
            }}
          >
            <input
              className="intg__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask ${suspect.name.split(' ')[0]} something…`}
              maxLength={200}
              disabled={thinking}
            />
            <button
              className="btn btn--accent"
              type="submit"
              disabled={thinking || !input.trim()}
            >
              Ask
            </button>
          </form>
        </div>
      </div>

      <NotebookPanel open={notebookOpen} onClose={() => setNotebookOpen(false)} />
    </div>
  );
}
