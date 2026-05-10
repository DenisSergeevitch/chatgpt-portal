export type AllowRule = {
  protocol: string;
  hostname: string;
  port: string;
  pathPrefix: string;
};

export class UrlPolicy {
  private readonly explicitRules: AllowRule[];
  private readonly allowSubdomains: boolean;

  constructor(allowlist: string[], options: { allowSubdomains?: boolean } = {}) {
    this.explicitRules = allowlist.map(parseAllowRule).filter((rule): rule is AllowRule => Boolean(rule));
    this.allowSubdomains = options.allowSubdomains ?? true;
  }

  resolve(input: string, baseUrl?: string): URL {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("A url query parameter is required.");
    }

    const base = baseUrl && isHttpUrl(baseUrl) ? baseUrl : undefined;
    const url = new URL(trimmed, base);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Only http and https URLs are allowed, got ${url.protocol}`);
    }

    url.hash = "";
    return url;
  }

  isAllowed(url: URL | string, currentUrl?: string): boolean {
    const parsed = typeof url === "string" ? new URL(url) : url;

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    if (this.explicitRules.length > 0) {
      return this.explicitRules.some((rule) => matchesRule(parsed, rule, this.allowSubdomains));
    }

    if (!currentUrl || !isHttpUrl(currentUrl)) {
      return true;
    }

    const current = new URL(currentUrl);
    return matchesHostBoundary(
      parsed,
      {
        protocol: current.protocol,
        hostname: current.hostname,
        port: current.port,
      },
      this.allowSubdomains
    );
  }

  isWithinScope(url: URL, scope: URL): boolean {
    if (!this.isAllowed(url, scope.toString())) {
      return false;
    }

    if (!matchesHostBoundary(
      url,
      {
        protocol: scope.protocol,
        hostname: scope.hostname,
        port: scope.port,
      },
      this.allowSubdomains
    )) {
      return false;
    }

    const prefix = scope.pathname.endsWith("/")
      ? scope.pathname
      : scope.pathname.replace(/\/[^/]*$/, "/");

    return url.pathname.startsWith(prefix || "/");
  }
}

function parseAllowRule(value: string): AllowRule | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      pathPrefix: url.pathname === "/" ? "/" : trimTrailingSlash(url.pathname),
    };
  } catch (error) {
    return null;
  }
}

function matchesRule(url: URL, rule: AllowRule, allowSubdomains: boolean): boolean {
  if (!matchesHostBoundary(url, rule, allowSubdomains)) {
    return false;
  }

  if (rule.pathPrefix === "/") {
    return true;
  }

  return url.pathname === rule.pathPrefix || url.pathname.startsWith(`${rule.pathPrefix}/`);
}

function matchesHostBoundary(
  url: URL,
  rule: Pick<AllowRule, "protocol" | "hostname" | "port">,
  allowSubdomains: boolean
): boolean {
  if (url.protocol !== rule.protocol || url.port !== rule.port) {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const allowed = rule.hostname.toLowerCase();
  return host === allowed || (allowSubdomains && host.endsWith(`.${allowed}`));
}

function trimTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}
