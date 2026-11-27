/* Any Home Assistant action on a button or a gesture (decision D-47): what it is, what it is aimed at, its data, and whether it asks first. The action is the remote builder's
   {t: "do", s, tg, d, q, n} (cleanDo in app/model.js), so every place that takes a button's action takes it. */

/* Commands that run programs, restart or stop the system or wipe data: only an administrator may run them, and they always ask. */
var ACT_ADMIN = /^(shell_command|python_script|pyscript|hassio|backup|recorder|system_log)\.|^homeassistant\.(restart|stop|reload_all|reload_core_config|set_location|reload_config_entry)$|^[a-z0-9_]+\.(purge|reboot|shutdown|restart)[a-z0-9_]*$/;
/* Commands that open the home or remove something: they always ask. */
var ACT_ASKS = /^lock\.(unlock|open)$|^alarm_control_panel\.alarm_disarm$|^update\.install$|^[a-z0-9_]+\.(remove|delete|clear|reload)[a-z0-9_]*$/;

function actRisk(service) {
  return ACT_ADMIN.test(service) ? "admin" : ACT_ASKS.test(service) ? "ask" : "";
}

function actList(v) {
  return Array.isArray(v) ? v : typeof v === "string" && v ? [v] : [];
}

/* Every entity the action reaches: named, or through a device or an area, in its target or its data. The access rules and "ask first" apply to all of them. */
function actIds(a) {
  var h = H(),
    out = [],
    devices = {},
    areas = {};
  /* an entity named anywhere in the data (a scene's `entities`, a player's group) counts too */
  (function named(v) {
    if (typeof v === "string") {
      if (h && h.states && h.states[v] && out.indexOf(v) < 0) out.push(v);
    } else if (v && typeof v === "object")
      Object.keys(v).forEach(function (k) {
        named(k);
        named(v[k]);
      });
  })(a.d);
  [a.tg || {}, a.d || {}].forEach(function (src) {
    actList(src.entity_id).forEach(function (id) {
      if (out.indexOf(id) < 0) out.push(id);
    });
    actList(src.device_id).forEach(function (id) {
      devices[id] = 1;
    });
    actList(src.area_id).forEach(function (id) {
      areas[id] = 1;
    });
  });
  if (Object.keys(devices).length || Object.keys(areas).length)
    Object.keys((h && h.entities) || {}).forEach(function (id) {
      var e = h.entities[id],
        dv = e.device_id && h.devices && h.devices[e.device_id],
        area = e.area_id || (dv && dv.area_id);
      if (((e.device_id && devices[e.device_id]) || (area && areas[area])) && out.indexOf(id) < 0) out.push(id);
    });
  return out;
}

/* Whether it is aimed at something the dashboard cannot list the entities of (a floor, a label, everything), so the access rules cannot be applied to it. */
function actWide(a) {
  return [a.tg || {}, a.d || {}].some(function (src) {
    return src.floor_id !== undefined || src.label_id !== undefined || actList(src.entity_id).indexOf("all") >= 0;
  });
}

function actCall(a) {
  var p = a.s.split(".");
  return [p[0], p[1], Object.assign({}, a.d || {}, a.tg || {})];
}

/* Whether it can run now: Home Assistant has the action, and no entity it names is unavailable. */
function actUsable(a) {
  var h = H(),
    p = a.s.split(".");
  if (!h) return false;
  if (h.services && Object.keys(h.services).length && !(h.services[p[0]] && h.services[p[0]][p[1]])) return false;
  return actList(a.tg && a.tg.entity_id).every(function (id) {
    var s = h.states[id];
    return s && s.state !== "unavailable";
  });
}

/* What it is called: its own name, else Home Assistant's name for it, and what it is aimed at. */
function actName(a) {
  if (a.n) return a.n;
  var p = a.s.split("."),
    h = H(),
    meta = h && h.services && h.services[p[0]] && h.services[p[0]][p[1]],
    first = actList(a.tg && a.tg.entity_id)[0],
    who = first ? A(first).friendly_name || first : actList(a.tg && a.tg.area_id)[0] || "";
  return ((meta && meta.name) || a.s) + (who ? " · " + who : "");
}

function actRun(a, ask, label) {
  var risk = actRisk(a.s),
    ids = actIds(a),
    c = actCall(a);
  if ((risk === "admin" || actWide(a)) && !ISADMIN) {
    toast(_T("act_admin_only"));
    return;
  }
  function run() {
    gate(ids, function () {
      callRaw(c[0], c[1], c[2]);
    });
  }
  if (ask || a.q || risk || ids.some(asksFirst)) confirmDlg((label || actName(a)) + "?", run);
  else run();
}

/* ---- choosing one ---- */

var ACTEDIT = null;

function actEdit(a, done) {
  ACTEDIT = { a: a ? JSON.parse(JSON.stringify(a)) : { t: "do", s: "" }, done: done };
  showPopup("act-edit", true);
}

/* One value of a field, as the action wants it: JSON where it reads as JSON, else the text. */
function actValue(text) {
  var t = String(text).trim();
  if (!t) return undefined;
  if (/^[\[{"]|^(true|false|null)$|^-?\d+(\.\d+)?$/.test(t))
    try {
      return JSON.parse(t);
    } catch (e) {}
  return t;
}

function actEditPage(b) {
  var K = ACTEDIT;
  if (!K) return;
  var a = K.a,
    box = mk("div");
  b.appendChild(box);
  function set(key, value) {
    a.d = a.d || {};
    if (value === undefined) delete a.d[key];
    else a.d[key] = value;
  }
  function aim(key, id, on) {
    a.tg = a.tg || {};
    var list = actList(a.tg[key]).filter(function (x) {
      return x !== id;
    });
    if (on) list.push(id);
    if (list.length) a.tg[key] = list;
    else delete a.tg[key];
  }
  function draw() {
    var h = H(),
      p = a.s.split("."),
      meta = (a.s && h.services && h.services[p[0]] && h.services[p[0]][p[1]]) || {};
    box.appendChild(
      pill("play", a.s ? meta.name || a.s : _T("act_pick"), {
        sub: function () {
          return a.s ? a.s : _T("act_pick_sub");
        },
        tap: function () {
          showPopup("act-pick", true);
        },
      })
    );
    if (!a.s) return;
    if (meta.description) box.appendChild(hintRow(meta.description));
    if (actRisk(a.s)) box.appendChild(hintRow(_T(actRisk(a.s) === "admin" ? "act_risk_admin" : "act_risk_ask")));
    box.appendChild(sep(_T("act_target"), "target"));
    actList(a.tg && a.tg.entity_id).forEach(function (id) {
      box.appendChild(
        pill("trash", A(id).friendly_name || id, {
          sub: function () {
            return id;
          },
          tap: function () {
            aim("entity_id", id, false);
            redrawBox(box, draw);
          },
        })
      );
    });
    box.appendChild(
      pill("plus", _T("act_add_entity"), {
        tap: function () {
          var doms = Object.keys(h.states).map(dom).filter(function (d, i, all) {
            return all.indexOf(d) === i;
          });
          pickEntity(_T("act_add_entity"), doms, null, function (id) {
            aim("entity_id", id, true);
          });
        },
      })
    );
    var areas = Object.keys(h.areas || {});
    areas.forEach(function (id) {
      box.appendChild(
        pill("home", h.areas[id].name || id, {
          on: function () {
            return actList(a.tg && a.tg.area_id).indexOf(id) >= 0;
          },
          sub: function () {
            return actList(a.tg && a.tg.area_id).indexOf(id) >= 0 ? _T("act_whole_area") : "";
          },
          tap: function () {
            aim("area_id", id, actList(a.tg && a.tg.area_id).indexOf(id) < 0);
            redrawBox(box, draw);
          },
        })
      );
    });
    var fields = Object.keys(meta.fields || {}).filter(function (k) {
      return k !== "advanced_fields" && meta.fields[k] && !meta.fields[k].fields;
    });
    if (fields.length) box.appendChild(sep(_T("act_fields"), "tune"));
    fields.forEach(function (k) {
      var f = meta.fields[k],
        sel = f.selector || {},
        label = f.name || cap(k.replace(/_/g, " ")),
        has = a.d && a.d[k] !== undefined,
        text = has ? (typeof a.d[k] === "string" ? a.d[k] : JSON.stringify(a.d[k])) : "";
      box.appendChild(sep(label + (f.required ? " *" : ""), "edit"));
      var options = sel.select && sel.select.options;
      if (options || sel.boolean !== undefined) {
        var values = options
          ? options.map(function (o) {
              return typeof o === "string" ? o : o.value;
            })
          : ["true", "false"];
        box.appendChild(
          dropRow(
            label,
            [""].concat(values),
            function () {
              return has ? String(a.d[k]) : "";
            },
            function (v) {
              set(k, v === "" ? undefined : options ? v : v === "true");
              redrawBox(box, draw);
            },
            "tune",
            function (v) {
              return v === "" ? _T("act_not_set") : v === "true" && !options ? _T("on_cap") : v === "false" && !options ? _T("off") : v;
            }
          )
        );
      } else
        box.appendChild(
          textRow(
            "edit",
            f.example !== undefined ? String(f.example).slice(0, 60) : label,
            text,
            function (v) {
              set(k, actValue(v));
            },
            400
          )
        );
    });
    box.appendChild(sep(_T("act_data"), "edit"));
    box.appendChild(
      areaRow(
        _T("act_data"),
        a.d && Object.keys(a.d).length ? JSON.stringify(a.d, null, 2) : "",
        function (v) {
          try {
            var o = JSON.parse(v || "{}");
            if (!o || typeof o !== "object" || Array.isArray(o) || JSON.stringify(o).length > 1000) throw new Error("not usable");
            a.d = o;
          } catch (e) {
            toast(_T("act_bad_data"));
          }
        },
        1000
      )
    );
    box.appendChild(sep(_T("act_name"), "edit"));
    box.appendChild(
      textRow(
        "edit",
        _T("act_name"),
        a.n || "",
        function (v) {
          a.n = v.trim();
        },
        40
      )
    );
    box.appendChild(
      flagPill("info", _T("act_ask"), a, "q", function (on) {
        return on || actRisk(a.s) ? _T("on_cap") : _T("off");
      })
    );
    box.appendChild(
      pill("play", _T("act_use"), {
        tap: function () {
          var clean = cleanDo(a);
          if (!clean) return toast(_T("act_pick_sub"));
          ACTEDIT = null;
          K.done(clean);
        },
      })
    );
  }
  draw();
}

function actPickPage(b) {
  var K = ACTEDIT;
  if (!K) return;
  var h = H(),
    w = mk("div", "sqw pane", svg("search")),
    inp = mk("input", "sq"),
    box = mk("div"),
    all = [];
  inp.type = "text";
  inp.placeholder = _T("search");
  inp.setAttribute("aria-label", _T("search"));
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(box);
  Object.keys(h.services || {}).forEach(function (domain) {
    Object.keys(h.services[domain]).forEach(function (name) {
      var id = domain + "." + name;
      if (actRisk(id) !== "admin" || ISADMIN) all.push([id, h.services[domain][name].name || ""]);
    });
  });
  all.sort(function (x, y) {
    return x[0].localeCompare(y[0]);
  });
  function draw() {
    var words = norm(inp.value).trim().split(/\s+/).filter(Boolean),
      found = all.filter(function (x) {
        var hay = norm(x[0] + " " + x[1]);
        return words.every(function (t) {
          return hay.indexOf(t) >= 0;
        });
      });
    found.slice(0, 60).forEach(function (x) {
      box.appendChild(
        pill("play", x[1] || x[0], {
          sub: function () {
            return x[0];
          },
          tap: function () {
            if (K.a.s !== x[0]) delete K.a.d;
            K.a.s = x[0];
            popBack();
          },
        })
      );
    });
    if (found.length > 60) box.appendChild(hintRow(_T("act_more_found", { n: found.length - 60 })));
    if (!found.length) box.appendChild(hintRow(_T("nothing_found")));
  }
  inp.addEventListener("input", function () {
    redrawBox(box, draw);
  });
  redrawBox(box, draw);
}
