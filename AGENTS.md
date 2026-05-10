# AGENTS.md

Instructions for coding agents working on ChatGPT Portal Browser Bridge.

## What This Project Does

This project exposes an already-authenticated browser page to ChatGPT without giving ChatGPT the raw private site, cookies, passwords, localStorage, or a reverse-proxy session.

The architecture is:

```text
Dedicated local Chrome profile
        -> Chrome DevTools Protocol
Local bridge on 127.0.0.1
        -> sanitized HTML snapshots and navigation-only actions
Cloudflare quick tunnel
        -> temporary trycloudflare.com URL
ChatGPT
```

The live bridge is local-only. The public `trycloudflare.com` URL is temporary and must be treated as a session secret.

## How To Expose A Page To ChatGPT

1. Install dependencies:

```bash
npm install
```

2. Start share mode with a strict allowlist for the private site origin or path:

```bash
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com npm run share
```

3. Log in inside the dedicated Chrome window opened or attached by the bridge.

4. Wait for the CLI to print:

```text
Share this URL with ChatGPT:
https://...trycloudflare.com/s/SESSION_TOKEN/view
```

5. Give ChatGPT only that full printed URL.

6. Stop access by pressing `Ctrl+C` in the share-mode terminal. This stops `cloudflared` and the local bridge.

Manual mode is only for debugging:

```bash
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com npm run dev
cloudflared tunnel --url http://127.0.0.1:7777
```

In normal usage, prefer `npm run share` because it prints the final public tokenized URL and avoids forcing the user to combine the tunnel host and session path manually.

## Safety Rules

- Do not build or suggest a raw reverse proxy into the authenticated site.
- Do not commit, hard-code in docs, persist, or casually share real session tokens, `trycloudflare.com` URLs, cookies, localStorage, bearer tokens, CSRF values, or crawl databases.
- Keep local state under ignored paths such as `.local/`, `.chrome-profile/`, `dist/`, and `node_modules/`.
- Keep the bridge bound to `127.0.0.1`.
- Keep `CHATGPT_PORTAL_ALLOWLIST` central to all examples and tests involving private pages.
- Do not add form filling, writes, uploads, downloads, or destructive actions unless the safety model is explicitly redesigned first.
- Do not add Cloudflare Worker, named tunnel, Cloudflare Access, MCP, or ChatGPT App behavior unless requested. V1 uses a temporary quick tunnel.

## How The Bridge Works

- `src/server.ts` starts the local tokenized HTML portal and exposes `/s/:token/...` routes.
- `src/share.ts` starts `npm run dev`, starts `cloudflared tunnel --url <local-origin>`, parses the generated `trycloudflare.com` origin, and prints the final `/s/<token>/view` URL.
- `src/browser.ts` launches or attaches to Chrome over CDP and uses a dedicated Chrome profile by default.
- `src/snapshot.ts` extracts visible text, headings, links, buttons, and form labels from the browser page.
- `src/sanitizer.ts` redacts secrets, classifies safe navigation actions, and blocks dangerous controls.
- `src/storage.ts` stores sanitized snapshots in local SQLite/FTS for `/search` and `/crawl`.
- `src/render.ts` renders plain HTML pages that ChatGPT can read and follow.

Supported routes:

```text
GET /health
GET /s/:token/view
GET /s/:token/page?url=<absolute-or-relative-url>
GET /s/:token/open?url=<absolute-or-relative-url>
GET /s/:token/links?url=<absolute-or-relative-url>
GET /s/:token/crawl?scope=<url-or-path>&limit=<number>
GET /s/:token/search?q=<query>
GET /s/:token/click?id=<element-id>
POST /shutdown?token=SESSION_TOKEN
```

`/click` is only for navigation-like controls: links, tabs, menus, pagination, and disclosure controls. It must continue blocking labels such as delete, remove, send, invite, approve, charge, refund, reset, publish, save, submit, upload, and download.

## Development Workflow

Run checks before publishing changes:

```bash
npm run check
```

This runs TypeScript compilation and Node tests.

When changing sharing behavior, update and run `tests/share.test.ts`.

When changing redaction, URL policy, or click classification, update and run the sanitizer or URL policy tests.

When changing public instructions, keep `README.md`, `index.html`, and this `AGENTS.md` aligned.

Before committing or pushing, scan for accidental private data. Also search explicitly for the current operator's local username or home-directory prefix before publishing:

```bash
rg -n -S 'sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH|PRIVATE) KEY|ghp_|github_pat_|gho_|eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}' .
```

Expected false positives may include test fixtures and CSS class names. Do not ignore real credentials or real local paths.
