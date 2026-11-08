// Site-wide settings (the Settings page next to the hub), kept in this browser only.
//
//   privacy   true: multiplayer games connect phones only directly; joining needs two scans
//             (invite one way, reply the other). false: invites and replies travel through the
//             signaling relay (relay/, a Cloudflare Worker), so a newcomer scans just once.
//   nerdStats true: multiplayer games show a "Stats for nerds" panel (links, paths, throughput).
//   relay     custom relay URL; empty = DEFAULT_RELAY.
//   theme     "system" | "light" | "dark" (applied on every page by shared/pwa.js).

/** The relay this site uses unless the Settings page says otherwise. Set it after deploying relay/
 *  (see relay/README.md), e.g. "https://minigames-relay.<account>.workers.dev". Empty = no relay. */
export const DEFAULT_RELAY = "";

const KEY = "minigames:settings";

export function getSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  return {
    privacy: s.privacy === true,
    nerdStats: s.nerdStats === true,
    relay: typeof s.relay === "string" ? s.relay : "",
    theme: s.theme === "light" || s.theme === "dark" ? s.theme : "system",
  };
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  if ("theme" in patch) window.dispatchEvent(new Event("minigames:theme")); // pwa.js repaints this page
  return next;
}

/** "https://host[/path]" without a trailing slash, or "" if the text isn't a usable https URL. */
export function cleanRelayUrl(text) {
  try {
    const u = new URL(String(text || "").trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return "";
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/** The relay URL in use ("" when none is set up). */
export const relayUrl = (s = getSettings()) => cleanRelayUrl(s.relay) || cleanRelayUrl(DEFAULT_RELAY);

/** "relay" (one scan) or "direct" (two scans): direct when privacy is on or no relay exists. */
export const connectMode = (s = getSettings()) => (!s.privacy && relayUrl(s) ? "relay" : "direct");
