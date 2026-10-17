// QR reader: synthetic camera frames made from qr.js codes (scaled, rotated, tilted,
// blurred, noisy, unevenly lit, on a dark page), plus Reed-Solomon repair.
import { test } from "node:test";
import assert from "node:assert/strict";
import { qrMatrix } from "../../site/shared/qr.js";
import { scanImage, decodeMatrix, rsCorrect } from "../../site/shared/qr-scan.js";

function random(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// Paint the code (with a light card around it) into a W×H frame by forward-mapping
// many sub-samples per module: independent of the reader's own geometry code.
function frame(text, { W = 640, H = 480, px = 6, angle = 0, tilt = 0, blur = 1, noise = 12, light = 0.35, mirror = false, seed = 1, ecl = "M" } = {}) {
  const m = qrMatrix(text, ecl), n = m.length, q = 4, total = n + 2 * q;
  const rnd = random(seed);
  const img = new Float32Array(W * H).fill(28); // dark page around the card
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const sub = 6;
  for (let gy = 0; gy < total * sub; gy++) for (let gx = 0; gx < total * sub; gx++) {
    let u = gx / sub - total / 2, v = gy / sub - total / 2;
    if (mirror) u = -u;
    const mx = Math.floor(gx / sub) - q, my = Math.floor(gy / sub) - q;
    const dark = mx >= 0 && my >= 0 && mx < n && my < n && m[my][mx];
    // rotate, then a simple perspective tilt around the horizontal axis
    let x = (u * cos - v * sin) * px, y = (u * sin + v * cos) * px;
    const z = 1 + tilt * (y / (total * px));
    x = x / z + W / 2;
    y = y / z + H / 2;
    const ix = Math.round(x), iy = Math.round(y);
    if (ix >= 0 && iy >= 0 && ix < W && iy < H) img[iy * W + ix] = dark ? 35 : 225;
  }
  // blur, uneven light, noise → RGBA
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, c = 0;
    for (let dy = -blur; dy <= blur; dy++) for (let dx = -blur; dx <= blur; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += img[yy * W + xx]; c++; }
    }
    const shade = 1 - light * (x / W);
    const g = (s / c) * shade + (rnd() - 0.5) * 2 * noise;
    const i = (y * W + x) * 4;
    out[i] = out[i + 1] = out[i + 2] = g;
    out[i + 3] = 255;
  }
  return out;
}

const INVITE = "https://games.about2crash.com/games/gallery-guess/#j=1~ijsjft~xmqz9c2a~QW5uYQ~e5sw~x~0~RRGu~/eAfXiMsk9iXBAU0SwSzQ/+y~"
  + "ZtXybS75Qj2pnGrV-ji54HkDJiu9s1eCbM_IL4rTsK0~s179.237.85.125:40574,mhd6Xek-4Q9aCNSOCSTgWew:40574,meLL0JNE3Q92D-E0pvLqupQ:37573";

const cases = [
  ["straight, small code", "hello", {}],
  ["invite link, straight", INVITE, { px: 5 }],
  ["invite link, rotated 25°", INVITE, { px: 4.5, angle: 0.44 }],
  ["invite link, upside down", INVITE, { px: 4.5, angle: Math.PI }],
  ["invite link, tilted", INVITE, { px: 4.5, tilt: 0.25, angle: -0.15 }],
  ["invite link, tilted the other way", INVITE, { px: 4.5, tilt: -0.25, angle: 0.3 }],
  ["invite link, small and noisy", INVITE, { px: 3.6, noise: 20, seed: 7 }],
  ["invite link, mirrored (front camera)", INVITE, { px: 4.5, mirror: true }],
  ["long text, level L", "Grüße ✓ " + "x".repeat(300), { px: 3.8, ecl: "L", W: 800, H: 600 }],
];
for (const [name, text, opts] of cases) {
  test(`reads a camera frame: ${name}`, () => {
    const W = opts.W ?? 640, H = opts.H ?? 480;
    assert.equal(scanImage(frame(text, opts), W, H), text);
  });
}

test("frames without a code give null", () => {
  const W = 320, H = 240, rgba = new Uint8ClampedArray(W * H * 4);
  const rnd = random(3);
  for (let i = 0; i < rgba.length; i++) rgba[i] = i % 4 === 3 ? 255 : rnd() * 255;
  assert.equal(scanImage(rgba, W, H), null);
});

test("damaged modules are repaired by error correction", () => {
  const m = qrMatrix(INVITE, "M");
  const n = m.length;
  const rnd = random(11);
  // flip a handful of modules away from the finder corners
  for (let k = 0; k < 12; k++) {
    const x = 10 + Math.floor(rnd() * (n - 20)), y = 10 + Math.floor(rnd() * (n - 20));
    m[y][x] = !m[y][x];
  }
  assert.equal(decodeMatrix(m), INVITE);
});

test("Reed-Solomon fixes up to half the ecc bytes, and refuses more", () => {
  const good = codewordsOf("RS!"); // version 1-M: one block, 16 data + 10 ecc
  const broken = good.slice();
  for (const i of [0, 3, 7, 12, 20]) broken[i] ^= 0x5a;
  assert.equal(rsCorrect(broken, 10), true);
  assert.deepEqual(broken, good);
  const tooMany = good.slice();
  for (const i of [0, 2, 4, 6, 8, 10]) tooMany[i] ^= 0x33;
  assert.equal(rsCorrect(tooMany, 10) && tooMany.every((v, i) => v === good[i]), false);
});

// The 26 codewords of a version 1-M code, read back from the matrix (single block, no interleaving).
function codewordsOf(text) {
  const m = qrMatrix(text, "M"), n = m.length;
  const fmt = (() => { let a = 0; [0, 1, 2, 3, 4, 5].forEach((i) => { a |= (m[i][8] ? 1 : 0) << i; }); a |= (m[7][8] ? 1 : 0) << 6; a |= (m[8][8] ? 1 : 0) << 7; a |= (m[8][7] ? 1 : 0) << 8; for (let i = 9; i < 15; i++) a |= (m[8][14 - i] ? 1 : 0) << i; return ((a ^ 0x5412) >>> 10) & 7; })();
  const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const isFn = (x, y) => (x < 9 && y < 9) || (x >= n - 8 && y < 9) || (x < 9 && y >= n - 8) || x === 6 || y === 6;
  const bits = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!isFn(x, y)) bits.push(m[y][x] !== masks[fmt](x, y) ? 1 : 0);
    }
  }
  return Array.from({ length: 26 }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8).join(""), 2));
}
