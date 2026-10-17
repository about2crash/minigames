// Gallery Guess rules (site/games/gallery-guess/logic.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../site/games/gallery-guess/logic.js";

// deterministic "random" for shuffles
function seeded(seed = 1) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function lobby(members) {
  return { room: "r", term: 1, ver: 1, leader: "a", nextSeq: 9, kicked: [], ...G.initialState(), members };
}
const m = (name, extra = {}) => ({ name, seq: 0, online: true, score: 0, ready: false, pids: [], photos: 0, have: 0, haveOf: "", ...extra });
// a ready player offering n photos with ids like "anna0001"
const ready = (name, id, n, extra = {}) => {
  const pids = Array.from({ length: n }, (_, i) => `${id}000${i}`);
  return m(name, { ready: true, pids, photos: n, ...extra });
};
// every present phone reports holding all photos currently in play
function allHave(s) {
  const need = G.requiredPids({ ...s, phase: "lobby" });
  for (const mem of Object.values(s.members)) Object.assign(mem, { have: need.length, haveOf: G.pidSig(need) });
}

test("points: 100 at once, minus 8 per second, at least 10, wrong is 0", () => {
  assert.equal(G.points(true, 0), 100);
  assert.equal(G.points(true, 1000), 92);
  assert.equal(G.points(true, 2500), 80);
  assert.equal(G.points(true, 9999), 20);
  assert.equal(G.points(true, 20000), 10);
  assert.equal(G.points(false, 100), 0);
});

test("photo order spreads each owner's photos out", () => {
  const photos = [];
  for (const owner of ["a", "b", "c"]) for (let i = 0; i < 4; i++) photos.push({ pid: `${owner}${i}`, owner });
  const order = G.spreadOrder(photos, seeded(7));
  assert.equal(order.length, 12);
  assert.deepEqual(new Set(order), new Set(photos.map((p) => p.pid)));
  for (let lap = 0; lap < 4; lap++) {
    const owners = order.slice(lap * 3, lap * 3 + 3).map((pid) => pid[0]);
    assert.deepEqual(owners.sort(), ["a", "b", "c"], `lap ${lap} has one photo per owner`);
  }
});

test("facts: names are capped, game facts from an older game are ignored, locked after start", () => {
  const s = lobby({});
  const mem = {};
  const pids = ["p1aaaaaa", "p2aaaaaa", "p3aaaaaa", "p4aaaaaa", "p5aaaaaa", "p6aaaaaa", "p1aaaaaa", "<img>"];
  G.mergeFacts(mem, { name: "A very very long name indeed", game: 1, ready: true, pids, have: 3, haveOf: "abc" }, s);
  assert.equal(mem.name.length, 20);
  assert.equal(mem.ready, true);
  assert.deepEqual(mem.pids, pids.slice(0, 5), "valid, unique, at most 5");
  assert.equal(mem.photos, G.MAX_PHOTOS);
  assert.equal(mem.have, 3);
  G.mergeFacts(mem, { name: "B", game: 0, ready: false, pids: [], have: 0 }, s);
  assert.equal(mem.ready, true, "stale game facts ignored");
  s.phase = "sync";
  G.mergeFacts(mem, { name: "B", game: 1, ready: false, pids: [], have: 7 }, s);
  assert.equal(mem.ready, true, "ready is locked once started");
  assert.equal(mem.photos, G.MAX_PHOTOS);
  assert.equal(mem.have, 7, "receiving photos still counts");
  s.phase = "lobby";
  G.mergeFacts(mem, { name: "B", game: 1, ready: false, pids }, s);
  assert.deepEqual(mem.pids, [], "not ready: no photos offered");
  const late = {};
  G.mergeFacts(late, { name: "Late", game: 1 }, s);
  assert.deepEqual(late, { name: "Late", score: 0, ready: false, pids: [], photos: 0, have: 0, haveOf: "" });
});

test("start needs two ready players, and every phone here holding every photo", () => {
  const s = lobby({ anna: ready("Anna", "anna", 2, { seq: 0 }), benn: m("Ben", { seq: 1 }) });
  assert.equal(G.startStatus(s).canStart, false);
  assert.match(G.startStatus(s).reason, /at least 2/);
  s.members.benn = ready("Ben", "benn", 1, { seq: 1 });
  s.members.cara = m("Cara", { seq: 2 }); // not playing, but will guess: needs the photos too
  const need = G.requiredPids(s);
  assert.deepEqual(need, ["anna0000", "anna0001", "benn0000"]);
  const sig = G.pidSig(need);
  Object.assign(s.members.anna, { have: 2, haveOf: sig });
  Object.assign(s.members.benn, { have: 3, haveOf: sig });
  Object.assign(s.members.cara, { have: 3, haveOf: "older" }); // counted for another set of photos
  const st = G.startStatus(s);
  assert.equal(st.canStart, true);
  assert.equal(st.ok, false);
  assert.match(st.reason, /Anna 2\/3, Cara 0\/3/);
  Object.assign(s.members.anna, { have: 3 });
  Object.assign(s.members.cara, { haveOf: sig });
  assert.equal(G.startStatus(s).ok, true);
  s.members.benn.online = false;
  assert.equal(G.startStatus(s).canStart, false, "offline players don't count");
});

test("start waits in sync until every phone has every photo, then begins by itself", () => {
  const s = lobby({ anna: ready("Anna", "anna", 1, { seq: 0 }), benn: ready("Ben", "benn", 1, { seq: 1 }) });
  assert.equal(G.requestStart(s, seeded(1)), true);
  assert.equal(s.phase, "sync");
  assert.equal(G.syncStep(s, seeded(1)), false, "still waiting");
  assert.equal(s.phase, "sync");
  allHave(s);
  assert.equal(G.syncStep(s, seeded(1)), true);
  assert.equal(s.phase, "round");
  assert.equal(s.order.length, 2);

  // if a player drops out while waiting and fewer than 2 remain, back to the lobby
  const t = lobby({ anna: ready("Anna", "anna", 1, { seq: 0 }), benn: ready("Ben", "benn", 1, { seq: 1 }) });
  G.requestStart(t);
  t.members.benn.online = false;
  G.syncStep(t);
  assert.equal(t.phase, "lobby");

  // the leader may start anyway
  const u = lobby({ anna: ready("Anna", "anna", 1, { seq: 0 }), benn: ready("Ben", "benn", 1, { seq: 1 }) });
  assert.equal(G.startGame(u), false);
  assert.equal(G.startGame(u, seeded(2), true), true);
  assert.equal(u.phase, "round");
});

test("photo owners come from the state", () => {
  const s = lobby({ anna: ready("Anna", "anna", 2, { seq: 0 }), benn: ready("Ben", "benn", 1, { seq: 1 }) });
  s.members.benn.pids.push("anna0000"); // a false claim: the earlier seat keeps it
  const owners = G.photoOwners(s);
  assert.equal(owners.get("anna0000"), "anna");
  assert.equal(owners.get("benn0000"), "benn");
  assert.equal(owners.get("nope0000"), undefined);
  assert.equal(G.pidSig(["b", "a"]), G.pidSig(["a", "b"]), "order doesn't matter");
  assert.notEqual(G.pidSig(["a", "b"]), G.pidSig(["a", "c"]));
});

test("a full game: start, guess, reveal, next, over, play again", () => {
  const s = lobby({
    a: ready("Anna", "pa", 1, { score: 50, seq: 0 }),
    b: ready("Ben", "pb", 1, { seq: 1 }),
    c: m("Cara", { seq: 2, pids: ["px000000"] }), // in the room but not playing; may still guess
  });
  allHave(s);
  assert.equal(G.startGame(s, seeded(3)), true);
  assert.equal(s.phase, "round");
  assert.deepEqual([...s.players].sort(), ["a", "b"]);
  assert.equal(s.order.length, 2, "photos of non-players are not used");
  assert.deepEqual(G.requiredPids(s), s.order, "during the game, the game's photos are needed");
  assert.equal(s.members.a.score, 0, "scores reset");
  assert.deepEqual(G.guessers(s).sort(), ["a", "b", "c"]);

  const owner = G.photoOwners(s).get(s.order[0]);
  const other = owner === "a" ? "b" : "a";
  G.resolveRound(s, owner, {
    a: { pick: owner, ms: 1000 },
    b: { pick: other, ms: 500 },
    c: { pick: owner, ms: 15000 }, // too late: ignored
  });
  assert.equal(s.phase, "reveal");
  assert.deepEqual(s.last.guesses.a, { pick: owner, ms: 1000, pts: 92 });
  assert.equal(s.last.guesses.b.pts, 0);
  assert.equal(s.last.guesses.c, undefined);
  assert.equal(s.members.a.score, 92);

  G.nextRound(s);
  assert.equal(s.phase, "round");
  assert.equal(s.round, 1);
  G.resolveRound(s, null, { a: { pick: "a", ms: 100 } });
  assert.equal(s.last.guesses.a.pts, 0, "unknown owner: no points");
  G.nextRound(s);
  assert.equal(s.phase, "over");

  s.members.c.left = true;
  G.newGame(s);
  assert.equal(s.game, 2);
  assert.equal(s.phase, "lobby");
  assert.equal(s.members.c, undefined, "players who left are dropped");
  assert.deepEqual([s.members.a.ready, s.members.a.pids, s.members.a.photos, s.members.a.score], [false, [], 0, 0]);
});

test("rounds are capped", () => {
  const members = {};
  for (const id of ["aaaa", "bbbb", "cccc", "dddd", "eeee"]) members[id] = ready(id, id, 5);
  const s = lobby(members);
  allHave(s);
  G.startGame(s, seeded(5));
  assert.equal(s.order.length, G.MAX_ROUNDS);
});

test("standings: best first, ties share a place", () => {
  const s = lobby({ a: m("Anna", { score: 90 }), b: m("Ben", { score: 120 }), c: m("Cara", { score: 90 }) });
  const rows = G.standings(s);
  assert.deepEqual(rows.map((r) => [r.name, r.place]), [["Ben", 1], ["Anna", 2], ["Cara", 2]]);
});

test("state from other phones is coerced: no markup or strange types reach the page", () => {
  const s = lobby({ anna: m("Anna"), benn: m("Ben") });
  Object.assign(s, {
    phase: "<script>", game: "2", players: ["anna", "<img>", "ghost"], order: ["pid1abcd", 5, "x"], round: 99,
    last: { pid: "pid1abcd", owner: "<b>", guesses: { benn: { pick: "anna", ms: "1", pts: "<img onerror=alert(1)>" }, "<x>": {} } },
  });
  s.members.anna.score = "<img src=x onerror=alert(1)>";
  s.members.anna.pids = ["pid1abcd", "pid1abcd", "__proto__", 7, "a1aaaaaa", "a2aaaaaa", "a3aaaaaa", "a4aaaaaa", "a5aaaaaa"];
  s.members.anna.photos = 99;
  s.members.anna.haveOf = { toString: 1 };
  s.members.benn.ready = "yes";
  const c = G.cleanGame(s);
  assert.equal(c.phase, "lobby");
  assert.equal(c.game, 1);
  assert.deepEqual(c.players, ["anna"]);
  assert.deepEqual(c.order, ["pid1abcd"]);
  assert.equal(c.round, 0);
  assert.deepEqual(c.last, { pid: "pid1abcd", owner: null, guesses: { benn: { pick: "anna", ms: 0, pts: 0 } } });
  assert.equal(c.members.anna.score, 0);
  assert.deepEqual(c.members.anna.pids, ["pid1abcd", "a1aaaaaa", "a2aaaaaa", "a3aaaaaa", "a4aaaaaa"]);
  assert.equal(c.members.anna.photos, G.MAX_PHOTOS);
  assert.equal(c.members.anna.haveOf, "");
  assert.equal(c.members.benn.ready, false);
});

test("hostile facts can't crash the leader", () => {
  const s = lobby({});
  const mem = {};
  const evil = JSON.parse('{"name":{"toString":1},"game":1,"ready":"yes","pids":{"length":3},"have":"9","haveOf":["x"]}');
  G.mergeFacts(mem, evil, s);
  assert.deepEqual(mem, { name: "Player", score: 0, ready: false, pids: [], photos: 0, have: 0, haveOf: "" });
});
