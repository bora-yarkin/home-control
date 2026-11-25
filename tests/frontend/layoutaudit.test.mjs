// SPDX-License-Identifier: GPL-3.0-or-later
// The layout audit of the harness (tests/frontend/harness/layout.js), run in a real browser: every widget on the Showcase page is measured at a phone and a tablet width,
// and any square card, any missing padding, and any two controls that touch fail the test. It needs Chrome (or Chromium): set CHROME_PATH when it is not found; with no
// browser the test is skipped on a developer's machine and FAILS where CI is set, so a run that measured nothing is never green. No dependency: Chrome is driven over its
// DevTools protocol with Node's own http and WebSocket. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  const named = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [];
  const fixed = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  for (const c of [...named, ...fixed]) if (existsSync(c)) return c;
  for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const r = spawnSync("which", [n], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

/* The repository, as files, on a port of its own. */
function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function launch(chrome) {
  const dir = mkdtempSync(path.join(tmpdir(), "hc-audit-"));
  const args = ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "about:blank"];
  if (process.env.CI) args.unshift("--no-sandbox");
  /* its own process group, so that Chrome and its helper processes are all stopped at the end */
  const proc = spawn(chrome, args, { stdio: "ignore", detached: true });
  let port = null;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    const f = path.join(dir, "DevToolsActivePort");
    if (existsSync(f)) port = Number(readFileSync(f, "utf8").split("\n")[0]);
  }
  assert.ok(port, "Chrome did not start");
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      waiting.set(n, (msg) => (msg.error ? reject(new Error(method + ": " + msg.error.message)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("page: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const close = () => {
    ws.close();
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      proc.kill("SIGKILL");
    }
    rmSync(dir, { recursive: true, force: true });
  };
  return { send, evaluate, close };
}

/* The harness, opened at a width, with the Showcase page built. */
async function open(browser, base, width, height) {
  await browser.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await browser.send("Page.navigate", { url: `${base}/tests/frontend/harness/index.html` });
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    const ready = await browser.evaluate("!!(window.BOOTED && window.UI && UI.rooms.some((r) => r.id === 'showcase') && window.auditSurfaces && window.go)").catch(() => false);
    if (ready) return;
  }
  assert.fail("the harness did not start");
}

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
      box.innerHTML = "<div class='wc pane' style='border-radius:0;padding:0'>Square and bare</div><div class='pill pane' style='margin:0;min-height:40px'>One</div><div class='pill pane' style='margin:0;min-height:40px'>Two</div>";
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
