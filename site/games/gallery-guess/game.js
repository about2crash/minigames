// Gallery Guess page logic. Rules are in logic.js, networking in ../../shared/mesh.js.
import { Room, randomId, parseInvite, parseReply } from "../../shared/mesh.js";
import { qrSvg } from "../../shared/qr.js";
import { scanImage } from "../../shared/qr-scan.js";
import * as G from "./logic.js";

const $ = (id) => document.getElementById(id);
const BASE = location.origin + location.pathname;
const KEY = "minigames:gallery-guess:";
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(KEY + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch {} },
};
const session = {
  get() { try { return JSON.parse(sessionStorage.getItem(KEY + "session")) || {}; } catch { return {}; } },
  set(v) { try { sessionStorage.setItem(KEY + "session", JSON.stringify(v)); } catch {} },
};
const CROSS = `<svg viewBox="0 0 10 10" width="12" height="12" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// in-page scanning works wherever there is a camera (https only); BarcodeDetector is used when present
const canScan = !!navigator.mediaDevices?.getUserMedia;
const bc = "BroadcastChannel" in window ? new BroadcastChannel("minigames-gallery-guess") : null;

const room = new Room();
room.mergeFacts = G.mergeFacts;
room.cleanGame = G.cleanGame;

// Local, per-phone data
const photos = new Map();   // pid -> { url, owner, game }  (own photos too)
let picks = [];             // my chosen photos: { buf, url }
let myPids = [];            // ids of my photos once I'm ready
const guesses = new Map();  // "game:round" -> Map(id -> { pick, ms })
let joining = null;         // { inviter, reply } while the inviter still has to scan our reply
let invite = null;          // { id, code, at } the invite currently on screen
let handoff = null;         // reply link opened in its own tab
let prev = null;            // previous state, for "X joined" style messages
let lostSince = 0;

// ── Identity: one seat per tab; a refresh or a re-invite takes the same seat back ──
function seatFor(roomId) {
  const s = session.get();
  if (s.room === roomId && s.id) return s.id;
  const seats = store.get("seats", {});
  const old = seats[roomId];
  if (old && Date.now() - old.beat > 6000) return old.id; // that tab is gone: keep its score
  return randomId();
}
setInterval(() => {
  if (!room.roomId || !room.state) return;
  const seats = store.get("seats", {});
  for (const [r, v] of Object.entries(seats)) if (Date.now() - v.beat > 864e5) delete seats[r];
  seats[room.roomId] = { id: room.id, beat: Date.now() };
  store.set("seats", seats);
}, 2000);

// ── Small helpers ──
let toastTimer;
function toast(text) {
  $("toast").textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").textContent = ""; }, 3200);
}
const nameOf = (id) => room.state?.members[id]?.name || "someone";
const linkFor = (kind, code) => `${BASE}#${kind}=${code}`;
function codeFrom(text, kind) {
  const t = String(text || "").trim();
  const m = t.match(new RegExp(`#${kind}=(.+)$`));
  if (!m) return t;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
async function shareOrCopy(url, title) {
  if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
  await copy(url);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Link copied"); }
  catch {
    const i = document.createElement("textarea");
    i.value = text; document.body.append(i); i.select();
    try { document.execCommand("copy"); toast("Link copied"); } catch { toast("Copy failed: select the text by hand"); }
    i.remove();
  }
}
function guessesFor(game, round) {
  const k = `${game}:${round}`;
  if (!guesses.has(k)) guesses.set(k, new Map());
  return guesses.get(k);
}
const haveCount = () => [...photos.values()].filter((p) => p.game === room.state?.game).length;
const othersAround = () => !!room.state && Object.entries(room.state.members).some(([id, m]) => id !== room.id && !m.left);

// ── Keep the screen on while in a room ──
let wake = null;
async function keepAwake() {
  const want = !!room.state && document.visibilityState === "visible";
  try {
    if (want && !wake && navigator.wakeLock) {
      wake = await navigator.wakeLock.request("screen");
      wake.addEventListener("release", () => { wake = null; });
    } else if (!want && wake) { await wake.release(); wake = null; }
  } catch {}
}
document.addEventListener("visibilitychange", keepAwake);
window.addEventListener("beforeunload", (e) => { if (room.state && othersAround() && room.alivePeers.length) e.preventDefault(); });

// ── Room events ──
room.addEventListener("state", (e) => onState(e.detail));
room.addEventListener("peers", (e) => {
  if (e.detail.up) sendMyPhotos(e.detail.up);
  render();
});
room.addEventListener("message", (e) => onMessage(e.detail.from, e.detail.msg));
room.addEventListener("bulk", (e) => onBulk(e.detail));
room.addEventListener("rejected", (e) => {
  resetLocal();
  room.leave();
  render();
  $("homeMsg").textContent = e.detail.why === "kicked" ? "You were removed from that room." : "Couldn't join: that invite is for another room.";
});

function onState(detail) {
  const s = room.state;
  if (!s) return;
  if (joining) {
    joining = null;
    toast(`You're in! Welcome, ${room.me.name}.`);
  }
  session.set({ room: s.room, id: room.id });
  // a new game (play again): drop old photos, pick new ones
  if (room.me.game !== s.game) {
    for (const [pid, p] of photos) if (p.game !== s.game) { if (p.owner !== room.id) URL.revokeObjectURL(p.url); photos.delete(pid); }
    myPids = [];
    room.setFacts({ game: s.game, ready: false, photos: 0, have: 0 });
  }
  if (prev && prev.room === s.room) {
    for (const [id, m] of Object.entries(s.members)) {
      if (id === room.id) continue;
      const was = prev.members[id];
      if (!was && !m.left) {
        toast(`${m.name} joined`);
        $("inviteMsg").textContent = `${m.name} is in. The next player can scan the new code.`;
      }
      else if (was && !was.left && m.left) toast(`${m.name} left`);
      else if (was && was.online && !m.online && !m.left) toast(`${m.name} lost connection`);
    }
    if (detail.leaderChanged && detail.prevLeader && detail.prevLeader !== s.leader) {
      toast(s.leader === room.id ? "You're leading the room now" : `${nameOf(s.leader)} is leading the room now`);
    }
  }
  prev = structuredClone(s);
  keepAwake();
  render();
}

function onMessage(from, msg) {
  const s = room.state;
  if (!s || !msg) return;
  if (msg.t === "guess" && msg.game === s.game && Number.isInteger(msg.round) && msg.round >= 0 && msg.round < G.MAX_ROUNDS
    && G.isId(msg.pick) && Number.isFinite(msg.ms)) {
    const g = guessesFor(msg.game, msg.round);
    if (!g.has(from)) g.set(from, { pick: msg.pick, ms: msg.ms });
    render();
  } else if (msg.t === "unphoto") {
    for (const [pid, p] of photos) if (p.owner === from && p.game === msg.game) { URL.revokeObjectURL(p.url); photos.delete(pid); }
    room.setFacts({ have: haveCount() });
  }
}

function onBulk({ from, meta, data }) {
  const s = room.state;
  // a photo can overtake the room state on a fresh connection; old games are cleaned up in onState
  if (meta.t !== "photo" || !G.isId(meta.pid) || !Number.isInteger(meta.game) || (s && meta.game !== s.game) || photos.has(meta.pid)) return;
  // nobody gets to flood us with more photos than the game allows
  if ([...photos.values()].filter((p) => p.owner === from && p.game === meta.game).length >= G.MAX_PHOTOS) return;
  photos.set(meta.pid, { url: URL.createObjectURL(data), owner: from, game: meta.game });
  room.setFacts({ have: haveCount() });
  render();
}

function sendMyPhotos(to) {
  const s = room.state;
  if (!s || !room.me.ready || !myPids.length) return;
  myPids.forEach((pid, i) => { if (picks[i]) room.sendBulk(to, { t: "photo", pid, game: s.game }, picks[i].buf); });
}

// ── Leader: drives rounds; any member can take this over at any time ──
let timer = { key: null, end: 0 };
setInterval(() => {
  const s = room.state;
  if (!room.isLeader || !s) { timer.key = null; return; }
  const key = `${s.phase}:${s.game}:${s.round}`;
  if (key !== timer.key) {
    timer = { key, end: Date.now() + (s.phase === "round" ? G.ROUND_MS + 800 : G.REVEAL_MS) };
  }
  if (s.phase === "round") {
    const g = guessesFor(s.game, s.round);
    if (G.guessers(s).every((id) => g.has(id)) || Date.now() >= timer.end) {
      const owner = photos.get(s.order[s.round])?.owner ?? null;
      room.update((st) => G.resolveRound(st, owner, Object.fromEntries(g)));
    }
  } else if (s.phase === "reveal" && Date.now() >= timer.end) {
    room.update(G.nextRound);
  }
}, 200);

// ── Actions ──
function myName() {
  const n = $("nameInput").value.trim().slice(0, 20);
  if (!n) { $("homeMsg").textContent = "Type your name first."; $("nameInput").focus(); return null; }
  store.set("name", n);
  return n;
}

function resetLocal() {
  for (const p of photos.values()) if (p.owner !== room.id) URL.revokeObjectURL(p.url);
  photos.clear();
  guesses.clear();
  myPids = [];
  invite = null;
  joining = null;
  prev = null;
  session.set({});
}

function createRoom() {
  const name = myName();
  if (!name) return;
  resetLocal();
  room.id = randomId();
  room.me = { name };
  room.create(G.initialState());
  room.setFacts({ game: room.state.game, ready: false, photos: 0, have: 0 });
  render();
}

async function joinRoom(code) {
  const inv = parseInvite(code);
  if (!inv) { $("homeMsg").textContent = "That doesn't look like an invite link."; return; }
  const name = myName();
  if (!name) return;
  const keepPicks = room.roomId === inv.room;
  if (!keepPicks) { resetLocal(); picks = []; }
  room.id = seatFor(inv.room);
  room.me = { name };
  joining = { inviter: inv.name || "the host", reply: null };
  history.replaceState(null, "", BASE);
  render();
  try {
    const reply = await room.join(code);
    if (!joining) return;
    joining.reply = linkFor("r", reply);
    joining.at = Date.now();
    render();
  } catch (e) {
    joining = null;
    render();
    $("homeMsg").textContent = `Couldn't prepare the connection: ${e.message}`;
  }
}

function leaveRoom() {
  room.leave();
  resetLocal();
  $("homeMsg").textContent = "";
  render();
}

async function ensureInvite(force = false) {
  if (!room.state) return;
  if (!force && invite && Date.now() - invite.at < 90e3) return;
  const mine = invite = { pending: true, at: Date.now() };
  $("inviteQr").innerHTML = `<span class="hint">Making an invite…</span>`;
  try {
    const { id, code } = await room.createInvite();
    if (invite !== mine) return;
    invite = { id, code, at: Date.now() };
    $("inviteQr").innerHTML = qrSvg(linkFor("j", code));
    $("inviteQr").dataset.link = linkFor("j", code);
  } catch (e) {
    invite = null;
    $("inviteQr").innerHTML = `<span class="hint">Couldn't make an invite: ${esc(e.message)}</span>`;
  }
}

async function takeReply(text) {
  const code = codeFrom(text, "r");
  const r = parseReply(code);
  if (!r) throw new Error("That doesn't look like a reply code.");
  const name = await room.acceptReply(code);
  $("inviteMsg").textContent = `Connecting ${name}…`;
  if (invite?.id === r.invite) ensureInvite(true); // that code is used up: show a fresh one
  return name;
}

async function submitReply(text) {
  try { await takeReply(text); $("replyInput").value = ""; }
  catch (e) { $("inviteMsg").textContent = e.message; }
}

// Reply links opened in another tab of this browser arrive here.
function onHandoff(code) {
  const r = parseReply(code);
  if (!r || !room.hasInvite(r.invite)) return;
  bc?.postMessage({ ack: r.invite, name: r.name });
  store.set("ack", { invite: r.invite, name: r.name, at: Date.now() });
  submitReply(code);
}
bc?.addEventListener("message", (e) => { if (e.data?.reply) onHandoff(e.data.reply); });
window.addEventListener("storage", (e) => {
  if (e.key === KEY + "reply" && e.newValue) { try { onHandoff(JSON.parse(e.newValue).code); } catch {} }
});

function startHandoff(code) {
  const r = parseReply(code);
  handoff = { code, done: false };
  history.replaceState(null, "", BASE);
  render();
  if (!r) {
    $("handoffTitle").textContent = "That link is broken";
    $("handoffMsg").textContent = "Ask for a new reply code.";
    return;
  }
  const done = (inviteId) => {
    if (inviteId !== r.invite || handoff.done) return;
    handoff.done = true;
    $("handoffTitle").textContent = `${r.name} is joining`;
    $("handoffMsg").textContent = "Done! Switch back to your Gallery Guess tab. You can close this one.";
    $("handoffManual").hidden = true;
  };
  bc?.addEventListener("message", (e) => done(e.data?.ack));
  window.addEventListener("storage", (e) => { if (e.key === KEY + "ack" && e.newValue) { try { done(JSON.parse(e.newValue).invite); } catch {} } });
  bc?.postMessage({ reply: code });
  store.set("reply", { code, at: Date.now() });
  setTimeout(() => {
    if (handoff.done) return;
    $("handoffTitle").textContent = `Reply from ${r.name}`;
    $("handoffMsg").textContent = "No open game found in this browser. Copy this link and paste it into your game under \"Their reply\".";
    $("handoffCode").value = linkFor("r", code);
    $("handoffManual").hidden = false;
  }, 2500);
}

// Camera scanning: the browser's own QR reader where it has one (Chrome on Android, macOS),
// otherwise our reader (shared/qr-scan.js) on downscaled video frames.
async function scanCode() {
  const dlg = $("scanDialog"), video = $("scanVideo");
  let stream;
  dlg.showModal();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream;
    await video.play();
    let det = null;
    try { if ("BarcodeDetector" in window) det = new BarcodeDetector({ formats: ["qr_code"] }); } catch {}
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    while (dlg.open) {
      let text = null;
      if (det) text = (await det.detect(video).catch(() => []))[0]?.rawValue || null;
      if (!text && video.videoWidth) {
        const k = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * k);
        canvas.height = Math.round(video.videoHeight * k);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        text = scanImage(frame.data, frame.width, frame.height);
      }
      if (text) { navigator.vibrate?.(60); return text; }
      await new Promise((r) => setTimeout(r, 120));
    }
    return null;
  } catch (e) {
    toast(`Camera unavailable: ${e.message}`);
    return null;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    if (dlg.open) dlg.close();
  }
}

// ── Photos ──
async function compress(file) {
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const k = Math.min(1, 1280 / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.78));
  return { buf: await blob.arrayBuffer(), url: URL.createObjectURL(blob) };
}

let slotTarget = 0;
$("fileInput").addEventListener("change", async (e) => {
  const files = [...e.target.files].slice(0, G.MAX_PHOTOS);
  e.target.value = "";
  let i = slotTarget;
  for (const f of files) {
    if (i >= G.MAX_PHOTOS) break;
    try {
      const p = await compress(f);
      if (picks[i]) URL.revokeObjectURL(picks[i].url);
      picks[i] = p;
    } catch { toast(`Couldn't read ${f.name}`); }
    i++;
    while (i < G.MAX_PHOTOS && picks[i]) i++;
  }
  picks = picks.filter(Boolean);
  render();
});

function setReady(on) {
  const s = room.state;
  if (!s || s.phase !== "lobby") return;
  if (on) {
    if (!picks.length) { toast("Pick at least one photo first"); return; }
    myPids = picks.map(() => randomId(10));
    myPids.forEach((pid, i) => photos.set(pid, { url: picks[i].url, owner: room.id, game: s.game }));
    room.me.ready = true;
    for (const id of room.alivePeers) sendMyPhotos(id);
  } else {
    for (const pid of myPids) photos.delete(pid);
    myPids = [];
    room.broadcast({ t: "unphoto", game: s.game });
  }
  room.setFacts({ ready: on, photos: on ? picks.length : 0, have: haveCount() });
  render();
}

function guess(pick) {
  const s = room.state;
  if (!s || s.phase !== "round") return;
  const key = `${s.game}:${s.round}`;
  const g = guessesFor(s.game, s.round);
  if (g.has(room.id) || shown.key !== key) return;
  const ms = Math.round(performance.now() - shown.at);
  if (ms > G.ROUND_MS) return;
  g.set(room.id, { pick, ms });
  room.broadcast({ t: "guess", game: s.game, round: s.round, pick, ms });
  render();
}

// ── Rendering ──
const SECTIONS = ["home", "reply", "handoff", "lobby", "round", "reveal", "over"];
let shown = { key: null, at: 0 };   // when this round's photo appeared on this screen
let built = { options: null, reveal: null, over: null };

function show(id) {
  for (const s of SECTIONS) {
    const el = $(s);
    const on = s === id;
    if (el.hidden === on) el.hidden = !on;
  }
}

function render() {
  const s = room.state;
  $("roomInfo").hidden = !s;
  if (handoff) return show("handoff");
  if (!s) {
    if (joining) return renderReply();
    renderHome();
    return show("home");
  }
  renderStatus();
  if (s.phase === "lobby") renderLobby();
  else if (s.phase === "round") renderRound();
  else if (s.phase === "reveal") renderReveal();
  else renderOver();
  show(s.phase);
  placeInvitePanel();
}

function renderHome() {
  const inv = parseInvite(codeFrom(location.hash, "j"));
  $("joinBox").hidden = !inv;
  $("createBox").hidden = !!inv;
  if (inv) $("inviterName").textContent = inv.name || "Someone";
  $("inviteScan").hidden = !canScan;
}

function renderReply() {
  show("reply");
  $("replyTo").textContent = joining.inviter;
  if (joining.reply && $("replyQr").dataset.for !== joining.reply) {
    $("replyQr").dataset.for = joining.reply;
    $("replyQr").innerHTML = qrSvg(joining.reply);
    $("replyQr").dataset.link = joining.reply;
  } else if (!joining.reply) {
    $("replyQr").dataset.for = "";
    $("replyQr").innerHTML = `<span class="hint">Preparing your reply…</span>`;
  }
  const slow = joining.at && Date.now() - joining.at > 45e3;
  $("replyMsg").textContent = slow
    ? `Still waiting. Make sure ${joining.inviter} scans this code. If it never connects, your networks may block direct connections: try the same Wi-Fi.`
    : `Waiting for ${joining.inviter} to scan…`;
}
setInterval(() => { if (joining && !room.state) renderReply(); }, 5000);

function renderStatus() {
  const n = room.alivePeers.length;
  const others = othersAround();
  $("netDot").classList.toggle("off", others && !n);
  $("netText").textContent = !others ? "Only you so far" : `Connected to ${n} ${n === 1 ? "player" : "players"}`;
  if (others && !n) { lostSince ||= Date.now(); } else lostSince = 0;
  $("lost").hidden = !(lostSince && Date.now() - lostSince > 8000);
  $("inviteOpen").hidden = room.state.phase === "lobby";
}
setInterval(() => { if (room.state) renderStatus(); }, 2000);

function renderLobby() {
  const s = room.state;
  const st = G.startStatus(s);
  $("roomCode").textContent = `Room ${s.room}`;
  const rows = Object.entries(s.members).filter(([, m]) => !m.left).sort((a, b) => a[1].seq - b[1].seq);
  $("members").innerHTML = rows.map(([id, m]) => {
    const tags = [];
    if (id === s.leader) tags.push(`<span class="chip lead">leading</span>`);
    if (!m.online) tags.push(`<span class="chip">offline</span>`);
    else if (m.ready) {
      tags.push(`<span class="chip ok">ready · ${esc(m.photos)} ${m.photos === 1 ? "photo" : "photos"}</span>`);
      if ((m.have || 0) < st.total) tags.push(`<span class="chip">receiving ${esc(m.have || 0)}/${esc(st.total)}</span>`);
    } else tags.push(`<span class="chip">picking photos</span>`);
    const kick = room.isLeader && id !== room.id ? `<button class="kick" type="button" data-kick="${esc(id)}" aria-label="Remove ${esc(m.name)}">${CROSS}</button>` : "";
    return `<li class="${m.online ? "" : "off"}"><span class="who">${esc(m.name)}${id === room.id ? " <span class=\"hint\">(you)</span>" : ""}</span><span class="tags">${tags.join("")}</span>${kick}</li>`;
  }).join("");

  const ready = !!room.me.ready;
  $("photosPanel").classList.toggle("locked", ready);
  const sig = `${ready}|${picks.map((p) => p.url).join()}`;
  if ($("slots").dataset.sig !== sig) {
    $("slots").dataset.sig = sig;
    $("slots").innerHTML = Array.from({ length: G.MAX_PHOTOS }, (_, i) => picks[i]
      ? `<div class="slot filled"><button class="pick" type="button" data-slot="${i}" aria-label="Replace photo ${i + 1}"><img src="${picks[i].url}" alt=""></button>`
        + `<button class="x" type="button" data-remove="${i}" aria-label="Remove photo ${i + 1}">${CROSS}</button></div>`
      : `<div class="slot"><button class="pick" type="button" data-slot="${i}" aria-label="Add photo">+</button></div>`).join("");
  }
  $("readyBtn").textContent = ready ? "Change photos" : picks.length ? `I'm ready (${picks.length} ${picks.length === 1 ? "photo" : "photos"})` : "I'm ready";
  $("readyBtn").classList.toggle("primary", !ready);
  $("readyBtn").disabled = !ready && !picks.length;

  $("startBtn").hidden = !room.isLeader;
  $("startBtn").disabled = !st.ok;
  $("startMsg").textContent = room.isLeader
    ? (st.ok ? `${st.ready.length} players, ${Math.min(st.total, G.MAX_ROUNDS)} rounds.` : st.reason)
    : `Waiting for ${room.leaderName} to start the game.${st.ok ? "" : ` ${st.reason}.`}`;
}

function renderRound() {
  const s = room.state;
  const key = `${s.game}:${s.round}`;
  const pid = s.order[s.round];
  const photo = photos.get(pid);
  $("roundLabel").textContent = `Round ${s.round + 1} of ${s.order.length}`;
  if (built.options !== key) {
    built.options = key;
    shown = { key: null, at: 0 };
    $("options").innerHTML = s.players.map((id, i) =>
      `<button type="button" data-pick="${esc(id)}">${i < 9 ? `<span class="hint" style="opacity:.6">${i + 1}</span> ` : ""}${esc(nameOf(id))}${id === room.id ? " (you)" : ""}</button>`).join("");
    $("roundPhoto").innerHTML = "";
    $("roundPhoto").dataset.pid = "";
  }
  if (photo && $("roundPhoto").dataset.pid !== pid) {
    $("roundPhoto").dataset.pid = pid;
    const img = new Image();
    img.alt = "Whose photo is this?";
    img.src = photo.url;
    img.decode().catch(() => {}).then(() => {
      if (built.options !== key) return;
      $("roundPhoto").replaceChildren(img);
      shown = { key, at: performance.now() };
      render(); // enables the answer buttons
      tickTimer();
    });
  } else if (!photo) {
    $("roundPhoto").innerHTML = `<span class="hint">Photo still on its way…</span>`;
  }
  const g = guessesFor(s.game, s.round);
  const mine = g.get(room.id);
  for (const b of $("options").querySelectorAll("button")) {
    b.disabled = !!mine || !shown.key;
    b.classList.toggle("picked", mine?.pick === b.dataset.pick);
  }
  $("guessed").innerHTML = G.guessers(s).map((id) => `<span class="chip ${g.has(id) ? "done" : ""}">${g.has(id) ? "✓ " : ""}${esc(nameOf(id))}</span>`).join("");
}

function tickTimer() {
  const s = room.state;
  if (!s || s.phase !== "round" || !shown.key || shown.key !== `${s.game}:${s.round}`) return;
  const left = Math.max(0, 1 - (performance.now() - shown.at) / G.ROUND_MS);
  $("timerBar").style.transform = `scaleX(${left})`;
  if (left === 0) {
    for (const b of $("options").querySelectorAll("button")) b.disabled = true;
    return;
  }
  requestAnimationFrame(tickTimer);
}

function renderReveal() {
  const s = room.state, last = s.last;
  if (!last) return;
  const key = `${s.game}:${s.round}`;
  $("revealLabel").textContent = `Round ${s.round + 1} of ${s.order.length}`;
  if (built.reveal !== key) {
    built.reveal = key;
    const p = photos.get(last.pid);
    $("revealPhoto").innerHTML = p ? `<img src="${p.url}" alt="">` : "";
  }
  $("revealOwner").textContent = last.owner ? `${nameOf(last.owner)}'s photo` : "Nobody knows!";
  const me = last.guesses[room.id];
  const v = $("revealVerdict");
  v.className = "verdict";
  if (!last.owner) v.textContent = "The owner dropped out before their photo arrived. No points.";
  else if (last.owner === room.id && !me) v.textContent = "Your photo! Did they get it?";
  else if (!me) v.textContent = "No guess this time.";
  else if (me.pts) { v.textContent = `Right! +${me.pts} in ${(me.ms / 1000).toFixed(1)} s`; v.classList.add("good"); }
  else v.textContent = `Not quite: you picked ${nameOf(me.pick)}.`;
  $("revealBoard").innerHTML = G.standings(s).map((r) => {
    const g = last.guesses[r.id];
    const pick = g ? (g.pts ? `<span class="plus">+${esc(g.pts)}</span>` : `picked ${esc(nameOf(g.pick))}`) : "—";
    return `<li><span class="place">${esc(r.place)}.</span><span>${esc(r.name)}</span><span class="pick">${pick}</span><span class="score">${esc(r.score)}</span></li>`;
  }).join("");
}

function renderOver() {
  const s = room.state;
  const rows = G.standings(s);
  const top = rows.filter((r) => r.place === 1);
  $("winner").textContent = top.map((r) => r.name).join(" & ") || "—";
  $("finalBoard").innerHTML = rows.map((r) =>
    `<li><span class="place">${esc(r.place)}.</span><span>${esc(r.name)}${r.id === room.id ? " (you)" : ""}</span><span></span><span class="score">${esc(r.score)}</span></li>`).join("");
  $("againBtn").hidden = !room.isLeader;
  $("againMsg").textContent = room.isLeader ? "Everyone taps Ready again for the next game (and can swap photos)." : `${room.leaderName} can start another game.`;
  const key = `${s.game}`;
  if (built.over !== key) {
    built.over = key;
    $("gallery").innerHTML = s.order.map((pid) => {
      const p = photos.get(pid);
      return p ? `<figure><button type="button" data-view="${esc(pid)}"><img src="${p.url}" alt="Photo by ${esc(nameOf(p.owner))}"></button><figcaption>${esc(nameOf(p.owner))}</figcaption></figure>` : "";
    }).join("");
  }
}

// The invite panel sits in the lobby; during a game it opens as a dialog.
let inviteSlotFor = null;
function placeInvitePanel() {
  const panel = $("invitePanel");
  const inLobby = room.state?.phase === "lobby";
  const lobbyKey = `${room.state?.room}:${room.state?.game}`;
  if (inLobby && inviteSlotFor !== lobbyKey) {
    inviteSlotFor = lobbyKey;
    $("inviteSlot").open = room.isLeader;
  }
  const host = inLobby ? $("inviteSlot") : $("inviteDialog");
  if (panel.parentElement !== host) host.append(panel);
  $("replyScan").hidden = !canScan;
  if (inviteVisible()) ensureInvite();
}
const inviteVisible = () => !!room.state && (room.state.phase === "lobby" ? $("inviteSlot").open : $("inviteDialog").open);
setInterval(() => { if (inviteVisible()) ensureInvite(); }, 10e3);
$("inviteSlot").addEventListener("toggle", () => { if (inviteVisible()) ensureInvite(); });

// ── Wiring ──
$("nameInput").value = store.get("name", "");
$("createBtn").addEventListener("click", createRoom);
$("joinBtn").addEventListener("click", () => joinRoom(codeFrom(location.hash, "j")));
$("nameInput").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (!$("joinBox").hidden) $("joinBtn").click(); else createRoom();
});
$("inviteGo").addEventListener("click", () => joinRoom(codeFrom($("inviteInput").value, "j")));
$("inviteInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("inviteGo").click(); });
$("inviteScan").addEventListener("click", async () => { const v = await scanCode(); if (v) joinRoom(codeFrom(v, "j")); });
$("replyShare").addEventListener("click", () => joining?.reply && shareOrCopy(joining.reply, "Gallery Guess reply"));
$("replyCopy").addEventListener("click", () => joining?.reply && copy(joining.reply));
$("replyCancel").addEventListener("click", () => { room.leave(); resetLocal(); render(); });
$("handoffCopy").addEventListener("click", () => copy($("handoffCode").value));
$("inviteShare").addEventListener("click", () => invite?.code && shareOrCopy(linkFor("j", invite.code), "Join my Gallery Guess game"));
$("inviteCopy").addEventListener("click", () => invite?.code && copy(linkFor("j", invite.code)));
$("inviteNew").addEventListener("click", () => ensureInvite(true));
$("replyGo").addEventListener("click", () => submitReply($("replyInput").value));
$("replyInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("replyGo").click(); });
$("replyScan").addEventListener("click", async () => { const v = await scanCode(); if (v) submitReply(v); });
$("inviteOpen").addEventListener("click", () => { $("inviteDialog").showModal(); placeInvitePanel(); });
$("leaveBtn").addEventListener("click", leaveRoom);
$("readyBtn").addEventListener("click", () => setReady(!room.me.ready));
$("startBtn").addEventListener("click", () => {
  const s = room.state;
  const list = [...photos.entries()].filter(([, p]) => p.game === s.game).map(([pid, p]) => ({ pid, owner: p.owner }));
  room.update((st) => G.startGame(st, list));
});
$("againBtn").addEventListener("click", () => room.update(G.newGame));
for (const d of document.querySelectorAll("dialog")) {
  d.addEventListener("click", (e) => {
    const r = d.getBoundingClientRect();
    const outside = e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    if (outside || e.target.closest("[data-close]")) d.close();
  });
}
document.addEventListener("click", (e) => {
  const t = e.target;
  const rm = t.closest("[data-remove]");
  if (rm) {
    const i = +rm.dataset.remove;
    URL.revokeObjectURL(picks[i]?.url);
    picks.splice(i, 1);
    return render();
  }
  const slot = t.closest("[data-slot]");
  if (slot) { slotTarget = Math.min(+slot.dataset.slot, picks.length); return $("fileInput").click(); }
  const pick = t.closest("[data-pick]");
  if (pick) return guess(pick.dataset.pick);
  const kick = t.closest("[data-kick]");
  if (kick) { room.kick(kick.dataset.kick); return; }
  const view = t.closest("[data-view]");
  if (view) {
    const p = photos.get(view.dataset.view);
    if (!p) return;
    $("viewerImg").src = p.url;
    $("viewerCap").textContent = `${nameOf(p.owner)}'s photo`;
    $("viewer").showModal();
  }
});
document.addEventListener("keydown", (e) => {
  if (room.state?.phase !== "round" || e.target.closest("input, textarea")) return;
  const n = parseInt(e.key, 10);
  const id = room.state.players[n - 1];
  if (id) guess(id);
});
// Replies pasted into this tab's address bar
window.addEventListener("hashchange", () => {
  const h = location.hash;
  if (h.startsWith("#r=") && room.state) { submitReply(h); history.replaceState(null, "", BASE); }
  else if (h.startsWith("#j=") && !room.state) render();
});

// ── Start ──
if (location.hash.startsWith("#r=")) startHandoff(codeFrom(location.hash, "r"));
else render();
