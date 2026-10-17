// mesh.js without WebRTC: the compact SDP codec, invite parsing, and the room logic
// (state merging, leader takeover, message routing) driven with fake peers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Room, packSdp, unpackSdp, parseInvite, parseReply, cleanState } from "../../site/shared/mesh.js";

// Shaped like a Chrome data-channel offer.
const CHROME_OFFER = [
  "v=0", "o=- 4611731400430051336 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0",
  "a=extmap-allow-mixed", "a=msid-semantic: WMS", "m=application 50000 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 203.0.113.77",
  "a=candidate:2999745851 1 udp 2122260223 4a1f2c3d-5e6f-4a1b-9c2d-3e4f5a6b7c8d.local 50000 typ host generation 0 network-id 1",
  "a=candidate:842163049 1 udp 1686052607 203.0.113.77 61234 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-id 1",
  "a=candidate:1510613869 1 tcp 1518280447 4a1f2c3d-5e6f-4a1b-9c2d-3e4f5a6b7c8d.local 9 typ host tcptype active generation 0",
  "a=candidate:3 1 udp 2122194687 2001:db8::1 50001 typ host generation 0",
  "a=ice-ufrag:x9Kq", "a=ice-pwd:aB3dE5fG7hJ9kL1mN3pQ5rS7", "a=ice-options:trickle",
  "a=fingerprint:sha-256 0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9",
  "a=setup:actpass", "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144", "",
].join("\r\n");

test("compact SDP keeps what a data channel needs and survives a round trip", () => {
  const packed = packSdp(CHROME_OFFER);
  const [setup, mid, ufrag, pwd, fp, cands] = packed;
  assert.equal(setup, "x");
  assert.equal(mid, "0");
  assert.equal(ufrag, "x9Kq");
  assert.equal(pwd, "aB3dE5fG7hJ9kL1mN3pQ5rS7");
  assert.equal(fp.length, 43);
  const list = cands.split(",");
  assert.equal(list[0], "s203.0.113.77:61234", "public address first");
  assert.ok(list.some((c) => c.startsWith("m") && c.endsWith(":50000")), "mDNS host candidate kept");
  assert.ok(list.includes("h2001:db8::1:50001"), "IPv6 host candidate kept");
  assert.equal(list.length, 3, "tcp candidate dropped");

  const sdp = unpackSdp(packed, "offer");
  assert.equal(sdp.type, "offer");
  assert.match(sdp.sdp, /a=ice-ufrag:x9Kq\r\n/);
  assert.match(sdp.sdp, /a=fingerprint:sha-256 0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A:1B/);
  assert.match(sdp.sdp, /a=setup:actpass/);
  assert.match(sdp.sdp, / 4a1f2c3d-5e6f-4a1b-9c2d-3e4f5a6b7c8d\.local 50000 typ host/);
  assert.match(sdp.sdp, / 203\.0\.113\.77 61234 typ srflx raddr 0\.0\.0\.0 rport 0/);
  assert.deepEqual(packSdp(sdp.sdp), packed);
});

test("SDP without a usable route is rejected", () => {
  assert.throws(() => packSdp(CHROME_OFFER.replace(/a=candidate:.*\r\n/g, "")));
});

test("invite and reply codes parse, and junk does not", () => {
  const sdp = packSdp(CHROME_OFFER);
  const name = Buffer.from("Zoë ✓").toString("base64url");
  const inv = parseInvite(["1", "room42", "abcdefgh", name, "inv1", ...sdp].join("~"));
  assert.deepEqual({ ...inv, sdp: undefined }, { room: "room42", from: "abcdefgh", name: "Zoë ✓", invite: "inv1", sdp: undefined });
  const rep = parseReply(["2", "inv1", "guest123", name, ...sdp].join("~"));
  assert.equal(rep.id, "guest123");
  assert.equal(rep.name, "Zoë ✓");
  for (const junk of ["", "hello", "1~a~b", ["2", "inv1", "g", name, ...sdp].join("~")]) assert.equal(parseInvite(junk), null);
  assert.equal(parseReply(["1", "room42", "abcdefgh", name, "inv1", ...sdp].join("~")), null);
});

// ── Room logic with fake peers ──
// ids must look like real ones (4-16 lowercase letters/digits)
const A = "anna", B = "benn", C = "cara", D = "dave", E = "evee";

function fakePeer(id, neighbors = []) {
  const sent = [];
  return {
    id, open: true, last: Date.now(), born: Date.now(), timeout: 15000, neighbors: new Set(neighbors), sent,
    ctl: { readyState: "open", send: (m) => sent.push(JSON.parse(m)) }, pc: { close() {} },
  };
}

function makeRoom(id, state) {
  const room = new Room({ id, name: id });
  clearInterval(room._tickTimer);
  room._connectVia = () => {}; // no WebRTC here
  room.roomId = "room1";
  room.state = state && structuredClone(state);
  return room;
}

const baseState = () => ({
  room: "room1", term: 1, ver: 5, leader: A, nextSeq: 3, kicked: [],
  members: {
    [A]: { name: "Anna", seq: 0, online: true, left: false },
    [B]: { name: "Ben", seq: 1, online: true, left: false },
    [C]: { name: "Cara", seq: 2, online: true, left: false },
  },
});

test("state copies: higher term wins, then the more senior leader, then the newer version", () => {
  const room = makeRoom(B, baseState());
  const s = baseState();
  assert.equal(room._better({ ...s, ver: 6 }, s), true);
  assert.equal(room._better({ ...s, ver: 4 }, s), false);
  assert.equal(room._better({ ...s, term: 2, ver: 1, leader: C }, s), true);
  assert.equal(room._better({ ...s, leader: C, ver: 99 }, s), false, "same term: senior leader wins");
  assert.equal(room._better({ ...s, room: "other", term: 9 }, s), false);
  room.destroy();
});

test("adopting state: stale copies are ignored, being kicked is reported", () => {
  const room = makeRoom(C, baseState());
  room._adopt({ ...baseState(), ver: 1 }, A);
  assert.equal(room.state.ver, 5);
  room._adopt({ ...baseState(), ver: 6 }, A);
  assert.equal(room.state.ver, 6);
  let rejected = null;
  room.addEventListener("rejected", (e) => { rejected = e.detail.why; });
  room._adopt({ ...baseState(), ver: 9, kicked: [C] }, A);
  assert.equal(rejected, "kicked");
  room.destroy();
});

test("only the leader may send state; a member can't crown itself while sending as itself", () => {
  const room = makeRoom(C, baseState());
  room._adopt({ ...baseState(), ver: 50 }, B);
  assert.equal(room.state.ver, 5, "B is not the leader");
  room._adopt({ ...baseState(), ver: 50, term: 2, leader: B }, B);
  assert.equal(room.state.leader, B, "a takeover is sent by the new leader itself (failover)");
  room._adopt({ ...baseState(), ver: 60, term: 3, leader: C }, A);
  assert.equal(room.state.leader, B, "A is no longer leader and can't speak for C");
  room.destroy();
});

test("a newcomer accepts the room from its inviter, even if the inviter isn't leading", () => {
  const room = makeRoom(D, null);
  room._adopt(baseState(), B, true);
  assert.equal(room.state.leader, A);
  room.destroy();
});

test("hostile state copies are cleaned: bad ids dropped, wrong types coerced, junk rejected", () => {
  const s = baseState();
  s.members.__proto__ = { name: "x" };
  s.members["<img src=x>"] = { name: "y" };
  s.members[B].name = { toString: 1 };
  s.members[C].seq = "0";
  s.term = "9";
  s.kicked = [C, "__proto__", 5];
  const clean = cleanState(JSON.parse(JSON.stringify(s).replace('"x"}', '"x"},"__proto__":{"name":"p"}')));
  assert.deepEqual(Object.keys(clean.members).sort(), [A, B, C].sort());
  assert.equal(typeof clean.members[B].name, "string");
  assert.equal(clean.members[C].seq, 1e9);
  assert.equal(clean.term, 0);
  assert.deepEqual(clean.kicked, [C]);
  assert.equal(({}).name, undefined, "no prototype pollution");
  assert.equal(cleanState({ ...baseState(), leader: "nobody" }), null);
  assert.equal(cleanState("junk"), null);
});

test("the leader merges facts and gives newcomers the next join number", () => {
  const room = makeRoom(A, baseState());
  room._mergeFacts(D, { name: "Dee", ready: true });
  assert.deepEqual(room.state.members[D], { name: "Dee", seq: 3, online: true, left: false });
  assert.equal(room.state.nextSeq, 4);
  assert.equal(room.state.ver, 6);
  room._mergeFacts(D, { name: "Dee" });
  assert.equal(room.state.ver, 6, "no change, no new version");
  room.state.kicked.push(E);
  room._mergeFacts(E, { name: "Eve" });
  assert.equal(room.state.members[E], undefined, "kicked players stay out");
  room.destroy();
});

test("when the leader disappears, the next member by join order takes over", () => {
  const b = makeRoom(B, baseState());
  const c = makeRoom(C, baseState());
  b.peers.set(C, fakePeer(C)); // A is gone for both
  c.peers.set(B, fakePeer(B));
  b._tick();
  c._tick();
  assert.equal(b.state.leader, B);
  assert.equal(b.state.term, 2);
  assert.equal(b.state.members[A].online, false);
  assert.equal(c.state.leader, A, "C waits: B is more senior and still around");
  c._adopt(b.state, B);
  assert.equal(c.state.leader, B);
  b.destroy(); c.destroy();
});

test("a member cut off from everyone does not crown itself", () => {
  const c = makeRoom(C, baseState());
  c.state.members[B].left = true; // only A (gone) and C remain
  c._tick();
  assert.equal(c.state.leader, A);
  // but when everyone else really left, the last one leads the room
  c.state.members[A].left = true;
  c._tick();
  assert.equal(c.state.leader, C);
  c.destroy();
});

test("leaving as leader hands the room to the next member first", () => {
  const a = makeRoom(A, baseState());
  const pb = fakePeer(B), pc = fakePeer(C);
  a.peers.set(B, pb);
  a.peers.set(C, pc);
  a.leave();
  const handover = pb.sent.find((m) => m.k === "state");
  assert.equal(handover.d.leader, B);
  assert.equal(handover.d.term, 2);
  assert.equal(handover.d.members[A].left, true);
  assert.ok(pb.sent.some((m) => m.k === "bye"));
  // and B accepts it, although A sends it
  const b = makeRoom(B, baseState());
  b._adopt(handover.d, A);
  assert.equal(b.state.leader, B);
  a.destroy(); b.destroy();
});

test("routing: nothing is forwarded in a full mesh, missing links are bridged once", () => {
  // B hears a broadcast from A; C is connected to A too, so B stays quiet
  const b = makeRoom(B, baseState());
  const pa = fakePeer(A, [B, C]), pc = fakePeer(C, [A, B]);
  b.peers.set(A, pa);
  b.peers.set(C, pc);
  const got = [];
  b.addEventListener("message", (e) => got.push(e.detail));
  const env = { k: "app", mid: "m1", o: A, h: 0, d: { hi: 1 } };
  b._route(env, A);
  assert.deepEqual(got, [{ from: A, msg: { hi: 1 } }]);
  assert.equal(pc.sent.length, 0);
  b._route({ ...env, h: 1 }, C);
  assert.equal(got.length, 1, "duplicates are dropped");

  // A and C lost their link: B passes A's message on to C
  pa.neighbors = new Set([B]);
  b._route({ ...env, mid: "m2" }, A);
  assert.equal(pc.sent.length, 1);
  assert.equal(pc.sent[0].h, 1);

  // targeted messages go straight to the target only
  const pd = fakePeer(D, [B]);
  b.peers.set(D, pd);
  b._route({ k: "app", mid: "m3", o: A, h: 0, to: D, d: {} }, A);
  assert.equal(pd.sent.length, 1);
  assert.equal(pc.sent.length, 1);
  b.destroy();
});

test("routing: forged senders are dropped", () => {
  const b = makeRoom(B, baseState());
  b.peers.set(A, fakePeer(A, [B, C]));
  b.peers.set(C, fakePeer(C, [A, B]));
  const got = [];
  b.addEventListener("message", (e) => got.push(e.detail));
  b._route({ k: "app", mid: "f1", o: A, h: 0, d: { guess: "x" } }, C);
  assert.equal(got.length, 0, "C claims a first-hand message from A");
  b._route({ k: "app", mid: "f2", o: A, h: 1, d: { guess: "x" } }, C);
  assert.equal(got.length, 0, "C claims to relay A, but A talks to us directly");
  b._route({ k: "app", mid: "f3", o: "__proto__", h: 1, d: {} }, C);
  b._route({ k: "app", mid: "f4", o: D, h: 1, to: "<x>", d: {} }, C);
  assert.equal(got.length, 0, "malformed ids");
  b._route({ k: "app", mid: "f5", o: D, h: 1, d: { ok: 1 } }, C);
  assert.deepEqual(got, [{ from: D, msg: { ok: 1 } }], "a real relay from someone we can't reach directly");
  b.destroy();
});
