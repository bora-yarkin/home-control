/* Light effects as data (decision D-15): the catalogues Home Control offers, which one is for a light, how an effect is drawn, and the Settings page where
 an administrator imports a file. A plus integration (Hue Plus) brings its own catalogue; a light's effects that no catalogue knows are listed as the light reports them. */

/* The catalogues: [{ id, name, kind: "provider" | "file", lights: { entities, platforms, models }, groups: [{ id, label }], effects: [...], set_effect }]. */
var FX = { sources: [], ready: false, lights: [] };

function fxLoad(done) {
  HA.effects.sources().then(
    function (list) {
      FX.sources = Array.isArray(list) ? list : [];
    },
    function () {
      FX.sources = [];
    }
  ).then(function () {
    FX.ready = true;
    if (done) done();
  });
}

/* Whether a catalogue is for this light: its entity is named, or its integration, or its device's model. */
function fxMatches(src, id) {
  var w = src.lights || {},
    e = (H().entities || {})[id] || {},
    d = e.device_id ? (H().devices || {})[e.device_id] : null;
  return (
    (w.entities || []).indexOf(id) >= 0 ||
    (w.platforms || []).indexOf(e.platform) >= 0 ||
    (!!d && !!d.model && (w.models || []).indexOf(d.model) >= 0)
  );
}

/* The catalogue entry of an effect: from a catalogue that is for one of the lights in hand (FX.lights, set by the page that shows effects),
 else from any catalogue that lists it. */
function fxFind(name) {
  var hit = null;
  [true, false].forEach(function (needLight) {
    if (hit) return;
    FX.sources.forEach(function (src) {
      if (hit || (needLight && !FX.lights.some(function (id) { return fxMatches(src, id); }))) return;
      (src.effects || []).forEach(function (fx, i) {
        if (!hit && fx.id === name) hit = { src: src, fx: fx, rank: i };
      });
    });
  });
  return hit;
}

/* The effect as the panel reads it: null when no catalogue knows it. cat is the group (null: "more"), pal the preview colours, bri and spd the
 defaults, rng the part of the light's own speed scale the speed steps cover, v the colour variants [id, label, colour]. */
function lpFxCat(name) {
  var f = fxFind(name);
  if (!f) return null;
  var g = (f.src.groups || []).filter(function (x) {
    return x.id === f.fx.group;
  })[0];
  return {
    label: f.fx.label,
    cat: g ? f.src.id + ":" + g.id : null,
    catLabel: g ? g.label : "",
    h: f.fx.hue,
    pal: f.fx.palette || [],
    bri: f.fx.brightness,
    spd: f.fx.speed,
    rng: f.fx.speed_range,
    def: f.fx.default_label || "",
    v: (f.fx.variants || []).map(function (v) {
      return [v.id, v.label, v.colour];
    }),
    art: f.fx.art || "",
    src: f.src,
    rank: f.rank,
  };
}

/* The groups to show for these effect names, in the order the catalogues list them, then the effects no catalogue groups under "More".
 Returns [{ key, label, names }]. */
function fxGroups(names) {
  var by = {},
    order = [];
  names.forEach(function (n) {
    var c = lpFxCat(n),
      key = c && c.cat ? c.cat : "more";
    if (!by[key]) {
      by[key] = { key: key, label: c && c.cat ? c.catLabel : _T("fx_more"), names: [] };
      order.push(key);
    }
    by[key].names.push(n);
  });
  function rank(key) {
    if (key === "more") return 1e9;
    var out = 1e8;
    FX.sources.forEach(function (src, si) {
      (src.groups || []).forEach(function (g, gi) {
        if (src.id + ":" + g.id === key) out = si * 1000 + gi;
      });
    });
    return out;
  }
  order.sort(function (a, b) {
    return rank(a) - rank(b);
  });
  return order.map(function (k) {
    by[k].names.sort(function (x, y) {
      var cx = lpFxCat(x),
        cy = lpFxCat(y);
      return (cx ? cx.rank : 1e6) - (cy ? cy.rank : 1e6);
    });
    return by[k];
  });
}

/* ---- pictures ---- */

var FX_SVG_TAGS = ["svg", "defs", "g", "rect", "circle", "ellipse", "path", "polygon", "polyline", "line", "lineargradient", "radialgradient", "stop"];
/* The names as SVG spells them, for the two that have capitals. */
var FX_SVG_CASE = { lineargradient: "linearGradient", radialgradient: "radialGradient" };
var FX_SVG_ATTRS = [
  "viewbox", "preserveaspectratio", "id", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "fx", "fy", "d", "points",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "fill-opacity", "opacity", "offset", "stop-color",
  "stop-opacity", "transform", "gradienttransform", "gradientunits", "spreadmethod",
];
/* An attribute value is plain: numbers, colours, a path or point list, a transform, or a reference to something in the same picture. */
var FX_SVG_VALUE = /^[#\w\s.,%()\-+:]{0,600}$/;
var FX_SVG_REF = /url\(\s*#([\w-]+)\s*\)/g;

/* A picture an integration brought, rebuilt from a short list of elements and attributes and nothing else, with its ids made unique so two pictures on one page never
 take each other's gradients. An attribute that is not on the list or has an odd value is left out; a picture with any element that is not on the list (a script,
 a link, text, anything that could hold content) is not drawn at all (""). The result is made only of pieces that were checked, never of the text that was given. */
function fxSvg(text, uid) {
  if (typeof text !== "string" || text.length > 4000 || /<!|<\?|\]\]>/.test(text)) return "";
  var tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:'[^']*'|"[^"]*"))*)\s*(\/?)>/g,
    out = "",
    open = [],
    last = 0,
    m,
    seen = false;
  while ((m = tag.exec(text))) {
    if (text.slice(last, m.index).trim()) return ""; /* text between tags: not a picture */
    last = tag.lastIndex;
    var name = m[2].toLowerCase();
    if (FX_SVG_TAGS.indexOf(name) < 0) return ""; /* an element that is not on the list: the picture is not drawn */
    if (m[1]) {
      if (open.pop() !== name) return "";
      out += "</" + (FX_SVG_CASE[name] || name) + ">";
      continue;
    }
    if (!seen && name !== "svg") return "";
    seen = true;
    var attrs = "",
      a,
      ar = /([\w:-]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/g;
    while ((a = ar.exec(m[3]))) {
      var key = a[1].toLowerCase(),
        val = a[2] !== undefined ? a[2] : a[3];
      if (FX_SVG_ATTRS.indexOf(key) < 0 || !FX_SVG_VALUE.test(val)) continue;
      if (/url\(/i.test(val) && val.replace(FX_SVG_REF, "").indexOf("url(") >= 0) continue;
      val = val.replace(FX_SVG_REF, "url(#" + uid + "-$1)");
      if (key === "id") val = uid + "-" + val;
      attrs += " " + (key === "viewbox" ? "viewBox" : key === "preserveaspectratio" ? "preserveAspectRatio" : key === "gradienttransform" ? "gradientTransform" : key === "gradientunits" ? "gradientUnits" : key === "spreadmethod" ? "spreadMethod" : key) + "='" + val + "'";
    }
    if (m[4]) out += "<" + (FX_SVG_CASE[name] || name) + attrs + "/>";
    else {
      open.push(name);
      out += "<" + (FX_SVG_CASE[name] || name) + attrs + ">";
    }
  }
  if (text.slice(last).trim() || open.length || !seen) return "";
  return out;
}

var FX_ART_N = 0;

/* A picture for a palette: its colours as a gradient. */
function fxPaletteArt(palette) {
  var id = "fxp" + ++FX_ART_N,
    cols = palette.length > 1 ? palette : [palette[0], palette[0]];
  return (
    "<svg viewBox='0 0 100 100' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='" + id + "' x1='0' y1='0' x2='0' y2='1'>" +
    cols.map(function (c, i) {
      return "<stop offset='" + (i / (cols.length - 1)).toFixed(2) + "' stop-color='" + c + "'/>";
    }).join("") +
    "</linearGradient></defs><rect width='100' height='100' fill='url(#" + id + ")'/></svg>"
  );
}

/* The picture of an effect: the catalogue's own, else its palette, else a plain one. */
function lpFxArt(name) {
  var n = ++FX_ART_N;
  if (name === "off")
    return "<svg viewBox='0 0 100 100'><circle cx='50' cy='50' r='22' fill='none' stroke='currentColor' stroke-width='5' opacity='.6'/><path d='M34 66L66 34' stroke='currentColor' stroke-width='5' stroke-linecap='round' opacity='.6'/></svg>";
  var c = lpFxCat(name);
  if (c && c.art) {
    var own = fxSvg(c.art, "fx" + n);
    if (own) return own;
  }
  if (c && c.pal.length) return fxPaletteArt(c.pal);
  return fxPaletteArt(["#ffffff", "#8a8fff", "#1c1f4a"]);
}

/* What an effect is called: the catalogue's label, else the name as the light lists it with a capital. */
function lpFxLabel(name) {
  if (name === "off") return _T("no_effect");
  var c = lpFxCat(name);
  if (c && c.label) return c.label;
  var s = String(name).replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---- Settings: Effects ---- */

var FX_DOCS = "https://github.com/bora-yarkin/home-control/blob/main/docs/effects-file.md";

var FX_EXAMPLE = {
  schema: 1,
  name: "My strips",
  lights: { platforms: ["govee"] },
  groups: [{ id: "calm", label: "Calm" }],
  effects: [
    { id: "Aurora", label: "Aurora", group: "calm", palette: ["#86ecff", "#1f78bf", "#07203f"], brightness: 80 },
    { id: "Candle", group: "calm", palette: ["#ffd27a", "#ff8a1e"] },
  ],
};

/* The problems of a file that was refused, one row each, in a page of their own. */
var FX_PROBLEMS = [];

function fxProblemsPage(b) {
  b.appendChild(pill("info", _T("the_file_was_not_added"), { sub: function () { return _T("fix_these_and_import_it_again"); } }));
  FX_PROBLEMS.forEach(function (p) {
    var at = p.indexOf(": ");
    b.appendChild(pill("info", at > 0 ? p.slice(at + 2) : p, { sub: function () { return at > 0 ? p.slice(0, at) : ""; } }));
  });
}

function fxImportText(text, done) {
  HA.effects.importFile(text).then(
    function (r) {
      if (r && r.ok) {
        toast(_T("added") + r.name + "” · " + r.effects + " " + _T("effects"));
        fxLoad(done);
      } else {
        FX_PROBLEMS = (r && r.problems) || [_T("the_file_could_not_be_read")];
        showPopup("fx-problems", true);
      }
    },
    function () {
      toast(_T("the_file_could_not_be_read"));
    }
  );
}

function fxSettings(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    redrawBox(box, function () {
      FX.sources.forEach(function (src) {
        var n = (src.effects || []).length,
          row = pill(src.kind === "provider" ? "sparkle" : "sd", src.name, {
            sub: function () {
              return n + " " + (n === 1 ? _T("effect") : _T("effects")) + " · " + (src.kind === "provider" ? _T("from_an_integration") : _T("from_a_file"));
            },
            tap:
              src.kind === "file"
                ? function () {
                    confirmDlg(_T("remove") + src.name + "”?", function () {
                      HA.effects.removeFile(src.id).then(function () {
                        fxLoad(draw);
                      });
                    });
                  }
                : undefined,
          });
        box.appendChild(row);
      });
      if (!FX.sources.length) box.appendChild(pill("info", _T("no_effects_catalogue_yet"), {}));
      box.appendChild(
        pill("plus", _T("import_an_effects_file"), {
          sub: function () {
            return _T("for_lights_of_any_brand_a_json_file");
          },
          tap: function () {
            var inp = mk("input");
            inp.type = "file";
            inp.accept = ".json,application/json";
            inp.addEventListener("change", function () {
              var f = inp.files && inp.files[0];
              if (!f) return;
              var r = new FileReader();
              r.onload = function () {
                fxImportText(String(r.result), draw);
              };
              r.readAsText(f);
            });
            inp.click();
          },
        })
      );
      box.appendChild(
        pill("info", _T("how_to_write_an_effects_file"), {
          sub: function () {
            return _T("the_syntax_with_an_example");
          },
          tap: function () {
            window.open(FX_DOCS, "_blank", "noopener");
          },
        })
      );
      box.appendChild(
        pill("sd", _T("copy_an_example_file"), {
          sub: function () {
            return _T("to_start_from_or_to_give_an_ai");
          },
          tap: function () {
            var text = JSON.stringify(FX_EXAMPLE, null, 2);
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(_T("example_copied")); });
          },
        })
      );
    });
  }
  draw();
}
