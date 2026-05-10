export type AllowRule = {
  origin: string;
  pathPrefix: string;
};

export class UrlPolicy {
  private readonly explicitRules: AllowRule[];

  constructor(allowlist: string[]) {
    this.explicitRules = allowlist.map(parseAllowRule).filter((rule): rule is AllowRule => Boolean(rule));
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
      return this.explicitRules.some((rule) => matchesRule(parsed, rule));
    }

    if (!currentUrl || !isHttpUrl(currentUrl)) {
      return true;
    }

    const current = new URL(currentUrl);
    return parsed.origin === current.origin;
  }

  isWithinScope(url: URL, scope: URL): boolean {
    if (!this.isAllowed(url, scope.toString())) {
      return false;
    }

    if (url.origin !== scope.origin) {
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
      origin: url.origin,
      pathPrefix: url.pathname === "/" ? "/" : trimTrailingSlash(url.pathname),
    };
  } catch (error) {
    return null;
  }
}

function matchesRule(url: URL, rule: AllowRule): boolean {
  if (url.origin !== rule.origin) {
    return false;
  }

  if (rule.pathPrefix === "/") {
    return true;
  }

  return url.pathname === rule.pathPrefix || url.pathname.startsWith(`${rule.pathPrefix}/`);
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
