import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const LOCAL_VIEW_RE = /Local view URL:\s*(http:\/\/127\.0\.0\.1:\d+\/s\/[A-Za-z0-9_-]+\/view)\b/;
const TRYCLOUDFLARE_RE = /\b(https:\/\/[A-Za-z0-9-]+\.trycloudflare\.com)\b/;
type ManagedProcess = ChildProcessByStdio<null, Readable, Readable>;

export function extractLocalViewUrl(text: string): string | null {
  return text.match(LOCAL_VIEW_RE)?.[1] || null;
}

export function extractTryCloudflareUrl(text: string): string | null {
  return text.match(TRYCLOUDFLARE_RE)?.[1] || null;
}

export function buildPublicViewUrl(publicTunnelUrl: string, localViewUrl: string): string {
  const tunnel = new URL(publicTunnelUrl);
  const local = new URL(localViewUrl);
  return new URL(local.pathname, tunnel).toString();
}

async function main(): Promise<void> {
  let serverProcess: ManagedProcess | null = null;
  let tunnelProcess: ManagedProcess | null = null;
  let localViewUrl: string | null = null;
  let printedShareUrl = false;
  let shuttingDown = false;

  const stop = (code = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    if (tunnelProcess && !tunnelProcess.killed) {
      tunnelProcess.kill("SIGINT");
    }
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGINT");
    }

    setTimeout(() => process.exit(code), 150);
  };

  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));

  const server = spawn(npmCommand(), ["run", "dev"], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  }) as ManagedProcess;
  serverProcess = server;

  server.on("error", (error) => {
    console.error(`Could not start the local bridge: ${error.message}`);
    stop(1);
  });

  server.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`Local bridge exited before share URL was ready (${signal || code}).`);
      stop(code || 1);
    }
  });

  server.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  server.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);

    const foundLocalViewUrl = extractLocalViewUrl(text);
    if (!localViewUrl && foundLocalViewUrl) {
      localViewUrl = foundLocalViewUrl;
      const localBaseUrl = new URL(localViewUrl).origin;
      tunnelProcess = startTunnel(localBaseUrl);
    }
  });

  function startTunnel(localBaseUrl: string): ManagedProcess {
    console.log("");
    console.log("Starting Cloudflare Tunnel...");
    console.log(`cloudflared tunnel --url ${localBaseUrl}`);
    console.log("");

    const tunnel = spawn(process.env.CHATGPT_PORTAL_CLOUDFLARED || "cloudflared", ["tunnel", "--url", localBaseUrl], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    }) as ManagedProcess;

    const handleTunnelOutput = (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);

      const tunnelUrl = extractTryCloudflareUrl(text);
      if (tunnelUrl && localViewUrl && !printedShareUrl) {
        printedShareUrl = true;
        const publicViewUrl = buildPublicViewUrl(tunnelUrl, localViewUrl);
        console.log("");
        console.log("Share this URL with ChatGPT:");
        console.log(publicViewUrl);
        console.log("");
        console.log("Press Ctrl+C to stop the tunnel and revoke public access.");
        console.log("");
      }
    };

    tunnel.stdout.on("data", handleTunnelOutput);
    tunnel.stderr.on("data", handleTunnelOutput);

    tunnel.on("error", (error) => {
      console.error("");
      console.error(`Could not start cloudflared: ${error.message}`);
      console.error("Install it with `brew install cloudflared`, or run `cloudflared tunnel --url http://127.0.0.1:7777` manually.");
      stop(1);
    });

    tunnel.on("exit", (code, signal) => {
      if (!shuttingDown) {
        console.error(`Cloudflare Tunnel exited (${signal || code}).`);
        stop(code || 1);
      }
    });

    return tunnel;
  }
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
