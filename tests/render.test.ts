import assert from "node:assert/strict";
import test from "node:test";
import { renderSearchPage, renderSnapshotPage } from "../src/render.js";

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

test("renders controlled form actions for inputs, selects, and files", () => {
  const html = renderSnapshotPage("token", {
    url: "https://intranet.example.com/form",
    title: "Form",
    capturedAt: "2026-05-10T00:00:00.000Z",
    markdown: "# Form\n**Service provider**: [text input]",
    visibleText: "Form page",
    headings: [],
    links: [],
    buttons: [],
    controls: [
      {
        id: "c1",
        kind: "radio",
        label: "Personal",
        checked: false,
        disabled: false,
        required: true,
        risk: "input",
      },
      {
        id: "c2",
        kind: "text",
        label: "Service provider",
        disabled: false,
        required: true,
        hasValue: true,
        risk: "input",
      },
      {
        id: "c3",
        kind: "file",
        label: "Evidence",
        disabled: false,
        required: false,
        accept: ".pdf",
        risk: "input",
      },
    ],
    forms: [],
  });

  assert.match(html, /\/s\/token\/select\?id=c1/);
  assert.match(html, /Structured markdown/);
  assert.match(html, /# Form/);
  assert.match(html, /action="\/s\/token\/fill"/);
  assert.match(html, /action="\/s\/token\/upload"/);
  assert.match(html, /\/s\/token\/files/);
});
