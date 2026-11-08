// A local stand-in for relay/worker.js (same protocol), on Node's standard library only:
// minimal WebSocket server (RFC 6455 text frames, close codes). Used by relay.test.mjs and
// for trying one-scan joining locally:  node tests/js/relay-mock.mjs 8787
//   then Settings → Relay server: http://127.0.0.1:8787
import http from "node:http";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const SLOTS = ["offer", "answer"];

function frame(opcode, payload) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
    : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
  return Buffer.concat([head, payload]);
}

class Sock {
  constructor(socket) { this.socket = socket; this.buf = Buffer.alloc(0); this.onText = () => {}; this.onClose = () => {}; this.closed = false; }
  send(text) { if (!this.closed) this.socket.write(frame(1, Buffer.from(text))); }
  close(code = 1000, reason = "") {
    if (this.closed) return;
    this.closed = true;
    const p = Buffer.alloc(2 + Buffer.byteLength(reason)); p.writeUInt16BE(code); p.write(reason, 2);
    this.socket.end(frame(8, p));
    this.onClose();
  }
  feed(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 2) {
      const op = this.buf[0] & 15, masked = this.buf[1] & 128;
      let len = this.buf[1] & 127, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      const mask = masked ? this.buf.subarray(off, off + 4) : null;
      const data = Buffer.from(this.buf.subarray(off + (masked ? 4 : 0), need));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(need);
      if (op === 1) this.onText(data.toString());
      else if (op === 8) this.close(1000, "bye");
      else if (op === 9) this.socket.write(frame(10, data));
    }
  }
}

export function startMockRelay(port = 0, { allowedOrigins = [] } = {}) {
  const boxes = new Map(); // box -> { slots: Map, socks: Set }
  const server = http.createServer((req, res) => { res.writeHead(200, { "access-control-allow-origin": "*" }); res.end("minigames relay: ok (mock)\n"); });
  server.on("upgrade", (req, socket) => {
    const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const ws = new Sock(socket);
    socket.on("data", (c) => ws.feed(c));
    socket.on("error", () => {});
    socket.on("close", () => { ws.closed = true; ws.onClose(); });
    if (allowedOrigins.length && !allowedOrigins.includes(req.headers.origin)) return ws.close(4003, "origin not allowed");
    const m = req.url.match(/^\/c\/([a-z0-9]{20})$/);
    if (!m) return ws.close(4004, "bad box");
    const box = boxes.get(m[1]) || { slots: new Map(), socks: new Set() };
    boxes.set(m[1], box);
    if (box.socks.size >= 4) return ws.close(4029, "busy");
    box.socks.add(ws);
    ws.onClose = () => box.socks.delete(ws);
    for (const [slot, data] of box.slots) ws.send(JSON.stringify({ slot, data }));
    ws.send(JSON.stringify({ ready: true }));
    ws.onText = (text) => {
      if (text.length > 8192) return ws.close(1009, "too big");
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      if (!SLOTS.includes(msg?.put) || typeof msg.data !== "string") return;
      box.slots.set(msg.put, msg.data);
      for (const o of box.socks) if (o !== ws) o.send(JSON.stringify({ slot: msg.put, data: msg.data }));
    };
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({
    url: `http://127.0.0.1:${server.address().port}`,
    boxes,
    expire: (box) => { for (const s of boxes.get(box)?.socks || []) s.close(4010, "expired"); boxes.delete(box); },
    close: () => new Promise((r) => { for (const b of boxes.values()) for (const s of b.socks) s.close(1001); server.close(r); }),
  })));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await startMockRelay(Number(process.argv[2]) || 8787);
  console.log(`mock relay at ${r.url}`);
}
