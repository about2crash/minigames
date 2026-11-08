// Random numbers for games: the browser's cryptographic generator (falls back to Math.random).
// Same contract as Math.random: a float in [0, 1).
export function random() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  } catch {
    return Math.random();
  }
}

/** A whole number from min to max, both included. */
export const randomInt = (min, max, rand = random) => min + Math.floor(rand() * (max - min + 1));
