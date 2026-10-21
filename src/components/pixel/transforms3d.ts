/*
 * wireframe3d.ts — a minimal 3D pipeline, from scratch.
 * ------------------------------------------------------------------
 * Demonstrates the syllabus "3D transformations & projection" topic
 * explicitly in code: 4×4 homogeneous matrices, matrix multiplication,
 * model/view/perspective composition, the perspective divide, and the
 * viewport transform. Vertices are pushed through Model·View·Projection,
 * divided by w, mapped to screen space, and the edges are rasterized with
 * the Bresenham line (which itself Cohen–Sutherland-clips to the buffer).
 *
 * The object is the Ravenswood manor as a house wireframe, rotating.
 */

import type { PixelCanvas, Color } from './pixelRenderer';

export type Vec3 = [number, number, number];
/** 4×4 matrix, row-major, 16 numbers. */
export type Mat4 = number[];

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Matrix product a·b (both row-major). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 4; col++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + col];
      out[r * 4 + col] = s;
    }
  }
  return out;
}

export function translate(tx: number, ty: number, tz: number): Mat4 {
  return [1, 0, 0, tx, 0, 1, 0, ty, 0, 0, 1, tz, 0, 0, 0, 1];
}
export function scale(sx: number, sy: number, sz: number): Mat4 {
  return [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
}
export function rotationX(t: number): Mat4 {
  const c = Math.cos(t), s = Math.sin(t);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}
export function rotationY(t: number): Mat4 {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}
export function rotationZ(t: number): Mat4 {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Perspective projection (row-major, maps view space to clip space). */
export function perspective(fovYRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, 2 * far * near * nf,
    0, 0, -1, 0,
  ];
}

/** Transform a point in homogeneous coordinates: returns [x,y,z,w]. */
export function transform(m: Mat4, v: Vec3): [number, number, number, number] {
  const [x, y, z] = v;
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11],
    m[12] * x + m[13] * y + m[14] * z + m[15],
  ];
}

/* ---- The manor, as a house wireframe ----------------------------- */
const HOUSE_VERTS: Vec3[] = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], // front wall
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],     // back wall
  [0, 2, -1], [0, 2, 1],                               // roof ridge
];
const HOUSE_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0], // front
  [4, 5], [5, 6], [6, 7], [7, 4], // back
  [0, 4], [1, 5], [2, 6], [3, 7], // connectors
  [3, 8], [2, 8], [7, 9], [6, 9], [8, 9], // roof
];

/**
 * Draw the rotating wireframe manor into a PixelCanvas region.
 * `time` drives the rotation; ( cx, cy ) is the screen centre.
 */
export function drawWireframeManor(
  canvas: PixelCanvas,
  time: number,
  cx: number,
  cy: number,
  screenScale: number,
  color: Color,
): void {
  const aspect = 1;
  const proj = perspective(Math.PI / 3, aspect, 0.1, 100);
  const view = translate(0, -0.3, -5.2); // pull the camera back
  // Model: spin about Y, gentle nod about X. Composite transform.
  const model = multiply(rotationY(time * 0.6), rotationX(Math.sin(time * 0.4) * 0.25));
  const mvp = multiply(proj, multiply(view, model));

  // Project every vertex to screen space (perspective divide + viewport).
  const pts: [number, number][] = HOUSE_VERTS.map((v) => {
    const [x, y, z, w] = transform(mvp, v);
    const ndcX = x / w;
    const ndcY = y / w;
    void z;
    return [cx + ndcX * screenScale, cy - ndcY * screenScale];
  });

  // Rasterize each edge with the Bresenham line (clipped to the buffer).
  for (const [a, b] of HOUSE_EDGES) {
    const [x0, y0] = pts[a];
    const [x1, y1] = pts[b];
    canvas.drawLine(x0, y0, x1, y1, color[0], color[1], color[2]);
  }
  // Vertex dots for a touch of readability.
  for (const [px, py] of pts) {
    canvas.putPixel(Math.round(px), Math.round(py), 255, 240, 210);
  }
}
