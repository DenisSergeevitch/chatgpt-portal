# ChatGPT Portal Browser Bridge

Expose sanitized authenticated browser snapshots to ChatGPT without sharing cookies, passwords, localStorage, or a raw reverse proxy into a private app. The tool is made for GPT Pro-series browsing and coding agents that need to inspect private pages through a local bridge with controlled navigation and form-wizard actions.

The bridge runs locally on `127.0.0.1`, controls a dedicated Chrome profile through Chrome DevTools Protocol, and publishes only a tokenized HTML portal. For temporary public access, use share mode:

```bash
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com npm run share
```

Do not commit or share the generated session token, crawl database, Chrome profile, logs, or any `trycloudflare.com` URL after the session is over.

## Install

```bash
npm install
```

## Run

Set an allowlist for the private origin or path you want this session to inspect, then run share mode:

```bash
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com npm run share
```

Optional settings:

```bash
CHATGPT_PORTAL_TARGET=https://intranet.example.com/dashboard
CHATGPT_PORTAL_PORT=7777
CHATGPT_PORTAL_CDP_PORT=9222
CHATGPT_PORTAL_ALLOW_SUBDOMAINS=1
CHATGPT_PORTAL_UPLOAD_DIR=.local/uploads
CHATGPT_PORTAL_TOKEN_TTL_MINUTES=240
CHATGPT_PORTAL_NO_LAUNCH=1
```

Allowlisted hosts include their subdomains by default. For example, allowing `https://example.com` also allows `https://app.example.com`. Set `CHATGPT_PORTAL_ALLOW_SUBDOMAINS=0` when a session must stay on exact hostnames only.

Share mode starts the local bridge, starts `cloudflared`, and prints the final URL to give ChatGPT:

```text
Share this URL with ChatGPT:
https://<random-name>.trycloudflare.com/s/<session-token>/view
```

## ChatGPT Handoff Prompt

Replace `<tokenized-portal-url>` with the exact URL printed by share mode:

```text
Use this ChatGPT Portal link to inspect the browser page I opened:

<tokenized-portal-url>

Instructions:
- Start by opening the link and reading the current `/view` snapshot.
- Use only the portal's rendered links and actions, such as `/page`, `/open`, `/links`, `/search`, `/crawl`, safe `/click` navigation controls, `/select`, `/fill`, `/files`, and `/upload`.
- You may select visible radio/checkbox/select controls, fill non-secret text fields and textareas, upload a file only after it has been prepared in the portal upload staging folder, and click navigation-like Continue/Next controls when the user asks.
- Do not ask for credentials, cookies, localStorage, sessionStorage, bearer tokens, CSRF values, browser profile files, or raw request headers.
- Do not enter credentials or secrets into forms. Do not click final submit/send/save/publish/approve/delete/charge/refund/invite controls or other destructive/state-changing controls.
- If you need broader exploration, ask before using `/crawl` with a large limit.
- Summarize what you can see from sanitized snapshots and say when something is blocked by the portal safety model.
```

Manual mode is still available if you want to run `cloudflared` yourself:

```bash
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com npm run dev
cloudflared tunnel --url http://127.0.0.1:7777
```

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
GET /s/:token/select?id=<control-id>[&value=<option-value>]
GET /s/:token/fill?id=<control-id>&value=<text>
GET /s/:token/files
GET /s/:token/upload?id=<control-id>&file=<staged-filename>
POST /shutdown?token=SESSION_TOKEN
```

## Safety Model

- No raw reverse proxy into the authenticated site.
- Snapshots strip cookies, bearer tokens, auth headers, localStorage, sessionStorage, hidden inputs, CSRF fields, password fields, scripts, and raw forms.
- URL actions are restricted to the configured allowlist. Allowlisted hosts include subdomains by default; set `CHATGPT_PORTAL_ALLOW_SUBDOMAINS=0` for exact-host-only sessions.
- Clicks are limited to navigation-like links, tabs, menus, pagination, and disclosure controls.
- Controlled form actions can select radio/checkbox/select controls, fill non-secret text inputs and textareas, and set file inputs from the upload staging folder.
- File uploads reject absolute paths and only accept filenames inside `CHATGPT_PORTAL_UPLOAD_DIR` (`.local/uploads` by default). Prepare the file there before using `/upload`.
- Destructive/action controls are blocked by default, including delete, remove, send, invite, approve, charge, refund, reset, publish, save, submit, and download.
- Local crawl/search state stays under `.local/`, which is ignored by git.

## Test

```bash
npm run check
```

This runs TypeScript compilation and Node tests for redaction, URL policy, action classification, controlled form rendering, and HTML escaping.
