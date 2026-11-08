// Most Likely Boom rules (site/games/most-likely-boom/logic.js) and questions.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../site/games/most-likely-boom/logic.js";
import { QUESTIONS } from "../../site/games/most-likely-boom/questions.js";

function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

test("questions: plenty per language, no duplicates, each ends with a question mark", () => {
  for (const lang of Object.keys(G.LANGS)) {
    const q = QUESTIONS[lang];
    assert.ok(q.start.length > 5);
    assert.ok(q.endings.length >= 120, `${lang}: ${q.endings.length}`);
    assert.equal(new Set(q.endings).size, q.endings.length, `${lang} has duplicates`);
    for (const e of q.endings) assert.match(e, /\?$/u);
  }
});

test("no question repeats until all were shown, then they start over", () => {
  const n = G.questionCount("de");
  const rand = seeded(4);
  let used = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const p = G.pickQuestion("de", used, rand);
    assert.equal(p.reset, false);
    assert.ok(!seen.has(p.text));
    seen.add(p.text);
    used = p.used;
  }
  const again = G.pickQuestion("de", used, rand);
  assert.equal(again.reset, true);
  assert.equal(again.used.length, 1);
  assert.ok(G.pickQuestion("en", ["x", -1, 1e9, { toString: 1 }], rand).text);
});

test("fuse length stays in the chosen range", () => {
  const rand = seeded(8);
  for (let i = 0; i < 500; i++) {
    const ms = G.fuseMs(60, 300, rand);
    assert.ok(ms >= 60000 && ms <= 300000);
  }
  assert.equal(G.fuseMs(90, 90, rand), 90000);
  const swapped = G.fuseMs(300, 60, rand);
  assert.ok(swapped >= 60000 && swapped <= 300000);
});

test("outcomes: holder mode always the holder; twist mode uses every rule, holder most", () => {
  const rand = seeded(13);
  for (let i = 0; i < 50; i++) assert.equal(G.pickOutcome("holder", rand), "holder");
  const count = {};
  for (let i = 0; i < 10000; i++) { const o = G.pickOutcome("twist", rand); count[o] = (count[o] || 0) + 1; }
  assert.deepEqual(Object.keys(count).sort(), Object.keys(G.OUTCOMES).sort());
  for (const id of Object.keys(G.OUTCOMES)) assert.ok(count.holder >= count[id]);
  for (const lang of ["en", "de"]) for (const id of Object.keys(G.OUTCOMES)) assert.equal(G.outcomeText(id, lang).length, 2);
});

test("ticking: steady, or faster only in the last fifth", () => {
  assert.equal(G.tickGap(50000, 60000, false), 1000);
  assert.equal(G.tickGap(10000, 60000, true), 1000);
  assert.ok(G.tickGap(55000, 60000, true) < 1000);
  assert.equal(G.tickGap(60000, 60000, true), 250);
});
