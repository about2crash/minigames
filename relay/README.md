# Minigames relay (optional)

A tiny Cloudflare Worker that passes the invite and reply codes between two phones, so a
newcomer joins a multiplayer game with **one scan** instead of two. It is optional: without it,
or with "Full privacy" on in the site's Settings, games use the two-scan direct exchange.

What it sees: sealed (AES-GCM encrypted) codes and the phones' IP addresses. The key is only
in the invite link's `#fragment`, which browsers never send to a server. Boxes delete
themselves after 15 minutes. Game data and photos never pass through it.

## Deploy (free plan is enough)

```sh
cd relay
npx wrangler login          # once, opens the browser
npx wrangler deploy         # prints https://minigames-relay.<account>.workers.dev
```

Then put that URL into `DEFAULT_RELAY` in `site/shared/settings.js`, commit and push.
(To try it first without a commit: open the site's Settings page, paste the URL under
"Relay server", and press "Test relay".)

If you serve the site from another address, add it to `ALLOWED_ORIGINS` in `wrangler.toml`
and deploy again. Custom domain (e.g. `relay.about2crash.com`): Cloudflare dashboard →
Workers → minigames-relay → Settings → Domains & Routes.

## Protocol

WebSocket `/c/<box>` (20 characters, `a-z2-9`). Send `{"put":"offer"|"answer","data":"…"}`;
receive `{"slot":…, "data":…}` for stored and new texts, and `{"ready":true}` once the
socket is accepted (refused sockets close before that). Close codes: 4003 origin not
allowed, 4004 bad box name, 4010 expired, 4029 busy, 1009 too big. `site/shared/relay.js`
is the client; `tests/js/relay.test.mjs` runs it against a local stand-in of this worker.
