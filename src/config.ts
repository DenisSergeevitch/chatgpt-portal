import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AppConfig = {
  host: "127.0.0.1";
  port: number;
  tokenTtlMs: number;
  cdpEndpoint: string;
  cdpPort: number;
  chromePath: string | null;
  chromeProfileDir: string;
  databasePath: string;
  actionLogPath: string;
  uploadDir: string;
  allowlist: string[];
  allowSubdomains: boolean;
  initialUrl: string | null;
  maxTextChars: number;
  maxCrawlLimit: number;
  autoLaunchChrome: boolean;
};

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_DIR = path.join(ROOT_DIR, ".local");

export async function loadConfig(): Promise<AppConfig> {
  await mkdir(LOCAL_DIR, { recursive: true });
  const uploadDir = process.env.CHATGPT_PORTAL_UPLOAD_DIR || path.join(LOCAL_DIR, "uploads");
  await mkdir(uploadDir, { recursive: true });

  const port = numberFromEnv("CHATGPT_PORTAL_PORT", 7777);
  const cdpPort = numberFromEnv("CHATGPT_PORTAL_CDP_PORT", 9222);
  const cdpEndpoint = process.env.CHATGPT_PORTAL_CDP || `http://127.0.0.1:${cdpPort}`;
  const chromeProfileDir =
    process.env.CHATGPT_PORTAL_CHROME_PROFILE || path.join(LOCAL_DIR, "chrome-profile");

  return {
    host: "127.0.0.1",
    port,
    tokenTtlMs: numberFromEnv("CHATGPT_PORTAL_TOKEN_TTL_MINUTES", 240) * 60 * 1000,
    cdpEndpoint,
    cdpPort,
    chromePath: process.env.CHATGPT_PORTAL_CHROME || findChromePath(),
    chromeProfileDir,
    databasePath: process.env.CHATGPT_PORTAL_DB || path.join(LOCAL_DIR, "portal.db"),
    actionLogPath: process.env.CHATGPT_PORTAL_ACTION_LOG || path.join(LOCAL_DIR, "actions.jsonl"),
    uploadDir,
    allowlist: splitList(process.env.CHATGPT_PORTAL_ALLOWLIST || ""),
    allowSubdomains: booleanFromEnv("CHATGPT_PORTAL_ALLOW_SUBDOMAINS", true),
    initialUrl: process.env.CHATGPT_PORTAL_TARGET || null,
    maxTextChars: numberFromEnv("CHATGPT_PORTAL_MAX_TEXT_CHARS", 120000),
    maxCrawlLimit: numberFromEnv("CHATGPT_PORTAL_MAX_CRAWL_LIMIT", 5000),
    autoLaunchChrome: process.env.CHATGPT_PORTAL_NO_LAUNCH !== "1",
  };
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function findChromePath(): string | null {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  return candidates.find((candidate) => existsSync(candidate)) || null;
}
