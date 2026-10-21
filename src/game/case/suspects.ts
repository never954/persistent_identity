/*
 * THE SUSPECTS.
 * ------------------------------------------------------------------
 * Five characters, each deliberately built around one human-memory
 * phenomenon so the fallible-memory backend has a clear target later.
 * The `persona` string is written to double as the LLM system-prompt
 * seed; `memory` values are the future decay/interference/source-amnesia
 * dials. For now they flavour scripted dialogue and set difficulty.
 */

import type { Suspect } from '../types';

export const SUSPECTS: Suspect[] = [
  {
    id: 'agnes',
    name: 'Agnes Hartwell',
    role: 'Housekeeper, 41 years in service',
    age: 63,
    persona:
      'A devoted, flustered old housekeeper who has done the same evening ' +
      'routine ten thousand times. She speaks warmly of the family and is ' +
      'mortified by the whole affair. Under pressure her nights blur together.',
    accent: '#8a94a6', // cold moon-grey
    statedAlibi: 'In the kitchen, then carried up the late tea as she does every night.',
    motive: 'None apparent — utterly loyal. But loyalty can hide things.',
    memory: {
      decay: 0.75,
      interference: 0.85,
      sourceAmnesia: 0.3,
      note: 'Heavy decay + interference. Her routine nights merge, so she "remembers" serving tea she never served. The game’s key honest-mistake red herring.',
    },
    isKiller: false,
  },
  {
    id: 'julian',
    name: 'Julian Ravenswood',
    role: 'Nephew and sole heir',
    age: 34,
    persona:
      'A sharp, expensively-dressed young man with a gambler’s nerves and a ' +
      'sneer he uses as armour. Quick, defensive, and hiding something — though ' +
      'not necessarily the murder. His memory is clear; his honesty is not.',
    accent: '#b08d4f', // brass
    statedAlibi: 'Reading alone in the library all evening.',
    motive: 'Drowning in gambling debt; inherits the entire Ravenswood estate.',
    memory: {
      decay: 0.2,
      interference: 0.2,
      sourceAmnesia: 0.15,
      note: 'Low fallibility. The contrast case: when Julian’s story breaks it is a deliberate lie, not a memory error — the ambiguity the player must learn to read.',
    },
    isKiller: false,
  },
  {
    id: 'vance',
    name: 'Dr. Eleanor Vance',
    role: 'Family physician and confidante',
    age: 49,
    persona:
      'A calm, exact woman who chooses her words like instruments. She has known ' +
      'the family for decades and grieves quietly. She reports what she observed ' +
      'and resists speculation. The most reliable voice in the house.',
    accent: '#6f9c8f', // clinical teal
    statedAlibi: 'In the conservatory with her reading until the body was found.',
    motive: 'None. She stood to lose a lifelong patient and friend.',
    memory: {
      decay: 0.1,
      interference: 0.1,
      sourceAmnesia: 0.05,
      note: 'Near-perfect memory. Anchors the timeline (time of death, the sedative) so the player has firm ground to reason from.',
    },
    isKiller: false,
  },
  {
    id: 'thomas',
    name: 'Thomas Bell',
    role: 'Valet, three months employed',
    age: 19,
    persona:
      'A nervous young valet, new and desperate to please. He agrees too easily ' +
      'and second-guesses himself aloud. He genuinely saw something near the study ' +
      'that night — but he can be talked into remembering it wrong.',
    accent: '#9a7b5a', // timid sepia
    statedAlibi: 'Turning down the lamps along the upstairs hall.',
    motive: 'None — but he fears losing the only position he has ever held.',
    memory: {
      decay: 0.4,
      interference: 0.45,
      sourceAmnesia: 0.9,
      note: 'The crown jewel. Very high source-amnesia: suggest a detail and he adopts it as his own memory. In the backend he mislabels who told him what.',
    },
    isKiller: false,
  },
  {
    id: 'vivian',
    name: 'Vivian Cross',
    role: 'Business partner and house guest',
    age: 38,
    persona:
      'A poised, glittering woman in crimson who answers every question with ' +
      'another. Warm on the surface, calculating beneath. She remembers everything ' +
      'perfectly well — she simply decides what to say.',
    accent: '#a3312b', // crimson
    statedAlibi: 'Retired early to her quarters with a headache; saw no one.',
    motive: 'Alistair had uncovered her embezzlement and meant to expose her at dawn.',
    memory: {
      decay: 0.15,
      interference: 0.15,
      sourceAmnesia: 0.1,
      note: 'The killer. Low fallibility by design — her "forgetting" is motivated and strategic, so telling her lie from Agnes’s honest error is the whole detective problem.',
    },
    isKiller: true,
  },
];

export const SUSPECTS_BY_ID: Record<string, Suspect> = Object.fromEntries(
  SUSPECTS.map((s) => [s.id, s]),
);
