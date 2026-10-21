/*
 * renderEntry.ts — headless render entry. Bundled by esbuild and run in
 * Node (with an ImageData shim) to produce real PNGs of the canvas scenes
 * for the slide deck. No DOM beyond ImageData is touched by these draws.
 */

import { PixelCanvas, PX_WIDTH, PX_HEIGHT } from '../src/components/pixel/pixelRenderer';
import { drawInterrogationRoom } from '../src/components/scene/interrogationScene';
import { drawRoom } from '../src/components/room/roomScene';
import { ROOM_LAYOUTS } from '../src/game/case/roomLayouts';
import type { RoomId } from '../src/game/types';
import { drawWireframeManor } from '../src/components/pixel/transforms3d';
import {
  drawExteriorApproach,
  drawDetectiveWalking,
  drawEntranceDoors,
  drawFoyerInterior,
  drawCaseBegins,
} from '../src/screens/cutscene/sceneCompositions';

export interface Shot {
  name: string;
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export function renderAll(): Shot[] {
  const shots: Shot[] = [];
  const grab = (name: string, draw: (c: PixelCanvas) => void, w = PX_WIDTH, h = PX_HEIGHT) => {
    const pc = new PixelCanvas(w, h);
    draw(pc);
    shots.push({ name, w, h, data: pc.imageData.data });
  };

  grab('interrogation', (c) => drawInterrogationRoom(c, 2.0, { suspectId: 'vivian', speaking: false }));

  // Explorable rooms (one preview each).
  (Object.keys(ROOM_LAYOUTS) as RoomId[]).forEach((rid) => {
    const L = ROOM_LAYOUTS[rid];
    grab(`room_${rid}`, (c) => drawRoom(c, 2.4, rid, {
      player: { x: L.spawnX, facing: 1, moving: false },
      nearHotspotId: L.hotspots[0]?.id ?? null,
      examinedIds: [],
    }));
  });
  grab('cutscene_1_approach', (c) => drawExteriorApproach(c, 2.6));
  grab('cutscene_2_walking', (c) => drawDetectiveWalking(c, 2.6));
  grab('cutscene_3_doors', (c) => drawEntranceDoors(c, 2.6));
  grab('cutscene_4_foyer', (c) => drawFoyerInterior(c, 2.6));
  grab('cutscene_5_begins', (c) => drawCaseBegins(c, 2.6));
  grab('wireframe', (c) => {
    c.imageData.data.fill(0);
    drawWireframeManor(c, 0.75, 64, 60, 34, [244, 184, 96]);
  }, 128, 120);

  return shots;
}
