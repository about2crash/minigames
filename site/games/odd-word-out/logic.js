// Odd Word Out rules: pure functions, tested in tests/js/odd-word-out.test.mjs.
export { LANGS, categories, pool, pickWord, wordsLeft } from "../../shared/words.js";
import { random } from "../../shared/random.js";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;

/** Most impostors that still leave a clear majority who know the word. */
export const maxImpostors = (players) => Math.max(1, Math.floor((players - 1) / 2));

/**
 * Indices of the impostors among `players` seats, sorted. Fair random rather than pure random:
 * `since[i]` = rounds since seat i was last an impostor (0 = last round, missing = never).
 * Weights grow with that, so streaks get rare and everyone gets a turn, but nobody is ever
 * ruled out (otherwise last round's impostor would know they're safe).
 */
export function dealImpostors(players, count, rand = random, since = []) {
  const n = Math.min(Math.max(1, count), maxImpostors(players));
  const weight = Array.from({ length: players }, (_, i) =>
    0.5 + Math.min(Number.isFinite(since[i]) ? Math.max(0, since[i]) : players, players));
  const out = [];
  for (let k = 0; k < n; k++) {
    let r = rand() * weight.reduce((a, b) => a + b, 0);
    let pick = weight.findIndex((w) => w > 0 && (r -= w) < 0);
    if (pick < 0) pick = weight.findLastIndex((w) => w > 0); // float rounding at the very end
    out.push(pick);
    weight[pick] = 0;
  }
  return out.sort((a, b) => a - b);
}

/** The `since` list for the next round: impostors back to 0, everyone else one round further. */
export const nextSince = (since, players, impostors) =>
  Array.from({ length: players }, (_, i) => (impostors.includes(i) ? 0 : (Number.isFinite(since[i]) ? since[i] : players) + 1));

/** Who gives the first clue. */
export const pickStarter = (players, rand = random) => Math.floor(rand() * players);
