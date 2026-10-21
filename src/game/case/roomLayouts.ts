/*
 * roomLayouts.ts — the explorable-room layer.
 * ---------------------------------------------------------------------------
 * Each manor room (caseData ROOMS) gets a side-view interior the detective can
 * walk through at 384×216. A layout declares the palette THEME, the walkable
 * floor band, where the player enters, which suspect (if any) waits here, and
 * a set of HOTSPOTS — props you approach and examine. A hotspot either reveals
 * an engine-owned clue (clueId, from caseData) or just prints flavour.
 *
 * Nothing here invents case facts: clueIds are the exact ids in caseData.CLUES.
 */

import type { Color } from '../../components/pixel/pixelRenderer';
import type { RoomId } from '../types';

export interface RoomTheme {
  wall: Color[];          // wall gradient, dark→light (top→bottom)
  wallAccent: Color;      // damask / pattern accent
  floor: Color[];         // floor gradient ramp
  wood: Color[];          // trim / furniture wood ramp
  ambient: Color;         // tint of the ambient fill light
  ambientStrength: number;
  warm: boolean;          // warm candlelit vs cool moonlit mood
}

export type PropKind =
  | 'bookshelf' | 'fireplace' | 'desk' | 'rug' | 'window' | 'painting'
  | 'cabinet' | 'armchair' | 'fern' | 'wineRack' | 'diningTable' | 'stove'
  | 'bodyOutline' | 'barrel' | 'bed' | 'door' | 'crate' | 'mantelClock'
  | 'teaCart' | 'globe';

export interface Hotspot {
  id: string;
  kind: PropKind;
  /** Prop anchor + footprint in room space (384×216). */
  x: number; y: number; w: number; h: number;
  /** X the player must stand near to examine (defaults to prop centre). */
  standX?: number;
  label: string;          // shown on the "examine" prompt
  clueId?: string;        // reveals this engine clue when examined
  flavor: string;         // shown after examining (clue detail wins if clueId)
  /** A decorative prop (no examine) when true. */
  decor?: boolean;
}

export interface RoomLayout {
  theme: RoomTheme;
  floorY: number;         // top of the floor band / player baseline
  walkMinX: number;
  walkMaxX: number;
  spawnX: number;
  suspectId?: string;     // a suspect waiting to be questioned here
  hotspots: Hotspot[];
}

/* ---------------------------------------------------------------- themes -- */

const THEMES: Record<string, RoomTheme> = {
  study: {
    wall: [[20, 14, 16], [30, 20, 20], [42, 28, 26], [52, 36, 32]],
    wallAccent: [90, 60, 40], floor: [[24, 16, 10], [40, 26, 16], [56, 38, 22]],
    wood: [[14, 9, 6], [30, 18, 12], [50, 32, 20], [74, 50, 32], [98, 70, 44], [120, 90, 56]],
    ambient: [70, 48, 24], ambientStrength: 0.22, warm: true,
  },
  library: {
    wall: [[16, 14, 12], [26, 22, 18], [38, 32, 24], [48, 40, 30]],
    wallAccent: [80, 62, 36], floor: [[20, 14, 10], [34, 24, 16], [48, 34, 22]],
    wood: [[12, 9, 6], [28, 20, 12], [48, 34, 20], [70, 50, 30], [94, 70, 42], [118, 92, 56]],
    ambient: [74, 54, 28], ambientStrength: 0.2, warm: true,
  },
  conservatory: {
    wall: [[12, 18, 20], [18, 28, 30], [26, 40, 42], [34, 52, 52]],
    wallAccent: [60, 90, 90], floor: [[16, 18, 16], [26, 30, 24], [38, 44, 34]],
    wood: [[10, 14, 10], [22, 30, 20], [38, 50, 34], [56, 70, 48], [78, 92, 64], [100, 116, 82]],
    ambient: [90, 120, 150], ambientStrength: 0.26, warm: false,
  },
  kitchen: {
    wall: [[18, 18, 20], [28, 28, 30], [40, 40, 42], [52, 52, 52]],
    wallAccent: [120, 120, 118], floor: [[22, 20, 18], [36, 32, 28], [52, 46, 40]],
    wood: [[14, 12, 10], [30, 24, 18], [50, 40, 28], [72, 58, 40], [96, 78, 54], [120, 100, 70]],
    ambient: [120, 110, 90], ambientStrength: 0.24, warm: true,
  },
  cellar: {
    wall: [[10, 10, 12], [18, 18, 20], [28, 28, 30], [38, 36, 36]],
    wallAccent: [70, 66, 60], floor: [[12, 11, 10], [22, 20, 18], [34, 30, 26]],
    wood: [[10, 7, 5], [24, 16, 10], [42, 28, 16], [62, 42, 24], [84, 58, 34], [104, 76, 46]],
    ambient: [80, 70, 44], ambientStrength: 0.18, warm: true,
  },
  quarters: {
    wall: [[18, 16, 22], [28, 24, 34], [40, 34, 48], [50, 44, 58]],
    wallAccent: [100, 86, 120], floor: [[20, 16, 14], [34, 26, 20], [48, 38, 28]],
    wood: [[12, 9, 7], [28, 20, 14], [48, 34, 22], [70, 50, 32], [94, 70, 46], [118, 92, 62]],
    ambient: [90, 80, 120], ambientStrength: 0.2, warm: false,
  },
  dining: {
    wall: [[22, 16, 16], [34, 24, 22], [46, 34, 28], [58, 44, 34]],
    wallAccent: [110, 72, 44], floor: [[22, 15, 10], [38, 26, 16], [54, 38, 24]],
    wood: [[14, 9, 6], [30, 18, 12], [50, 32, 20], [74, 50, 32], [98, 70, 44], [122, 92, 58]],
    ambient: [100, 66, 32], ambientStrength: 0.22, warm: true,
  },
  foyer: {
    wall: [[16, 14, 18], [24, 22, 28], [34, 30, 38], [44, 40, 50]],
    wallAccent: [92, 80, 70], floor: [[26, 24, 28], [48, 46, 50], [78, 74, 78]],
    wood: [[10, 6, 4], [28, 18, 12], [50, 32, 20], [74, 50, 32], [98, 70, 44], [120, 90, 56]],
    ambient: [96, 78, 56], ambientStrength: 0.18, warm: true,
  },
};

/* --------------------------------------------------------------- layouts -- */

const FLOOR_Y = 150;
const base = (theme: RoomTheme): Omit<RoomLayout, 'hotspots'> => ({
  theme, floorY: FLOOR_Y, walkMinX: 40, walkMaxX: 344, spawnX: 60,
});

export const ROOM_LAYOUTS: Record<RoomId, RoomLayout> = {
  study: {
    ...base(THEMES.study),
    hotspots: [
      { id: 'hs-mantel', kind: 'fireplace', x: 44, y: 70, w: 64, h: 80, label: 'the mantelpiece', clueId: 'candlestick-missing', flavor: 'Two matched candlesticks should stand here. Only one remains.' },
      { id: 'hs-grate', kind: 'crate', x: 58, y: 132, w: 30, h: 18, standX: 72, label: 'the fire grate', clueId: 'burned-ledger', flavor: 'Ash, and a corner of scorched paper that did not finish burning.' },
      { id: 'hs-desk', kind: 'desk', x: 150, y: 116, w: 96, h: 34, label: 'the writing desk', clueId: 'crimson-thread', flavor: 'A heavy oak desk, its edge splintered where someone gripped it hard.' },
      { id: 'hs-body', kind: 'bodyOutline', x: 196, y: 150, w: 90, h: 12, standX: 232, label: 'where he fell', clueId: 'stopped-watch', flavor: 'A chalk outline. His pocket-watch lies shattered beside it.' },
      { id: 'hs-glass', kind: 'cabinet', x: 300, y: 92, w: 58, h: 58, label: 'the drinks cabinet', clueId: 'wine-residue', flavor: 'A brandy decanter and a single used glass, clouded at the bottom.' },
      { id: 'hs-window', kind: 'window', x: 258, y: 40, w: 34, h: 60, label: 'the tall window', flavor: 'Rain sheets down the glass. The latch is thrown from inside.', decor: true },
    ],
  },
  library: {
    ...base(THEMES.library), suspectId: 'julian',
    hotspots: [
      { id: 'hs-shelfL', kind: 'bookshelf', x: 30, y: 46, w: 80, h: 104, label: 'the west shelves', flavor: 'Law, ledgers, and a gap where a volume was pulled and not replaced.' },
      { id: 'hs-chair', kind: 'armchair', x: 150, y: 112, w: 46, h: 40, label: 'the reading chair', flavor: 'The leather is still faintly warm. Someone sat here until recently.' },
      { id: 'hs-hearth', kind: 'fireplace', x: 236, y: 74, w: 60, h: 76, label: 'the cold hearth', flavor: 'The fire went out hours ago. A brandy glass sits on the mantel.' },
      { id: 'hs-shelfR', kind: 'bookshelf', x: 304, y: 46, w: 62, h: 104, label: 'the east shelves', flavor: 'Poetry and atlases — and behind them, the quiet hum of the storm.' },
    ],
  },
  conservatory: {
    ...base(THEMES.conservatory),
    hotspots: [
      { id: 'hs-door', kind: 'door', x: 300, y: 56, w: 46, h: 94, label: 'the garden door', clueId: 'muddy-prints', flavor: 'The garden door stands unlocked. Wet mud is tracked across the tiles.' },
      { id: 'hs-fernL', kind: 'fern', x: 50, y: 96, w: 50, h: 54, label: 'the dripping ferns', flavor: 'Overgrown ferns drip onto the tiles. Nothing hidden among them.' },
      { id: 'hs-fernR', kind: 'fern', x: 150, y: 100, w: 46, h: 50, label: 'the potted palms', flavor: 'A row of potted palms against the cold glass wall.' },
      { id: 'hs-glass', kind: 'window', x: 110, y: 34, w: 160, h: 70, label: 'the glass wall', flavor: 'Floor-to-ceiling glass, streaming with rain. The garden is black beyond.', decor: true },
    ],
  },
  kitchen: {
    ...base(THEMES.kitchen), suspectId: 'agnes',
    hotspots: [
      { id: 'hs-stove', kind: 'stove', x: 44, y: 92, w: 64, h: 58, label: 'the range', flavor: 'The great iron range is banked low. A kettle sits off the heat.' },
      { id: 'hs-teapot', kind: 'teaCart', x: 150, y: 110, w: 54, h: 40, label: "the night's tea tray", clueId: 'cold-teapot', flavor: 'The teapot is full to the brim and stone cold. It was never carried up.' },
      { id: 'hs-counter', kind: 'cabinet', x: 266, y: 96, w: 96, h: 54, label: 'the worktable', flavor: 'Scrubbed spotless, as Agnes keeps it. Knives racked, nothing missing.' },
    ],
  },
  cellar: {
    ...base(THEMES.cellar),
    hotspots: [
      { id: 'hs-rack', kind: 'wineRack', x: 40, y: 54, w: 92, h: 96, label: 'the far wine rack', clueId: 'gambling-papers', flavor: 'Behind the dusty bottles: a bundle of IOUs in a careless hand.' },
      { id: 'hs-barrels', kind: 'barrel', x: 170, y: 104, w: 70, h: 46, label: 'the cask stack', flavor: 'Old casks, cobwebbed. Fresh scuff marks where one was shifted.' },
      { id: 'hs-rack2', kind: 'wineRack', x: 274, y: 54, w: 88, h: 96, label: 'the near wine rack', flavor: 'Vintages going back decades, undisturbed but for a gap or two.' },
    ],
  },
  quarters: {
    ...base(THEMES.quarters), suspectId: 'vivian',
    hotspots: [
      { id: 'hs-bed', kind: 'bed', x: 44, y: 104, w: 92, h: 46, label: 'the turned bed', flavor: 'The guest bed is turned down but not slept in. The cover is cold.' },
      { id: 'hs-door1', kind: 'door', x: 170, y: 58, w: 40, h: 92, label: "Vivian's door", flavor: "Vivian Cross's door. She claims she never once left this corridor." },
      { id: 'hs-wardrobe', kind: 'cabinet', x: 280, y: 70, w: 72, h: 80, label: 'the wardrobe', flavor: 'An evening wardrobe. One gown is missing from its hanger.' },
    ],
  },
  dining: {
    ...base(THEMES.dining), suspectId: 'vance',
    hotspots: [
      { id: 'hs-table', kind: 'diningTable', x: 96, y: 112, w: 190, h: 38, label: 'the long table', flavor: 'Dinner was cleared at ten. Five places were laid; one chair stays empty.' },
      { id: 'hs-sideboard', kind: 'cabinet', x: 300, y: 92, w: 60, h: 58, label: 'the sideboard', flavor: 'Decanters and silver. The brandy is lower than it should be.' },
      { id: 'hs-portrait', kind: 'painting', x: 150, y: 34, w: 40, h: 46, label: 'the family portrait', flavor: 'Lord Ravenswood in oils, watching the room he died in.', decor: true },
    ],
  },
  foyer: {
    ...base(THEMES.foyer), suspectId: 'thomas',
    hotspots: [
      { id: 'hs-clock', kind: 'mantelClock', x: 300, y: 70, w: 44, h: 80, label: 'the grandfather clock', flavor: 'The great clock stopped at 11:14 — the same hour as the watch upstairs.' },
      { id: 'hs-stand', kind: 'cabinet', x: 44, y: 110, w: 40, h: 40, label: 'the umbrella stand', flavor: 'One umbrella drips, still soaked. Someone came in from the storm.' },
      { id: 'hs-portrait', kind: 'painting', x: 150, y: 36, w: 44, h: 50, label: 'the hall portraits', flavor: 'Generations of Ravenswoods, dim behind rain-streaked glass.', decor: true },
    ],
  },
};

export function layoutFor(roomId: RoomId): RoomLayout {
  return ROOM_LAYOUTS[roomId];
}
