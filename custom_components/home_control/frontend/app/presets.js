/* Section presets (decision D-42): a Section saved as a file without any entity id, and loaded in another home by choosing an entity for each place. */

/* The Section with every entity of this home replaced by a place "$1", "$2"..., and what each place was: its domain and a name to recognise it by. */
function presetFrom(section) {
  var places = {},
    list = [],
    states = (H() && H().states) || {};
  function walk(v) {
    if (typeof v === "string") {
      if (!ENTRE.test(v) || !(states[v] || v.indexOf("media_player.") === 0)) return v;
      if (!places[v]) {
        list.push({ domain: dom(v), name: (states[v] && states[v].attributes.friendly_name) || "" });
        places[v] = "$" + list.length;
      }
      return places[v];
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
  var copy = walk(JSON.parse(JSON.stringify(section)));
  delete copy.id;
  return { format: "home-control.section", version: 1, section: copy, places: list };
}

/* The preset with the chosen entities put in its places ("$1" is chosen[0]); a place left empty drops out with whatever needed it, when the Section is cleaned. */
function presetFill(preset, chosen) {
  function walk(v) {
    if (typeof v === "string") {
      var m = /^\$(\d+)$/.exec(v);
      return m ? chosen[+m[1] - 1] || "" : v;
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
  return !!(p && p.format === "home-control.section" && p.version === 1 && p.section && Array.isArray(p.places) && p.places.length <= 200);
}

function presetSave(section) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(presetFrom(section), null, 2)], { type: "application/json" }));
  a.download = "home-control-section.json";
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
  }, 4000);
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

function presetAdd() {
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
  b.appendChild(pill("check", _T("preset_add"), { tap: presetAdd }));
}
