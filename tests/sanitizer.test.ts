import assert from "node:assert/strict";
import test from "node:test";
import { classifyButton, classifyLink, redactSensitiveText } from "../src/sanitizer.js";
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
  assert.equal(classifyButton({ text: "Submit invoice", role: "" }, undefined, policy, currentUrl), "blocked");
});
