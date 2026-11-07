// Odd Word Out rules: pure functions, tested in tests/js/odd-word-out.test.mjs.
export { LANGS, categories, pool, pickWord, wordsLeft } from "../../shared/words.js";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 20;

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
