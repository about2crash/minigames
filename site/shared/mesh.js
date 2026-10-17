// Serverless multiplayer rooms over WebRTC, for static sites.
//
// - Joining: a member shows an invite (QR/link holding a compact WebRTC offer), the
//   newcomer answers with a reply code (QR/link) that goes back to that member.
//   That is the only manual step; no signaling server is involved.
// - Mesh: once connected to one member, the newcomer reaches everyone else through
//   signaling relayed over the existing connections. Broken links heal the same way.
// - Leader: the room state is a plain object owned by one leader and copied to every
//   member. Leader = online member with the lowest join number; when it disappears the
//   next one takes over with a higher `term`. Highest term wins, so everyone converges.
// - Public STUN servers only tell each browser its public address (needed across the
//   internet, not on the same Wi-Fi). Game data never passes through any server.
//
//   const room = new Room({ id, name });
//   room.create({ phase: "lobby" })  |  const reply = await room.join(inviteCode)
//   room.addEventListener("state", ...)       // room.state changed
//   room.update((s) => { s.phase = "play"; }) // leader only
//   room.broadcast({ ... }) / room.send(id, { ... }) -> "message" events
//   room.sendBulk(id, meta, arrayBuffer)              -> "bulk" events

const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
const PING_MS = 2000, DEAD_MS = 7000, CONNECT_MS = 15000, GATHER_MS = 2500, CHUNK = 16384;
const MAX_BULK = 8 * 1024 * 1024; // largest single file a peer may send us
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export const randomId = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHABET[b % 32]).join("");

// Everything from other peers is untrusted. Ids become object keys, so they must never
// be things like "__proto__"; our own ids always match this.
export const isId = (v) => typeof v === "string" && /^[a-z0-9]{4,16}$/.test(v);
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
// never String(v): objects like {"toString": 1} from JSON would throw
export const str = (v, max = 40) => (typeof v === "string" ? v.slice(0, max) : "");

/** Room fields of a state copy from a peer, coerced to the expected types (null = reject). */
export function cleanState(s) {
  if (!isObj(s) || !isId(s.room) || !isId(s.leader) || !isObj(s.members)) return null;
  const members = {};
  for (const [id, m] of Object.entries(s.members)) {
    if (!isId(id) || !isObj(m)) continue;
    members[id] = { ...m, name: str(m.name), seq: num(m.seq, 1e9), online: m.online === true, left: m.left === true };
  }
  if (!members[s.leader]) return null;
  return {
    ...s, members, term: num(s.term), ver: num(s.ver), nextSeq: num(s.nextSeq),
    kicked: Array.isArray(s.kicked) ? s.kicked.filter(isId) : [],
  };
}

const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hexToBytes = (h) => Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
const bytesToHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const encText = (s) => b64u(new TextEncoder().encode(s));
const decText = (s) => new TextDecoder().decode(unb64u(s));

// ── Compact SDP: only what a data-channel session needs, so invites fit a small QR code ──
const SETUP = { actpass: "x", active: "a", passive: "p" };
const SETUP_BACK = { x: "actpass", a: "active", p: "passive" };
const CAND_TYPE = { h: "host", m: "host", s: "srflx", p: "prflx", r: "relay" };
const CAND_PRIO = { host: 2122260223, srflx: 1686052607, prflx: 1845501695, relay: 41885439 };

function packSdp(sdp) {
  const get = (re) => (sdp.match(re) || [])[1];
  const ufrag = get(/a=ice-ufrag:(\S+)/), pwd = get(/a=ice-pwd:(\S+)/), fp = get(/a=fingerprint:sha-256 (\S+)/i);
  const cands = [];
  for (const [, addr0, port, typ] of sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ (host|srflx|prflx|relay)/gi)) {
    let addr = addr0, t = typ[0].toLowerCase();
    const uuid = addr.match(/^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i);
    if (uuid) { t = "m"; addr = b64u(hexToBytes(uuid.slice(1).join("").toLowerCase())); }
    const c = `${t}${addr}:${port}`;
    if (!cands.includes(c)) cands.push(c);
  }
  if (!ufrag || !pwd || !fp || !cands.length) throw new Error("No network route found");
  // public address first, then local ones; a QR code has no room for more than a few
  cands.sort((a, b) => "srpmh".indexOf(a[0]) - "srpmh".indexOf(b[0]));
  return [SETUP[get(/a=setup:(\S+)/)] || "a", get(/a=mid:(\S+)/) || "0", ufrag, pwd,
    b64u(hexToBytes(fp.replace(/:/g, ""))), cands.slice(0, 5).join(",")];
}

function unpackSdp([setup, mid, ufrag, pwd, fp, cands], type) {
  const lines = ["v=0", `o=- ${Date.now()} 2 IN IP4 127.0.0.1`, "s=-", "t=0 0", `a=group:BUNDLE ${mid}`,
    "a=msid-semantic: WMS", "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0"];
  cands.split(",").forEach((c, i) => {
    const k = c.lastIndexOf(":"), t = c[0], typ = CAND_TYPE[t];
    let addr = c.slice(1, k);
    if (t === "m") addr = bytesToHex(unb64u(addr)).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5") + ".local";
    lines.push(`a=candidate:${i + 1} 1 udp ${CAND_PRIO[typ] - i} ${addr} ${c.slice(k + 1)} typ ${typ}`
      + (typ === "host" ? "" : " raddr 0.0.0.0 rport 0"));
  });
  lines.push(`a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`,
    `a=fingerprint:sha-256 ${bytesToHex(unb64u(fp)).toUpperCase().match(/../g).join(":")}`,
    `a=setup:${SETUP_BACK[setup]}`, `a=mid:${mid}`, "a=sctp-port:5000", "a=max-message-size:262144");
  return { type, sdp: lines.join("\r\n") + "\r\n" };
}

// Invite:  1~room~fromId~fromName~inviteId~<6 sdp fields>
// Reply:   2~inviteId~guestId~guestName~<6 sdp fields>
// exported for tests
export { packSdp, unpackSdp };

export function parseInvite(code) {
  const p = String(code).split("~");
  if (p[0] !== "1" || p.length !== 11 || !isId(p[1]) || !isId(p[2]) || !isId(p[4])) return null;
  try { return { room: p[1], from: p[2], name: decText(p[3]).slice(0, 40), invite: p[4], sdp: p.slice(5) }; } catch { return null; }
}
export function parseReply(code) {
  const p = String(code).split("~");
  if (p[0] !== "2" || p.length !== 10 || !isId(p[1]) || !isId(p[2])) return null;
  try { return { invite: p[1], id: p[2], name: decText(p[3]).slice(0, 40), sdp: p.slice(4) }; } catch { return null; }
}

function gathered(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const t = setTimeout(resolve, GATHER_MS);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(t); resolve(); }
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Room extends EventTarget {
  constructor({ id = randomId(), name = "", maxPeers = 12 } = {}) {
    super();
    this.id = id;
    this.me = { name };
    this.maxPeers = maxPeers;
    this.roomId = null;
    this.state = null;
    this.peers = new Map();    // id -> peer
    this.invites = new Map();  // inviteId -> { peer, at }
    this.seen = new Map();     // message id -> time (dedupe for relayed messages)
    this.attempts = new Map(); // id -> { at, wait } (mesh healing backoff)
    // Leader hook: how a member's self-reported facts land in the shared state.
    this.mergeFacts = (member, facts) => Object.assign(member, { name: str(facts.name) });
    // Hook: coerce the game's own fields of a state copy from a peer (return null to reject).
    this.cleanGame = (s) => s;
    this._tickTimer = setInterval(() => this._tick(), 1000);
    this._factsTimer = null;
    this._sendStateQueued = false;
  }

  get isLeader() { return !!this.state && this.state.leader === this.id; }
  get leaderName() { return this.state?.members[this.state.leader]?.name || ""; }
  alive(id) { const p = this.peers.get(id); return !!p && p.open && Date.now() - p.last < DEAD_MS; }
  get alivePeers() { return [...this.peers.values()].filter((p) => this.alive(p.id)).map((p) => p.id); }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  // ── Room lifecycle ────────────────────────────────────────────────
  create(initial = {}) {
    this._closeAll();
    this.roomId = randomId(6);
    this.state = {
      ...initial, room: this.roomId, term: 1, ver: 1, leader: this.id, nextSeq: 1, kicked: [],
      members: { [this.id]: { ...this.me, seq: 0, online: true } },
    };
    this._emit("state", { leaderChanged: true });
  }

  /** Become a guest from an invite code. Returns the reply code to show the inviter. */
  async join(code) {
    const inv = parseInvite(code);
    if (!inv) throw new Error("That is not a valid invite");
    this._closeAll();
    this.roomId = inv.room;
    this.state = null;
    const peer = this._newPeer(inv.from, false);
    peer.name = inv.name;
    peer.timeout = 20 * 60e3; // the inviter still has to scan our reply
    await peer.pc.setRemoteDescription(unpackSdp(inv.sdp, "offer"));
    await peer.pc.setLocalDescription(await peer.pc.createAnswer());
    await gathered(peer.pc);
    return ["2", inv.invite, this.id, encText(this.me.name), ...packSdp(peer.pc.localDescription.sdp)].join("~");
  }

  /** Leave for good: hand the lead to the next member, say goodbye, close everything. */
  leave() {
    if (this.isLeader) {
      const next = this._succession().find((id) => id !== this.id);
      if (next) {
        this.state.leader = next;
        this.state.term++;
        this.state.ver++;
        this.state.members[this.id].left = true;
        this.state.members[this.id].online = false;
        // sent directly: we are no longer the leader, so _sendState() would refuse
        this._route({ k: "state", mid: randomId(10), o: this.id, h: 0, d: this.state }, null);
      }
    }
    for (const p of this.peers.values()) this._direct(p, { k: "bye" });
    setTimeout(() => this._closeAll(), 300);
    this.state = null;
    this.roomId = null;
  }

  destroy() { clearInterval(this._tickTimer); this._closeAll(); }

  // ── Invites (the one manual signaling step) ──────────────────────
  async createInvite() {
    if (!this.roomId) throw new Error("Not in a room");
    const id = randomId(4);
    const peer = this._newPeer(null, true);
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    await gathered(peer.pc);
    this.invites.set(id, { peer, at: Date.now() });
    // keep a handful of recent invites alive: someone may still be typing their name
    for (const [iid, inv] of this.invites) {
      if (this.invites.size <= 6 && Date.now() - inv.at < 15 * 60e3) break;
      if (iid !== id) { inv.peer.pc.close(); this.invites.delete(iid); }
    }
    return { id, code: ["1", this.roomId, this.id, encText(this.me.name), id, ...packSdp(peer.pc.localDescription.sdp)].join("~") };
  }

  hasInvite(id) { return this.invites.has(id); }

  /** Feed a guest's reply code to the matching invite. Returns the guest's name. */
  async acceptReply(code) {
    const r = parseReply(code);
    if (!r) throw new Error("That is not a valid reply code");
    const inv = this.invites.get(r.invite);
    if (!inv) throw new Error("This reply belongs to an old or used invite. Show a fresh one.");
    if (this.state?.kicked.includes(r.id)) throw new Error(`${r.name} was removed from this room`);
    if (this.alivePeers.length + 1 >= this.maxPeers) throw new Error("The room is full");
    this.invites.delete(r.invite);
    const old = this.peers.get(r.id);
    if (old) this._drop(old);
    const peer = inv.peer;
    peer.id = r.id;
    peer.name = r.name;
    peer.born = Date.now();
    this.peers.set(r.id, peer);
    await peer.pc.setRemoteDescription(unpackSdp(r.sdp, "answer"));
    return r.name;
  }

  // ── Messaging ────────────────────────────────────────────────────
  broadcast(msg) { this._route({ k: "app", mid: randomId(10), o: this.id, h: 0, d: msg }, null); }
  send(to, msg) { this._route({ k: "app", mid: randomId(10), o: this.id, h: 0, to, d: msg }, null); }

  /** Self-reported facts (name, ready, ...) that the leader merges into state.members[me]. */
  setFacts(facts) {
    Object.assign(this.me, facts);
    clearTimeout(this._factsTimer);
    this._factsTimer = setTimeout(() => this._sendFacts(), 120);
  }

  /** Leader only: change the shared state; it is copied to everyone. */
  update(fn) {
    if (!this.isLeader) return false;
    fn(this.state);
    this.state.ver++;
    this._emit("state", {});
    if (!this._sendStateQueued) {
      this._sendStateQueued = true;
      queueMicrotask(() => { this._sendStateQueued = false; this._sendState(); });
    }
    return true;
  }

  kick(id) {
    this.update((s) => {
      if (!s.kicked.includes(id)) s.kicked.push(id);
      if (s.members[id]) Object.assign(s.members[id], { left: true, online: false });
    });
    const p = this.peers.get(id);
    if (p) setTimeout(() => this._drop(p), 500);
  }

  /** Send a binary payload straight to one peer (photos, files). */
  async sendBulk(to, meta, buf) {
    const p = this.peers.get(to);
    if (!p?.open) return false;
    const run = async () => {
      const ch = p.bulk;
      if (ch.readyState !== "open") return false;
      ch.send(JSON.stringify({ ...meta, size: buf.byteLength }));
      for (let o = 0; o < buf.byteLength; o += CHUNK) {
        while (ch.bufferedAmount > 1 << 20 && ch.readyState === "open") await sleep(30);
        if (ch.readyState !== "open") return false;
        ch.send(buf.slice(o, o + CHUNK));
      }
      return true;
    };
    p.bulkQueue = p.bulkQueue.then(run, run);
    return p.bulkQueue;
  }

  // ── Peers ────────────────────────────────────────────────────────
  _newPeer(id, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const peer = {
      id, pc, initiator, name: "", open: false, last: Date.now(), born: Date.now(), timeout: CONNECT_MS, neighbors: new Set(),
      ctl: pc.createDataChannel("ctl", { negotiated: true, id: 0 }),
      bulk: pc.createDataChannel("bulk", { negotiated: true, id: 1 }),
      rx: null, bulkQueue: Promise.resolve(),
    };
    peer.bulk.binaryType = "arraybuffer";
    if (id) this.peers.set(id, peer);
    peer.ctl.onopen = () => {
      peer.open = true;
      peer.last = Date.now();
      this._direct(peer, { k: "hello", id: this.id, room: this.roomId, name: this.me.name, state: this.state });
    };
    peer.ctl.onclose = () => this._drop(peer);
    peer.ctl.onmessage = (e) => {
      peer.last = Date.now();
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this._onDirect(peer, m);
    };
    peer.bulk.onmessage = (e) => {
      peer.last = Date.now();
      if (typeof e.data === "string") {
        peer.rx = null;
        try {
          const meta = JSON.parse(e.data);
          if (isObj(meta) && Number.isInteger(meta.size) && meta.size >= 0 && meta.size <= MAX_BULK) peer.rx = { meta, parts: [], got: 0 };
        } catch {}
      } else if (peer.rx) {
        peer.rx.parts.push(e.data);
        peer.rx.got += e.data.byteLength;
      }
      if (peer.rx && peer.rx.got >= peer.rx.meta.size) {
        const { meta, parts } = peer.rx;
        peer.rx = null;
        this._emit("bulk", { from: peer.id, meta, data: new Blob(parts) });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this._drop(peer);
    };
    return peer;
  }

  _drop(peer) {
    if (peer.dropped) return;
    peer.dropped = true;
    const wasOpen = peer.open;
    peer.open = false;
    try { peer.pc.close(); } catch {}
    if (peer.id && this.peers.get(peer.id) === peer) this.peers.delete(peer.id);
    if (wasOpen) this._emit("peers", { down: peer.id });
    this._tick();
  }

  _closeAll() {
    for (const p of [...this.peers.values()]) { p.open = false; p.dropped = true; try { p.pc.close(); } catch {} }
    for (const inv of this.invites.values()) inv.peer.pc.close();
    this.peers.clear();
    this.invites.clear();
    this._emit("peers", {});
  }

  _direct(peer, msg) {
    if (peer.ctl.readyState !== "open") return;
    try { peer.ctl.send(JSON.stringify(msg)); } catch {}
  }

  _onDirect(peer, m) {
    switch (m.k) {
      case "hello": {
        if (!isId(m.id) || m.room !== this.roomId || this.state?.kicked.includes(m.id) || (peer.id && peer.id !== m.id)) {
          this._direct(peer, { k: "nope", why: this.state?.kicked.includes(m.id) ? "kicked" : "room" });
          setTimeout(() => this._drop(peer), 300);
          return;
        }
        peer.name = str(m.name);
        // a newcomer takes the room as its inviter knows it
        if (m.state) this._adopt(m.state, peer.id, !this.state);
        this.attempts.delete(peer.id);
        this._emit("peers", { up: peer.id });
        this._sendFacts();
        return;
      }
      case "nope":
        this._emit("rejected", { why: m.why });
        return;
      case "ping":
        peer.neighbors = new Set(Array.isArray(m.n) ? m.n.filter(isId) : []);
        return;
      case "bye":
        if (this.isLeader && this.state.members[peer.id]) {
          this.update((s) => Object.assign(s.members[peer.id], { left: true, online: false }));
        }
        this._drop(peer);
        return;
      default:
        if (typeof m.mid === "string" && m.mid.length <= 32) this._route(m, peer.id);
    }
  }

  // Relayed messages: in a full mesh nothing is forwarded; around a broken link the
  // members that can reach both sides pass it on (at most a few hops, deduplicated).
  _route(env, via) {
    if (this.seen.has(env.mid)) return;
    if (via) {
      // Who sent it? A direct peer can only speak for itself; a relayed copy claiming to come
      // from someone we are directly connected to is a forgery (they would have told us directly).
      if (!isId(env.o) || (env.to !== undefined && !isId(env.to)) || !Number.isInteger(env.h)) return;
      if (env.o !== via && (env.h === 0 || this.alive(env.o))) return;
    }
    this.seen.set(env.mid, Date.now());
    if (env.o !== this.id && (!env.to || env.to === this.id)) this._deliver(env);
    if (env.to === this.id || env.h > 3) return;
    const out = { ...env, h: env.h + 1 };
    const open = [...this.peers.values()].filter((p) => p.open && p.id !== via && p.id !== env.o);
    if (env.to) {
      const target = open.find((p) => p.id === env.to);
      const hops = target ? [target] : open.filter((p) => p.neighbors.has(env.to));
      for (const p of hops.length ? hops : open) this._direct(p, out);
      return;
    }
    const viaPeer = via && this.peers.get(via);
    for (const p of open) if (!viaPeer || !viaPeer.neighbors.has(p.id)) this._direct(p, out);
  }

  _deliver(env) {
    switch (env.k) {
      case "app": this._emit("message", { from: env.o, msg: env.d }); break;
      case "state": this._adopt(env.d, env.o); break;
      case "facts": if (isObj(env.d)) this._mergeFacts(env.o, env.d); break;
      case "sig": this._onSignal(env.o, env.d); break;
    }
  }

  // ── Shared state ─────────────────────────────────────────────────
  _sendState() {
    if (this.isLeader) this._route({ k: "state", mid: randomId(10), o: this.id, h: 0, d: this.state }, null);
  }

  _sendFacts() {
    if (!this.state) return;
    if (this.isLeader) this._mergeFacts(this.id, this.me);
    else this._route({ k: "facts", mid: randomId(10), o: this.id, h: 0, d: this.me }, null);
  }

  _mergeFacts(id, facts) {
    if (!this.isLeader || this.state.kicked.includes(id)) return;
    const s = this.state;
    const before = JSON.stringify(s.members[id] || null);
    const m = s.members[id] || (s.members[id] = { seq: s.nextSeq++ });
    this.mergeFacts(m, facts, s);
    m.online = true;
    m.left = false;
    if (JSON.stringify(m) !== before) this.update(() => {});
  }

  // Which of two state copies wins: higher term, then the more senior leader, then newer.
  _better(a, b) {
    if (!b) return true;
    if (a.room !== b.room) return false;
    if (a.term !== b.term) return a.term > b.term;
    if (a.leader !== b.leader) return (a.members[a.leader]?.seq ?? 1e9) < (b.members[b.leader]?.seq ?? 1e9);
    return a.ver > b.ver;
  }

  _adopt(raw, from, fromInviter = false) {
    let s = cleanState(raw);
    if (s) s = this.cleanGame(s);
    if (!s || s.room !== this.roomId) return;
    // only the leader a copy names (or the current leader, handing over) may send it
    if (!fromInviter && from !== s.leader && from !== this.state?.leader) return;
    if (!this._better(s, this.state)) return;
    const prev = this.state;
    this.state = s;
    if (s.kicked.includes(this.id)) {
      this._emit("rejected", { why: "kicked" });
      return;
    }
    for (const id of s.kicked) { const p = this.peers.get(id); if (p) this._drop(p); }
    const leaderChanged = !prev || prev.leader !== s.leader;
    this._emit("state", { leaderChanged, prevLeader: prev?.leader });
    // the leader may not know our facts yet (new leader, or we just arrived)
    const mine = s.members[this.id];
    if (!mine || mine.left || Object.keys(this.me).some((k) => JSON.stringify(mine[k]) !== JSON.stringify(this.me[k]))) {
      this._sendFacts();
    }
  }

  _succession() {
    const s = this.state;
    return Object.entries(s.members)
      .filter(([id, m]) => !m.left && !s.kicked.includes(id) && (id === this.id || this.alive(id)))
      .sort((a, b) => a[1].seq - b[1].seq)
      .map(([id]) => id);
  }

  // ── Mesh healing via relayed signaling ───────────────────────────
  async _connectVia(id) {
    const peer = this._newPeer(id, true);
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      await gathered(peer.pc);
      if (peer.dropped) return;
      this._route({ k: "sig", mid: randomId(10), o: this.id, h: 0, to: id, d: { type: "offer", sdp: peer.pc.localDescription.sdp } }, null);
    } catch { this._drop(peer); }
  }

  async _onSignal(from, d) {
    if (this.state?.kicked.includes(from) || !isObj(d) || typeof d.sdp !== "string") return;
    d = { type: d.type, sdp: d.sdp };
    let peer = this.peers.get(from);
    if (d.type === "offer") {
      if (peer && peer.open && this.alive(from)) return;
      // both sides dialed at once: the lower id's offer wins
      if (peer && peer.initiator && !peer.open && this.id < from) return;
      if (peer) this._drop(peer);
      peer = this._newPeer(from, false);
      try {
        await peer.pc.setRemoteDescription(d);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        await gathered(peer.pc);
        if (peer.dropped) return;
        this._route({ k: "sig", mid: randomId(10), o: this.id, h: 0, to: from, d: { type: "answer", sdp: peer.pc.localDescription.sdp } }, null);
      } catch { this._drop(peer); }
    } else if (d.type === "answer" && peer && peer.pc.signalingState === "have-local-offer") {
      try { await peer.pc.setRemoteDescription(d); } catch { this._drop(peer); }
    }
  }

  // ── Heartbeat: pings, dead peers, leader takeover, healing ───────
  _tick() {
    const now = Date.now();
    for (const [mid, t] of this.seen) if (now - t > 60e3) this.seen.delete(mid);
    for (const p of [...this.peers.values()]) {
      if (p.open && now - p.last > DEAD_MS) this._drop(p);
      else if (!p.open && now - p.born > p.timeout) this._drop(p);
    }
    if (!this._pingAt || now - this._pingAt >= PING_MS) {
      this._pingAt = now;
      const n = this.alivePeers;
      for (const p of this.peers.values()) if (p.open) this._direct(p, { k: "ping", n });
    }
    const s = this.state;
    if (!s) return;

    if (this.isLeader) {
      // keep the online flags honest and re-send the state now and then (heals missed copies)
      let changed = false;
      for (const [id, m] of Object.entries(s.members)) {
        const on = id === this.id || this.alive(id);
        if (m.online !== on && !(m.left && !on)) { m.online = on; changed = true; }
      }
      if (changed) this.update(() => {});
      else if (!this._stateAt || now - this._stateAt > 3000) { this._stateAt = now; this._sendState(); }
    } else if (!this.alive(s.leader)) {
      // The leader is gone. The most senior member we can still reach takes over,
      // unless we are cut off from everyone (then we wait to be re-invited).
      const order = this._succession();
      const othersAround = Object.entries(s.members).some(([id, m]) => id !== this.id && !m.left && !s.kicked.includes(id));
      if (order[0] === this.id && (this.alivePeers.length > 0 || !othersAround)) {
        const prevLeader = s.leader;
        s.term++;
        s.leader = this.id;
        if (s.members[prevLeader]) s.members[prevLeader].online = false;
        this.update(() => {});
        this._emit("state", { leaderChanged: true, prevLeader });
      }
    }

    // Connect to every member we are missing; the lower id dials, with backoff.
    for (const [id, m] of Object.entries(s.members)) {
      if (id === this.id || m.left || s.kicked.includes(id) || this.peers.has(id) || this.id > id) continue;
      if (!this.alivePeers.length) break;
      const a = this.attempts.get(id) || { at: 0, wait: 4000 };
      if (now - a.at < a.wait) continue;
      this.attempts.set(id, { at: now, wait: Math.min(a.wait * 2, 60e3) });
      this._connectVia(id);
    }
  }
}
