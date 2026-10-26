/*
 * App — the top-level screen router. It reads the current `phase` from
 * the game store and renders exactly one screen. This is the visible
 * form of the state machine defined in store.tsx.
 */

import { useEffect } from 'react';
import { useGame } from './game/store';
import { Toasts } from './components/ui/Toasts';
import { TitleScreen } from './screens/TitleScreen';
import { CutsceneScreen } from './screens/CutsceneScreen';
import { PrologueScreen } from './screens/PrologueScreen';
import { ManorScreen } from './screens/ManorScreen';
import { ExploreRoomScreen } from './screens/ExploreRoomScreen';
import { InterrogationScreen } from './screens/InterrogationScreen';
import { AccusationScreen } from './screens/AccusationScreen';
import { VerdictScreen } from './screens/VerdictScreen';

export function App() {
  const { state, dispatch } = useGame();
  const ended = state.world?.ended ?? null;
  const deadline = state.world?.deadline ?? false;

  // The house can end the case for you: a shot fired ends it now; at the deadline
  // the Chief Constable arrives and you must name someone.
  useEffect(() => {
    if (ended && state.phase !== 'verdict' && state.phase !== 'title') {
      dispatch({ type: 'SET_PHASE', phase: 'verdict' });
    } else if (deadline && ['investigation', 'explore', 'interrogation'].includes(state.phase)) {
      dispatch({ type: 'SET_PHASE', phase: 'accusation' });
    }
  }, [ended, deadline, state.phase, dispatch]);

  return (
    <>
      <Screen />
      {state.phase !== 'title' && <Toasts />}
    </>
  );
}

function Screen() {
  const { state } = useGame();
  switch (state.phase) {
    case 'title':
      return <TitleScreen />;
    case 'cutscene':
      return <CutsceneScreen />;
    case 'prologue':
      return <PrologueScreen />;
    case 'investigation':
      return <ManorScreen />;
    case 'explore':
      return <ExploreRoomScreen />;
    case 'interrogation':
      return <InterrogationScreen />;
    case 'accusation':
      return <AccusationScreen />;
    case 'verdict':
      return <VerdictScreen />;
    default:
      return <TitleScreen />;
  }
}
