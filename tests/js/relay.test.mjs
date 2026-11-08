// The relay client (site/shared/relay.js) against a local stand-in of relay/worker.js,
// and the site settings helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Mailbox, newTicket, ticketCode, parseTicket, seal, unseal, testRelay, RelayError } from "../../site/shared/relay.js";
import { cleanRelayUrl, connectMode } from "../../site/shared/settings.js";
import { startMockRelay } from "./relay-mock.mjs";

test("tickets: the link carries box and key, the relay URL only when it isn't the default", () => {
  const t = newTicket("https://relay.example");
  assert.match(t.box, /^[a-z2-9]{20}$/);
  assert.equal(t.key.length, 22);
  const short = ticketCode(t, "https://relay.example");
  assert.equal(short.split(".").length, 2);
  assert.deepEqual(parseTicket(short, "https://relay.example"), t);
  const long = ticketCode(t, "https://other.example");
  assert.deepEqual(parseTicket(long, "https://other.example"), t);
  assert.equal(parseTicket("nope"), null);
  assert.equal(parseTicket(`${t.box}.${t.key}.${Buffer.from("http://evil.example").toString("base64url")}`), null, "plain http only for localhost");
});

test("sealing: round trip, and a wrong key is a clear error", async () => {
  const a = newTicket("x"), b = newTicket("x");
  const sealed = await seal(a.key, "1~room~code");
  assert.ok(!sealed.includes("room"));
  assert.equal(await unseal(a.key, sealed), "1~room~code");
  await assert.rejects(unseal(b.key, sealed), (e) => e instanceof RelayError && e.code === "bad-key");
});

test("settings: relay URLs must be https (or local), privacy turns the relay off", () => {
  assert.equal(cleanRelayUrl("https://r.example/"), "https://r.example");
  assert.equal(cleanRelayUrl("http://r.example"), "");
  assert.equal(cleanRelayUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(cleanRelayUrl("not a url"), "");
  assert.equal(connectMode({ privacy: false, relay: "https://r.example" }), "relay");
  assert.equal(connectMode({ privacy: true, relay: "https://r.example" }), "direct");
  assert.equal(connectMode({ privacy: false, relay: "" }), "direct");
});

test("offer and answer travel through a box, sealed", async () => {
  const relay = await startMockRelay();
  try {
    const t = newTicket(relay.url);
    const host = new Mailbox(t);
    await host.connect();
    await host.put("offer", "the invite code");
    const guest = new Mailbox(parseTicket(ticketCode(t, relay.url), relay.url));
    await guest.connect();
    assert.equal(await guest.wait("offer", 2000), "the invite code");
    const stored = relay.boxes.get(t.box).slots.get("offer");
    assert.ok(stored && !stored.includes("invite"), "the relay only sees ciphertext");
    const answer = host.wait("answer", 2000);
    await guest.put("answer", "the reply code");
    assert.equal(await answer, "the reply code");
    host.close(); guest.close();
    assert.ok((await testRelay(relay.url)).ms >= 0);
  } finally { await relay.close(); }
});

test("relay failures come with reasons", async () => {
  await assert.rejects(new Mailbox(newTicket("")).connect(), (e) => e.code === "not-configured");
  await assert.rejects(new Mailbox(newTicket("http://127.0.0.1:9")).connect(1500), (e) => e.code === "unreachable");
  const relay = await startMockRelay();
  try {
    const t = newTicket(relay.url);
    const guest = new Mailbox(t);
    await guest.connect();
    await assert.rejects(guest.wait("offer", 200, "no-offer"), (e) => e.code === "no-offer" && /wasn't found/.test(e.message));
    const waiting = guest.wait("offer", 2000);
    relay.expire(t.box);
    await assert.rejects(waiting, (e) => e.code === "expired");
    const socks = [];
    for (let i = 0; i < 4; i++) { const m = new Mailbox(t); await m.connect(); socks.push(m); }
    await assert.rejects(new Mailbox(t).connect(), (e) => e.code === "busy");
    socks.forEach((m) => m.close());
  } finally { await relay.close(); }
  const strict = await startMockRelay(0, { allowedOrigins: ["https://games.example"] });
  try {
    await assert.rejects(new Mailbox(newTicket(strict.url)).connect(), (e) => e.code === "refused");
  } finally { await strict.close(); }
});
