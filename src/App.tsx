/*
 * App — the top-level screen router. It reads the current `phase` from
 * the game store and renders exactly one screen. This is the visible
 * form of the state machine defined in store.tsx.
 */

import { useGame } from './game/store';
import { TitleScreen } from './screens/TitleScreen';
import { CutsceneScreen } from './screens/CutsceneScreen';
import { PrologueScreen } from './screens/PrologueScreen';
import { InvestigationHub } from './screens/InvestigationHub';
import { ExploreRoomScreen } from './screens/ExploreRoomScreen';
import { InterrogationScreen } from './screens/InterrogationScreen';
import { AccusationScreen } from './screens/AccusationScreen';
import { VerdictScreen } from './screens/VerdictScreen';

export function App() {
  const { state } = useGame();

  switch (state.phase) {
    case 'title':
      return <TitleScreen />;
    case 'cutscene':
      return <CutsceneScreen />;
    case 'prologue':
      return <PrologueScreen />;
    case 'investigation':
      return <InvestigationHub />;
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
