// SPDX-License-Identifier: GPL-3.0-or-later
// Every function the application calls exists: a call to a name nobody defines fails only when it is tapped (the vacuum appliance's Stop and dock did nothing from 0.29.0).
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const files = readdirSync(new URL("app/", root))
  .filter((f) => f.endsWith(".js") && f !== "strings.js" && f !== "icons.js")
  .map((f) => "app/" + f)
  .concat(["app/strings.js", "app/icons.js", "integrations.js", "ha-adapter.js", "camera-stream.js", "dashboard-app.js"]);

/* The source with comments, texts and regular expressions blanked, so only code is left. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|(?<=[(,=:[!&|?{};]\s*)\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[a-z]*/g, " ");
}

const BUILTIN = new Set(
  "if for while switch catch function return typeof new delete void throw in of do else await yield super async Array Object String Number Boolean Math Date JSON Promise Set Map WeakMap Error TypeError RegExp Symbol Function parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent setTimeout setInterval clearTimeout clearInterval requestAnimationFrame cancelAnimationFrame fetch getComputedStyle matchMedia URL URLSearchParams Blob File FileReader FormData Image Audio Event CustomEvent KeyboardEvent MutationObserver ResizeObserver IntersectionObserver AbortController WebSocket RTCPeerConnection MediaStream AudioContext Uint8Array Int16Array Int32Array Float32Array ArrayBuffer DataView TextEncoder TextDecoder btoa atob alert confirm prompt structuredClone queueMicrotask Intl Notification XMLSerializer DOMParser Path2D Option".split(" "),
);

test("no file calls a function that nobody defines", () => {
  const sources = files.map((f) => [f, code(readFileSync(new URL(f, root), "utf8"))]);
  const defined = new Set(BUILTIN);
  for (const [, src] of sources) {
    for (const m of src.matchAll(/\bfunction\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g)) {
      if (m[1]) defined.add(m[1]);
      for (const p of m[2].split(",")) defined.add(p.trim().replace(/=.*$/, "").trim());
    }
    for (const m of src.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
    /* further names of one declaration: var a = 1, b = 2 */
    for (const m of src.matchAll(/,\s*\n?\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g)) defined.add(m[1]);
    for (const m of src.matchAll(/\(([A-Za-z_$][\w$, ]*)\)\s*=>|\b([A-Za-z_$][\w$]*)\s*=>/g)) for (const p of (m[1] || m[2]).split(",")) defined.add(p.trim());
    /* getters and setters of an object */
    for (const m of src.matchAll(/\b(?:get|set)\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
    for (const m of src.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm)) defined.add(m[1]);
  }
  const unknown = [];
  for (const [file, src] of sources)
    for (const m of src.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) if (!defined.has(m[1])) unknown.push(file + ": " + m[1]);
  assert.deepEqual([...new Set(unknown)], []);
});
