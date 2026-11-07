// Odd Word Out rules (site/games/odd-word-out/logic.js) and word lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../site/games/odd-word-out/logic.js";
import { WORDS } from "../../site/games/odd-word-out/words.js";

function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

test("both languages have the same categories, each with plenty of words", () => {
  assert.deepEqual(Object.keys(WORDS).sort(), Object.keys(G.LANGS).sort());
  const ids = (lang) => G.categories(lang).map((c) => c.id);
  assert.deepEqual(ids("de"), ids("en"));
  for (const lang of Object.keys(G.LANGS)) {
    assert.ok(G.pool(lang, []).length >= 800, `${lang}: ${G.pool(lang, []).length} words`);
    for (const c of G.categories(lang)) {
      assert.ok(c.words.length >= 40, `${lang}/${c.id}: ${c.words.length}`);
      for (const w of c.words) assert.match(w, /^\S(.*\S)?$/u);
    }
  }
});

test("a word belongs to one category only", () => {
  for (const lang of Object.keys(G.LANGS)) {
    const words = G.pool(lang, []).map((e) => e.word.toLowerCase());
    assert.equal(new Set(words).size, words.length);
  }
});

test("no word repeats until the chosen categories run out, then they start over", () => {
  const cats = ["animals"];
  const size = G.pool("en", cats).length;
  const rand = seeded(3);
  let used = [];
  const seen = new Set();
  for (let i = 0; i < size; i++) {
    const p = G.pickWord("en", cats, used, rand);
    assert.equal(p.reset, false);
    assert.equal(p.catId, "animals");
    assert.ok(!seen.has(p.word), `repeated ${p.word}`);
    seen.add(p.word);
    used = p.used;
  }
  assert.equal(G.wordsLeft("en", cats, used), 0);
  const again = G.pickWord("en", cats, used, rand);
  assert.equal(again.reset, true);
  assert.equal(G.wordsLeft("en", cats, again.used), size - 1);
});

test("words used in other categories stay used after a reset", () => {
  const food = G.pickWord("en", ["food"], [], seeded(5));
  let used = food.used;
  for (const e of G.pool("en", ["animals"])) used = [...used, e.word];
  const p = G.pickWord("en", ["animals"], used, seeded(9));
  assert.equal(p.reset, true);
  assert.ok(p.used.includes(food.word.toLowerCase()));
});

test("no category chosen means all categories; junk in the used list is ignored", () => {
  assert.equal(G.pool("de", []).length, G.pool("de", G.categories("de").map((c) => c.id)).length);
  const p = G.pickWord("de", ["nope"], [1, null, { toString: 1 }], seeded(2));
  assert.ok(p.word);
});

test("impostors: right count, distinct seats, capped below half", () => {
  assert.equal(G.maxImpostors(3), 1);
  assert.equal(G.maxImpostors(5), 2);
  assert.equal(G.maxImpostors(8), 3);
  const rand = seeded(11);
  for (let n = 3; n <= 12; n++) {
    for (let k = 0; k <= 6; k++) {
      const imps = G.dealImpostors(n, k, rand);
      assert.equal(imps.length, Math.min(Math.max(1, k), G.maxImpostors(n)));
      assert.equal(new Set(imps).size, imps.length);
      for (const i of imps) assert.ok(i >= 0 && i < n);
    }
  }
  const hits = new Array(4).fill(0);
  for (let i = 0; i < 4000; i++) hits[G.dealImpostors(4, 1, rand)[0]]++;
  for (const h of hits) assert.ok(h > 800, `uneven: ${hits}`);
});
