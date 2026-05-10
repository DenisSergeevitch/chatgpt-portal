import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicViewUrl, extractLocalViewUrl, extractTryCloudflareUrl } from "../src/share.js";

test("extracts local tokenized view URL from bridge output", () => {
  const text = "Local view URL: http://127.0.0.1:7777/s/abc_DEF-123/view";
  assert.equal(extractLocalViewUrl(text), "http://127.0.0.1:7777/s/abc_DEF-123/view");
});

test("extracts trycloudflare URL from tunnel output", () => {
  const text = "Your quick Tunnel has been created! Visit it at https://random-name.trycloudflare.com";
  assert.equal(extractTryCloudflareUrl(text), "https://random-name.trycloudflare.com");
});

test("builds public tokenized view URL without manual combining", () => {
  const url = buildPublicViewUrl(
    "https://random-name.trycloudflare.com",
    "http://127.0.0.1:7777/s/abc_DEF-123/view"
  );

  assert.equal(url, "https://random-name.trycloudflare.com/s/abc_DEF-123/view");
});
