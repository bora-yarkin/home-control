/* What the person changes about items and the look of the dashboard (decisions D-42, D-43), all saved with the dashboard:
   per item (on the device entry): color, act {tap, hold, dbl}, ask, txt (a state text), txtif [{c, t}], when [conditions];
   per type of entity (UI.types[domain]): tap, hold, dbl, ask, used where the item says nothing;
   the whole look (UI.look): kc {group: colour}, style "mono" | "rainbow", radius, density. */

/* The colour groups of the icons (the data-k of a row), and the actions a gesture can have. */
var LOOK_GROUPS = ["light", "climate", "heat", "media", "security", "power", "clean", "scene", "appliance", "cover", "alert", "link", "other"],
  ACT_KINDS = ["popup", "toggle", "more", "page", "run", "none"],
  GESTURES = ["tap", "hold", "dbl"],
  COLORRE = /^#[0-9a-f]{6}$/;

function typeCfg(id) {
  return (id && UI.types && UI.types[dom(id)]) || {};
}

function itemAct(d, gesture) {
  return (d.act && d.act[gesture]) || (typeCfg(d.id)[gesture]) || null;
}

/* Whether the entity asks "are you sure" before it is operated: its item on any page, or its type. */
function asksFirst(id) {
  if (typeCfg(id).ask) return true;
  return Object.keys(UI.devs || {}).some(function (r) {
    return (UI.devs[r] || []).some(function (d) {
      return d.id === id && d.ask;
    });
  });
}

function itemShown(d) {
  return !d.when || d.when.every(ruleEvalCond);
}

/* {state}, {name}, {attr:x}, {entity.id} and {entity.id:attr} in a state text. Only values are put in; nothing is evaluated. */
function fillText(template, id, name) {
  return String(template).replace(/\{([^{}]{1,120})\}/g, function (all, token) {
    var p = token.split(":");
    if (token === "state") return id ? domState(id) : "";
    if (token === "name") return name || "";
    if (p[0] === "attr" && p[1]) return id ? domAttrText(id, p[1]) : "";
    if (p[0].indexOf(".") > 0) return p[1] ? domAttrText(p[0], p[1]) : domState(p[0]);
    return all;
  });
}

/* The text a row shows instead of its own: the first "when" that holds, else the item's text, else null. */
function itemText(d) {
  var hit = (d.txtif || []).filter(function (x) {
    return ruleEvalCond(x.c);
  })[0];
  var t = hit ? hit.t : d.txt;
  return t ? fillText(t, d.id, d.name) : null;
}

function runAct(a, d) {
  if (a.t === "none") return;
  if (a.t === "toggle") return toggleDevice(d);
  if (a.t === "more") {
    if (!window.HA.moreInfo(d.id)) toast(_T("cannot_open_ha_dialog"));
    return;
  }
  if (a.t === "page") return go(a.p);
  if (a.t === "run") return remotePress({ a: a.a });
  var key = devPop(d);
  if (key) showPopup(key, true);
}

function rainbowColor(name) {
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return "hsl(" + ((h * 47) % 360) + " 70% 62%)";
}

/* Applies an item's own settings to the row drawn for it. */
function itemDecorate(el, d) {
  if (!el) return el;
  var color = d.color || (UI.look && UI.look.style === "rainbow" ? rainbowColor(d.name + d.id) : "");
  if (color) {
    el.style.setProperty("--kc", color);
    el.querySelectorAll("[data-k]").forEach(function (x) {
      x.style.setProperty("--kc", color);
    });
  }
  if (d.txt || d.txtif) {
    var say = function () {
      var t = itemText(d),
        v = el.querySelector(".vl");
      if (t !== null && v) v.textContent = t;
    };
    reg(say);
    say();
  }
  var tap = itemAct(d, "tap"),
    hold = itemAct(d, "hold"),
    dbl = itemAct(d, "dbl");
  if (!tap && !hold && !dbl) return el;
  var x = 0,
    y = 0,
    moved = false,
    held = false,
    timer = 0,
    waiting = 0;
  el.addEventListener(
    "pointerdown",
    function (e) {
      x = e.clientX;
      y = e.clientY;
      moved = held = false;
      clearTimeout(timer);
      if (hold && !editing())
        timer = setTimeout(function () {
          held = true;
          runAct(hold, d);
        }, 450);
    },
    true
  );
  el.addEventListener(
    "pointermove",
    function (e) {
      if (Math.abs(e.clientX - x) > 8 || Math.abs(e.clientY - y) > 8) {
        moved = true;
        clearTimeout(timer);
      }
    },
    true
  );
  ["pointerup", "pointercancel"].forEach(function (name) {
    el.addEventListener(name, function () {
      clearTimeout(timer);
    }, true);
  });
  el.addEventListener(
    "click",
    function (e) {
      if (editing()) return;
      /* the icon keeps switching the device unless the tap itself was changed */
      if (!tap && !dbl && !held) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (held || moved) return;
      var single = function () {
        waiting = 0;
        runAct(tap || { t: "popup" }, d);
      };
      if (!dbl) return single();
      if (waiting) {
        clearTimeout(waiting);
        waiting = 0;
        return runAct(dbl, d);
      }
      waiting = setTimeout(single, 280);
    },
    true
  );
  return el;
}

/* The look chosen for the whole dashboard, as a style sheet of its own after the dashboard's. */
function lookApply() {
  var l = UI.look || {},
    css = "";
  Object.keys(l.kc || {}).forEach(function (k) {
    css += "[data-k=" + k + "],body.light [data-k=" + k + "]{--kc:" + l.kc[k] + "}";
  });
  if (l.style === "mono") css += "[data-k],body.light [data-k]{--kc:#9a9a9a}body{--acc:#9a9a9a}";
  if (l.radius === "sharp") css += ":root{--r-s:4px;--r-m:6px;--r-l:8px;--r-xl:10px;--r-row:4px}";
  if (l.radius === "round") css += ":root{--r-s:22px;--r-m:30px;--r-l:34px;--r-xl:40px;--r-row:28px}";
  if (l.density === "compact") css += ":root{--sp:6px;--sp-s:5px;--sp-l:8px}.pill{min-height:46px}";
  if (l.density === "roomy") css += ":root{--sp:14px;--sp-s:11px;--sp-l:18px}.pill{min-height:68px}";
  var s = document.getElementById("hc-look");
  if (!s) {
    s = document.createElement("style");
    s.id = "hc-look";
    document.head.appendChild(s);
  }
  s.textContent = css;
}

/* ---- settings ---- */

function actText(a) {
  if (!a) return _T("default_action");
  if (a.t === "page") return _T("act_page") + ": " + (TITLES[a.p] || a.p);
  if (a.t === "run") return rmActName(a.a);
  return _T("act_" + a.t);
}

/* Choosing what a gesture does, for an item (o = the device entry) or a type (o = its settings). */
function actRows(box, holder, save, redraw) {
  GESTURES.forEach(function (g) {
    var cur = holder[g] || null;
    box.appendChild(
      dropRow(
        _T("gesture_" + g),
        ["default"].concat(ACT_KINDS),
        function () {
          return cur ? cur.t : "default";
        },
        function (v) {
          function put(a) {
            if (a) holder[g] = a;
            else delete holder[g];
            save();
            redraw();
          }
          if (v === "default") return put(null);
          if (v === "page") {
            openMenu(box, ORDER, ORDER[0], function (p) {
              put({ t: "page", p: p });
            }, function (p) {
              return TITLES[p] || p;
            });
            return;
          }
          if (v === "run") {
            RM.vacuum = null;
            rmChooseAction(function (a) {
              put({ t: "run", a: a });
              return null;
            });
            return;
          }
          put({ t: v });
        },
        "tune",
        function (v) {
          if (v === "default") return _T("default_action");
          if (v === cur && cur) return actText(cur);
          return _T("act_" + v);
        }
      )
    );
    if (cur && (cur.t === "page" || cur.t === "run")) box.appendChild(hintRow(actText(cur)));
  });
}

function custPage(b, key) {
  var d = devAt(key);
  if (!d) return;
  var box = mk("div");
  b.appendChild(box);
  function redraw() {
    redrawBox(box, draw);
  }
  function save() {
    ["act", "txtif", "when"].forEach(function (k) {
      if (d[k] && !Object.keys(d[k]).length) delete d[k];
    });
    uiChanged();
  }
  function draw() {
    box.appendChild(
      colorButton(
        _T("icon_colour"),
        function () {
          return d.color || "";
        },
        function (c) {
          if (c) d.color = c;
          else delete d.color;
          save();
        }
      )
    );
    box.appendChild(sep(_T("gestures"), "tune"));
    d.act = d.act || {};
    actRows(box, d.act, save, redraw);
    box.appendChild(
      flagPill("lock", _T("ask_before"), d, "ask", function (on) {
        return on ? _T("on_cap") : _T("off");
      })
    );
    box.appendChild(sep(_T("state_text"), "edit"));
    box.appendChild(hintRow(_T("state_text_hint")));
    box.appendChild(
      textRow("edit", _T("state_text"), d.txt || "", function (v) {
        if (v.trim()) d.txt = v.slice(0, 80);
        else delete d.txt;
        save();
      }, 80)
    );
    (d.txtif || []).forEach(function (x, i) {
      box.appendChild(
        pill("edit", x.t || _T("text_when"), {
          sub: function () {
            return condText(x.c);
          },
          tap: function () {
            showPopup("cust-cond:" + key + ":txtif:" + i, true);
          },
        })
      );
    });
    if ((d.txtif || []).length < 4)
      box.appendChild(
        pill("plus", _T("add_text_when"), {
          tap: function () {
            (d.txtif = d.txtif || []).push({ c: { c: "state", id: d.id, is: "on" }, t: "{state}" });
            save();
            showPopup("cust-cond:" + key + ":txtif:" + (d.txtif.length - 1), true);
          },
        })
      );
    box.appendChild(sep(_T("show_only_when"), "clock"));
    (d.when || []).forEach(function (c, i) {
      box.appendChild(
        pill("clock", condText(c), {
          tap: function () {
            showPopup("cust-cond:" + key + ":when:" + i, true);
          },
        })
      );
    });
    if ((d.when || []).length < 4)
      box.appendChild(
        pill("plus", _T("add_a_condition"), {
          tap: function () {
            (d.when = d.when || []).push({ c: "between", from: "22:00", to: "07:00" });
            save();
            showPopup("cust-cond:" + key + ":when:" + (d.when.length - 1), true);
          },
        })
      );
  }
  draw();
}

/* One condition of an item: "<rid>:<i>:<when|txtif>:<n>". */
function custCondPage(b, key) {
  var p = key.split(":"),
    n = +p.pop(),
    list = p.pop(),
    d = devAt(p.join(":")),
    x = d && d[list] && d[list][n];
  if (!x) return;
  if (list === "txtif")
    b.appendChild(
      textRow("edit", _T("state_text"), x.t, function (v) {
        x.t = v.slice(0, 80);
        uiChanged();
      }, 80)
    );
  condBody(
    b,
    list === "txtif" ? x.c : x,
    uiChanged,
    function (box) {
      box.appendChild(
        pill("trash", _T("remove_this_condition"), {
          tap: function () {
            d[list].splice(n, 1);
            if (!d[list].length) delete d[list];
            uiChanged();
            popBack();
          },
        })
      );
    },
    true
  );
}

/* The look of the whole dashboard: colours of each kind of icon, none or all colours, corners and spacing. */
function lookPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function look() {
    return (UI.look = UI.look || {});
  }
  function save() {
    uiChanged();
    lookApply();
    redrawBox(box, draw);
  }
  function choice(label, key, values) {
    box.appendChild(sep(_T(label), "tune"));
    box.appendChild(
      seg(
        values.map(function (v) {
          return [v, _T(key + "_" + (v || "normal"))];
        }),
        (UI.look && UI.look[key]) || "",
        function (v) {
          if (v) look()[key] = v;
          else delete look()[key];
          save();
        }
      )
    );
  }
  function draw() {
    box.appendChild(hintRow(_T("look_shared_hint")));
    choice("icon_colours", "style", ["", "mono", "rainbow"]);
    choice("corners", "radius", ["sharp", "", "round"]);
    choice("spacing", "density", ["compact", "", "roomy"]);
    box.appendChild(sep(_T("colour_by_type"), "palette"));
    LOOK_GROUPS.forEach(function (g) {
      box.appendChild(
        colorButton(
          _T("group_" + g),
          function () {
            return (UI.look && UI.look.kc && UI.look.kc[g]) || "";
          },
          function (c) {
            var kc = (look().kc = look().kc || {});
            if (c) kc[g] = c;
            else delete kc[g];
            if (!Object.keys(kc).length) delete look().kc;
            uiChanged();
            lookApply();
          }
        )
      );
    });
  }
  draw();
}

/* Defaults per type of entity: what its rows do, and whether it asks first. */
function typesPage(b) {
  var have = {};
  Object.keys(UI.devs || {}).forEach(function (r) {
    (UI.devs[r] || []).forEach(function (d) {
      if (d.id) have[dom(d.id)] = 1;
    });
  });
  b.appendChild(hintRow(_T("types_hint")));
  Object.keys(have)
    .sort()
    .forEach(function (t) {
      b.appendChild(
        pill("tune", domWord(t), {
          sub: function () {
            var n = Object.keys((UI.types && UI.types[t]) || {}).length;
            return n ? _T("changed") : _T("default_action");
          },
          tap: function () {
            showPopup("type:" + t, true);
          },
        })
      );
    });
}

function typePage(b, t) {
  var box = mk("div");
  b.appendChild(box);
  UI.types = UI.types || {};
  var o = UI.types[t] || {};
  function save() {
    if (Object.keys(o).length) UI.types[t] = o;
    else delete UI.types[t];
    uiChanged();
  }
  function draw() {
    actRows(box, o, save, function () {
      redrawBox(box, draw);
    });
    box.appendChild(
      pill("lock", _T("ask_before"), {
        on: function () {
          return !!o.ask;
        },
        val: function () {
          return o.ask ? _T("on_cap") : _T("off");
        },
        tap: function () {
          if (o.ask) delete o.ask;
          else o.ask = 1;
          save();
        },
      })
    );
  }
  draw();
}

/* The person's own attention rules: when a condition holds, a line of their own. */
function myAlerts() {
  return (STORE.cfg && STORE.cfg.myAlerts) || [];
}

function myAlertsSave(list) {
  STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { myAlerts: list }));
  storeChanged();
}

function myAlertsPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(hintRow(_T("my_alerts_hint")));
    myAlerts().forEach(function (x, i) {
      box.appendChild(
        pill("alert", x.t, {
          sub: function () {
            return condText(x.c);
          },
          tap: function () {
            showPopup("my-alert:" + i, true);
          },
        })
      );
    });
    box.appendChild(
      pill("plus", _T("add_alert"), {
        tap: function () {
          myAlertsSave(myAlerts().concat([{ c: { c: "state", id: "sun.sun", is: "below_horizon" }, t: _T("new_alert") }]));
          showPopup("my-alert:" + (myAlerts().length - 1), true);
        },
      })
    );
  }
  draw();
}

function myAlertPage(b, n) {
  var list = JSON.parse(JSON.stringify(myAlerts())),
    x = list[+n];
  if (!x) return;
  b.appendChild(
    textRow("edit", _T("alert_text"), x.t, function (v) {
      if (!v.trim()) return;
      x.t = v.slice(0, 80);
      myAlertsSave(list);
    }, 80)
  );
  condBody(
    b,
    x.c,
    function () {
      myAlertsSave(list);
    },
    function (box) {
      box.appendChild(
        pill("trash", _T("remove"), {
          tap: function () {
            list.splice(+n, 1);
            myAlertsSave(list);
            popBack();
          },
        })
      );
    },
    true
  );
}
