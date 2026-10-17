// Gallery Guess rules: pure functions on the shared room state, so they can be tested
// without a browser. The leader applies them through room.update(); see index.html.
//
// Game fields in the room state (next to the members/leader fields from mesh.js):
//   phase   "lobby" | "round" | "reveal" | "over"
//   game    counts up with every "play again"; photos and facts carry it so stale ones are ignored
//   players ids whose photos are in this game (the answer options)
//   order   photo ids in play order, round = index into it
//   last    result of the latest round: { pid, owner, guesses: { id: { pick, ms, pts } } }
// Member facts: name, game, ready, photos (how many they offer), have (photos received).

export const ROUND_MS = 10000;
export const REVEAL_MS = 5000;
export const MAX_ROUNDS = 20;
export const MAX_PHOTOS = 5;

const PHASES = ["lobby", "round", "reveal", "over"];
export const isId = (v) => typeof v === "string" && /^[a-z0-9]{4,16}$/.test(v);
const int = (v, min, max, d = min) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);

/**
 * Hook for mesh.js: coerce the game fields of a state copy from another phone, so a
 * broken or malicious peer can't feed the page unexpected types (or markup).
 */
export function cleanGame(s) {
  const out = { ...s };
  out.phase = PHASES.includes(s.phase) ? s.phase : "lobby";
  out.game = int(s.game, 1, 1e6, 1);
  out.players = Array.isArray(s.players) ? s.players.filter((id) => isId(id) && s.members[id]) : [];
  out.order = Array.isArray(s.order) ? s.order.filter(isId).slice(0, MAX_ROUNDS) : [];
  out.round = int(s.round, 0, Math.max(0, out.order.length - 1));
  out.last = null;
  if (s.last && typeof s.last === "object" && isId(s.last.pid)) {
    const guesses = {};
    for (const [id, g] of Object.entries(s.last.guesses || {})) {
      if (!isId(id) || !g || typeof g !== "object") continue;
      guesses[id] = { pick: isId(g.pick) ? g.pick : null, ms: int(g.ms, 0, ROUND_MS), pts: int(g.pts, 0, 100) };
    }
    out.last = { pid: s.last.pid, owner: isId(s.last.owner) ? s.last.owner : null, guesses };
  }
  if ((out.phase === "round" || out.phase === "reveal") && !out.order.length) out.phase = "lobby";
  for (const m of Object.values(s.members)) {
    m.score = int(m.score, 0, 1e6);
    m.ready = m.ready === true;
    m.photos = int(m.photos, 0, MAX_PHOTOS);
    m.have = int(m.have, 0, 1000);
  }
  return out;
}

export function initialState() {
  return { phase: "lobby", game: 1, players: [], order: [], round: 0, last: null };
}

/** Points for a guess: 100 at once, minus 8 per second, at least 10; wrong = 0. */
export function points(correct, ms) {
  if (!correct) return 0;
  return Math.max(10, Math.floor(100 - (ms / 1000) * 8));
}

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Interleave photos so each owner's photos are spread out: A B C A B C ... */
export function spreadOrder(photos, rnd = Math.random) {
  const groups = new Map();
  for (const p of photos) {
    if (!groups.has(p.owner)) groups.set(p.owner, []);
    groups.get(p.owner).push(p.pid);
  }
  for (const g of groups.values()) shuffle(g, rnd);
  const owners = [...groups.keys()];
  const out = [];
  while (out.length < photos.length) {
    shuffle(owners, rnd);
    for (const o of owners) { const g = groups.get(o); if (g.length) out.push(g.shift()); }
  }
  return out;
}

const present = (m) => m.online && !m.left;

/** Leader hook for mesh.js: merge a member's facts, ignoring game facts from an older game. */
export function mergeFacts(member, facts, state) {
  member.name = (typeof facts.name === "string" && facts.name.trim().slice(0, 20)) || "Player";
  member.score ??= 0;
  member.ready ??= false;
  member.photos ??= 0;
  member.have ??= 0;
  if (facts.game !== state.game) return member;
  // ready and photo count are locked once the game has started
  if (state.phase === "lobby") {
    member.ready = facts.ready === true;
    member.photos = int(facts.photos, 0, MAX_PHOTOS);
  }
  member.have = int(facts.have, 0, 1000);
  return member;
}

/** Who may start, and if not, why not. */
export function startStatus(s) {
  const ready = Object.entries(s.members).filter(([, m]) => present(m) && m.ready && m.photos > 0);
  const total = ready.reduce((n, [, m]) => n + m.photos, 0);
  if (ready.length < 2) return { ok: false, reason: "Waiting for at least 2 players with photos ready", ready: ready.map(([id]) => id), total };
  const behind = ready.filter(([, m]) => (m.have || 0) < total);
  if (behind.length) {
    const names = behind.map(([, m]) => `${m.name} ${m.have || 0}/${total}`).join(", ");
    return { ok: false, reason: `Sharing photos… ${names}`, ready: ready.map(([id]) => id), total };
  }
  return { ok: true, reason: "", ready: ready.map(([id]) => id), total };
}

/** Leader: start a game with the photos it holds ([{ pid, owner }] for the current game). */
export function startGame(s, photos, rnd = Math.random) {
  const { ok, ready } = startStatus(s);
  if (!ok) return false;
  const usable = photos.filter((p) => ready.includes(p.owner));
  s.players = shuffle([...ready], rnd);
  s.order = spreadOrder(usable, rnd).slice(0, MAX_ROUNDS);
  s.round = 0;
  s.last = null;
  s.phase = "round";
  for (const m of Object.values(s.members)) m.score = 0;
  return true;
}

/** Everyone who is here right now may guess (late joiners too). */
export function guessers(s) {
  return Object.entries(s.members).filter(([, m]) => present(m)).map(([id]) => id);
}

/** Leader: score the current round. owner = null if nobody knows (owner's photo never arrived). */
export function resolveRound(s, owner, guesses) {
  const results = {};
  for (const [id, g] of Object.entries(guesses)) {
    if (!s.members[id] || !(g.ms >= 0) || g.ms > ROUND_MS) continue;
    const pts = owner ? points(g.pick === owner, g.ms) : 0;
    results[id] = { pick: g.pick, ms: Math.round(g.ms), pts };
    s.members[id].score = (s.members[id].score || 0) + pts;
  }
  s.last = { pid: s.order[s.round], owner, guesses: results };
  s.phase = "reveal";
}

/** Leader: after the reveal, go to the next photo or finish. */
export function nextRound(s) {
  if (s.round + 1 < s.order.length) {
    s.round++;
    s.phase = "round";
  } else {
    s.phase = "over";
  }
}

/** Leader: back to the lobby for another game; everyone confirms (or swaps) their photos. */
export function newGame(s) {
  s.game++;
  Object.assign(s, { phase: "lobby", players: [], order: [], round: 0, last: null });
  for (const [id, m] of Object.entries(s.members)) {
    if (m.left) { delete s.members[id]; continue; }
    Object.assign(m, { ready: false, photos: 0, have: 0, score: 0 });
  }
}

/** Scoreboard, best first; ties share a place. */
export function standings(s) {
  const rows = Object.entries(s.members)
    .filter(([id, m]) => !m.left || m.score > 0 || s.players.includes(id))
    .map(([id, m]) => ({ id, name: m.name, score: m.score || 0, online: present(m) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.place = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].place : i + 1; });
  return rows;
}
