import type {
  ClickTarget,
  PageSnapshot,
  RawButton,
  RawLink,
  RawPageSnapshot,
  Risk,
  SnapshotButton,
  SnapshotLink,
} from "./types.js";
import { UrlPolicy } from "./url-policy.js";

const DANGEROUS_WORDS =
  /\b(delete|remove|send|invite|approve|charge|refund|reset|publish|save|submit|upload|download|export|import|create|update|disable|enable|archive|deactivate|confirm)\b/i;

const NAVIGATION_WORDS =
  /\b(next|previous|prev|back|continue|open|view|details|more|show|hide|expand|collapse|menu|tab|page|settings|dashboard|home|search|filter|sort)\b/i;

export function sanitizeSnapshot(
  raw: RawPageSnapshot,
  policy: UrlPolicy,
  options: { maxTextChars: number }
): { snapshot: PageSnapshot; targets: Map<string, ClickTarget> } {
  const targets = new Map<string, ClickTarget>();
  const currentUrl = raw.url;

  const links: SnapshotLink[] = [];
  for (const rawLink of raw.links) {
    const href = normalizeHref(rawLink.href, currentUrl);
    if (!href) {
      continue;
    }

    const id = `l${links.length + 1}`;
    const text = cleanInline(rawLink.text) || href;
    const risk = classifyLink(text, href, policy, currentUrl);
    links.push({ id, text: redactSensitiveText(text), href, risk });
    targets.set(id, {
      id,
      selector: rawLink.selector,
      index: rawLink.index,
      text,
      href,
      risk,
    });
  }

  const buttons: SnapshotButton[] = [];
  for (const rawButton of raw.buttons) {
    const id = `b${buttons.length + 1}`;
    const text = cleanInline(rawButton.text) || "Untitled control";
    const href = rawButton.href ? normalizeHref(rawButton.href, currentUrl) || undefined : undefined;
    const risk = classifyButton(rawButton, href, policy, currentUrl);
    buttons.push({ id, text: redactSensitiveText(text), risk });
    targets.set(id, {
      id,
      selector: rawButton.selector,
      index: rawButton.index,
      text,
      href,
      risk,
    });
  }

  return {
    snapshot: {
      url: currentUrl,
      title: redactSensitiveText(cleanInline(raw.title) || "Untitled"),
      capturedAt: new Date().toISOString(),
      visibleText: truncate(redactSensitiveText(cleanBlock(raw.visibleText)), options.maxTextChars),
      headings: raw.headings.map((heading) => redactSensitiveText(cleanInline(heading))).filter(Boolean),
      links,
      buttons,
      forms: raw.forms.map((form, index) => ({
        id: `f${index + 1}`,
        fields: form.fields.map((field) => redactSensitiveText(cleanInline(field))).filter(Boolean),
        risk: "blocked",
      })),
    },
    targets,
  };
}

export function classifyLink(text: string, href: string, policy: UrlPolicy, currentUrl: string): Risk {
  if (DANGEROUS_WORDS.test(text) || DANGEROUS_WORDS.test(href)) {
    return "blocked";
  }

  try {
    return policy.isAllowed(new URL(href), currentUrl) ? "navigation" : "blocked";
  } catch (error) {
    return "blocked";
  }
}

export function classifyButton(
  button: Pick<RawButton, "text" | "role">,
  href: string | undefined,
  policy: UrlPolicy,
  currentUrl: string
): Risk {
  const text = cleanInline(button.text);

  if (DANGEROUS_WORDS.test(text)) {
    return "blocked";
  }

  if (href) {
    return classifyLink(text, href, policy, currentUrl);
  }

  if (button.role === "tab" || NAVIGATION_WORDS.test(text)) {
    return "navigation";
  }

  return "blocked";
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(?:bearer|token|api[_-]?key|secret|session|csrf|password)\s*[:=]\s*[A-Za-z0-9._~+/\-=]{10,}\b/gi, "[REDACTED_SECRET]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[REDACTED_HEX]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[REDACTED_TOKEN]");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cleanInline(value: string): string {
  return cleanBlock(value).replace(/\s+/g, " ").trim();
}

export function cleanBlock(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function normalizeHref(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch (error) {
    return null;
  }
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n\n[Truncated at ${maxChars} characters]`;
}
