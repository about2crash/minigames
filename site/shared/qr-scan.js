// QR code reader for camera frames, no dependencies (byte mode, error correction L/M:
// the codes qr.js makes). Follows the approach of ZXing (Apache-2.0): local-threshold
// binarization, 1:1:3:1:1 finder patterns, perspective sampling, Reed-Solomon repair.
//   const text = scanImage(imageData.data, imageData.width, imageData.height); // or null

import { ECC_PER_BLOCK, NUM_BLOCKS, rawModules, alignmentPositions } from "./qr.js";

// ── Binarize: a pixel is dark if clearly below the average of its neighbourhood ──
function binarize(rgba, w, h) {
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (rgba[j] + 2 * rgba[j + 1] + rgba[j + 2]) >> 2;
  const W = w + 1;
  const integral = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row;
    }
  }
  const r = Math.max(4, Math.round(Math.min(w, h) / 16));
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      bits[y * w + x] = gray[y * w + x] < mean - Math.max(6, mean * 0.1) ? 1 : 0;
    }
  }
  return bits;
}

// ── Finder patterns: dark-light-dark-light-dark runs in the ratio 1:1:3:1:1 ──
function ratioOk(s, slack = 0.5) {
  let total = 0;
  for (const c of s) { if (!c) return false; total += c; }
  if (total < 7) return false;
  const mod = total / 7, v = mod * slack;
  return Math.abs(s[0] - mod) < v && Math.abs(s[1] - mod) < v && Math.abs(s[2] - 3 * mod) < 3 * v
    && Math.abs(s[3] - mod) < v && Math.abs(s[4] - mod) < v;
}

// Walk from (cx, cy) both ways along (dx, dy); returns the pattern centre offset and module size.
function crossCheck(bits, w, h, cx, cy, dx, dy, expectTotal) {
  const at = (k) => {
    const x = Math.round(cx + dx * k), y = Math.round(cy + dy * k);
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : bits[y * w + x];
  };
  const s = [0, 0, 0, 0, 0];
  const limit = expectTotal * 2;
  let k = 0;
  while (at(k) === 1 && s[2] < limit) { s[2]++; k--; }
  while (at(k) === 0 && s[1] < limit) { s[1]++; k--; }
  while (at(k) === 1 && s[0] < limit) { s[0]++; k--; }
  k = 1;
  while (at(k) === 1 && s[2] < limit) { s[2]++; k++; }
  while (at(k) === 0 && s[3] < limit) { s[3]++; k++; }
  while (at(k) === 1 && s[4] < limit) { s[4]++; k++; }
  const total = s.reduce((a, b) => a + b, 0);
  if (!ratioOk(s, 0.7) || 5 * Math.abs(total - expectTotal) >= 2 * expectTotal) return null;
  return { offset: k - s[4] - s[3] - s[2] / 2, size: total / 7 };
}

function findFinders(bits, w, h) {
  const found = [];
  const consider = (s, xEnd, y) => {
    const total = s.reduce((a, b) => a + b, 0);
    let cx = xEnd - s[4] - s[3] - s[2] / 2;
    const v = crossCheck(bits, w, h, cx, y, 0, 1, total);
    if (!v) return;
    const cy = y + v.offset;
    const hz = crossCheck(bits, w, h, cx, cy, 1, 0, total);
    if (!hz) return;
    cx += hz.offset;
    const size = (v.size + hz.size) / 2;
    const near = found.find((f) => Math.abs(f.x - cx) <= size * 1.5 && Math.abs(f.y - cy) <= size * 1.5 && Math.abs(f.size - size) <= Math.max(1, size * 0.5));
    if (near) {
      const n = near.count;
      near.x = (near.x * n + cx) / (n + 1);
      near.y = (near.y * n + cy) / (n + 1);
      near.size = (near.size * n + size) / (n + 1);
      near.count++;
    } else found.push({ x: cx, y: cy, size, count: 1 });
  };
  for (let y = 0; y < h; y++) {
    const s = [0, 0, 0, 0, 0];
    let state = 0;
    for (let x = 0; x <= w; x++) {
      const dark = x < w && bits[y * w + x] === 1;
      if (dark) {
        if (state & 1) state++;
        s[state]++;
      } else if (!(state & 1)) {
        if (state === 4) {
          if (ratioOk(s)) consider(s, x, y);
          s[0] = s[2]; s[1] = s[3]; s[2] = s[4]; s[3] = 1; s[4] = 0;
          state = 3;
        } else { state++; s[state]++; }
      } else s[state]++;
    }
  }
  return found.sort((a, b) => b.count - a.count).slice(0, 12);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Candidate triples, best first: similar sizes, shaped like a right isosceles triangle.
function triples(found) {
  const out = [];
  for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) for (let k = j + 1; k < found.length; k++) {
    const p = [found[i], found[j], found[k]];
    const sizes = p.map((f) => f.size), avg = (sizes[0] + sizes[1] + sizes[2]) / 3;
    const sizeVar = Math.max(...sizes.map((s) => Math.abs(s - avg))) / avg;
    if (sizeVar > 0.5) continue;
    const [a, b, c] = [dist(p[0], p[1]), dist(p[1], p[2]), dist(p[0], p[2])].sort((x, y) => x - y);
    if (a < avg * 10) continue;
    const shape = Math.abs(c - Math.hypot(a, b)) / c + Math.abs(a - b) / b;
    if (shape > 0.5) continue;
    out.push({ p, score: shape + sizeVar - Math.min(p[0].count, p[1].count, p[2].count) * 0.01 });
  }
  return out.sort((x, y) => x.score - y.score).slice(0, 4).map((t) => t.p);
}

// Which corner is which: top-left sits opposite the longest side.
function order([p0, p1, p2]) {
  const d01 = dist(p0, p1), d12 = dist(p1, p2), d02 = dist(p0, p2);
  let a, b, c;
  if (d12 >= d01 && d12 >= d02) [b, a, c] = [p0, p1, p2];
  else if (d02 >= d12 && d02 >= d01) [b, a, c] = [p1, p0, p2];
  else [b, a, c] = [p2, p0, p1];
  if ((c.x - b.x) * (a.y - b.y) - (c.y - b.y) * (a.x - b.x) < 0) [a, c] = [c, a];
  return { bl: a, tl: b, tr: c };
}

// ── Perspective: maps module coordinates to image pixels through four point pairs ──
function squareToQuad(q) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den && (dx3 || dy3) ? (dx3 * dy2 - dx2 * dy3) / den : 0;
  const hh = den && (dx3 || dy3) ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  return [x1 - x0 + g * x1, x3 - x0 + hh * x3, x0, y1 - y0 + g * y1, y3 - y0 + hh * y3, y0, g, hh, 1];
}
function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
}
function mul3(m, n) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = m[i * 3] * n[j] + m[i * 3 + 1] * n[3 + j] + m[i * 3 + 2] * n[6 + j];
  return r;
}
function quadToQuad(from, to) {
  const m = mul3(squareToQuad(to), invert3(squareToQuad(from)));
  return (x, y) => {
    const z = m[6] * x + m[7] * y + m[8];
    return [(m[0] * x + m[1] * y + m[2]) / z, (m[3] * x + m[4] * y + m[5]) / z];
  };
}

// Alignment pattern near its expected spot, found by template matching along the code's own axes.
// Perspective moves it away from the estimate and changes its size there, so the search
// widens (5, 10, 16 modules) and tries a few module sizes.
function findAlignment(bits, w, h, ex, ey, ux, uy, vx, vy) {
  for (const modules of [5, 10, 16]) {
    for (const k of [1, 0.85, 1.15, 0.72, 1.3]) {
      const found = searchAlignment(bits, w, h, ex, ey, ux * k, uy * k, vx * k, vy * k, Math.max(4, Math.hypot(ux, uy) * modules));
      if (found) return found;
    }
  }
  return null;
}

function searchAlignment(bits, w, h, ex, ey, ux, uy, vx, vy, radius) {
  const step = Math.hypot(ux, uy);
  let best = null, bestScore = 21;
  for (let oy = -radius; oy <= radius; oy += Math.max(1, step / 3)) {
    for (let ox = -radius; ox <= radius; ox += Math.max(1, step / 3)) {
      const cx = ex + ox, cy = ey + oy;
      let score = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const x = Math.round(cx + i * ux + j * vx), y = Math.round(cy + i * uy + j * vy);
        const dark = x >= 0 && y >= 0 && x < w && y < h && bits[y * w + x] === 1;
        if (dark === (Math.max(Math.abs(i), Math.abs(j)) !== 1)) score++;
      }
      if (score > bestScore || (score === bestScore && best && Math.hypot(ox, oy) < Math.hypot(best.x - ex, best.y - ey))) {
        bestScore = score;
        best = { x: cx, y: cy };
      }
    }
  }
  return best;
}

function sample(bits, w, h, f, dim, align) {
  const { tl, tr, bl } = f;
  const d3 = dim - 3.5;
  let br = [tr.x - tl.x + bl.x, tr.y - tl.y + bl.y], brModule = d3;
  if (align) { br = [align.x, align.y]; brModule = dim - 6.5; }
  const map = quadToQuad([3.5, 3.5, d3, 3.5, brModule, brModule, 3.5, d3], [tl.x, tl.y, tr.x, tr.y, br[0], br[1], bl.x, bl.y]);
  const m = [];
  for (let y = 0; y < dim; y++) {
    const row = [];
    for (let x = 0; x < dim; x++) {
      const [px, py] = map(x + 0.5, y + 0.5);
      const ix = Math.round(px), iy = Math.round(py);
      row.push(ix >= 0 && iy >= 0 && ix < w && iy < h && bits[iy * w + ix] === 1);
    }
    m.push(row);
  }
  return m;
}

// ── Reed-Solomon over GF(256), generator roots α^0..α^(n-1) as QR uses ──
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const gdiv = (a, b) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);

function syndromes(block, ecc) {
  const S = new Array(ecc);
  for (let i = 0; i < ecc; i++) {
    let s = 0;
    for (const c of block) s = gmul(s, EXP[i]) ^ c;
    S[i] = s;
  }
  return S;
}

/** Repairs `block` (data + ecc codewords) in place; false if too damaged. Exported for tests. */
export function rsCorrect(block, ecc) {
  const S = syndromes(block, ecc);
  if (S.every((s) => s === 0)) return true;
  // Berlekamp-Massey: error locator C(x)
  let C = [1], B = [1], L = 0, m = 1, b = 1;
  for (let k = 0; k < ecc; k++) {
    let d = S[k];
    for (let i = 1; i <= L; i++) d ^= gmul(C[i] || 0, S[k - i]);
    if (d === 0) { m++; continue; }
    const T = C.slice(), coef = gdiv(d, b);
    while (C.length < B.length + m) C.push(0);
    for (let i = 0; i < B.length; i++) C[i + m] ^= gmul(coef, B[i]);
    if (2 * L <= k) { L = k + 1 - L; B = T; b = d; m = 1; } else m++;
  }
  // Chien search: degree p is block index n-1-p
  const n = block.length, errs = [];
  for (let p = 0; p < n; p++) {
    const xinv = EXP[(255 - p) % 255];
    let v = 0;
    for (let i = C.length - 1; i >= 0; i--) v = gmul(v, xinv) ^ C[i];
    if (v === 0) errs.push(p);
  }
  if (errs.length !== L) return false;
  // Forney: e = X * Ω(X⁻¹) / C'(X⁻¹)
  const omega = new Array(ecc).fill(0);
  for (let i = 0; i < ecc; i++) for (let j = 0; j < C.length && i + j < ecc; j++) omega[i + j] ^= gmul(S[i], C[j]);
  for (const p of errs) {
    const X = EXP[p], xinv = EXP[(255 - p) % 255];
    let num = 0;
    for (let i = omega.length - 1; i >= 0; i--) num = gmul(num, xinv) ^ omega[i];
    let den = 0;
    for (let i = 1; i < C.length; i += 2) den ^= gmul(C[i], EXP[(LOG[xinv] * (i - 1)) % 255]);
    if (!den) return false;
    block[n - 1 - p] ^= gmul(X, gdiv(num, den));
  }
  return syndromes(block, ecc).every((s) => s === 0);
}

// ── Matrix → text ──
const ECL = { 1: "L", 0: "M" }; // Q and H never come from qr.js
const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
const FORMATS = Array.from({ length: 32 }, (_, d) => {
  let rem = d;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((d << 10) | rem) ^ 0x5412;
});
const popcount = (x) => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };

function functionMap(ver, n) {
  const f = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (x0, y0, w, h) => {
    for (let y = Math.max(0, y0); y < Math.min(n, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(n, x0 + w); x++) f[y][x] = true;
  };
  mark(0, 0, 9, 9); mark(n - 8, 0, 8, 9); mark(0, n - 8, 9, 8);
  mark(6, 0, 1, n); mark(0, 6, n, 1);
  const al = alignmentPositions(ver, n);
  for (const a of al) for (const b of al) {
    if ((a === 6 && b === 6) || (a === 6 && b === al.at(-1)) || (a === al.at(-1) && b === 6)) continue;
    mark(a - 2, b - 2, 5, 5);
  }
  if (ver >= 7) { mark(n - 11, 0, 3, 6); mark(0, n - 11, 6, 3); }
  return f;
}

/** Decodes a sampled module matrix (true = dark). Exported for tests. */
export function decodeMatrix(m) {
  const n = m.length, ver = (n - 17) / 4;
  if (!Number.isInteger(ver) || ver < 1 || ver > 40) return null;
  const bit = (x, y) => (m[y][x] ? 1 : 0);
  let a = 0, c = 0;
  const first = [];
  for (let i = 0; i <= 5; i++) first.push(bit(8, i));
  first.push(bit(8, 7), bit(8, 8), bit(7, 8));
  for (let i = 9; i < 15; i++) first.push(bit(14 - i, 8));
  first.forEach((v, i) => { a |= v << i; });
  for (let i = 0; i < 8; i++) c |= bit(n - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) c |= bit(8, n - 15 + i) << i;
  let fmt = -1, best = 4;
  FORMATS.forEach((code, d) => {
    const e = Math.min(popcount(code ^ a), popcount(code ^ c));
    if (e < best) { best = e; fmt = d; }
  });
  if (fmt < 0) return null;
  const ecl = ECL[fmt >> 3], mask = MASKS[fmt & 7];
  if (!ecl) return null;

  const fn = functionMap(ver, n);
  const bits = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!fn[y][x]) bits.push(m[y][x] !== mask(x, y) ? 1 : 0);
    }
  }
  const raw = Math.floor(rawModules(ver) / 8);
  const cw = [];
  for (let i = 0; i < raw; i++) {
    let v = 0;
    for (let k = 0; k < 8; k++) v = (v << 1) | (bits[i * 8 + k] || 0);
    cw.push(v);
  }
  const numBlocks = NUM_BLOCKS[ecl][ver], eccLen = ECC_PER_BLOCK[ecl][ver];
  const shortLen = Math.floor(raw / numBlocks), numShort = numBlocks - (raw % numBlocks);
  const blocks = Array.from({ length: numBlocks }, (_, i) => ({ data: shortLen - eccLen + (i < numShort ? 0 : 1), cw: [] }));
  let k = 0;
  const longest = shortLen - eccLen + 1;
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data) b.cw.push(cw[k++]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) b.cw.push(cw[k++]);
  const data = [];
  for (const b of blocks) {
    if (!rsCorrect(b.cw, eccLen)) return null;
    data.push(...b.cw.slice(0, b.data));
  }

  // byte-mode segments until the terminator
  let p = 0;
  const take = (len) => { let v = 0; for (let i = 0; i < len; i++) { const byte = data[(p >> 3)] ?? 0; v = (v << 1) | ((byte >> (7 - (p & 7))) & 1); p++; } return v; };
  const out = [];
  while (p + 4 <= data.length * 8) {
    const mode = take(4);
    if (mode === 0) break;
    if (mode !== 4) return null;
    const count = take(ver < 10 ? 8 : 16);
    if (p + count * 8 > data.length * 8) return null;
    for (let i = 0; i < count; i++) out.push(take(8));
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(out)); } catch { return null; }
}

/** Finds and decodes a QR code in RGBA pixels. Returns the text or null. */
export function scanImage(rgba, w, h) {
  const bits = binarize(rgba, w, h);
  for (const t of triples(findFinders(bits, w, h))) {
    const f = order(t);
    const size = (f.tl.size + f.tr.size + f.bl.size) / 3;
    const est = Math.round((dist(f.tl, f.tr) + dist(f.tl, f.bl)) / 2 / size) + 7;
    const base = est - ((est - 17) % 4 + 4) % 4 + ((((est - 17) % 4 + 4) % 4) >= 2 ? 4 : 0);
    for (const dim of [base, base - 4, base + 4]) {
      if (dim < 21 || dim > 177) continue;
      const span = dim - 7;
      const ux = (f.tr.x - f.tl.x) / span, uy = (f.tr.y - f.tl.y) / span;
      const vx = (f.bl.x - f.tl.x) / span, vy = (f.bl.y - f.tl.y) / span;
      const tries = [null];
      if (dim > 21) {
        const k = span - 3;
        const al = findAlignment(bits, w, h, f.tl.x + k * (ux + vx), f.tl.y + k * (uy + vy), ux, uy, vx, vy);
        if (al) tries.unshift(al);
      }
      for (const al of tries) {
        const m = sample(bits, w, h, f, dim, al);
        const text = decodeMatrix(m) ?? decodeMatrix(m.map((row, y) => row.map((_, x) => m[x][y]))); // also mirrored
        if (text !== null) return text;
      }
    }
  }
  return null;
}
