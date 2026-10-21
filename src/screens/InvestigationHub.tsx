/*
 * InvestigationHub — the central "explore" state. The manor is shown as
 * a lit cutaway you pan/zoom around; you SEARCH rooms for clues and
 * QUESTION the suspects standing in them. A top bar tracks progress and
 * holds the Case Book and the accusation gate.
 */

import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { Atmosphere } from '../components/graphics/Atmosphere';
import { MansionMap } from '../components/ui/MansionMap';
import { NotebookPanel } from '../components/ui/NotebookPanel';
import { CASE_META, CLUES_BY_ID, ROOMS_BY_ID } from '../game/case/caseData';
import type { RoomId } from '../game/types';
import './hub.css';

export function InvestigationHub() {
  const { state, dispatch } = useGame();
  const [selectedRoom, setSelectedRoom] = useState<RoomId | null>(null);
  const [notebookOpen, setNotebookOpen] = useState(false);

  const examinedRooms = useMemo(() => {
    const set = new Set<RoomId>();
    for (const room of Object.values(ROOMS_BY_ID)) {
      if (room.clues.length > 0 && room.clues.every((c) => state.cluesFound.includes(c))) {
        set.add(room.id);
      }
    }
    return set;
  }, [state.cluesFound]);

  const room = selectedRoom ? ROOMS_BY_ID[selectedRoom] : null;
  const roomExamined = room ? examinedRooms.has(room.id) : false;

  const enterRoom = () => {
    if (!room) return;
    dispatch({ type: 'ENTER_ROOM', roomId: room.id });
    dispatch({ type: 'SET_PHASE', phase: 'explore' });
  };

  const totalClues = Object.keys(CLUES_BY_ID).length;

  return (
    <div className="hub screen-enter">
      <Atmosphere
        rain={false}
        dust
        intensity={0.4}
        vignette
        grain
        candles={[
          { x: 0.06, y: 0.1, radius: 0.24 },
          { x: 0.95, y: 0.92, radius: 0.26, rgb: '200,120,60' },
        ]}
      />

      {/* ---- Top bar ------------------------------------------------ */}
      <header className="hub__bar">
        <div className="hub__bar-left">
          <span className="eyebrow">{CASE_META.title}</span>
          <span className="hub__meta">
            {CASE_META.year} · {state.difficulty}
          </span>
        </div>
        <div className="hub__bar-right">
          <span className="hub__stat"><b>{state.cluesFound.length}</b>/{totalClues} clues</span>
          <span className="hub__stat"><b>{state.notebook.length}</b> statements</span>
          <button className="btn" onClick={() => setNotebookOpen(true)}>Case Book</button>
          <button
            className="btn btn--danger"
            onClick={() => dispatch({ type: 'SET_PHASE', phase: 'accusation' })}
          >
            Make an Accusation
          </button>
        </div>
      </header>

      {/* ---- The manor --------------------------------------------- */}
      <div className="hub__main">
        <section className="hub__map panel">
          <MansionMap
            selectedRoom={selectedRoom}
            examinedRooms={examinedRooms}
            onSelectRoom={setSelectedRoom}
            onQuestionSuspect={(id) =>
              dispatch({ type: 'OPEN_INTERROGATION', suspectId: id })
            }
          />

          {room && (
            <div className="room-detail">
              <button className="room-detail__x" onClick={() => setSelectedRoom(null)} aria-label="Dismiss">✕</button>
              <h3 className="room-detail__name">{room.name}</h3>
              <p className="room-detail__blurb">{room.blurb}</p>

              {room.clues.length > 0 && (
                <p className="room-detail__none">
                  {roomExamined
                    ? 'You have searched this room thoroughly.'
                    : `${room.clues.filter((c) => state.cluesFound.includes(c)).length}/${room.clues.length} clues found here.`}
                </p>
              )}
              <button className="btn btn--accent" onClick={enterRoom}>Enter &amp; search the room ▸</button>
              {roomExamined && (
                <ul className="room-detail__clues">
                  {room.clues.map((id) => (
                    <li key={id}>
                      <b>{CLUES_BY_ID[id].title}</b> — {CLUES_BY_ID[id].detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <NotebookPanel open={notebookOpen} onClose={() => setNotebookOpen(false)} />
    </div>
  );
}
