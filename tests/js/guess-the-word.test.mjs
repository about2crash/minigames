// Guess the Word rules (site/games/guess-the-word/logic.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../site/games/guess-the-word/logic.js";

const near = (a, b) => Math.abs(a - b) < 1e-9;

test("screenUp: flat face up is +1, upright is 0, face down is -1, in any rotation", () => {
  assert.ok(near(G.screenUp(0, 0), 1));
  assert.ok(near(G.screenUp(90, 0), 0));     // portrait, upright
  assert.ok(near(G.screenUp(0, 90), 0));     // landscape, upright
  assert.ok(near(G.screenUp(0, -90), 0));    // landscape the other way
  assert.ok(near(G.screenUp(180, 0), -1));
  // landscape on the forehead: tilting the screen to the ceiling brings gamma from 90 towards 0,
  // tilting it to the floor wraps gamma to -90…-50 with beta flipped to 180
  assert.ok(G.screenUp(0, 45) > G.TILT_ON);
  assert.ok(G.screenUp(180, -45) < -G.TILT_ON);
  assert.ok(G.screenUp(-180, 45) < -G.TILT_ON);
  assert.equal(G.screenUp(null, 0), null);
  assert.equal(G.screenUp(undefined, undefined), null);
});

test("tilt tracker: starts disarmed, one answer per tilt, needs to come back upright", () => {
  const t = G.tiltTracker();
  assert.equal(t(1), null);          // lying on the table at the start: ignored
  assert.equal(t(-0.9), null);
  assert.equal(t(0.1), null);        // upright: armed
  assert.equal(t(-0.5), null);       // not far enough
  assert.equal(t(-0.7), "correct");
  assert.equal(t(-0.95), null);      // still tilted: no second answer
  assert.equal(t(0.5), null);        // between: not upright yet
  assert.equal(t(0.8), null);
  assert.equal(t(0.2), null);        // upright again
  assert.equal(t(0.8), "pass");
  assert.equal(t(null), null);
});

test("scores and standings", () => {
  assert.equal(G.turnScore([{ ok: true }, { ok: false }, { ok: true }]), 2);
  assert.equal(G.turnScore([]), 0);
  const s = G.standings(["Ann", "Ben", "Cy", "Di"], [3, 5, 3, 1]);
  assert.deepEqual(s.map((r) => [r.name, r.score, r.place]), [["Ben", 5, 1], ["Ann", 3, 2], ["Cy", 3, 2], ["Di", 1, 4]]);
});

test("words come from the shared lists without repeats", () => {
  let used = [];
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const p = G.pickWord("de", [], used);
    assert.ok(!seen.has(p.word));
    seen.add(p.word);
    used = p.used;
  }
});
