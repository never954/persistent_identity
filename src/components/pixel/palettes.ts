/*
 * palettes.ts — colour ramps for the Ravenswood pixel-art world.
 * ------------------------------------------------------------------
 * Each ramp is an array of [R, G, B] steps ordered from darkest shadow
 * to brightest lit tone. The pixelRenderer's `fillGradient` and
 * `fillDithered` functions use these to produce the smooth, textured
 * colour transitions that define the Pixel Chill / lofi look.
 *
 * Naming: *_RAMP = a reusable gradient palette.
 *         *_COL  = a single constant colour.
 */

import type { Color } from './pixelRenderer';

/* ------------------------------------------------------------------ */
/*  Night Sky — stormy, moody, 12 stops                               */
/* ------------------------------------------------------------------ */

export const SKY_NIGHT_RAMP: Color[] = [
  [6, 7, 16],        // deep zenith
  [10, 12, 26],
  [14, 17, 36],
  [18, 22, 44],
  [22, 28, 52],
  [26, 34, 60],
  [32, 42, 70],
  [38, 50, 80],
  [44, 56, 86],       // mid-altitude
  [50, 60, 88],
  [56, 64, 86],
  [62, 68, 82],       // near-horizon (stormy purple-grey)
];

/* ------------------------------------------------------------------ */
/*  Storm Clouds — dark purple-grey masses                            */
/* ------------------------------------------------------------------ */

export const CLOUD_RAMP: Color[] = [
  [16, 18, 30],       // darkest inner shadow
  [22, 25, 40],
  [30, 34, 52],
  [40, 44, 62],
  [52, 56, 72],
  [64, 68, 80],       // lit cloud edge
];

/* ------------------------------------------------------------------ */
/*  Stone / Masonry — manor walls, archway, steps                     */
/* ------------------------------------------------------------------ */

export const STONE_RAMP: Color[] = [
  [12, 11, 14],       // deep shadow
  [22, 20, 24],
  [34, 30, 34],
  [44, 40, 44],
  [56, 52, 54],
  [68, 64, 66],
  [80, 76, 76],
  [92, 88, 86],       // bright lit stone
];

export const BRICK_RAMP: Color[] = [
  [18, 12, 10],       // dark mortar shadow
  [30, 20, 16],
  [42, 28, 22],
  [56, 36, 28],
  [68, 44, 34],
  [78, 54, 42],
  [86, 64, 50],
  [94, 72, 56],       // warm sunlit brick (used for lightning reveal)
];

/* ------------------------------------------------------------------ */
/*  Wood — interior panelling, doors, desk, beams                     */
/* ------------------------------------------------------------------ */

export const WOOD_DARK_RAMP: Color[] = [
  [10, 6, 4],         // deepest shadow
  [18, 12, 8],
  [28, 18, 12],
  [38, 24, 16],
  [50, 32, 20],
  [62, 40, 26],
  [74, 50, 32],
  [86, 60, 38],
  [98, 70, 44],
  [110, 82, 52],      // bright warm-lit wood
];

export const WOOD_LIGHT_RAMP: Color[] = [
  [24, 16, 10],
  [40, 28, 18],
  [58, 40, 26],
  [76, 54, 34],
  [94, 68, 44],
  [112, 82, 54],
  [130, 98, 66],
  [148, 114, 78],
  [164, 130, 92],
  [178, 148, 108],    // pale oak
];

/* ------------------------------------------------------------------ */
/*  Candle / Warm Light — glow halos, lamp spill                      */
/* ------------------------------------------------------------------ */

export const CANDLE_RAMP: Color[] = [
  [60, 28, 8],        // deep amber
  [90, 42, 12],
  [120, 58, 16],
  [150, 78, 22],
  [180, 100, 30],
  [210, 130, 48],
  [234, 164, 72],
  [255, 200, 110],    // bright candle core
];

export const WARM_GLOW_RAMP: Color[] = [
  [20, 10, 4],
  [40, 22, 8],
  [64, 36, 14],
  [90, 52, 22],
  [120, 72, 32],
  [150, 96, 46],
  [180, 120, 60],
  [210, 150, 80],
];

/* ------------------------------------------------------------------ */
/*  Glass — rain-spattered windows                                    */
/* ------------------------------------------------------------------ */

export const GLASS_DARK_RAMP: Color[] = [
  [10, 16, 28],       // near-opaque reflection
  [16, 24, 42],
  [22, 32, 56],
  [30, 42, 70],
  [38, 52, 84],
  [48, 64, 98],       // bright window (warm interior glow behind)
];

export const GLASS_WARM_RAMP: Color[] = [
  [40, 28, 16],       // dim warm interior through glass
  [60, 42, 22],
  [82, 58, 30],
  [106, 76, 40],
  [130, 96, 52],
  [158, 120, 68],     // bright warm lit window
];

/* ------------------------------------------------------------------ */
/*  Metal — iron gate, brass fixtures, door knocker                   */
/* ------------------------------------------------------------------ */

export const IRON_RAMP: Color[] = [
  [8, 8, 10],
  [18, 18, 22],
  [30, 30, 36],
  [44, 44, 50],
  [58, 58, 66],
  [74, 74, 80],       // bright iron highlight
];

export const BRASS_RAMP: Color[] = [
  [30, 20, 8],
  [50, 34, 14],
  [72, 48, 20],
  [96, 66, 28],
  [122, 86, 38],
  [152, 110, 52],
  [184, 140, 70],
  [216, 174, 96],     // bright polished brass
];

/* ------------------------------------------------------------------ */
/*  Foliage — hedges, ivy, garden trees                               */
/* ------------------------------------------------------------------ */

export const FOLIAGE_RAMP: Color[] = [
  [6, 10, 6],         // deep shadow
  [12, 18, 10],
  [18, 26, 16],
  [26, 36, 22],
  [34, 46, 30],
  [42, 56, 38],
  [52, 66, 46],
  [62, 78, 56],       // bright leaf
];

/* ------------------------------------------------------------------ */
/*  Ground — gravel path, wet earth                                   */
/* ------------------------------------------------------------------ */

export const GRAVEL_RAMP: Color[] = [
  [14, 12, 10],
  [24, 22, 18],
  [36, 32, 28],
  [48, 44, 38],
  [60, 54, 48],
  [72, 66, 58],
  [84, 78, 68],
  [96, 88, 78],       // pale dry gravel
];

export const MUD_RAMP: Color[] = [
  [10, 8, 6],
  [18, 14, 10],
  [28, 20, 14],
  [38, 28, 20],
  [48, 36, 26],
  [58, 44, 32],
];

/* ------------------------------------------------------------------ */
/*  Interior — marble floor, carpet, wallpaper                        */
/* ------------------------------------------------------------------ */

export const MARBLE_RAMP: Color[] = [
  [20, 18, 22],
  [36, 34, 38],
  [54, 50, 54],
  [72, 68, 72],
  [90, 86, 88],
  [108, 104, 106],
  [126, 122, 124],
  [142, 138, 140],    // bright marble
];

export const CARPET_RAMP: Color[] = [
  [18, 8, 8],
  [32, 14, 12],
  [48, 22, 18],
  [64, 30, 24],
  [80, 40, 32],
  [96, 52, 42],       // rich crimson carpet
];

export const WALLPAPER_RAMP: Color[] = [
  [16, 14, 18],
  [24, 22, 28],
  [34, 30, 38],
  [44, 40, 50],
  [54, 50, 60],
  [64, 58, 68],       // faded vintage wallpaper
];

/* ------------------------------------------------------------------ */
/*  Fabric — detective coat, suspect clothing                         */
/* ------------------------------------------------------------------ */

export const TRENCHCOAT_RAMP: Color[] = [
  [10, 8, 6],
  [18, 16, 12],
  [28, 24, 18],
  [38, 32, 24],
  [48, 42, 32],
  [58, 50, 38],       // wet trenchcoat highlight
];

/* ------------------------------------------------------------------ */
/*  Water / Rain                                                      */
/* ------------------------------------------------------------------ */

export const RAIN_COL: Color = [160, 180, 210];
export const PUDDLE_RAMP: Color[] = [
  [8, 12, 20],
  [14, 20, 34],
  [22, 30, 48],
  [30, 40, 62],
  [40, 52, 76],       // bright puddle reflection
];

/* ------------------------------------------------------------------ */
/*  Lightning flash — overlay tint                                    */
/* ------------------------------------------------------------------ */

export const LIGHTNING_COL: Color = [200, 210, 230];

/* ------------------------------------------------------------------ */
/*  Text / Title                                                      */
/* ------------------------------------------------------------------ */

export const PARCHMENT_COL: Color = [239, 228, 207];
export const TITLE_GLOW_COL: Color = [244, 184, 96];
