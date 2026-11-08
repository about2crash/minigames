// Most Likely Boom rules: pure functions, tested in tests/js/most-likely-boom.test.mjs.
import { QUESTIONS } from "./questions.js";
import { random } from "../../shared/random.js";

export const LANGS = { en: "English", de: "Deutsch" };
export const FUSE_SECONDS = [30, 60, 90, 120, 180, 240, 300]; // choices for the shortest and longest fuse
export const TAP_COOLDOWN_MS = 800; // a new question at most this often, so a double tap doesn't skip one

/** Hidden fuse length in ms, anywhere between minS and maxS seconds (swapped if given the wrong way). */
export function fuseMs(minS, maxS, rand = random) {
  const lo = Math.min(minS, maxS) * 1000, hi = Math.max(minS, maxS) * 1000;
  return Math.round(lo + rand() * (hi - lo));
}

export const questionStart = (lang) => (QUESTIONS[lang] || QUESTIONS.en).start;
export const questionCount = (lang) => (QUESTIONS[lang] || QUESTIONS.en).endings.length;

/**
 * A question nobody has had yet. `used` = indices already shown in this language; when all were
 * shown they start over (reset: true). Returns { text, used, reset }.
 */
export function pickQuestion(lang, used, rand = random) {
  const all = (QUESTIONS[lang] || QUESTIONS.en).endings;
  let seen = new Set((Array.isArray(used) ? used : []).filter((i) => Number.isInteger(i) && i >= 0 && i < all.length));
  let reset = false;
  if (seen.size >= all.length) { seen = new Set(); reset = true; }
  const fresh = all.map((_, i) => i).filter((i) => !seen.has(i));
  const i = fresh[Math.floor(rand() * fresh.length)];
  seen.add(i);
  return { text: all[i], used: [...seen], reset };
}

// ---------- who loses ----------
// "holder": whoever holds the phone loses. "twist": a random rule, shown when it explodes.
export const OUTCOMES = {
  holder:     { weight: 4, en: ["You lose!", "Whoever holds the phone loses."], de: ["Du verlierst!", "Wer das Handy hält, verliert."] },
  choose:     { weight: 2, en: ["You choose!", "Point at someone: they lose instead of you."], de: ["Du entscheidest!", "Zeig auf jemanden: diese Person verliert statt dir."] },
  left:       { weight: 1, en: ["Your left!", "The person on your left loses."], de: ["Links von dir!", "Die Person links von dir verliert."] },
  right:      { weight: 1, en: ["Your right!", "The person on your right loses."], de: ["Rechts von dir!", "Die Person rechts von dir verliert."] },
  neighbours: { weight: 1, en: ["Neighbours!", "The people left and right of you lose. You're safe."], de: ["Nachbarn!", "Die Personen links und rechts von dir verlieren. Du bist sicher."] },
  trio:       { weight: 1, en: ["All three!", "You and both of your neighbours lose."], de: ["Alle drei!", "Du und deine beiden Nachbarn verlieren."] },
};

/** Which rule applies when the bomb goes off. */
export function pickOutcome(mode, rand = random) {
  if (mode !== "twist") return "holder";
  const ids = Object.keys(OUTCOMES);
  let r = rand() * ids.reduce((a, id) => a + OUTCOMES[id].weight, 0);
  return ids.find((id) => (r -= OUTCOMES[id].weight) < 0) || "holder";
}

/** [title, line] for an outcome in a language. */
export const outcomeText = (id, lang) => (OUTCOMES[id] || OUTCOMES.holder)[lang in LANGS ? lang : "en"];

/** Seconds between ticks: steady, a bit faster in the last 20 % if `speedUp`. */
export function tickGap(elapsedMs, fuse, speedUp) {
  if (!speedUp) return 1000;
  const left = 1 - elapsedMs / fuse;
  return left > 0.2 ? 1000 : Math.max(250, 1000 * (left / 0.2));
}
