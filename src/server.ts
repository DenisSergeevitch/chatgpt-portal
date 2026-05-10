import crypto from "node:crypto";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { BrowserController } from "./browser.js";
import { AuditLog } from "./audit.js";
import { SnapshotStore } from "./storage.js";
import {
  pageShell,
  renderCrawlPage,
  renderErrorPage,
  renderLinksOnlyPage,
  renderSearchPage,
  renderSnapshotPage,
} from "./render.js";
import { redactSensitiveText } from "./sanitizer.js";
import type { PageSnapshot } from "./types.js";
import { UrlPolicy } from "./url-policy.js";

const config = await loadConfig();
const token = crypto.randomBytes(24).toString("base64url");
const tokenExpiresAt = Date.now() + config.tokenTtlMs;
const policy = new UrlPolicy(config.allowlist);
const browser = new BrowserController(config, policy);
const store = new SnapshotStore(config.databasePath);
const audit = new AuditLog(config.actionLogPath);
const startedAt = Date.now();

const server = http.createServer((request, response) => {
  const requestUrl = requestUrlForLog(request);
  const requestStarted = Date.now();
  logPortal(`<= ${request.method || "GET"} ${describeUrlForLog(requestUrl)}`);

  handleRequest(request, response).catch((error) => {
    const details = errorDetails(error);
    logPortal(
      `!! ${request.method || "GET"} ${describeUrlForLog(requestUrl)} -> ${details.status} ${details.title} (${Date.now() - requestStarted}ms): ${details.logMessage}`,
      true
    );
    writeHtml(response, details.status, renderErrorPage(details.status, details.title, details.userMessage));
  });
});

server.listen(config.port, config.host, () => {
  const base = `http://${config.host}:${config.port}`;
  console.log("");
  console.log("ChatGPT Portal local bridge is running.");
  console.log(`Local view URL: ${base}/s/${token}/view`);
  console.log(`Health: ${base}/health`);
  console.log(`Token expires: ${new Date(tokenExpiresAt).toISOString()}`);
  console.log("");
  console.log("Expose temporarily with:");
  console.log("  npm run share");
  console.log("Or run cloudflared manually:");
  console.log(`  cloudflared tunnel --url ${base}`);
  console.log("");
  if (config.allowlist.length) {
    console.log(`Allowlist: ${config.allowlist.join(", ")}`);
  } else {
    console.log("Allowlist: implicit current-origin mode. Set CHATGPT_PORTAL_ALLOWLIST for stricter scoping.");
  }
  console.log("");
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${config.host}:${config.port}`}`);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-store");

  if (request.method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, {
      ok: true,
      host: config.host,
      port: config.port,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      tokenExpiresAt: new Date(tokenExpiresAt).toISOString(),
      cdpEndpoint: config.cdpEndpoint,
      allowlistMode: config.allowlist.length ? "explicit" : "implicit-current-origin",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/shutdown") {
    if (!validToken(url.searchParams.get("token") || request.headers["x-portal-token"])) {
      writeHtml(response, 404, renderErrorPage(404, "Not found", "Invalid or expired portal token."));
      return;
    }

    await audit.write("shutdown");
    writeHtml(response, 200, pageShell("Shutdown", "<h1>Bridge shutting down</h1><p>The session token is now revoked.</p>"));
    setTimeout(() => shutdown(0), 50);
    return;
  }

  if (request.method !== "GET") {
    writeHtml(response, 405, renderErrorPage(405, "Method not allowed", "Only GET routes are exposed, except POST /shutdown."));
    return;
  }

  if (url.pathname === "/") {
    writeHtml(
      response,
      200,
      pageShell(
        "ChatGPT Portal local bridge",
        `
          <header>
            <p class="eyebrow">Local bridge</p>
            <h1>Token required</h1>
            <p>Use the tokenized URL printed in the terminal:</p>
            <pre>http://${config.host}:${config.port}/s/&lt;session-token&gt;/view</pre>
          </header>
        `
      )
    );
    return;
  }

  const match = url.pathname.match(/^\/s\/([^/]+)\/?([^/]*)$/);
  if (!match || !validToken(match[1])) {
    writeHtml(response, 404, renderErrorPage(404, "Not found", "Invalid or expired portal token."));
    return;
  }

  const route = match[2] || "view";
  await handleSessionRoute(route, url, response);
}

async function handleSessionRoute(route: string, url: URL, response: ServerResponse): Promise<void> {
  if (route === "view") {
    const snapshot = await browser.snapshot();
    store.upsert(snapshot);
    await audit.write("view", { url: snapshot.url });
    logSnapshot("view", snapshot);
    writeHtml(response, 200, renderSnapshotPage(token, snapshot));
    return;
  }

  if (route === "page" || route === "open") {
    const target = url.searchParams.get("url") || "";
    logPortal(`.. ${route} ${safeValueForLog("url", target)}`);
    const snapshot = await browser.open(target);
    store.upsert(snapshot);
    await audit.write(route, { url: snapshot.url });
    logSnapshot(route, snapshot);
    writeHtml(response, 200, renderSnapshotPage(token, snapshot, route === "open" ? "Opened page" : "Page"));
    return;
  }

  if (route === "links") {
    const target = url.searchParams.get("url");
    logPortal(target ? `.. links ${safeValueForLog("url", target)}` : ".. links current page");
    const snapshot = target ? await browser.open(target) : await browser.snapshot();
    store.upsert(snapshot);
    await audit.write("links", { url: snapshot.url });
    logSnapshot("links", snapshot);
    writeHtml(response, 200, renderLinksOnlyPage(token, snapshot));
    return;
  }

  if (route === "search") {
    const query = url.searchParams.get("q") || "";
    const limit = numberParam(url, "limit", 20, 1, 100);
    const results = store.search(query, limit);
    await audit.write("search", { query, count: results.length });
    logPortal(`=> search q=${query ? "<query>" : "<empty>"} results=${results.length}`);
    writeHtml(response, 200, renderSearchPage(token, query, results));
    return;
  }

  if (route === "crawl") {
    const scope = url.searchParams.get("scope") || (await browser.currentUrl()) || "";
    const requestedLimit = numberParam(url, "limit", 100, 1, config.maxCrawlLimit);
    logPortal(`.. crawl ${safeValueForLog("scope", scope)} limit=${requestedLimit}`);
    const results = await crawl(scope, requestedLimit);
    await audit.write("crawl", { scope: results.scope, count: results.visited.length, skipped: results.skipped.length });
    logPortal(`=> crawl ${safeUrlForLog(results.scope)} visited=${results.visited.length} skipped=${results.skipped.length}`);
    writeHtml(response, 200, renderCrawlPage(token, results));
    return;
  }

  if (route === "click") {
    const id = url.searchParams.get("id") || "";
    if (!id) {
      throw new Error("An id query parameter is required.");
    }
    logPortal(`.. click id=${redactSensitiveText(id)}`);
    const snapshot = await browser.click(id);
    store.upsert(snapshot);
    await audit.write("click", { id, url: snapshot.url });
    logSnapshot("click", snapshot);
    writeHtml(response, 200, renderSnapshotPage(token, snapshot, `Clicked ${id}`));
    return;
  }

  writeHtml(response, 404, renderErrorPage(404, "Unknown route", `No route exists for /${route}.`));
}

async function crawl(scopeInput: string, limit: number): Promise<{
  scope: string;
  requestedLimit: number;
  visited: PageSnapshot[];
  skipped: string[];
}> {
  const currentUrl = await browser.currentUrl();
  const scope = policy.resolve(scopeInput, currentUrl);
  if (!policy.isAllowed(scope, currentUrl)) {
    throw new Error(`Crawl scope is outside the portal allowlist: ${scope.toString()}`);
  }

  const queue = [scope.toString()];
  const seen = new Set<string>();
  const visited: PageSnapshot[] = [];
  const skipped: string[] = [];

  while (queue.length && visited.length < limit) {
    const nextUrl = queue.shift();
    if (!nextUrl || seen.has(nextUrl)) {
      continue;
    }

    seen.add(nextUrl);

    try {
      const snapshot = await browser.open(nextUrl);
      store.upsert(snapshot);
      visited.push(snapshot);

      for (const link of snapshot.links) {
        if (link.risk !== "navigation") {
          continue;
        }

        const parsed = new URL(link.href);
        if (policy.isWithinScope(parsed, scope) && !seen.has(parsed.toString())) {
          queue.push(parsed.toString());
        }
      }
    } catch (error) {
      skipped.push(`${nextUrl} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    scope: scope.toString(),
    requestedLimit: limit,
    visited,
    skipped,
  };
}

function validToken(value: string | string[] | undefined | null): boolean {
  const supplied = Array.isArray(value) ? value[0] : value;
  if (!supplied || Date.now() > tokenExpiresAt) {
    return false;
  }

  const expected = Buffer.from(token);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function writeHtml(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(body);
}

function writeJson(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data, null, 2));
}

async function shutdown(code: number): Promise<void> {
  server.close();
  await browser.close();
  process.exit(code);
}

function logSnapshot(action: string, snapshot: PageSnapshot): void {
  logPortal(`=> ${action} ${safeUrlForLog(snapshot.url)} "${redactSensitiveText(snapshot.title)}"`);
}

function logPortal(message: string, isError = false): void {
  const line = `[portal] ${new Date().toISOString()} ${stripAnsi(message)}`;
  if (isError) {
    console.error(line);
  } else {
    console.log(line);
  }
}

function requestUrlForLog(request: IncomingMessage): URL {
  return new URL(request.url || "/", `http://${request.headers.host || `${config.host}:${config.port}`}`);
}

function describeUrlForLog(url: URL): string {
  const safePath = url.pathname.replace(/^\/s\/[^/]+/, "/s/<token>");
  const params: string[] = [];

  for (const name of ["url", "scope", "limit", "q", "id"]) {
    const value = url.searchParams.get(name);
    if (value !== null) {
      params.push(`${name}=${safeValueForLog(name, value)}`);
    }
  }

  return params.length ? `${safePath}?${params.join("&")}` : safePath;
}

function safeValueForLog(name: string, value: string): string {
  if (name === "url" || name === "scope") {
    return safeUrlForLog(value);
  }

  if (name === "q") {
    return value ? "<query>" : "<empty>";
  }

  return redactSensitiveText(value);
}

function safeUrlForLog(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = parsed.search ? "?..." : "";
    parsed.hash = "";
    return redactSensitiveText(parsed.toString());
  } catch (error) {
    return redactSensitiveText(value);
  }
}

function errorDetails(error: unknown): {
  status: number;
  title: string;
  userMessage: string;
  logMessage: string;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = stripAnsi(rawMessage);
  const logMessage = redactSensitiveText(message.replace(/\s+/g, " ").trim());

  if (message.includes("outside the portal allowlist") || message.includes("points outside the portal allowlist")) {
    return {
      status: 403,
      title: "Blocked by portal policy",
      userMessage: redactSensitiveText(message),
      logMessage,
    };
  }

  if (
    message.includes("url query parameter is required") ||
    message.includes("Only http and https URLs are allowed") ||
    message.includes("Unknown element id") ||
    message.includes("not navigation-like")
  ) {
    return {
      status: 400,
      title: "Bad portal request",
      userMessage: redactSensitiveText(message),
      logMessage,
    };
  }

  if (
    message.includes("Could not connect to Chrome DevTools") ||
    message.includes("Chrome DevTools is not reachable") ||
    message.includes("Google Chrome or Chromium was not found")
  ) {
    return {
      status: 503,
      title: "Browser unavailable",
      userMessage: redactSensitiveText(message),
      logMessage,
    };
  }

  if (
    message.includes("page.goto") ||
    message.includes("net::") ||
    message.includes("Timeout") ||
    message.includes("Navigation")
  ) {
    return {
      status: 502,
      title: "Navigation failed",
      userMessage: redactSensitiveText(message),
      logMessage,
    };
  }

  return {
    status: 500,
    title: "Bridge error",
    userMessage: redactSensitiveText(message),
    logMessage,
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
