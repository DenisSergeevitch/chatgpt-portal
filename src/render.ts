import { escapeHtml } from "./sanitizer.js";
import type { PageSnapshot, SearchResult } from "./types.js";

export function renderSnapshotPage(token: string, snapshot: PageSnapshot, title = "Current page"): string {
  return pageShell(
    `${title}: ${snapshot.title}`,
    `
      <nav class="top-nav">
        <a href="/s/${token}/view">Current page</a>
        <a href="/s/${token}/search">Search</a>
        <a href="/health">Health</a>
      </nav>
      <header>
        <p class="eyebrow">Sanitized snapshot</p>
        <h1>${escapeHtml(snapshot.title)}</h1>
        <p><strong>URL:</strong> <code>${escapeHtml(snapshot.url)}</code></p>
        <p><strong>Captured:</strong> ${escapeHtml(snapshot.capturedAt)}</p>
      </header>
      ${renderSearchForm(token)}
      <section>
        <h2>Structured markdown</h2>
        <p class="meta">Semantic view for agents. Links, buttons, and form controls are marked before the plain text fallback.</p>
        <pre>${escapeHtml(snapshot.markdown || "(No structured markdown captured)")}</pre>
      </section>
      <section>
        <h2>Plain visible text</h2>
        <pre>${escapeHtml(snapshot.visibleText || "(No visible text captured)")}</pre>
      </section>
      <section>
        <h2>Headings</h2>
        ${snapshot.headings.length ? `<ul>${snapshot.headings.map((heading) => `<li>${escapeHtml(heading)}</li>`).join("")}</ul>` : "<p>No headings captured.</p>"}
      </section>
      <section>
        <h2>Links</h2>
        ${renderLinksTable(token, snapshot.links)}
      </section>
      <section>
        <h2>Clickable controls</h2>
        ${renderButtonsTable(token, snapshot.buttons)}
      </section>
      <section>
        <h2>Form controls</h2>
        ${renderControlsTable(token, snapshot.controls)}
      </section>
      <section>
        <h2>Forms</h2>
        ${snapshot.forms.length ? `<ul>${snapshot.forms.map((form) => `<li><strong>${escapeHtml(form.id)}</strong>: direct form submission blocked (${form.fields.map(escapeHtml).join(", ") || "no fields listed"})</li>`).join("")}</ul>` : "<p>No forms captured.</p>"}
      </section>
      <section>
        <h2>Raw snapshot JSON</h2>
        <pre>${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre>
      </section>
    `
  );
}

export function renderLinksOnlyPage(token: string, snapshot: PageSnapshot): string {
  return pageShell(
    `Links: ${snapshot.title}`,
    `
      <nav class="top-nav"><a href="/s/${token}/view">Current page</a></nav>
      <header>
        <p class="eyebrow">Links</p>
        <h1>${escapeHtml(snapshot.title)}</h1>
        <p><code>${escapeHtml(snapshot.url)}</code></p>
      </header>
      ${renderLinksTable(token, snapshot.links)}
    `
  );
}

export function renderSearchPage(token: string, query: string, results: SearchResult[]): string {
  return pageShell(
    "Search",
    `
      <nav class="top-nav"><a href="/s/${token}/view">Current page</a></nav>
      <header>
        <p class="eyebrow">Local index</p>
        <h1>Search sanitized snapshots</h1>
      </header>
      ${renderSearchForm(token, query)}
      ${
        query
          ? results.length
            ? `<ol class="results">${results
                .map(
                  (result) => `
                    <li>
                      <h2><a href="/s/${token}/page?url=${encodeURIComponent(result.url)}">${escapeHtml(result.title || result.url)}</a></h2>
                      <p><code>${escapeHtml(result.url)}</code></p>
                      <p>${formatSnippet(result.snippet)}</p>
                    </li>
                  `
                )
                .join("")}</ol>`
            : `<p>No indexed snapshots matched <strong>${escapeHtml(query)}</strong>.</p>`
          : "<p>Run a crawl or visit pages first, then search this local index.</p>"
      }
    `
  );
}

export function renderCrawlPage(
  token: string,
  details: { scope: string; requestedLimit: number; visited: PageSnapshot[]; skipped: string[] }
): string {
  return pageShell(
    "Crawl results",
    `
      <nav class="top-nav"><a href="/s/${token}/view">Current page</a><a href="/s/${token}/search">Search</a></nav>
      <header>
        <p class="eyebrow">Crawl complete</p>
        <h1>${details.visited.length} sanitized page(s) indexed</h1>
        <p><strong>Scope:</strong> <code>${escapeHtml(details.scope)}</code></p>
        <p><strong>Limit:</strong> ${details.requestedLimit}</p>
      </header>
      ${renderSearchForm(token)}
      <section>
        <h2>Visited</h2>
        <ol>${details.visited
          .map(
            (snapshot) =>
              `<li><a href="/s/${token}/page?url=${encodeURIComponent(snapshot.url)}">${escapeHtml(snapshot.title || snapshot.url)}</a><br><code>${escapeHtml(snapshot.url)}</code></li>`
          )
          .join("")}</ol>
      </section>
      ${
        details.skipped.length
          ? `<section><h2>Skipped</h2><ul>${details.skipped.map((url) => `<li><code>${escapeHtml(url)}</code></li>`).join("")}</ul></section>`
          : ""
      }
    `
  );
}

export function renderErrorPage(status: number, title: string, message: string): string {
  return pageShell(
    title,
    `
      <header>
        <p class="eyebrow">Error ${status}</p>
        <h1>${escapeHtml(title)}</h1>
      </header>
      <pre>${escapeHtml(message)}</pre>
    `
  );
}

export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --bg:#f7f8fb; --panel:#fff; --text:#15181d; --muted:#5c6573; --line:#d9dee7; --accent:#0d6efd; --blocked:#a12a2a; --nav:#146c43; --input:#7a4f00; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(1100px, calc(100% - 28px)); margin:0 auto; padding:24px 0 48px; }
    header, section, form, .top-nav { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:18px; margin:0 0 14px; }
    .top-nav { display:flex; gap:14px; flex-wrap:wrap; }
    .eyebrow { margin:0 0 8px; color:var(--accent); font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
    h1 { margin:0 0 10px; font-size:30px; line-height:1.15; letter-spacing:0; }
    h2 { margin:0 0 8px; font-size:20px; }
    a { color:var(--accent); }
    code, pre { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
    pre { overflow:auto; max-height:520px; margin:0; padding:14px; background:#eef2f7; border-radius:6px; white-space:pre-wrap; }
    table { width:100%; border-collapse:collapse; }
    th, td { border-top:1px solid var(--line); padding:8px; text-align:left; vertical-align:top; }
    th { color:var(--muted); font-size:13px; }
    input, textarea, select { min-width:min(420px, 100%); padding:9px 10px; border:1px solid var(--line); border-radius:6px; font:inherit; }
    textarea { min-height:86px; }
    button, .button { display:inline-block; border:1px solid var(--accent); border-radius:6px; background:var(--accent); color:#fff; padding:8px 12px; text-decoration:none; font:inherit; font-weight:700; }
    .inline-form { display:flex; gap:8px; align-items:flex-start; flex-wrap:wrap; margin:0; padding:0; border:0; background:transparent; }
    .inline-form input, .inline-form textarea, .inline-form select { min-width:min(280px, 100%); }
    .meta { color:var(--muted); font-size:13px; }
    .risk-navigation { color:var(--nav); font-weight:700; }
    .risk-input { color:var(--input); font-weight:700; }
    .risk-blocked { color:var(--blocked); font-weight:700; }
    .results { display:grid; gap:12px; padding-left:22px; }
    mark { background:#fff1a8; padding:0 2px; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function renderSearchForm(token: string, query = ""): string {
  return `
    <form action="/s/${token}/search" method="get">
      <label>
        Search indexed pages
        <input name="q" value="${escapeHtml(query)}" autocomplete="off">
      </label>
      <button type="submit">Search</button>
    </form>
  `;
}

function renderLinksTable(token: string, links: PageSnapshot["links"]): string {
  if (!links.length) {
    return "<p>No links captured.</p>";
  }

  return `<table>
    <thead><tr><th>ID</th><th>Text</th><th>Risk</th><th>Href</th><th>Action</th></tr></thead>
    <tbody>${links
      .map(
        (link) => `
          <tr>
            <td><code>${escapeHtml(link.id)}</code></td>
            <td>${escapeHtml(link.text)}</td>
            <td class="risk-${link.risk}">${link.risk}</td>
            <td><code>${escapeHtml(link.href)}</code></td>
            <td>${link.risk === "navigation" ? `<a class="button" href="/s/${token}/page?url=${encodeURIComponent(link.href)}">Open</a>` : "Blocked"}</td>
          </tr>
        `
      )
      .join("")}</tbody>
  </table>`;
}

function renderButtonsTable(token: string, buttons: PageSnapshot["buttons"]): string {
  if (!buttons.length) {
    return "<p>No clickable controls captured.</p>";
  }

  return `<table>
    <thead><tr><th>ID</th><th>Text</th><th>Risk</th><th>Action</th></tr></thead>
    <tbody>${buttons
      .map(
        (button) => `
          <tr>
            <td><code>${escapeHtml(button.id)}</code></td>
            <td>${escapeHtml(button.text)}</td>
            <td class="risk-${button.risk}">${button.risk}</td>
            <td>${button.risk === "navigation" ? `<a class="button" href="/s/${token}/click?id=${encodeURIComponent(button.id)}">Click</a>` : "Blocked"}</td>
          </tr>
        `
      )
      .join("")}</tbody>
  </table>`;
}

function renderControlsTable(token: string, controls: PageSnapshot["controls"]): string {
  if (!controls.length) {
    return "<p>No form controls captured.</p>";
  }

  return `<table>
    <thead><tr><th>ID</th><th>Kind</th><th>Label</th><th>State</th><th>Risk</th><th>Action</th></tr></thead>
    <tbody>${controls
      .map(
        (control) => `
          <tr>
            <td><code>${escapeHtml(control.id)}</code></td>
            <td>${escapeHtml(control.kind)}</td>
            <td>
              ${escapeHtml(control.label)}
              ${control.name ? `<div class="meta">name: <code>${escapeHtml(control.name)}</code></div>` : ""}
              ${control.accept ? `<div class="meta">accept: <code>${escapeHtml(control.accept)}</code></div>` : ""}
            </td>
            <td>${controlState(control)}</td>
            <td class="risk-${control.risk}">${control.risk}</td>
            <td>${renderControlAction(token, control)}</td>
          </tr>
        `
      )
      .join("")}</tbody>
  </table>`;
}

function controlState(control: PageSnapshot["controls"][number]): string {
  const parts: string[] = [];
  if (control.checked !== undefined) {
    parts.push(control.checked ? "checked" : "not checked");
  }
  if (control.disabled) {
    parts.push("disabled");
  }
  if (control.required) {
    parts.push("required");
  }
  if (control.multiple) {
    parts.push("multiple");
  }
  if (control.hasValue && (control.kind === "text" || control.kind === "textarea" || control.kind === "file")) {
    parts.push("has value");
  }

  return parts.length ? parts.map(escapeHtml).join(", ") : "available";
}

function renderControlAction(token: string, control: PageSnapshot["controls"][number]): string {
  if (control.risk !== "input") {
    return "Blocked";
  }

  if (control.kind === "radio" || control.kind === "checkbox") {
    return `<a class="button" href="/s/${token}/select?id=${encodeURIComponent(control.id)}">Select</a>`;
  }

  if (control.kind === "select") {
    const options = control.options?.length
      ? control.options
          .map(
            (option) =>
              `<option value="${escapeHtml(option.value)}"${option.selected ? " selected" : ""}${option.disabled ? " disabled" : ""}>${escapeHtml(option.text)}</option>`
          )
          .join("")
      : `<option value="">Choose option</option>`;

    return `
      <form class="inline-form" action="/s/${token}/select" method="get">
        <input type="hidden" name="id" value="${escapeHtml(control.id)}">
        <select name="value">${options}</select>
        <button type="submit">Select</button>
      </form>
    `;
  }

  if (control.kind === "file") {
    return `
      <form class="inline-form" action="/s/${token}/upload" method="get">
        <input type="hidden" name="id" value="${escapeHtml(control.id)}">
        <input name="file" placeholder="staged filename" autocomplete="off">
        <button type="submit">Upload</button>
      </form>
      <div class="meta"><a href="/s/${token}/files">View staged files</a></div>
    `;
  }

  return `
    <form class="inline-form" action="/s/${token}/fill" method="get">
      <input type="hidden" name="id" value="${escapeHtml(control.id)}">
      ${
        control.kind === "textarea"
          ? `<textarea name="value" placeholder="Value"></textarea>`
          : `<input name="value" placeholder="Value" autocomplete="off">`
      }
      <button type="submit">Fill</button>
    </form>
  `;
}

function formatSnippet(snippet: string): string {
  return escapeHtml(snippet)
    .replace(/\u0001/g, "<mark>")
    .replace(/\u0002/g, "</mark>");
}
