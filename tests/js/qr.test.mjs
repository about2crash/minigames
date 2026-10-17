// QR generator: structure checks plus a small decoder that reads the payload back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { qrMatrix, qrSvg } from "../../site/shared/qr.js";

const FORMAT_MASK = 0x5412;
const ECL_BITS = { M: 0, L: 1 };

function readFormat(m) {
  const n = m.length;
  const b = (x, y) => (m[y][x] ? 1 : 0);
  let a = 0;
  // first copy, bit 0 first (same order as drawFormat in qr.js)
  const first = [];
  for (let i = 0; i <= 5; i++) first.push(b(8, i));
  first.push(b(8, 7), b(8, 8), b(7, 8));
  for (let i = 9; i < 15; i++) first.push(b(14 - i, 8));
  const second = [];
  for (let i = 0; i < 8; i++) second.push(b(n - 1 - i, 8));
  for (let i = 8; i < 15; i++) second.push(b(8, n - 15 + i));
  first.forEach((v, i) => { a |= v << i; });
  let c = 0;
  second.forEach((v, i) => { c |= v << i; });
  return { first: a, second: c };
}

function bchValid(bits) {
  let rem = bits;
  for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  return rem === 0;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// Function-pattern map, rebuilt independently from the spec (finders, timing, alignment, format, version).
function functionMap(ver) {
  const n = ver * 4 + 17;
  const f = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < n && y < n) f[y][x] = true; };
  mark(0, 0, 9, 9); mark(n - 8, 0, 8, 9); mark(0, n - 8, 9, 8);
  mark(6, 0, 1, n); mark(0, 6, n, 1);
  if (ver > 1) {
    const k = Math.floor(ver / 7) + 2;
    const step = Math.floor((ver * 8 + k * 3 + 5) / (k * 4 - 4)) * 2;
    const pos = [6];
    for (let p = n - 7; pos.length < k; p -= step) pos.splice(1, 0, p);
    for (const a of pos) for (const b of pos) {
      if ((a === 6 && b === 6) || (a === 6 && b === pos.at(-1)) || (a === pos.at(-1) && b === 6)) continue;
      mark(a - 2, b - 2, 5, 5);
    }
  }
  if (ver >= 7) { mark(n - 11, 0, 3, 6); mark(0, n - 11, 6, 3); }
  return f;
}

// Reads the data codewords back (no error correction needed for a clean matrix) and parses byte mode.
function decode(m, ecl, blocksTable) {
  const n = m.length, ver = (n - 17) / 4;
  const { first } = readFormat(m);
  const mask = (first ^ FORMAT_MASK) >>> 10 & 7;
  const fn = functionMap(ver);
  const bits = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
      if (!fn[y][x]) bits.push(m[y][x] !== MASKS[mask](x, y) ? 1 : 0);
    }
  }
  const raw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) raw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  // de-interleave
  const { numBlocks, eccLen } = blocksTable(ver, ecl);
  const total = raw.length;
  const shortLen = Math.floor(total / numBlocks), numShort = numBlocks - (total % numBlocks);
  const dataLens = Array.from({ length: numBlocks }, (_, i) => shortLen - eccLen + (i < numShort ? 0 : 1));
  const blocks = dataLens.map(() => []);
  let k = 0;
  for (let i = 0; i < Math.max(...dataLens); i++) for (let b = 0; b < numBlocks; b++) if (i < dataLens[b]) blocks[b].push(raw[k++]);
  const data = blocks.flat();
  const dbits = data.flatMap((byte) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (byte >>> i) & 1));
  let p = 0;
  const take = (len) => { let v = 0; for (let i = 0; i < len; i++) v = (v << 1) | dbits[p++]; return v; };
  assert.equal(take(4), 4, "byte mode");
  const count = take(ver < 10 ? 8 : 16);
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = take(8);
  return new TextDecoder().decode(out);
}

// Block layout from the spec tables (copied independently of qr.js for versions used here).
const BLOCKS = {
  M: { 1: [1, 10], 2: [1, 16], 9: [5, 22], 10: [5, 26], 11: [5, 30], 13: [9, 22], 17: [11, 28] },
  L: { 1: [1, 7], 9: [2, 30], 10: [4, 18], 11: [4, 20], 13: [4, 26], 17: [6, 28] },
};
const blocksTable = (ver, ecl) => {
  const e = BLOCKS[ecl][ver];
  assert.ok(e, `no test table entry for version ${ver}-${ecl}`);
  return { numBlocks: e[0], eccLen: e[1] };
};

test("smallest version that fits: 14 bytes is version 1-M, 15 needs version 2", () => {
  assert.equal(qrMatrix("x".repeat(14), "M").length, 21);
  assert.equal(qrMatrix("x".repeat(15), "M").length, 25);
});

test("finder patterns, timing pattern and dark module are in place", () => {
  const m = qrMatrix("https://example.com/", "M"), n = m.length;
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let d = -3; d <= 3; d++) assert.equal(m[cy - 3][cx + d], true, "finder outer ring");
    assert.equal(m[cy][cx], true, "finder center");
    assert.equal(m[cy - 2][cx], false, "finder white ring");
  }
  for (let i = 8; i < n - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0);
    assert.equal(m[i][6], i % 2 === 0);
  }
  assert.equal(m[n - 8][8], true);
});

test("format information is valid BCH, matches the level, and both copies agree", () => {
  for (const ecl of ["L", "M"]) {
    const m = qrMatrix("format check", ecl);
    const { first, second } = readFormat(m);
    assert.equal(first, second);
    const raw = first ^ FORMAT_MASK;
    assert.ok(bchValid(raw));
    assert.equal(raw >>> 13, ECL_BITS[ecl]);
  }
});

test("version information (version 7 and up) is valid", () => {
  const m = qrMatrix("v".repeat(200), "M"), n = m.length, ver = (n - 17) / 4;
  assert.ok(ver >= 7);
  let bits = 0;
  for (let i = 0; i < 18; i++) bits |= (m[Math.floor(i / 3)][n - 11 + (i % 3)] ? 1 : 0) << i;
  assert.equal(bits >>> 12, ver);
  let rem = bits;
  for (let i = 17; i >= 12; i--) if ((rem >>> i) & 1) rem ^= 0x1f25 << (i - 12);
  assert.equal(rem, 0);
});

test("payloads decode back to the same text", () => {
  const cases = [
    ["hi", "M"], ["hi", "L"],
    ["https://about2crash.github.io/minigames/games/gallery-guess/#j=1~ab12cd~k3j4h5g6~QW5uYQ~x9z1~x~0~AbCd~0123456789abcdefghijklmn~"
      + "A".repeat(43) + "~s203.0.113.77:61234,mQ2x8v_0aBcDeFgHiJkLmN:53211", "M"],
    ["Grüße, ünïcödé ✓ " + "y".repeat(180), "L"],
    ["z".repeat(500), "M"],
  ];
  for (const [text, ecl] of cases) assert.equal(decode(qrMatrix(text, ecl), ecl, blocksTable), text);
});

test("too long text throws, svg has the quiet zone", () => {
  assert.throws(() => qrMatrix("x".repeat(4000), "M"));
  const n = qrMatrix("hi").length;
  assert.match(qrSvg("hi"), new RegExp(`viewBox="0 0 ${n + 8} ${n + 8}"`));
});
