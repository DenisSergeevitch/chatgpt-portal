import assert from "node:assert/strict";
import test from "node:test";
import { renderSearchPage } from "../src/render.js";

test("escapes search snippets while preserving highlight markers", () => {
  const html = renderSearchPage("token", "secret", [
    {
      url: "https://intranet.example.com/page",
      title: "Result",
      capturedAt: "2026-05-10T00:00:00.000Z",
      snippet: 'hello \u0001secret\u0002 <img src=x onerror="alert(1)">',
    },
  ]);

  assert.match(html, /<mark>secret<\/mark>/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});
