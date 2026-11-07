// Guess the Word rules: pure functions, tested in tests/js/guess-the-word.test.mjs.
export { LANGS, categories, pool, pickWord, wordsLeft } from "../../shared/words.js";

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 20;
export const TURN_SECONDS = [30, 60, 90, 120];
export const COUNTDOWN_MS = 3000;

// ---------- tilt ----------
// The phone sits on the guesser's forehead, screen facing the others. What matters is how far
// the screen faces up or down, whatever way the phone is rotated: that is the vertical part of
// the screen's normal, cos(beta) * cos(gamma) from a deviceorientation event (spec angles, same
// on iOS and Android). +1 = screen to the ceiling, 0 = upright, -1 = screen to the floor.
export function screenUp(beta, gamma) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const r = Math.PI / 180;
  return Math.cos(beta * r) * Math.cos(gamma * r);
}

export const TILT_ON = 0.6;   // about 37° from upright counts as a tilt
export const TILT_OFF = 0.35; // back within about 20° of upright arms the next tilt

/**
 * Turns a stream of screenUp() readings into answers. Returns a function: feed it each reading,
 * it returns "correct" (screen tilted down), "pass" (tilted up) or null. After a tilt the phone
 * has to come back upright before the next one counts; it also starts disarmed, so a phone that
 * is still lying on the table doesn't answer the first word by itself.
 */
export function tiltTracker() {
  let armed = false;
  return (up) => {
    if (up == null) return null;
    if (Math.abs(up) < TILT_OFF) { armed = true; return null; }
    if (!armed) return null;
    if (up <= -TILT_ON) { armed = false; return "correct"; }
    if (up >= TILT_ON) { armed = false; return "pass"; }
    return null;
  };
}

// ---------- scores ----------
/** Points for one turn: one per word guessed. */
export const turnScore = (results) => results.filter((r) => r.ok).length;

/** Players sorted by score (best first); ties share a place. */
export function standings(names, scores) {
  const rows = names.map((name, i) => ({ name, score: scores[i] || 0 })).sort((a, b) => b.score - a.score);
  let place = 0;
  return rows.map((r, i) => ({ ...r, place: i && r.score === rows[i - 1].score ? place : (place = i + 1) }));
}
