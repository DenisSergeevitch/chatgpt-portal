import type {
  ClickTarget,
  PageSnapshot,
  RawButton,
  RawControl,
  RawLink,
  RawPageSnapshot,
  Risk,
  SnapshotButton,
  SnapshotControl,
  SnapshotLink,
} from "./types.js";
import { UrlPolicy } from "./url-policy.js";

const DANGEROUS_WORDS =
  /\b(delete|remove|send|invite|approve|charge|refund|reset|publish|save|submit|upload|download|export|import|create|update|disable|enable|archive|deactivate|confirm)\b/i;

const NAVIGATION_WORDS =
  /\b(next|previous|prev|back|continue|open|view|details|more|show|hide|expand|collapse|menu|tab|page|settings|dashboard|home|search|filter|sort|volgende|verder|doorgaan|terug|vorige)\b/i;

const SECRET_FIELD_WORDS =
  /\b(password|passcode|secret|token|api[_ -]?key|csrf|cookie|session|bearer|authorization|credential|login|log in|sign in)\b/i;

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
      kind: "link",
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
      kind: "button",
    });
  }

  const controls: SnapshotControl[] = [];
  for (const rawControl of raw.controls || []) {
    const id = `c${controls.length + 1}`;
    const label = cleanInline(rawControl.label) || cleanInline(rawControl.name || "") || `${rawControl.kind} control`;
    const name = rawControl.name ? redactSensitiveText(cleanInline(rawControl.name)) : undefined;
    const risk = classifyControl(rawControl);
    const options = rawControl.options
      ?.map((option) => ({
        text: redactSensitiveText(cleanInline(option.text) || option.value || "Untitled option"),
        value: redactSensitiveText(cleanInline(option.value)),
        selected: Boolean(option.selected),
        disabled: Boolean(option.disabled),
      }))
      .filter((option) => option.text || option.value);

    controls.push({
      id,
      kind: rawControl.kind,
      label: redactSensitiveText(label),
      name,
      checked: rawControl.checked,
      disabled: rawControl.disabled,
      required: rawControl.required,
      accept: rawControl.accept ? redactSensitiveText(cleanInline(rawControl.accept)) : undefined,
      multiple: rawControl.multiple,
      hasValue:
        rawControl.kind === "text" ||
        rawControl.kind === "textarea" ||
        rawControl.kind === "select" ||
        rawControl.kind === "file"
          ? Boolean(rawControl.value)
          : undefined,
      options,
      risk,
    });

    targets.set(id, {
      id,
      selector: rawControl.selector,
      index: rawControl.index,
      text: label,
      risk,
      kind: "control",
      controlKind: rawControl.kind,
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
      controls,
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

export function classifyControl(control: Pick<RawControl, "kind" | "label" | "name" | "disabled" | "inputType">): Risk {
  const descriptor = cleanInline(`${control.label || ""} ${control.name || ""} ${control.inputType || ""}`);

  if (control.disabled || SECRET_FIELD_WORDS.test(descriptor)) {
    return "blocked";
  }

  if (
    control.kind === "radio" ||
    control.kind === "checkbox" ||
    control.kind === "text" ||
    control.kind === "textarea" ||
    control.kind === "select" ||
    control.kind === "file"
  ) {
    return "input";
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
