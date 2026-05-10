import assert from "node:assert/strict";
import test from "node:test";
import { UrlPolicy } from "../src/url-policy.js";

test("resolves relative URLs against current page", () => {
  const policy = new UrlPolicy(["https://intranet.example.com/app"]);
  const url = policy.resolve("../billing", "https://intranet.example.com/app/customers/1");
  assert.equal(url.toString(), "https://intranet.example.com/app/billing");
});

test("enforces explicit origin and path allowlist", () => {
  const policy = new UrlPolicy(["https://intranet.example.com/app"]);
  assert.equal(policy.isAllowed("https://intranet.example.com/app/customers"), true);
  assert.equal(policy.isAllowed("https://intranet.example.com/admin"), false);
  assert.equal(policy.isAllowed("https://evil.example.com/app"), false);
});

test("implicit mode allows same origin as current page", () => {
  const policy = new UrlPolicy([]);
  assert.equal(policy.isAllowed("https://intranet.example.com/a", "https://intranet.example.com/b"), true);
  assert.equal(policy.isAllowed("https://other.example.com/a", "https://intranet.example.com/b"), false);
});

test("rejects non-http URLs", () => {
  const policy = new UrlPolicy([]);
  assert.throws(() => policy.resolve("javascript:alert(1)", "https://intranet.example.com/"));
});
