// Odd Word Out rules: pure functions, tested in tests/js/odd-word-out.test.mjs.
import { WORDS } from "./words.js";

export const LANGS = { en: "English", de: "Deutsch" };
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;

const key = (w) => w.toLocaleLowerCase();

// Categories of one language, with words that appear in an earlier category dropped,
// so every word belongs to exactly one category.
const cache = {};
export function categories(lang) {
  if (cache[lang]) return cache[lang];
  const seen = new Set();
  cache[lang] = (WORDS[lang] || []).map((c) => ({
    ...c,
    words: c.words.filter((w) => !seen.has(key(w)) && seen.add(key(w))),
  }));
  return cache[lang];
}

const usedSet = (used) => new Set((Array.isArray(used) ? used : []).filter((w) => typeof w === "string").map(key));

/** Every { word, cat, catId } of the chosen categories (all categories if none are chosen). */
export function pool(lang, catIds) {
  const cats = categories(lang);
  const chosen = cats.filter((c) => catIds.includes(c.id));
  return (chosen.length ? chosen : cats).flatMap((c) => c.words.map((word) => ({ word, cat: c.name, catId: c.id })));
}

/**
 * Picks a word nobody has had yet. `used` lists the words already played (any category).
 * When every word of the chosen categories was used, those words start over (reset: true).
 * Returns { word, cat, catId, used, reset } where `used` is the new list to remember.
 */
export function pickWord(lang, catIds, used, rand = Math.random) {
  const all = pool(lang, catIds);
  const seen = usedSet(used);
  let fresh = all.filter((e) => !seen.has(key(e.word)));
  let reset = false;
  if (!fresh.length) {
    for (const e of all) seen.delete(key(e.word));
    fresh = all;
    reset = true;
  }
  const pick = fresh[Math.floor(rand() * fresh.length)];
  seen.add(key(pick.word));
  return { ...pick, used: [...seen], reset };
}

/** How many words of the chosen categories are still unplayed. */
export function wordsLeft(lang, catIds, used) {
  const seen = usedSet(used);
  return pool(lang, catIds).filter((e) => !seen.has(key(e.word))).length;
}

/** Most impostors that still leave a clear majority who know the word. */
export const maxImpostors = (players) => Math.max(1, Math.floor((players - 1) / 2));

/** Indices of the impostors among `players` seats, sorted. */
export function dealImpostors(players, count, rand = Math.random) {
  const n = Math.min(Math.max(1, count), maxImpostors(players));
  const seats = Array.from({ length: players }, (_, i) => i);
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }
  return seats.slice(0, n).sort((a, b) => a - b);
}

/** Who gives the first clue. */
export const pickStarter = (players, rand = Math.random) => Math.floor(rand() * players);
