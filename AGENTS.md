# AGENTS.md

Best practices for coding agents working on ChatGPT Portal Browser Bridge.

## Product Boundary

ChatGPT Portal exposes an already-authenticated browser page to ChatGPT through sanitized, tokenized snapshots. It must not expose raw credentials, cookies, localStorage, hidden form fields, bearer tokens, CSRF values, browser profile files, or a full reverse-proxy session.

The architecture is intentionally small:

```text
Dedicated local Chrome profile
        -> Chrome DevTools Protocol
Local bridge on 127.0.0.1
        -> sanitized HTML snapshots and navigation-only actions
Cloudflare quick tunnel
        -> temporary tokenized public URL
ChatGPT
```

Treat every live tunnel URL and every `/s/<token>/...` URL as a session secret. They may appear in local terminal output while testing, but they must not be committed, added to docs, pasted into issues, or preserved in fixtures.

## Standard Operator Flow

Use generic placeholders in docs and examples. Never replace these examples with a real private origin, live token, private path, or credential.

```bash
npm install
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com npm run share
```

For a known initial page, set both the allowlist and target:

```bash
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com \
CHATGPT_PORTAL_TARGET=https://intranet.example.com/ \
npm run share
```

Normal usage should prefer `npm run share`. It starts the local bridge, starts `cloudflared`, parses the generated tunnel host, and prints the final tokenized public URL. Do not force users to manually combine a tunnel host with a token path unless you are debugging `src/share.ts`.

The user logs in only inside the dedicated Chrome profile opened by the bridge. Do not ask for passwords, cookies, exported storage, bearer tokens, or copied request headers.

Stop access by stopping share mode with `Ctrl+C`, closing the dedicated Chrome profile, or using the tokenized shutdown route. If a tunnel was started in a terminal multiplexer during testing, stop that session before reporting the test as finished.

## ChatGPT Handoff Message

After each successful share-mode run, post a short message the operator can paste into ChatGPT. Include the live tokenized URL only in the chat response, never in committed files, docs, fixtures, tests, or logs.

Do not include the private target URL, local filesystem paths, user names, machine names, or credentials in the handoff message unless the operator explicitly asks for that exact detail in the current chat. The tokenized portal URL is enough.

Use this template:

```text
Use this ChatGPT Portal link to inspect the browser page I opened:

<tokenized-portal-url>

Instructions:
- Start by opening the link and reading the current `/view` snapshot.
- Use only the portal's rendered links and actions, such as `/page`, `/open`, `/links`, `/search`, `/crawl`, and safe `/click` navigation controls.
- Do not ask for credentials, cookies, localStorage, sessionStorage, bearer tokens, CSRF values, browser profile files, or raw request headers.
- Do not submit forms, upload files, download files, save changes, publish, approve, delete, charge, refund, send, invite, or perform other state-changing actions.
- If you need broader exploration, ask before using `/crawl` with a large limit.
- Summarize what you can see from sanitized snapshots and say when something is blocked by the portal safety model.
```

## Security Invariants

- Keep the bridge bound to `127.0.0.1`.
- Keep `CHATGPT_PORTAL_ALLOWLIST` central to private-page usage, tests, and examples.
- Allowlisted hosts include their subdomains by default. Use `CHATGPT_PORTAL_ALLOW_SUBDOMAINS=0` for exact-host-only sessions.
- Keep Chrome profile data, crawl databases, logs, screenshots, and tunnel output under ignored local-only paths.
- Keep routes plain HTML that ChatGPT can read without client-side JavaScript.
- Keep `/click` restricted to navigation-like controls: links, tabs, pagination, menus, and disclosures.
- Keep destructive or state-changing labels blocked, including delete, remove, send, invite, approve, charge, refund, reset, publish, save, submit, upload, and download.
- Do not add forms, writes, uploads, downloads, raw request replay, cookie export, localStorage export, or arbitrary JavaScript execution without redesigning the safety model first.
- Do not add a Cloudflare Worker front door, named tunnel, Cloudflare Access, MCP server, ChatGPT App, or persistent public service unless explicitly requested.

## Implementation Map

- `src/server.ts` starts the local tokenized HTML portal and owns `/s/:token/...` routing.
- `src/share.ts` starts `npm run dev`, starts `cloudflared tunnel --url <local-origin>`, parses the generated tunnel origin, and prints the final `/s/<token>/view` URL.
- `src/browser.ts` launches or attaches to Chrome over CDP and uses a dedicated Chrome profile by default.
- `src/snapshot.ts` extracts visible text, headings, links, buttons, form labels, tables, and page metadata.
- `src/sanitizer.ts` redacts secrets, classifies safe navigation actions, and blocks dangerous controls.
- `src/storage.ts` stores sanitized snapshots in local SQLite/FTS for `/search` and `/crawl`.
- `src/render.ts` renders the plain HTML pages consumed by ChatGPT.

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
POST /shutdown?token=<session-token>
```

## Testing Guidance

Run the full project check before publishing changes:

```bash
npm run check
```

When testing against private or authenticated pages:

- Use a strict allowlist for the smallest practical origin or path.
- Remember that the default allowlist behavior includes subdomains of each allowed host. Do not hard-code real domains in tests or docs; use generic examples such as `https://example.com` and `https://app.example.com`.
- Prefer small manual checks before crawling. Avoid large crawls on real systems unless the user explicitly asks.
- Do not print full sanitized snapshots into chat or logs when the page may contain private business data. Fetch to a temporary file and inspect only status, title, captured URL, and obvious redaction signals.
- Verify tokenless and wrong-token requests return `404` or `401`.
- Verify `/health` locally and through the tunnel before testing `/view`.
- If CDP port `9222` is already occupied, use a separate port and endpoint, for example:

```bash
CHATGPT_PORTAL_CDP_PORT=9223 \
CHATGPT_PORTAL_CDP=http://localhost:9223 \
CHATGPT_PORTAL_ALLOWLIST=https://intranet.example.com \
npm run share
```

When changing sharing behavior, update and run `tests/share.test.ts`.

When changing redaction, URL policy, crawl behavior, or click classification, update the relevant unit tests and add fixture coverage for the new edge case.

When changing public instructions, keep `README.md`, `index.html`, and this `AGENTS.md` aligned.

## Privacy And Repo Hygiene

Never commit private operator details. That includes:

- live tunnel URLs or session tokens;
- private domains, intranet paths, account names, screenshots, and captured page text;
- cookies, localStorage, sessionStorage, CSRF values, hidden inputs, auth headers, bearer tokens, JWTs, API keys, or browser profile files;
- local absolute paths, user names, machine names, temporary database files, logs, or crawl artifacts.

When updating public docs, examples, tests, screenshots, README copy, release notes, or agent instructions, use placeholders such as `https://intranet.example.com`, `<tokenized-portal-url>`, and `<session-token>`. Do not copy values from a real run.

Before committing or pushing, inspect the diff and run a broad private-data scan:

```bash
git diff --check
rg -n -S '(trycloudflare\.com/s/|sk-[A-Za-z0-9]|BEGIN (RSA|OPENSSH|PRIVATE) KEY|ghp_|github_pat_|gho_|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|/Users/[^[:space:]]+|/home/[^[:space:]]+)' .
```

Expected false positives may include this file, test fixtures, and redaction tests. Do not ignore real credentials, live session URLs, private hostnames, or local paths.
