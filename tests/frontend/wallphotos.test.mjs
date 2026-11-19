// SPDX-License-Identifier: GPL-3.0-or-later
// The wall screen's photos: a gallery where each photo has a check that says whether it is used, an upload, and a saved list that keeps the photos switched off.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

const JPG = (n) => "data:image/jpeg;base64,AAAA" + n;

/* app/wall.js's photo gallery, with the real cleanCfg of app/store.js, on a pretend page. */
function wall(cfg) {
  const log = { toasts: [], confirms: [], picks: [], stored: 0 };
  const el = (cls = "") => {
    const classes = new Set(String(cls).split(" ").filter(Boolean));
    const e = {
      className: cls,
      children: [],
      attrs: {},
      listeners: {},
      classList: { has: (c) => classes.has(c) },
      appendChild(x) { this.children.push(x); return x; },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(n, fn) { (this.listeners[n] ||= []).push(fn); },
      click() { (this.listeners.click || []).forEach((fn) => fn({ stopPropagation() {} })); },
    };
    return e;
  };
  const sandbox = {
    STORE: { cfg: cfg },
    mk: (tag, cls) => el(cls),
    hintRow: (text) => Object.assign(el("hint"), { textContent: text }),
    svg: () => "",
    pill: (icon, name, o) => Object.assign(el("pill"), { name, o }),
    sep: (name) => Object.assign(el("sep"), { name }),
    textRow: (icon, ph, val, onChange) => Object.assign(el("sqw"), { ph, onChange }),
    redrawBox: (box, fn) => {
      box.children.length = 0;
      fn();
    },
    cntS: (n, a, b) => n + " " + (n === 1 ? a : b),
    confirmDlg: (text, fn, label) => log.confirms.push({ text, fn, label }),
    pickTextFile: (o, cb) => log.picks.push({ o, cb }),
    resizeImage: (f, cb) => cb(f.result),
    storeChanged: () => log.stored++,
    toast: (m) => log.toasts.push(m),
    _T: (k) => k,
    ALERT_KEYS: [],
    ENTRE: /^[a-z_]+\.[a-z0-9_]+$/,
    PREFS: {},
    Object, Array, Number,
  };
  vm.createContext(sandbox);
  const store = read("store.js");
  vm.runInContext(store.slice(store.indexOf("function cleanCfg"), store.indexOf("function seedStore")), sandbox);
  const w = read("wall.js");
  vm.runInContext(w.slice(w.indexOf("/* The photos the wall screen shows"), w.indexOf("/* Wall mode, with its idle time")), sandbox);
  const b = el();
  sandbox.wallPhotosPage(b);
  const box = () => b.children[0];
  const tiles = () => (box().children.filter((c) => c.className === "wg")[0] || { children: [] }).children;
  return { sandbox, log, tiles, box, state: () => plain(sandbox.STORE.cfg) };
}

test("the saved list keeps which photos are off, drops a photo that is not valid and moves the others' places with it", () => {
  const w = wall({});
  const clean = (c) => plain(w.sandbox.cleanCfg(c));
  const c = clean({ wallPhotos: [JPG(1), "http://not-https", JPG(2), "https://x/y.jpg", "junk", 5], wallOff: [0, 1, 3, 7, "x", 3] });
  assert.deepEqual(c.wallPhotos, [JPG(1), JPG(2), "https://x/y.jpg"]);
  assert.deepEqual(c.wallOff, [0, 2], "photo 0 stays 0, the dropped 1 is gone, the one at 3 is now 2, positions that do not exist are dropped");
  assert.deepEqual(clean({}).wallOff, []);
  assert.deepEqual(clean({ wallPhotos: Array.from({ length: 30 }, (_, i) => JPG(i)) }).wallPhotos.length, 16);
});

test("the wall screen uses only the photos that are on", () => {
  const w = wall({ wallPhotos: [JPG(1), JPG(2), JPG(3)], wallOff: [1] });
  assert.deepEqual(plain(w.sandbox.wallActive()), [JPG(1), JPG(3)]);
  assert.deepEqual(plain(wall({}).sandbox.wallActive()), []);
});

test("the gallery has a tile for every photo, each a checkbox that says whether it is used, in the saved order", () => {
  const w = wall(w0());
  function w0() {
    return { wallPhotos: [JPG(1), JPG(2), "https://x/y.jpg"], wallOff: [1] };
  }
  const t = w.tiles();
  assert.equal(t.length, 3);
  assert.deepEqual(t.map((x) => x.attrs["aria-checked"]), ["true", "false", "true"]);
  assert.deepEqual(t.map((x) => x.classList.has("off")), [false, true, false]);
  assert.equal(t[0].children[0].src, JPG(1));
  assert.ok(w.box().children.some((c) => c.name && String(c.name).startsWith("gallery")), "the heading counts the photos in use");
});

test("a tap on a tile uses the photo or not, and keeps the photo in the gallery either way", () => {
  const w = wall({ wallPhotos: [JPG(1), JPG(2)], wallOff: [] });
  w.tiles()[1].click();
  assert.deepEqual(w.state().wallOff, [1]);
  assert.deepEqual(w.state().wallPhotos, [JPG(1), JPG(2)], "still there");
  assert.equal(w.tiles()[1].attrs["aria-checked"], "false");
  w.tiles()[1].click();
  assert.deepEqual(w.state().wallOff, []);
});

test("the trash button asks first, then removes the photo and moves the off marks of the photos after it", () => {
  const w = wall({ wallPhotos: [JPG(1), JPG(2), JPG(3), JPG(4)], wallOff: [0, 2] });
  const trash = w.tiles()[1].children[2];
  trash.click();
  assert.equal(w.log.confirms.length, 1);
  assert.equal(w.log.confirms[0].label, "wg_remove", "the button says what it does");
  assert.deepEqual(w.state().wallPhotos.length, 4, "nothing removed yet");
  w.log.confirms[0].fn();
  assert.deepEqual(w.state().wallPhotos, [JPG(1), JPG(3), JPG(4)]);
  assert.deepEqual(w.state().wallOff, [0, 1], "photo 3 (was off at 2) is now at 1");
});

test("an uploaded photo is added and used at once; the 17th is refused; an address is checked before it is added", () => {
  const w = wall({ wallPhotos: [JPG(1)], wallOff: [0] });
  const upload = w.box().children.filter((c) => c.name === "upload_a_photo")[0];
  upload.o.tap();
  assert.equal(w.log.picks[0].o.accept, "image/*");
  assert.equal(w.log.picks[0].o.asFile, true);
  w.log.picks[0].cb({ result: JPG(2) });
  assert.deepEqual(w.state().wallPhotos, [JPG(1), JPG(2)]);
  assert.deepEqual(w.state().wallOff, [0], "the new one is in use");
  const row = w.box().children.filter((c) => c.ph && c.ph.indexOf("https") === 0)[0];
  row.onChange("http://nope");
  assert.ok(w.log.toasts.includes("use_an_https_or_local_address"));
  assert.equal(w.state().wallPhotos.length, 2);
  row.onChange("/local/wall/a.jpg");
  assert.equal(w.state().wallPhotos[2], "/local/wall/a.jpg");
  const full = wall({ wallPhotos: Array.from({ length: 16 }, (_, i) => JPG(i)), wallOff: [] });
  full.box().children.filter((c) => c.name === "upload_a_photo")[0].o.tap();
  full.log.picks[0].cb({ result: JPG(99) });
  assert.ok(full.log.toasts.includes("up_to_16_photos"));
  assert.equal(full.state().wallPhotos.length, 16);
});

test("the corner controls of a tile are placed over the picture: the style sheet outranks the rule that makes every child of a pane relative", () => {
  const css = readFileSync(new URL("../../custom_components/home_control/frontend/dashboard.css", import.meta.url), "utf8");
  assert.match(css, /\.wg-t>\.wg-x\{position:absolute;right:\d+px;top:\d+px/, "the trash button is at the top right");
  assert.match(css, /\.wg-t>\.wg-ck\{position:absolute;left:\d+px;top:\d+px/, "the check is at the top left");
  assert.match(css, /\.pane>\*\{position:relative/, "the rule they have to outrank is there");
});
