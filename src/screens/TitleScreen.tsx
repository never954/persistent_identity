/*
 * TitleScreen — the front door. Sets the mood (heavy atmosphere) and
 * lets the player choose a difficulty. The three difficulties are the
 * public face of the memory-fallibility dial: today they only gate how
 * many "tells" the game shows; once the backend lands, they will set the
 * suspects' actual decay / interference / source-amnesia strengths.
 */

import { useGame } from '../game/store';
import type { Difficulty } from '../game/types';
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
    memory: 'Clear memories',
    detail: 'Suspects barely misremember, and the game whispers every tell. For learning the ropes.',
  },
  {
    id: 'detective',
    label: 'Detective',
    memory: 'Fraying memories',
    detail: 'Honest mistakes and real lies both appear. Only the strongest tells are shown.',
  },
  {
    id: 'inspector',
    label: 'Inspector',
    memory: 'Treacherous memories',
    detail: 'Heavy forgetting and false memory. No tells at all — trust nothing, verify everything.',
  },
];

export function TitleScreen() {
  const { dispatch } = useGame();

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

        <div className="title__diff">
          <span className="eyebrow title__diff-label">
            Choose a difficulty to begin
          </span>
          <div className="title__diff-grid">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className="diff-card"
                onClick={() => dispatch({ type: 'START', difficulty: d.id })}
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
