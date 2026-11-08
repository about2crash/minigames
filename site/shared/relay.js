// Client for the optional signaling relay (relay/worker.js, a Cloudflare Worker).
//
// Without it, joining a room takes two scans: the newcomer scans the invite, the inviter scans
// the newcomer's reply. With it, both codes travel through a short-lived "box" on the relay, so
// the newcomer scans once and is in.
//
// Privacy: the link carries a random box name and a random AES key in its #fragment, which
// browsers never send to any server. Codes are sealed with that key before they leave the phone,
// so the relay only ever sees ciphertext (plus, like any server, the phones' IP addresses).
// Game data and photos never pass through it: they go phone to phone as before.
//
//   const t = newTicket(url);                        // inviter
//   const box = new Mailbox(t); await box.connect(); await box.put("offer", code);
//   const reply = await box.wait("answer");          // resolves when the newcomer answers
//   link: `${page}#c=${ticketCode(t)}`
//
//   const t = parseTicket(code, defaultUrl);         // newcomer, from the link
//   const box = new Mailbox(t); await box.connect(); const code = await box.wait("offer", 10e3);

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));

export const CONNECT_MS = 8000;
export const SLOTS = ["offer", "answer"];

// ── Errors with a reason a person can act on ─────────────────────────────
const REASONS = {
  "not-configured": "No relay is set up for this site, so joining needs two scans (invite and reply).",
  insecure: "The relay needs a secure page (https). Open the game over https, or use two scans.",
  offline: "This phone is offline. Connect to Wi-Fi or mobile data and try again.",
  unreachable: "Couldn't reach the relay server. The network may block it (some school, office or hotel Wi-Fi does), or it is down. Try mobile data, or use a private invite (two scans).",
  refused: "The relay refused this page (it only serves the Minigames site). If you host your own copy, add your address to ALLOWED_ORIGINS in relay/wrangler.toml.",
  busy: "Too many phones opened this invite at once. Ask for a new invite.",
  expired: "This invite has expired or was already used. Ask for a new one (invites last about 15 minutes).",
  "no-offer": "The invite wasn't found on the relay. It may have expired, or the inviter closed the game. Ask for a new invite.",
  "bad-key": "This invite link is damaged (the key doesn't match). Scan the code again, or ask for a new one.",
  closed: "The connection to the relay was closed.",
};
export class RelayError extends Error {
  constructor(code, detail = "") {
    super(REASONS[code] || detail || code);
    this.code = code;
    this.detail = detail;
  }
}
export const relayExplain = (code) => REASONS[code] || "";

// ── Tickets: box name + key (+ the relay URL when it isn't this site's default) ──
export function newTicket(url) {
  return { url, box: Array.from(rnd(20), (b) => ALPHABET[b % 32]).join(""), key: b64u(rnd(16)) };
}
export function ticketCode(t, defaultUrl = "") {
  const parts = [t.box, t.key];
  if (t.url && t.url !== defaultUrl) parts.push(b64u(new TextEncoder().encode(t.url)));
  return parts.join(".");
}
export function parseTicket(code, defaultUrl = "") {
  const m = /^([a-z0-9]{20})\.([A-Za-z0-9_-]{22})(?:\.([A-Za-z0-9_-]{1,400}))?$/.exec(String(code || "").trim());
  if (!m) return null;
  let url = defaultUrl;
  if (m[3]) {
    try { url = new TextDecoder().decode(unb64u(m[3])); } catch { return null; }
    if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) return null;
  }
  return { box: m[1], key: m[2], url };
}

// ── Sealing: AES-GCM with the ticket's key ───────────────────────────────
async function aesKey(key) {
  if (!globalThis.crypto?.subtle) throw new RelayError("insecure");
  return crypto.subtle.importKey("raw", unb64u(key), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(key, text) {
  const iv = rnd(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(key), new TextEncoder().encode(text));
  return `${b64u(iv)}.${b64u(new Uint8Array(ct))}`;
}
export async function unseal(key, sealed) {
  try {
    const [iv, ct] = String(sealed).split(".");
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv) }, await aesKey(key), unb64u(ct));
    return new TextDecoder().decode(pt);
  } catch (e) {
    if (e instanceof RelayError) throw e;
    throw new RelayError("bad-key");
  }
}

// ── One box on the relay ─────────────────────────────────────────────────
export class Mailbox extends EventTarget {
  constructor(ticket) {
    super();
    this.ticket = ticket;
    this.status = "new"; // new | connecting | open | closed | error
    this.error = null;
    this.slots = new Map(); // slot -> sealed text seen on the relay
    this.sentBytes = 0;
    this.recvBytes = 0;
    this.openedAt = 0;
    this._ws = null;
  }

  connect(timeout = CONNECT_MS) {
    if (!this.ticket.url) return Promise.reject(this._fail(new RelayError("not-configured")));
    if (!globalThis.crypto?.subtle) return Promise.reject(this._fail(new RelayError("insecure")));
    if (globalThis.navigator?.onLine === false) return Promise.reject(this._fail(new RelayError("offline")));
    this.status = "connecting";
    const url = `${this.ticket.url.replace(/^http/, "ws")}/c/${this.ticket.box}`;
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return reject(this._fail(new RelayError("unreachable", e.message))); }
      this._ws = ws;
      const t = setTimeout(() => { reject(this._fail(new RelayError("unreachable", "timeout"))); try { ws.close(); } catch {} }, timeout);
      // connected only once the relay says so: a refused socket opens and is closed right away
      ws.onmessage = (e) => {
        this.recvBytes += String(e.data).length;
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m?.ready === true && this.status === "connecting") {
          clearTimeout(t); this.status = "open"; this.openedAt = Date.now(); resolve(this);
          return;
        }
        if (SLOTS.includes(m?.slot) && typeof m.data === "string") {
          this.slots.set(m.slot, m.data);
          this.dispatchEvent(new CustomEvent("slot", { detail: m.slot }));
        }
      };
      ws.onerror = () => { clearTimeout(t); if (this.status === "connecting") reject(this._fail(new RelayError("unreachable"))); };
      ws.onclose = (e) => {
        clearTimeout(t);
        const why = { 4003: "refused", 4029: "busy", 4010: "expired", 4004: "no-offer" }[e.code];
        if (this.status === "connecting") reject(this._fail(new RelayError(why || "unreachable", `closed ${e.code}`)));
        else if (this.status === "open") this._fail(new RelayError(why || "closed", `closed ${e.code}`));
        this.dispatchEvent(new CustomEvent("close", { detail: this.error }));
      };
    });
  }

  async put(slot, text) {
    if (this.status !== "open") throw this.error || new RelayError("closed");
    const msg = JSON.stringify({ put: slot, data: await seal(this.ticket.key, text) });
    this.sentBytes += msg.length;
    this._ws.send(msg);
  }

  /** The other side's code for `slot`, once it is there (rejects on timeout or a closed box). */
  wait(slot, timeout = 15 * 60e3, missing = "expired") {
    return new Promise((resolve, reject) => {
      const done = (fn, v) => { clearTimeout(t); this.removeEventListener("slot", onSlot); this.removeEventListener("close", onClose); fn(v); };
      const onSlot = (e) => { if (e.detail === slot) unseal(this.ticket.key, this.slots.get(slot)).then((v) => done(resolve, v), (err) => done(reject, err)); };
      const onClose = () => done(reject, this.error || new RelayError("closed"));
      const t = setTimeout(() => done(reject, new RelayError(missing)), timeout);
      this.addEventListener("slot", onSlot);
      this.addEventListener("close", onClose);
      if (this.slots.has(slot)) onSlot({ detail: slot });
      else if (this.status !== "open") onClose();
    });
  }

  close() {
    if (this.status === "open" || this.status === "connecting") this.status = "closed";
    try { this._ws?.close(1000); } catch {}
  }

  _fail(err) {
    if (this.status !== "closed") { this.status = "error"; this.error = err; }
    return err;
  }
}

/** Round trip through a fresh box: { ms } or throws a RelayError. For the Settings page. */
export async function testRelay(url) {
  const t = newTicket(url);
  const a = new Mailbox(t), b = new Mailbox(t);
  const t0 = performance.now();
  try {
    await a.connect();
    await a.put("offer", "ping");
    await b.connect();
    if ((await b.wait("offer", CONNECT_MS, "no-offer")) !== "ping") throw new RelayError("bad-key");
    return { ms: Math.round(performance.now() - t0) };
  } finally {
    a.close(); b.close();
  }
}
