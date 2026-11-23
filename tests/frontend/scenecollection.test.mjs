// SPDX-License-Identifier: GPL-3.0-or-later
// Scenes in a Section are devices of it: a scene, a scene made on the dashboard, and a collection of scenes that fills itself in. A Section has no scene settings of its own.
// Run: node --test tests/frontend
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP = new URL("../../custom_components/home_control/frontend/app/", import.meta.url);
const read = (name) => readFileSync(new URL(name, APP), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
const piece = (file, from, to) => {
  const s = read(file);
  const a = s.indexOf(from);
  assert.ok(a >= 0, from);
  return s.slice(a, to ? s.indexOf(to, a) : undefined);
};

function modelWorld() {
  const ctx = vm.createContext({
    _T: (k) => k,
    iconOk: (n) => typeof n === "string" && !!n,
    window: {},
    document: { getElementById: () => null, querySelector: () => null },
    deviceGet: (k, d) => d,
    uiChanged() {},
    H: () => ({ states: {}, areas: {} }),
    TITLES: {},
    cleanCond: () => null,
  });
  for (const f of ["model.js", "sections.js", "glance.js", "mastersettings.js", "lightsmasters.js"]) vm.runInContext(read(f), ctx, { filename: f });
  ctx.cleanCond = () => null;
  return ctx;
}

test("a scenes section becomes a Section: its scenes are devices of it, and what it took in by page, tag and area is one collection of scenes; nothing of it stays on the Section", () => {
  const w = modelWorld();
  const out = plain(
    w.cleanLayout([{ id: "sc1", k: "scenes", scn: ["a1", "a2"], sents: ["scene.bath_dim", "light.x"], sarea: "bath", stag: ["warm"], xtag: ["kids"], spage: ["home"], hscn: ["scene.hidden"], keepname: 1 }]),
  )[0];
  assert.equal(out.k, "devs");
  assert.equal(out.t, "scenes", "it keeps being called Scenes");
  for (const k of ["scn", "sents", "sarea", "stag", "xtag", "spage", "hscn", "keepname", "scs", "pord"]) assert.equal(k in out, false, k + " is not on the Section");
  assert.deepEqual(out.devs.map((d) => d.kind + ":" + (d.sid || d.id)).slice(0, 3), ["cscene:a1", "cscene:a2", "scene:scene.bath_dim"]);
  const collection = out.devs.find((d) => d.kind === "scenes");
  assert.deepEqual([collection.spage, collection.stag, collection.xtag, collection.keepname], [["page:home", "hue:bath"], ["warm"], ["kids"], 1], "pages and Hue rooms are rooms of one list");
});

test("a scenes section that chose nothing is a collection of the page's area scenes, as it was; quick actions are the scenes made for Home", () => {
  const w = modelWorld();
  const out = plain(w.cleanLayout([{ id: "sc1", k: "scenes" }, { id: "quick", k: "quick", scn: ["q1"] }]));
  assert.deepEqual(out[0].devs.map((d) => d.kind), ["scenes"]);
  assert.deepEqual(out[0].devs[0].spage, ["hue:@page"], "no area named: the page's own Hue room");
  assert.deepEqual(out[1].devs.map((d) => d.kind + ":" + d.sid), ["cscene:q1"]);
});

test("a Section that is a master's keeps its scn (the master's scenes) and is not turned into scenes", () => {
  const w = modelWorld();
  const out = plain(w.cleanLayout([{ id: "m1", k: "devs", master: 1, scn: ["x1"], devs: [] }]))[0];
  assert.deepEqual(out.scn, ["x1"]);
  assert.deepEqual(out.devs, []);
});

test("a scene entity and a scene made on the dashboard are devices; a collection keeps only valid settings", () => {
  const w = modelWorld();
  const out = plain(
    w.cleanLayout([
      {
        id: "s1",
        k: "devs",
        devs: [
          { id: "scene.a", name: "A", icon: "scene", kind: "scene" },
          { id: "light.a", name: "L", icon: "scene", kind: "scene" },
          { id: "", sid: "mine1", name: "Scene", icon: "scene", kind: "cscene" },
          { id: "", sid: "Bad Id", name: "Scene", icon: "scene", kind: "cscene" },
          { id: "", name: "Many", icon: "scene", kind: "scenes", spage: ["page:home", "page:Bad Id", "hue:bath", "hue:@page", "x"], stag: ["Warm", "warm"], xtag: ["kids"] },
        ],
      },
    ]),
  )[0];
  assert.deepEqual(out.devs.map((d) => d.kind), ["scene", "cscene", "scenes"], "a scene device must be a scene entity, and a made scene needs a valid id");
  assert.deepEqual([out.devs[2].spage, out.devs[2].stag, out.devs[2].xtag], [["page:home", "hue:bath", "hue:@page"], ["warm"], ["kids"]]);
});

test("a collection takes in the scenes of the pages and tags it names (less the tagged ones left out) and the scene entities of its Hue rooms", () => {
  const sc = [{ id: "a", room: "bora" }, { id: "b", room: "bath", tags: ["bath"] }, { id: "c", room: "home" }, { id: "d", room: "bora", tags: ["kids"] }];
  const ctx = vm.createContext({
    STORE: { scenes: sc },
    UIROOM: { bora: { area: "bedroom" } },
    pageKey: () => "bora",
    sceneAllowed: () => true,
    sceneIds: (a) => (a === "bedroom" ? [["scene.one"], ["scene.two"]] : a === "bath" ? [["scene.bath"]] : []),
    Array, Object,
  });
  vm.runInContext(piece("scenes.js", "/* Whether a scene has any of these tags. */", "function scnToggle"), ctx);
  vm.runInContext(piece("scenes.js", "function sceneCollectionItems(d) {", "/* A collection of scenes as a device:"), ctx);
  const run = (d) => {
    const r = ctx.sceneCollectionItems(d);
    return plain([r.stored.map((x) => x.id), r.ents]);
  };
  assert.deepEqual(run({ spage: ["hue:@page"] }), [[], ["scene.one", "scene.two"]], "the page's own Hue room");
  assert.deepEqual(run({ spage: ["page:bora"], xtag: ["kids"] }), [["a"], []]);
  assert.deepEqual(run({ stag: ["bath"], spage: ["hue:bath"] }), [["b"], ["scene.bath"]]);
  assert.deepEqual(run({ spage: ["page:home"] }), [["c"], []], "a page brings no scene entities");
  assert.deepEqual(run({}), [[], []], "nothing named: nothing");
});

test("the add popup adds a checked scene entity as a scene device, a checked dashboard scene as a made-scene device, and a collection as one device that opens its settings", () => {
  const sandbox = { sectionOfList: () => ({}), dom: (id) => id.split(".")[0], DOMKIND: { scene: "scene" }, defIcon: () => "scene", placeDevice: (rid, d) => ((sandbox.last = d), { rid, i: 0 }), devSetupKind: () => null, kAuto: () => 0, devSetupAlways: () => false, sceneById: (id) => ({ id, icon: "sparkle" }) };
  vm.createContext(sandbox);
  vm.runInContext(piece("addpopup.js", "function addCandidate", "/* Puts a device where the popup was opened"), sandbox);
  sandbox.addCandidate("~bora~s1", { id: "scene.bath_dim", name: "Dim" });
  assert.equal(sandbox.last.kind, "scene");
  sandbox.addCandidate("~bora~s1", { id: "dscene:mine1", name: "Mine" });
  assert.deepEqual([sandbox.last.kind, sandbox.last.sid, sandbox.last.icon], ["cscene", "mine1", "sparkle"]);
  const popup = read("addpopup.js");
  assert.match(popup, /kind: "scenes"/);
  assert.match(popup, /showPopup\("manage-dev:" \+ at\.rid \+ ":" \+ at\.i, false\)/);
});

test("a Section has no scene settings of its own: the Scenes settings are the collection's, in its Behaviour tab", () => {
  assert.doesNotMatch(read("editor.js"), /scene_names_without_area|sceneTagSectionRows|pick-scene|Scenes from|scenes_from/);
  assert.match(read("manage.js"), /if \(d\.kind === "scenes"\) sceneCollectionSettings\(box, d\)/);
  assert.match(read("scenes.js"), /if \(d\.kind === "scenes"\) return sceneCollectionRow\(d\)/);
  assert.doesNotMatch(read("scenes.js"), /sectionHasScenes|scenesBlock/);
});
