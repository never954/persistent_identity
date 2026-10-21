/*
 * runRender.mjs — shims ImageData, runs the bundled renderer, upscales each
 * scene with nearest-neighbour, PNG-encodes (zlib), and writes docs/shots/*.
 * Run:  node scripts/runRender.mjs   (after building scripts/_bundle.mjs)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Minimal ImageData shim (Node has no DOM).
globalThis.ImageData = class {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
};

const { renderAll } = await import('./_bundle.mjs');

/** Nearest-neighbour integer upscale of RGBA data. */
function upscale(data, w, h, s) {
  const W = w * s;
  const H = h * s;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = (y / s) | 0;
    for (let x = 0; x < W; x++) {
      const sx = (x / s) | 0;
      const si = (sy * w + sx) * 4;
      const di = (y * W + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { data: out, w: W, h: H };
}

/** Encode RGBA bytes to a PNG buffer (filter 0 per scanline + zlib). */
function encodePNG(data, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, body])) >>> 0, 0);
    return Buffer.concat([len, t, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  // raw with filter byte 0 per row
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = data[y * w * 4 + x];
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// CRC32 (PNG)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

mkdirSync('docs/shots', { recursive: true });
const shots = renderAll();
for (const shot of shots) {
  const scale = shot.w <= 130 ? 4 : 3;
  const up = upscale(shot.data, shot.w, shot.h, scale);
  const png = encodePNG(up.data, up.w, up.h);
  const path = `docs/shots/${shot.name}.png`;
  writeFileSync(path, png);
  console.log(`wrote ${path} (${up.w}x${up.h}, ${(png.length / 1024).toFixed(0)}KB)`);
}
