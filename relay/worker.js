// Minigames signaling relay: a Cloudflare Worker with one Durable Object per "box".
//
// A box holds at most two short sealed texts, "offer" (the invite code) and "answer" (the
// reply code), and passes each one to the other phone over a WebSocket. Texts are encrypted
// on the phones with a key the relay never sees (it lives in the link's #fragment), boxes
// delete themselves after 15 minutes, and nothing else is stored or logged. Game data and
// photos never come here: phones talk to each other directly once connected.
//
// Protocol: WebSocket to /c/<20-char box name>
//   client -> relay  {"put": "offer" | "answer", "data": "<sealed text>"}
//   relay  -> client {"slot": "offer" | "answer", "data": "..."}  (stored ones right after connecting)
//   relay  -> client {"ready": true}  once accepted (a refused socket is closed before this)
//   close codes: 4003 origin not allowed, 4004 bad box name, 4010 box expired, 4029 box busy, 1009 too big
import { DurableObject } from "cloudflare:workers";

const TTL_MS = 15 * 60 * 1000;
const MAX_TEXT = 8 * 1024;
const MAX_SOCKETS = 4;
const SLOTS = ["offer", "answer"];

// ALLOWED_ORIGINS: comma separated; an entry ending in * matches as a prefix. Empty = any origin.
function allowed(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true;
  if (!origin) return false;
  return list.some((p) => (p.endsWith("*") ? origin.startsWith(p.slice(0, -1)) : origin === p));
}

// Accept the socket only to close it with a reason the page can show.
function refuse(code, reason) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.headers.get("Upgrade") !== "websocket") {
      const ok = url.pathname === "/";
      return new Response(ok ? "minigames relay: ok\n" : "not found\n", {
        status: ok ? 200 : 404,
        headers: { "content-type": "text/plain", "access-control-allow-origin": "*" },
      });
    }
    if (!allowed(req.headers.get("Origin"), env)) return refuse(4003, "origin not allowed");
    const m = url.pathname.match(/^\/c\/([a-z0-9]{20})$/);
    if (!m) return refuse(4004, "bad box");
    return env.BOX.get(env.BOX.idFromName(m[1])).fetch(req);
  },
};

export class Box extends DurableObject {
  async fetch() {
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return refuse(4029, "busy");
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server); // hibernation API: no cost while idle
    const stored = await this.ctx.storage.get(SLOTS);
    for (const [slot, data] of stored) server.send(JSON.stringify({ slot, data }));
    server.send(JSON.stringify({ ready: true }));
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + TTL_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > MAX_TEXT) return ws.close(1009, "too big");
    let m;
    try { m = JSON.parse(msg); } catch { return; }
    if (!SLOTS.includes(m?.put) || typeof m.data !== "string") return;
    await this.ctx.storage.put(m.put, m.data);
    const out = JSON.stringify({ slot: m.put, data: m.data });
    for (const other of this.ctx.getWebSockets()) if (other !== ws) { try { other.send(out); } catch {} }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000, "bye"); } catch {}
  }

  async alarm() {
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(4010, "expired"); } catch {} }
    await this.ctx.storage.deleteAll();
  }
}
