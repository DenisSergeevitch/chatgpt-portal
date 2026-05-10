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

test("explicit allowlist includes subdomains by default", () => {
  const policy = new UrlPolicy(["https://example.com"]);
  assert.equal(policy.isAllowed("https://app.example.com/"), true);
  assert.equal(policy.isAllowed("https://deep.app.example.com/"), true);
  assert.equal(policy.isAllowed("https://notexample.com/"), false);
  assert.equal(policy.isAllowed("http://app.example.com/"), false);
});

test("explicit path allowlist applies to subdomains", () => {
  const policy = new UrlPolicy(["https://example.com/app"]);
  assert.equal(policy.isAllowed("https://portal.example.com/app/case"), true);
  assert.equal(policy.isAllowed("https://portal.example.com/other"), false);
});

test("subdomain matching can be disabled", () => {
  const policy = new UrlPolicy(["https://example.com"], { allowSubdomains: false });
  assert.equal(policy.isAllowed("https://example.com/"), true);
  assert.equal(policy.isAllowed("https://app.example.com/"), false);
});

test("implicit mode allows same origin and subdomains of current page", () => {
  const policy = new UrlPolicy([]);
  assert.equal(policy.isAllowed("https://intranet.example.com/a", "https://intranet.example.com/b"), true);
  assert.equal(policy.isAllowed("https://app.example.com/", "https://example.com/"), true);
  assert.equal(policy.isAllowed("https://other.example.com/a", "https://intranet.example.com/b"), false);
  assert.equal(policy.isAllowed("https://example.com/", "https://app.example.com/"), false);
});

test("implicit subdomain matching can be disabled", () => {
  const policy = new UrlPolicy([], { allowSubdomains: false });
  assert.equal(policy.isAllowed("https://example.com/a", "https://example.com/b"), true);
  assert.equal(policy.isAllowed("https://app.example.com/", "https://example.com/"), false);
});

test("rejects non-http URLs", () => {
  const policy = new UrlPolicy([]);
  assert.throws(() => policy.resolve("javascript:alert(1)", "https://intranet.example.com/"));
});
