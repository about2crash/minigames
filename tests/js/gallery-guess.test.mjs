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
const m = (name, extra = {}) => ({ name, seq: 0, online: true, score: 0, ready: false, photos: 0, have: 0, ...extra });

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
  G.mergeFacts(mem, { name: "A very very long name indeed", game: 1, ready: true, photos: 9, have: 3 }, s);
  assert.equal(mem.name.length, 20);
  assert.equal(mem.ready, true);
  assert.equal(mem.photos, G.MAX_PHOTOS);
  assert.equal(mem.have, 3);
  G.mergeFacts(mem, { name: "B", game: 0, ready: false, photos: 0, have: 0 }, s);
  assert.equal(mem.ready, true, "stale game facts ignored");
  s.phase = "round";
  G.mergeFacts(mem, { name: "B", game: 1, ready: false, photos: 1, have: 7 }, s);
  assert.equal(mem.ready, true, "ready is locked during a game");
  assert.equal(mem.photos, G.MAX_PHOTOS);
  assert.equal(mem.have, 7, "receiving photos still counts");
  const late = {};
  G.mergeFacts(late, { name: "Late", game: 1 }, s);
  assert.deepEqual(late, { name: "Late", score: 0, ready: false, photos: 0, have: 0 });
});

test("start needs two ready players who received every photo", () => {
  const s = lobby({ a: m("Anna", { ready: true, photos: 2, have: 2 }), b: m("Ben") });
  assert.match(G.startStatus(s).reason, /at least 2/);
  s.members.b = m("Ben", { ready: true, photos: 1, have: 1 });
  const st = G.startStatus(s);
  assert.equal(st.ok, false);
  assert.match(st.reason, /Anna 2\/3, Ben 1\/3/);
  s.members.a.have = 3;
  s.members.b.have = 3;
  assert.equal(G.startStatus(s).ok, true);
  s.members.b.online = false;
  assert.equal(G.startStatus(s).ok, false, "offline players don't count");
});

test("a full game: start, guess, reveal, next, over, play again", () => {
  const s = lobby({
    a: m("Anna", { ready: true, photos: 1, have: 2, score: 50 }),
    b: m("Ben", { ready: true, photos: 1, have: 2 }),
    c: m("Cara"), // in the room but not playing; may still guess
  });
  const photos = [{ pid: "pa", owner: "a" }, { pid: "pb", owner: "b" }, { pid: "px", owner: "zed" }];
  assert.equal(G.startGame(s, photos, seeded(3)), true);
  assert.equal(s.phase, "round");
  assert.deepEqual([...s.players].sort(), ["a", "b"]);
  assert.equal(s.order.length, 2, "photos of non-players are not used");
  assert.equal(s.members.a.score, 0, "scores reset");
  assert.deepEqual(G.guessers(s).sort(), ["a", "b", "c"]);

  const owner = s.order[0] === "pa" ? "a" : "b";
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
  assert.deepEqual([s.members.a.ready, s.members.a.photos, s.members.a.score], [false, 0, 0]);
});

test("rounds are capped", () => {
  const members = {};
  const photos = [];
  for (const id of "abcde") {
    members[id] = m(id, { ready: true, photos: 5, have: 25 });
    for (let i = 0; i < 5; i++) photos.push({ pid: id + i, owner: id });
  }
  const s = lobby(members);
  G.startGame(s, photos, seeded(5));
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
  s.members.anna.photos = 99;
  s.members.benn.ready = "yes";
  const c = G.cleanGame(s);
  assert.equal(c.phase, "lobby");
  assert.equal(c.game, 1);
  assert.deepEqual(c.players, ["anna"]);
  assert.deepEqual(c.order, ["pid1abcd"]);
  assert.equal(c.round, 0);
  assert.deepEqual(c.last, { pid: "pid1abcd", owner: null, guesses: { benn: { pick: "anna", ms: 0, pts: 0 } } });
  assert.equal(c.members.anna.score, 0);
  assert.equal(c.members.anna.photos, G.MAX_PHOTOS);
  assert.equal(c.members.benn.ready, false);
});

test("hostile facts can't crash the leader", () => {
  const s = lobby({});
  const mem = {};
  const evil = JSON.parse('{"name":{"toString":1},"game":1,"ready":"yes","photos":{"valueOf":1,"toString":1},"have":"9"}');
  G.mergeFacts(mem, evil, s);
  assert.deepEqual(mem, { name: "Player", score: 0, ready: false, photos: 0, have: 0 });
});
