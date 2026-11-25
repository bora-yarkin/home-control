// SPDX-License-Identifier: GPL-3.0-or-later
// The layout audit of the harness (tests/frontend/harness/layout.js), run in a real browser: every widget on the Showcase page is measured at a phone and a tablet width,
// and any square card, any missing padding, and any two controls that touch fail the test. It needs Chrome (see helpers/browser.mjs): with no browser the test is skipped on a
// developer's machine and FAILS where CI is set, so a run that measured nothing is never green. Run: node --test tests/frontend
import assert from "node:assert/strict";
import test from "node:test";
import { findChrome, launch, open, serve } from "./helpers/browser.mjs";

const chrome = findChrome();

test("the widgets of the Showcase page have rounded corners, padding and room between them, at a phone width and a tablet width", { timeout: 180000, skip: !chrome && !process.env.CI ? "no Chrome found (set CHROME_PATH)" : false }, async () => {
  assert.ok(chrome, "CI needs Chrome or Chromium: this check must run, not be skipped");
  const server = await serve();
  const browser = await launch(chrome);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [width, height] of [[390, 844], [760, 1000]]) {
      await open(browser, base, width, height);
      const report = await browser.evaluate(`(async () => { const r = await auditSurfaces([{ page: "showcase", within: ".sec:has(.wgrid)", label: "widgets" }]); return r.findings; })()`);
      assert.ok(Array.isArray(report.widgets), "the audit ran");
      assert.deepEqual(report.widgets, [], `layout faults at ${width}px wide:\n  ` + report.widgets.join("\n  "));
    }
  } finally {
    browser.close();
    server.closeAllConnections();
    server.close();
  }
});

test("the audit finds a square card, a card with no padding, and two controls that touch (so a green run means something)", { timeout: 120000, skip: !chrome && !process.env.CI ? "no Chrome found (set CHROME_PATH)" : false }, async () => {
  assert.ok(chrome, "CI needs Chrome or Chromium");
  const server = await serve();
  const browser = await launch(chrome);
  try {
    await open(browser, `http://127.0.0.1:${server.address().port}`, 760, 1000);
    const findings = await browser.evaluate(`(() => {
      const box = document.createElement("div");
      box.style.cssText = "position:absolute;top:10px;left:10px;width:400px";
      box.innerHTML = "<div class='np pane' style='border-radius:0;padding:0'>Square and bare</div><div class='pill pane' style='margin:0;min-height:40px'>One</div><div class='pill pane' style='margin:0;min-height:40px'>Two</div>";
      document.body.appendChild(box);
      const out = auditLayout(box);
      box.remove();
      return out;
    })()`);
    const kinds = new Set(findings.map((f) => f.split(":")[0]));
    for (const k of ["radius", "padding", "touching"]) assert.ok(kinds.has(k), `a ${k} fault is found (found: ${[...kinds].join(", ") || "nothing"})`);
  } finally {
    browser.close();
    server.closeAllConnections();
    server.close();
  }
});
