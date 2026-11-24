// SPDX-License-Identifier: GPL-3.0-or-later
// There is one header size. The slim header and its settings are gone, and a saved page that still says slim keeps the regular header. Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/", import.meta.url);
const read = (path) => readFileSync(new URL(path, APP), "utf8");

test("a saved header that says slim is cleaned to a header with a clock and no size", () => {
  const sandbox = { _T: (k) => k, cleanHdr: () => [] };
  vm.createContext(sandbox);
  const model = read("app/model.js");
  const from = model.indexOf("function cleanMeta(");
  vm.runInContext(model.slice(from, model.indexOf("\n}\n", from) + 3), sandbox);
  const meta = JSON.parse(JSON.stringify(sandbox.cleanMeta({ size: "slim", clockSlim: true, clock: true })));
  assert.equal(meta.size, undefined);
  assert.equal(meta.clockSlim, undefined);
  assert.equal(meta.clock, true);
});

test("nothing of the slim header is left in the code, the style sheet or the settings", () => {
  for (const file of ["app/header.js", "app/appearance.js", "app/manage.js", "app/model.js", "app/settings.js", "app/strings.js", "dashboard.css"])
    assert.doesNotMatch(read(file), /slim|hdrSize|clockSlim/i, file);
});
