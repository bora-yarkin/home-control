/* Section presets (decision D-42): a Section saved as a file without any entity id, and loaded in another home by choosing an entity for each place. */

/* The Section with every entity of this home replaced by a place "$1", "$2"..., and what each place was: its domain and a name to recognise it by. */
function presetFrom(section) {
  var places = {},
    list = [],
    states = (H() && H().states) || {};
  function place(id) {
    if (!places[id]) {
      list.push({ domain: dom(id), name: (states[id] && states[id].attributes.friendly_name) || "" });
      places[id] = list.length;
    }
    return places[id];
  }
  function walk(v) {
    if (typeof v === "string") {
      if (ENTRE.test(v) && (states[v] || v.indexOf("media_player.") === 0)) return "$" + place(v);
      /* an entity named inside a longer text (a template, an action's data) leaves the file too */
      return v.replace(/\b[a-z_]+\.[a-z0-9_]+\b/g, function (id) {
        return states[id] ? "{{hc:" + place(id) + "}}" : id;
      });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) {
        /* the devices and areas of this home mean nothing in another */
        if (k !== "device_id" && k !== "area_id") o[walk(k)] = walk(v[k]);
      });
      return o;
    }
    return v;
  }
  var copy = walk(JSON.parse(JSON.stringify(section)));
  delete copy.id;
  return { format: "home-control.section", version: 1, section: copy, places: list };
}

/* The preset with the chosen entities put in its places ("$1" is chosen[0]); a place left empty drops out with whatever needed it, when the Section is cleaned. */
function presetFill(preset, chosen) {
  function walk(v) {
    if (typeof v === "string") {
      var m = /^\$(\d+)$/.exec(v);
      if (m) return chosen[+m[1] - 1] || "";
      return v.replace(/\{\{hc:(\d+)\}\}/g, function (all, n) {
        return chosen[+n - 1] || "";
      });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) {
        o[walk(k)] = walk(v[k]);
      });
      return o;
    }
    return v;
  }
  return walk(preset.section);
}

function presetValid(p) {
  return !!(p && (p.format === "home-control.section" || p.format === "home-control.device") && p.version === 1 && p.section && Array.isArray(p.places) && p.places.length <= 200);
}

/* Every action a file would let someone run, so it is read before it is added. */
function presetActions(v, out) {
  out = out || [];
  if (Array.isArray(v))
    v.forEach(function (x) {
      presetActions(x, out);
    });
  else if (v && typeof v === "object") {
    var name = v.t === "do" && typeof v.s === "string" ? v.s : typeof v.action === "string" ? v.action : "";
    if (name) {
      var text = name + (v.d || v.data ? " " + JSON.stringify(v.d || v.data).slice(0, 200) : "");
      if (out.indexOf(text) < 0) out.push(text);
    }
    Object.keys(v).forEach(function (k) {
      presetActions(v[k], out);
    });
  }
  return out;
}

/* An appliance and the blocks added to its popup, as a file without this home's entities. */
function presetFromDevice(d) {
  var more = moreSection("appliance:" + d.aid),
    out = presetFrom({ device: d, blocks: more ? more.sec.devs : [] });
  out.format = "home-control.device";
  return out;
}

function presetDownload(preset, name) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
  }, 4000);
}

function presetSave(section) {
  presetDownload(presetFrom(section), "home-control-section.json");
}

var PRESET = null;

/* Asks for a preset file and opens the page where its places are filled. */
function presetOpen(scopeId) {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", function () {
    var file = input.files && input.files[0];
    if (!file || file.size > 500000) return toast(_T("preset_not_read"));
    file
      .text()
      .then(function (text) {
        var p = JSON.parse(text);
        if (!presetValid(p)) throw new Error("not a preset");
        PRESET = { scope: scopeId, preset: p, chosen: [] };
        showPopup("preset", true);
      })
      .catch(function () {
        toast(_T("preset_not_read"));
      });
  });
  input.click();
}

/* A device file: the appliance with ids of its own, and the blocks of its popup. */
function presetAddDevice() {
  /* the Add popup names a Section ("~page~section"); the blocks go on its page */
  var sc = scopeKey(PRESET.scope.charAt(0) === "~" ? PRESET.scope.split("~")[1] : PRESET.scope),
    filled = presetFill(PRESET.preset, PRESET.chosen),
    d = filled.device || {};
  d.aid = newKey("ap");
  var clean = cleanDev(d);
  if (!clean || clean.kind !== "appliance") return toast(_T("preset_not_read"));
  devList(PRESET.scope).push(clean);
  var blocks = (Array.isArray(filled.blocks) ? filled.blocks : []).slice(0, 40);
  blocks.forEach(function (x) {
    if (x && x.kind === "widget") x.wid = widgetNewId();
  });
  blocks = blocks.map(cleanDev).filter(Boolean);
  if (blocks.length) {
    var arr = secOrder(sc);
    arr.push({ id: newSecId(arr), k: "devs", hide: false, of: widgetNewId(), pk: "appliance:" + clean.aid, devs: blocks });
    setSecOrder(sc, arr);
  }
  uiChanged();
  toast(_T("preset_device_added"));
  closeSheet();
}

function presetAdd() {
  if (PRESET.preset.format === "home-control.device") return presetAddDevice();
  var sc = scopeKey(PRESET.scope),
    arr = secOrder(sc),
    filled = presetFill(PRESET.preset, PRESET.chosen);
  filled.id = newSecId(arr);
  delete filled.of;
  /* widgets get ids of their own */
  (filled.devs || []).forEach(function (d) {
    if (d.kind === "widget") d.wid = widgetNewId();
  });
  var clean = cleanLayout([filled])[0];
  if (!clean) return toast(_T("preset_not_read"));
  arr.push(clean);
  setSecOrder(sc, arr);
  uiChanged();
  toast(_T("preset_added"));
  closeSheet();
}

function presetPage(b) {
  if (!PRESET) return;
  b.appendChild(hintRow(_T("preset_places_hint")));
  PRESET.preset.places.forEach(function (place, i) {
    b.appendChild(
      pill("search", place.name || place.domain, {
        sub: function () {
          return PRESET.chosen[i] || _T("ap_choose_an_entity") + " · " + place.domain;
        },
        tap: function () {
          pickEntity(place.name || place.domain, [place.domain], null, function (id) {
            PRESET.chosen[i] = id;
          });
        },
      })
    );
  });
  var actions = presetActions(PRESET.preset.section);
  if (actions.length) {
    b.appendChild(sep(_T("preset_runs"), "play"));
    actions.forEach(function (text) {
      b.appendChild(hintRow(text));
    });
  }
  b.appendChild(pill("check", _T(PRESET.preset.format === "home-control.device" ? "preset_add_device" : "preset_add"), { tap: presetAdd }));
}
