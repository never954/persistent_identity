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
import { BackendError, SERVER_HINT, act, worldView } from '../game/services/session';
import { SUSPECTS_BY_ID } from '../game/case/suspects';
import { DIALOGUE } from '../game/case/dialogue';
import { InterrogationRoom } from '../components/scene/InterrogationRoom';
import { NotebookPanel } from '../components/ui/NotebookPanel';
import type { Deed, MemoryTrace, NotebookEntry, Tone } from '../game/types';
import './interrogation.css';

const STATE_LABEL: Record<string, string> = {
  detail: 'recalled',
  gist: 'only the gist',
  forgotten: 'forgotten',
};

/** Spoiler tool: the memory layer's reasoning behind the last answer. */
function MemoryInspector({ trace }: { trace: MemoryTrace }) {
  const shown = trace.recalls.filter((r) => r.used || r.state !== 'forgotten' || r.relevance > 0.3);
  return (
    <div className="inspector">
      <p className="inspector__decision">
        Decided <b>{trace.decision.kind}</b> — {trace.decision.rule}
        {trace.case_question ? ' · about last night' : ' · personal'}
        {!trace.llm_ok && ' · voice offline (fallback line)'}
      </p>
      {trace.planted_now && trace.planted_now.length > 0 && (
        <p className="inspector__planted">Your question planted: “{trace.planted_now.join('” “')}”</p>
      )}
      <ul className="inspector__list">
        {shown.slice(0, 8).map((r) => (
          <li key={r.id} className={`inspector__item is-${r.state}${r.used ? ' is-used' : ''}`}>
            <span className="inspector__tags">
              {r.kind}
              {' · '}
              {r.kind === 'concealed' ? 'hidden truth' : STATE_LABEL[r.state]}
              {r.kind === 'planted' && (r.source_known ? ' · knows you said it' : ' · feels like their own')}
              {' · '}relevance {r.relevance.toFixed(2)}
            </span>
            <span className="inspector__text">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How you say it. A typed curse, threat or plea is detected even without a button. */
const TONES: { id: Tone; label: string; hint: string }[] = [
  { id: 'calm', label: 'Calm', hint: 'Just ask.' },
  { id: 'press', label: 'Press', hint: 'Lean on them. Raises fear — and anger.' },
  { id: 'threaten', label: 'Threaten', hint: 'Frightens the timid; the proud dig in.' },
  { id: 'comfort', label: 'Comfort', hint: 'Builds trust. Trusted, people tell you more.' },
  { id: 'beg', label: 'Plead', hint: 'Ask for their help.' },
  { id: 'insult', label: 'Insult', hint: 'Push far enough and they walk out.' },
];

/** What a deed looks like in the transcript. */
const DEED_LINES: Record<Deed, (name: string) => string> = {
  strike: (n) => `[You strike ${n} across the face.]`,
  draw: (n) => `[You draw your revolver and level it at ${n}.]`,
  holster: () => '[You lower the revolver.]',
  shoot: () => '[You fire.]',
  bribe: (n) => `[You slide a few pound notes across the table to ${n}.]`,
  watch: (n) => `[You tell the constable to keep watch on ${n}.]`,
  accept_bribe: () => '[You take the envelope.]',
  refuse_bribe: () => '[You push the envelope back.]',
  release: (n) => `[You tell ${n} they may go.]`,
};

/** Mood meter (fear / trust / anger toward you). */
function MoodBar({ label, value, kind }: { label: string; value: number; kind: string }) {
  return (
    <span className={`mood__bar mood__bar--${kind}`} title={`${label} ${value}/100`}>
      <span className="mood__label">{label}</span>
      <span className="mood__track">
        <span className="mood__fill" style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

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
  const [showInspector, setShowInspector] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [tone, setTone] = useState<Tone>('calm');
  const [armed, setArmed] = useState(false); // second click needed to fire
  const [flash, setFlash] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const history = suspect ? (state.histories[suspect.id] ?? []) : [];
  const npc = suspect ? state.world?.npcs[suspect.id] : undefined;
  const gunOnThem = !!suspect && state.world?.gun === suspect.id;
  const gone = npc && npc.status !== 'present';

  // The house may have moved on while you were away (moods, an envelope on the table).
  useEffect(() => {
    if (!suspect) return;
    worldView().then((w) => w && dispatch({ type: 'SET_WORLD', world: w }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspect?.id]);

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

  const reportError = (err: unknown) => {
    const text =
      err instanceof BackendError && err.problem === 'offline'
        ? `(The suspects’ memory server is not running. ${SERVER_HINT}, then try again.)`
        : err instanceof BackendError && err.problem === 'missing-save'
          ? '(This save no longer exists on the server — start a new case from the title screen.)'
          : err instanceof BackendError && err.problem === 'gone'
            ? `(${suspect.name} is not here any more.)`
            : `(No answer — ${(err as Error).message})`;
    dispatch({ type: 'ADD_TURN', suspectId: suspect.id, turn: { id: uid('err'), role: 'suspect', text } });
    // eslint-disable-next-line no-console
    console.error(err);
  };

  const speak = (text: string) => {
    setSpeaking(true);
    window.setTimeout(() => setSpeaking(false), Math.min(3200, 900 + text.length * 22));
  };

  /** A deed, not a question. */
  const doDeed = async (deed: Deed) => {
    if (thinking) return;
    if (deed === 'shoot' && !armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    setArmed(false);
    setThinking(true);
    if (deed === 'shoot') {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 220);
    }
    try {
      const r = await act(suspect.id, deed);
      dispatch({ type: 'SET_WORLD', world: { ...r.world, clock_label: r.clock_label } });
      if (r.notices.length) dispatch({ type: 'TOAST', texts: r.notices });
      dispatch({
        type: 'ADD_TURN',
        suspectId: suspect.id,
        turn: { id: uid('deed'), role: 'detective', text: DEED_LINES[deed](suspect.name.split(' ')[0]) },
      });
      if (r.line) {
        dispatch({ type: 'ADD_TURN', suspectId: suspect.id, turn: { id: uid('sus'), role: 'suspect', text: r.line } });
        speak(r.line);
      }
      if (deed === 'release') dispatch({ type: 'CLOSE_INTERROGATION' });
    } catch (err) {
      reportError(err);
    } finally {
      setThinking(false);
    }
  };

  const askQuestion = async (question: string) => {
    const q = question.trim();
    if (!q || thinking || gone) return;
    setInput('');
    const said = tone;
    setTone('calm');

    dispatch({
      type: 'ADD_TURN',
      suspectId: suspect.id,
      turn: { id: uid('det'), role: 'detective', text: q },
    });
    setThinking(true);

    try {
      const { statement, thinkMs, observation, clockLabel, trace, notices, world } = await suspectService.ask(
        suspect.id,
        q,
        state.difficulty,
        said,
      );
      await new Promise((r) => setTimeout(r, thinkMs));

      const suspectTurn: ChatTurn = {
        id: uid('sus'),
        role: 'suspect',
        text: statement.answer,
        kind: statement.kind,
        observation,
        trace,
      };
      dispatch({ type: 'ADD_TURN', suspectId: suspect.id, turn: suspectTurn });
      if (clockLabel) dispatch({ type: 'SET_CLOCK', clockLabel });
      if (world) dispatch({ type: 'SET_WORLD', world: { ...world, clock_label: clockLabel } });
      if (notices?.length) dispatch({ type: 'TOAST', texts: notices });

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
      speak(statement.answer);
    } catch (err) {
      reportError(err);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="intg screen-enter">
      {/* ---- The rendered scene fills the view -------------------- */}
      <InterrogationRoom
        suspect={suspect}
        speaking={(speaking || thinking) && !gone}
        fear={npc?.fear ?? 0}
        anger={npc?.anger ?? 0}
        gun={gunOnThem}
        absent={!!gone}
        dead={npc?.status === 'dead'}
        flash={flash}
      />
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
          <span className="intg__id-role">
            {suspect.role}
            {state.clockLabel && ` · ${state.clockLabel}`}
          </span>
          {npc && (
            <span className="mood">
              <MoodBar label="Fear" value={npc.fear} kind="fear" />
              <MoodBar label="Trust" value={npc.trust} kind="trust" />
              <MoodBar label="Anger" value={npc.anger} kind="anger" />
              <span className="mood__words">{npc.mood}{npc.watched && ' · under the constable’s watch'}</span>
            </span>
          )}
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
          {lastSuspect?.trace && (
            <>
              <button className="btn inspector__toggle" onClick={() => setShowInspector((v) => !v)}>
                {showInspector ? 'Hide the Memory Inspector' : 'Memory Inspector — reveals the truth'}
              </button>
              {showInspector && <MemoryInspector trace={lastSuspect.trace} />}
            </>
          )}
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
          <p className="intg__asked">
            {lastAsked.text.startsWith('[') ? lastAsked.text.slice(1, -1) : `You asked — “${lastAsked.text}”`}
          </p>
        )}

        {suspect.id === 'vivian' && state.world?.offer && !gone && (
          <div className="intg__offer">
            <span>Miss Cross slides a fat envelope across the table. “For your trouble, Detective — elsewhere.”</span>
            <button className="btn btn--danger" disabled={thinking} onClick={() => doDeed('accept_bribe')}>
              Take the money
            </button>
            <button className="btn" disabled={thinking} onClick={() => doDeed('refuse_bribe')}>
              Push it back
            </button>
          </div>
        )}

        {gone && (
          <p className="intg__gone">
            {npc!.status === 'refusing'
              ? `${suspect.name} has walked out and won’t speak to you until ${npc!.until}.`
              : npc!.status === 'dead'
                ? `${suspect.name} is dead.`
                : `${suspect.name} has fled Ravenswood.`}
          </p>
        )}

        {!gone && (
          <div className="intg__deeds" role="group" aria-label="Actions">
            {gunOnThem ? (
              <>
                <button className="deed deed--danger" disabled={thinking} onClick={() => doDeed('shoot')}>
                  {armed ? 'Really fire?' : 'Fire'}
                </button>
                <button className="deed" disabled={thinking} onClick={() => doDeed('holster')}>Lower the gun</button>
              </>
            ) : (
              <button className="deed deed--danger" disabled={thinking} onClick={() => doDeed('draw')}>
                Draw revolver
              </button>
            )}
            <button className="deed deed--danger" disabled={thinking} onClick={() => doDeed('strike')}>Strike</button>
            <button className="deed" disabled={thinking} onClick={() => doDeed('bribe')}>Offer money</button>
            <button
              className="deed"
              disabled={thinking || npc?.watched}
              title="One constable: whoever he watches cannot run — or be harmed. Everyone else is unguarded."
              onClick={() => doDeed('watch')}
            >
              {npc?.watched ? 'Constable watching' : 'Post the constable'}
            </button>
            <button className="deed" disabled={thinking} onClick={() => doDeed('release')}>Let them go</button>
          </div>
        )}

        <div className="intg__composer">
          {suggestions.length > 0 && history.length < 3 && !gone && (
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
          {!gone && (
            <div className="intg__tones" role="radiogroup" aria-label="How you say it">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={tone === t.id}
                  title={t.hint}
                  className={`tone tone--${t.id}` + (tone === t.id ? ' is-on' : '')}
                  disabled={thinking}
                  onClick={() => setTone(t.id)}
                >
                  {t.label}
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
              placeholder={gone ? '' : `Say something to ${suspect.name.split(' ')[0]}…`}
              maxLength={200}
              disabled={thinking || !!gone}
            />
            <button
              className="btn btn--accent"
              type="submit"
              disabled={thinking || !input.trim() || !!gone}
            >
              {tone === 'calm' ? 'Ask' : TONES.find((t) => t.id === tone)!.label}
            </button>
          </form>
        </div>
      </div>

      <NotebookPanel open={notebookOpen} onClose={() => setNotebookOpen(false)} />
    </div>
  );
}
