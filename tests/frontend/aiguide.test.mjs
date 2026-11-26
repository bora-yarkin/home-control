// SPDX-License-Identifier: GPL-3.0-or-later
// The example of docs/ai-setup.md is kept whole by the dashboard's own checks, so the guide cannot drift from the code. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const doc = readFileSync(new URL("../../docs/ai-setup.md", import.meta.url), "utf8");
const example = JSON.parse([...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]).filter((t) => t.includes('"app": "dashboard"'))[0]);

function world() {
  const stub = new Proxy(function () {}, { get: () => stub, apply: () => stub });
  const ctx = vm.createContext({
    _T: (k) => k,
    window: {},
    document: stub,
    iconOk: (n) => typeof n === "string" && !!n,
    imgOk: () => false,
    deviceGet: (k, d) => d,
    dom: (id) => id.split(".")[0],
    uiChanged() {},
    H: () => ({ states: {}, areas: {}, entities: {} }),
    IC: {},
    ICON_RE: /^mdi:/,
    NRULES: {},
    ALERT_KEYS: [],
    SAVED_MAX: 40,
    cleanCond: () => null,
    cleanNotify: () => ({}),
    cleanAccess: () => null,
    cleanIcons: () => ({}),
    GL_IDS: [],
    GL_DOMS: [],
    CHH: { "6h": 1, "24h": 1, "7d": 1, "30d": 1 },
    TITLES: {},
  });
  for (const f of ["model.js", "sections.js", "widgetkinds.js", "homewidgets.js", "remotemaster.js", "pins.js", "store.js"]) vm.runInContext(read(f), ctx, { filename: f });
  ctx.cleanCond = () => null;
  return ctx;
}

/* every value of the example is still there after the checks */
function lost(asked, kept, at, out) {
  if (asked && typeof asked === "object") {
    for (const k of Object.keys(asked)) {
      if (Array.isArray(asked[k]) && !asked[k].length) continue;
      if (asked[k] && typeof asked[k] === "object" && !Object.keys(asked[k]).length) continue;
      if (!kept || kept[k] === undefined) out.push(at + k);
      else lost(asked[k], kept[k], at + k + ".", out);
    }
  } else if (asked !== kept) out.push(at.slice(0, -1) + " = " + kept);
  return out;
}

test("the AI guide's example is accepted whole", () => {
  const w = world();
  const clean = JSON.parse(JSON.stringify(w.cleanStore(JSON.parse(JSON.stringify(example.data)))));
  assert.deepEqual(lost(example.data, clean, "", []), []);
});

test("every widget type the guide names exists", () => {
  const w = world();
  const named = [...doc.slice(doc.indexOf("### Widgets"), doc.indexOf("**Lights master**")).matchAll(/^\| (`[^|]+`) \|/gm)].flatMap((m) => [...m[1].matchAll(/`([a-z]+)`/g)].map((x) => x[1]));
  const known = Object.keys(vm.runInContext("WIDGETS", w));
  assert.deepEqual(named.filter((n) => n !== "w" && !known.includes(n)), []);
  assert.deepEqual(known.filter((n) => !named.includes(n)), [], "and none is left out");
});
