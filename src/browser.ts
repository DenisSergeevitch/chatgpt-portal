import { access, mkdir, stat } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import type { AppConfig } from "./config.js";
import { sanitizeSnapshot } from "./sanitizer.js";
import { captureRawSnapshot } from "./snapshot.js";
import type { ClickTarget, PageSnapshot } from "./types.js";
import { UrlPolicy } from "./url-policy.js";

export class BrowserController {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private chromeProcess: ChildProcess | null = null;
  private targets = new Map<string, ClickTarget>();
  private actionQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: AppConfig,
    private readonly policy: UrlPolicy
  ) {}

  async currentUrl(): Promise<string | undefined> {
    return this.runExclusive(async () => {
      const page = await this.ensurePage();
      const url = page.url();
      return url === "about:blank" ? undefined : url;
    });
  }

  async snapshot(): Promise<PageSnapshot> {
    return this.runExclusive(async () => {
      const page = await this.ensurePage();
      return this.capture(page);
    });
  }

  async open(inputUrl: string): Promise<PageSnapshot> {
    return this.runExclusive(async () => {
      const page = await this.ensurePage();
      const previousUrl = page.url();
      const target = this.policy.resolve(inputUrl, previousUrl);
      if (!this.policy.isAllowed(target, previousUrl)) {
        throw new Error(`URL is outside the portal allowlist: ${target.toString()}`);
      }

      try {
        await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
      } catch (error) {
        if (!isRecoverableNavigationAbort(error) || page.url() === previousUrl) {
          throw error;
        }
      }

      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
      return this.capture(page);
    });
  }

  async click(id: string): Promise<PageSnapshot> {
    return this.runExclusive(async () => {
      const page = await this.ensurePage();
      const target = this.targets.get(id);
      if (!target) {
        throw new Error(`Unknown element id ${id}. Refresh /view and use one of the listed ids.`);
      }

      if (target.risk !== "navigation") {
        throw new Error(`Element ${id} is blocked because it is not navigation-like.`);
      }

      if (target.href && !this.policy.isAllowed(target.href, page.url())) {
        throw new Error(`Element ${id} points outside the portal allowlist.`);
      }

      await page.locator(target.selector).nth(target.index).click({ timeout: 10000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
      return this.capture(page);
    });
  }

  async fill(id: string, value: string): Promise<PageSnapshot> {
    return this.runExclusive(async () => {
      const page = await this.ensurePage();
      const target = this.targetForInput(id);
      if (target.controlKind !== "text" && target.controlKind !== "textarea") {
        throw new Error(`Element ${id} cannot be filled because it is not a text input or textarea.`);
      }

      await page.locator(target.selector).nth(target.index).fill(value, { timeout: 10000 });
      await page.waitForTimeout(150);
      return this.capture(page);
    });
  }

  async select(id: string, value?: string): Promise<PageSnapshot> {
    return this.runExclusive(async () => {
      const page = await this.ensurePage();
      const target = this.targetForInput(id);
      const locator = page.locator(target.selector).nth(target.index);

      if (target.controlKind === "radio" || target.controlKind === "checkbox") {
        await locator.check({ force: true, timeout: 10000 });
      } else if (target.controlKind === "select") {
        if (!value) {
          throw new Error(`A value query parameter is required to select an option for ${id}.`);
        }
        await locator.selectOption(value, { timeout: 10000 });
      } else {
        throw new Error(`Element ${id} cannot be selected because it is not a radio, checkbox, or select.`);
      }

      await page.waitForTimeout(150);
      return this.capture(page);
    });
  }

  async upload(id: string, fileName: string): Promise<PageSnapshot> {
    return this.runExclusive(async () => {
      const page = await this.ensurePage();
      const target = this.targetForInput(id);
      if (target.controlKind !== "file") {
        throw new Error(`Element ${id} cannot upload files because it is not a file input.`);
      }

      const filePath = await this.stagedUploadPath(fileName);
      await page.locator(target.selector).nth(target.index).setInputFiles(filePath, { timeout: 10000 });
      await page.waitForTimeout(150);
      return this.capture(page);
    });
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    if (this.chromeProcess && !this.chromeProcess.killed) {
      this.chromeProcess.kill();
    }
  }

  private async capture(page: Page): Promise<PageSnapshot> {
    let raw: Awaited<ReturnType<typeof captureRawSnapshot>>;
    try {
      raw = await captureRawSnapshot(page);
    } catch (error) {
      if (!isTransientNavigationError(error)) {
        throw error;
      }

      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
      raw = await captureRawSnapshot(page);
    }

    const { snapshot, targets } = sanitizeSnapshot(raw, this.policy, {
      maxTextChars: this.config.maxTextChars,
    });
    this.targets = targets;
    return snapshot;
  }

  private targetForInput(id: string): ClickTarget {
    const target = this.targets.get(id);
    if (!target) {
      throw new Error(`Unknown element id ${id}. Refresh /view and use one of the listed ids.`);
    }

    if (target.risk !== "input" || target.kind !== "control") {
      throw new Error(`Element ${id} is blocked because it is not an allowed form control.`);
    }

    return target;
  }

  private async stagedUploadPath(fileName: string): Promise<string> {
    if (!fileName || path.isAbsolute(fileName) || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
      throw new Error("Upload file must be a filename relative to the portal upload staging folder.");
    }

    const root = path.resolve(this.config.uploadDir);
    const resolved = path.resolve(root, fileName);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error("Upload file must stay inside the portal upload staging folder.");
    }

    try {
      await access(resolved);
    } catch (error) {
      throw new Error("Upload file was not found in the portal upload staging folder.");
    }
    const details = await stat(resolved);
    if (!details.isFile()) {
      throw new Error("Upload target must be a regular file in the portal upload staging folder.");
    }

    return resolved;
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.actionQueue;
    let release: () => void = () => undefined;
    this.actionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous.catch(() => undefined);

    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    await this.ensureBrowser();
    const browser = this.browser;
    if (!browser) {
      throw new Error("Browser connection is not available.");
    }

    const context = browser.contexts()[0] || (await browser.newContext());
    this.page = context.pages().find((candidate) => !candidate.url().startsWith("devtools://")) || (await context.newPage());

    if (this.config.initialUrl && this.page.url() === "about:blank") {
      const target = this.policy.resolve(this.config.initialUrl);
      if (!this.policy.isAllowed(target)) {
        throw new Error(`Initial URL is outside the portal allowlist: ${target.toString()}`);
      }
      await this.page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
      await this.page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => undefined);
    }

    return this.page;
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser?.isConnected()) {
      return;
    }

    const reachable = await waitForCdp(this.config.cdpEndpoint, 750);
    if (!reachable) {
      await this.launchChrome();
      await waitForCdp(this.config.cdpEndpoint, 10000);
    }

    try {
      this.browser = await chromium.connectOverCDP(this.config.cdpEndpoint);
    } catch (error) {
      throw new Error(
        [
          `Could not connect to Chrome DevTools at ${this.config.cdpEndpoint}.`,
          "Start Chrome with remote debugging or let the bridge launch it:",
          `  "${this.config.chromePath || "Google Chrome"}" --remote-debugging-port=${this.config.cdpPort} --user-data-dir="${this.config.chromeProfileDir}"`,
        ].join("\n")
      );
    }
  }

  private async launchChrome(): Promise<void> {
    if (!this.config.autoLaunchChrome) {
      throw new Error(`Chrome DevTools is not reachable at ${this.config.cdpEndpoint}.`);
    }

    if (!this.config.chromePath) {
      throw new Error(
        "Google Chrome or Chromium was not found. Set CHATGPT_PORTAL_CHROME to the browser executable path."
      );
    }

    await mkdir(this.config.chromeProfileDir, { recursive: true });
    const args = [
      `--remote-debugging-port=${this.config.cdpPort}`,
      `--user-data-dir=${this.config.chromeProfileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      this.config.initialUrl || "about:blank",
    ];

    this.chromeProcess = spawn(this.config.chromePath, args, {
      detached: false,
      stdio: "ignore",
    });
  }
}

async function waitForCdp(endpoint: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, "")}/json/version`);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      await delay(250);
    }
  }

  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecoverableNavigationAbort(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("net::ERR_ABORTED");
}

function isTransientNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("Cannot find context with specified id") ||
    message.includes("Target closed")
  );
}
