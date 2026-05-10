# ChatGPT Portal Browser Bridge

Expose sanitized authenticated browser snapshots to ChatGPT without sharing cookies, passwords, localStorage, or a raw reverse proxy into a private app.

The bridge runs locally on `127.0.0.1`, controls a dedicated Chrome profile through Chrome DevTools Protocol, and publishes only a tokenized HTML portal. For temporary public access, expose that local portal with Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:7777
```

Do not commit or share the generated session token, crawl database, Chrome profile, logs, or any `trycloudflare.com` URL after the session is over.

## Install

```bash
npm install
```

## Run

Set an allowlist for the private origin or path you want this session to inspect:

```bash
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com npm run dev
```

Optional settings:

```bash
CHATGPT_PORTAL_TARGET=https://intranet.example.com/dashboard
CHATGPT_PORTAL_PORT=7777
CHATGPT_PORTAL_CDP_PORT=9222
CHATGPT_PORTAL_TOKEN_TTL_MINUTES=240
CHATGPT_PORTAL_NO_LAUNCH=1
```

The server prints a URL like:

```text
http://127.0.0.1:7777/s/<session-token>/view
```

Expose the local server temporarily:

```bash
cloudflared tunnel --url http://127.0.0.1:7777
```

Give ChatGPT the `trycloudflare.com` URL with the same `/s/<session-token>/view` path.

## Routes

```text
GET /health
GET /s/:token/view
GET /s/:token/page?url=<absolute-or-relative-url>
GET /s/:token/open?url=<absolute-or-relative-url>
GET /s/:token/links?url=<absolute-or-relative-url>
GET /s/:token/crawl?scope=<url-or-path>&limit=<number>
GET /s/:token/search?q=<query>
GET /s/:token/click?id=<element-id>
POST /shutdown?token=<session-token>
```

## Safety Model

- No raw reverse proxy into the authenticated site.
- Snapshots strip cookies, bearer tokens, auth headers, localStorage, sessionStorage, hidden inputs, CSRF fields, password fields, scripts, and raw forms.
- URL actions are restricted to the configured allowlist.
- Clicks are limited to navigation-like links, tabs, menus, pagination, and disclosure controls.
- Destructive/action controls are blocked by default, including delete, remove, send, invite, approve, charge, refund, reset, publish, save, submit, upload, and download.
- Local crawl/search state stays under `.local/`, which is ignored by git.

## Test

```bash
npm run check
```

This runs TypeScript compilation and Node tests for redaction, URL policy, click classification, and HTML escaping.
