import assert from "node:assert/strict";
import test from "node:test";
import { classifyButton, classifyControl, classifyLink, redactSensitiveText, sanitizeSnapshot } from "../src/sanitizer.js";
import { UrlPolicy } from "../src/url-policy.js";

const policy = new UrlPolicy(["https://intranet.example.com/docs"]);
const currentUrl = "https://intranet.example.com/docs/start";

test("redacts JWTs, named secrets, hex secrets, and long opaque tokens", () => {
  const input = [
    "jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepartlong",
    "api_key = sk_test_1234567890abcdef",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "opaque_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop",
  ].join("\n");

  const output = redactSensitiveText(input);
  assert.match(output, /\[REDACTED_JWT\]/);
  assert.match(output, /\[REDACTED_SECRET\]/);
  assert.match(output, /\[REDACTED_HEX\]/);
  assert.match(output, /\[REDACTED_TOKEN\]/);
});

test("allows same allowlist navigation links", () => {
  assert.equal(classifyLink("Billing details", "https://intranet.example.com/docs/billing", policy, currentUrl), "navigation");
});

test("blocks destructive links and off-allowlist links", () => {
  assert.equal(classifyLink("Delete customer", "https://intranet.example.com/docs/customer/1", policy, currentUrl), "blocked");
  assert.equal(classifyLink("Docs", "https://other.example.com/docs", policy, currentUrl), "blocked");
});

test("allows navigation-like buttons and blocks submit-like buttons", () => {
  assert.equal(classifyButton({ text: "Next page", role: "" }, undefined, policy, currentUrl), "navigation");
  assert.equal(classifyButton({ text: "Ga naar de volgende stap", role: "" }, undefined, policy, currentUrl), "navigation");
  assert.equal(classifyButton({ text: "Submit invoice", role: "" }, undefined, policy, currentUrl), "blocked");
});

test("allows controlled form inputs and blocks secret-like inputs", () => {
  assert.equal(
    classifyControl({ kind: "radio", label: "A consumer credit", name: "financial_product_type", disabled: false }),
    "input"
  );
  assert.equal(classifyControl({ kind: "text", label: "Service provider", name: "fsp_name", disabled: false }), "input");
  assert.equal(classifyControl({ kind: "file", label: "Evidence file", name: "attachment", disabled: false }), "input");
  assert.equal(classifyControl({ kind: "text", label: "API token", name: "api_token", disabled: false }), "blocked");
});

test("sanitizes controls without exposing typed text values", () => {
  const { snapshot, targets } = sanitizeSnapshot(
    {
      url: currentUrl,
      title: "Form",
      markdown: "**Service provider**: [text input: filled]",
      visibleText: "Visible form text",
      headings: [],
      links: [],
      buttons: [],
      controls: [
        {
          kind: "text",
          label: "Service provider",
          name: "fsp_name",
          value: "Private typed value",
          selector: "input",
          index: 0,
          disabled: false,
          required: true,
          inputType: "text",
        },
      ],
      forms: [],
    },
    policy,
    { maxTextChars: 5000 }
  );

  assert.equal(snapshot.controls[0].risk, "input");
  assert.equal(snapshot.controls[0].hasValue, true);
  assert.doesNotMatch(JSON.stringify(snapshot.controls), /Private typed value/);
  assert.equal(targets.get("c1")?.controlKind, "text");
});

test("redacts and exposes structured markdown separately from visible text", () => {
  const { snapshot } = sanitizeSnapshot(
    {
      url: currentUrl,
      title: "Form",
      markdown: "# Form\n[Account](https://intranet.example.com/docs/account)\n**API key**: sk_test_1234567890abcdef",
      visibleText: "Form flat text",
      headings: [],
      links: [],
      buttons: [],
      controls: [],
      forms: [],
    },
    policy,
    { maxTextChars: 5000 }
  );

  assert.match(snapshot.markdown, /\[Account\]\(https:\/\/intranet\.example\.com\/docs\/account\)/);
  assert.match(snapshot.markdown, /\[REDACTED_SECRET\]/);
  assert.equal(snapshot.visibleText, "Form flat text");
});
