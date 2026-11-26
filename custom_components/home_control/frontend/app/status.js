/* Status tiles, the home summary, battery list, climate tiles, header chips, and alerts (devices left on, low batteries, offline) with their thresholds. */

/* The value of a status tile of the header: a reading with its unit, or the state as words, or two readings of one tile (a temperature and a humidity). */
function statValue(s) {
  var a = s.text ? (svOk(s.id) ? cap(V_(s.id)) : _T("offline")) : sv(s.id, s.u || "", s.dp === undefined ? 1 : s.dp);
  if (!s.h) return a;
  var b = sv(s.h, "%", 0);
  if (a === _T("offline") && b === _T("offline")) return _T("offline");
  if (a === "–" && b === "–") return "–";
  return a + " · " + b;
}

/* The status tiles of a page that the header shows (decision D-27: its own list, set in the header's settings): one tile per reading, or nothing when it has none. */
/* The tiles of a page's header row that show now: an Attention tile only while there is something to say. */
function statShown(key) {
  var any = alertList().length > 0;
  return (UI.stat[key] || []).filter(function (s) {
    return s.k !== "alerts" || any;
  });
}

function statGrid(key) {
  var it = statShown(key).map(function (s) {
    return s.k === "alerts"
      ? [s.l, alertText]
      : [
          s.l,
          function () {
            return statValue(s);
          },
        ];
  });
  if (!it.length) return null;
  var g = glance(it, it.length);
  statShown(key).forEach(function (s, i) {
    if (s.k === "alerts") alertsTap(g.children[i]);
  });
  return g;
}

/* An Attention chip or tile of the header opens the details. While a page is edited the header's own tap (its settings) is left to it. */
function alertsTap(el) {
  if (!el) return;
  el.classList.add("tap");
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  function open(ev) {
    if (editing()) return;
    ev.preventDefault();
    ev.stopPropagation();
    showPopup("g-alerts", false);
  }
  el.addEventListener("click", open);
  el.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" || ev.key === " ") open(ev);
  });
}

function addStatTile(rid) {
  pickEntity(
    _T("choose_a_sensor"),
    ["sensor", "binary_sensor", "number", "input_number", "counter"],
    null,
    function (id) {
      var u = A(id).unit_of_measurement || "",
        txt = V_(id) === "" || isNaN(Number(V_(id))),
        t = { l: statLabel(id, rid), id: id };
      if (txt) t.text = 1;
      else {
        t.u = u && ["%", "°C", "°F", "°"].indexOf(u) < 0 ? " " + u : u;
        t.dp = Number(V_(id)) % 1 ? 1 : 0;
      }
      (UI.stat[rid] = UI.stat[rid] || []).push(t);
      uiChanged();
    }
  );
}

/* The climate tiles of the Home page (those of a hidden room are left out like the room's devices), or null when there are none. */
function chipGrid() {
  var chips = UI.chips.filter(function (c) {
    return ISADMIN || modeOf(c.t).mode !== "hide";
  });
  if (!chips.length) return null;
  function th(c) {
    return function () {
      var a = c.u ? sv(c.t, c.u, 0) : sv(c.t, "°"),
        b = c.h ? sv(c.h, "%", 0) : "";
      if (a === _T("offline") && (!c.h || b === _T("offline"))) return _T("offline");
      if (a === "–" && (!c.h || b === "–")) return "–";
      return a + (c.h ? " · " + b : "");
    };
  }
  var g = glance(
    chips.map(function (c) {
      return [c.l, th(c)];
    }),
    4
  );
  g.style.gridTemplateColumns = "";
  g.classList.add("gc4");
  /* As many columns as there are tiles (at most 4), so tiles of a hidden room leave no empty space. */
  g.style.setProperty("--gcn", Math.max(1, Math.min(chips.length, 4)));
  return g;
}

function homeStatus() {
  var chips = UI.chips.filter(function (c) {
    return ISADMIN || modeOf(c.t).mode !== "hide";
  });
  if (!chips.length && !editing()) return null;
  var g = chipGrid(),
    items = g ? [g] : [];
  if (editing()) {
    var bx = g ? [].slice.call(g.children) : [];
    bx.forEach(function (b, i) {
      edMark(b, function () {
        showPopup("manage-chip:" + i, true);
      });
    });
    edSort(bx, function (f, t) {
      UI.chips.splice(t, 0, UI.chips.splice(f, 1)[0]);
      uiChanged();
    });
    items.push(
      edAdd(_T("add_climate_tile"), function () {
        pickEntity(
          _T("choose_a_sensor"),
          ["sensor", "number", "input_number"],
          null,
          function (id) {
            var u = A(id).unit_of_measurement || "",
              c = { l: (A(id).friendly_name || id).slice(0, 40), t: id };
            if (A(id).device_class !== "temperature" && u && u !== "°C" && u !== "°F")
              c.u = " " + u;
            UI.chips.push(c);
            uiChanged();
          }
        );
      })
    );
  }
  return section(secT("climate", _T("climate")), secI("climate", "thermo"), items);
}

/* ---- status, pins, alerts, quick actions, search, display ---- */
var BATLIST = [];

/* alerts */
/* Lights, fans and players that have been on longer than the "left on" limit in Settings, longest first. */
function alertList() {
  var out = [],
    low = [],
    index = batIndex();
  BATLIST.forEach(function (d) {
    var i = batInfo(d, index);
    if (i.low === true && batVisible(d, index)) low.push(i.name + " " + (i.pct === null ? _T("battery_low") : i.pct + "%"));
  });
  if (alertOn("battery") && low.length)
    out.push([
      _T("low_battery"),
      low.join(" · "),
      function () {
        showPopup("g-batteries", false);
      },
    ]);
  vacuumList().forEach(function (d) {
    if (alertOn("vacuum") && V_(d.id) === "error")
      out.push([
        _T("needs_attention", { x: d.name }),
        "",
        function () {
          showPopup(d.pop, false);
        },
      ]);
  });
  devsOf("camera").forEach(function (d) {
    if (alertOn("camera") && !svOk(d.id))
      out.push([
        _T("is_offline", { x: d.name }),
        "",
        function () {
          alertGo(d.room);
        },
      ]);
  });
  /* Every lock of the home, as the Security overview lists them, whether or not it is on a page; one that is on a page is named as there. */
  if (alertOn("lock") && H())
    secEnts().lock.forEach(function (id) {
      if (V_(id) !== "unavailable") return;
      var d = devsOf("lock").filter(function (x) {
        return x.id === id;
      })[0];
      out.push([
        _T("is_offline", { x: (d ? d.name : entName(id)) }),
        "",
        d
          ? function () {
              alertGo(d.room);
            }
          : null,
      ]);
    });
  var acs = devsOf("climate").filter(function (d) {
    return V_(d.id) === "unavailable";
  });
  if (alertOn("climate") && acs.length)
    out.push([
      _T("air_conditioner_offline"),
      acs
        .map(function (d) {
          return TITLES[d.room];
        })
        .join(" · "),
      function () {
        showPopup("g-acs", false);
      },
    ]);
  var ls = allLights().filter(function (i) {
    return V_(i) === "unavailable";
  });
  if (alertOn("lights") && ls.length)
    out.push([
      ls.length + (ls.length === 1 ? _T("light_is") : _T("lights_are")) + " unavailable",
      ls.map(entName).join(" · "),
      function () {
        showPopup("g-lights", false);
      },
    ]);
  myAlerts().forEach(function (x) {
    if (ruleEvalCond(x.c)) out.push([x.t, condText(x.c), null]);
  });
  return out;
}

/* To the page an alert is about, from a row of a page or of the Attention popup. */
function alertGo(room) {
  if (SHEET) closeSheet();
  go(room);
}

/* Attention is a device (a widget): the alerts as rows of its Section. Nothing to report, it draws nothing and a Section that holds only it is not shown either; while the page is edited it stays, saying so, to be found and changed. */
function alertsDevice(ed) {
  var box = mk("div", "alerts"),
    key = null;
  function build() {
    var list = alertList(),
      k =
        list
          .map(function (a) {
            return a[0] + "|" + a[1];
          })
          .join("||") +
        "|" +
        ed;
    var sec = box.closest ? box.closest(".sec") : null;
    if (sec && !ed) sec.style.display = list.length ? "" : "none";
    if (k === key) return;
    key = k;
    box.innerHTML = "";
    box.style.display = list.length || ed ? "" : "none";
    if (!list.length && ed)
      box.appendChild(
        pill("info", _T("no_alerts_right_now"), {
          sub: function () {
            return _T("lights_fans_and_media_left_on_and_pr");
          },
        })
      );
    list.forEach(function (a) {
      var p = pill("alert", a[0], {
        sub: a[1]
          ? function () {
              return a[1];
            }
          : null,
        tap: a[2],
      });
      p.classList.add("warn");
      box.appendChild(p);
    });
  }
  reg(build);
  build();
  return box;
}

/* The text of an Attention tile or chip: the one thing that needs attention, or how many. */
function alertText() {
  var list = alertList();
  return list.length === 1 ? list[0][0] : _T("n_alerts", { n: list.length });
}

/* Thresholds shown on the dashboard come from settings, not from the code. */
function batLow() {
  return nrule("batt").thr || 20;
}

function partsLow() {
  return (STORE.cfg && STORE.cfg.partsLow) || 15;
}

var ALERT_KEYS = ["battery", "vacuum", "camera", "lock", "climate", "lights"];

function alertOn(k) {
  return ((STORE.cfg && STORE.cfg.alertOff) || []).indexOf(k) < 0;
}

/* status tiles per room */
function statLabel(id, rid) {
  var nm = A(id).friendly_name || id,
    r = roomById(rid);
  if (r && nm.indexOf(r.name) === 0) nm = nm.slice(r.name.length).replace(/^\s+/, "") || nm;
  return nm.slice(0, 30);
}

function statTile(b, key) {
  var p = key.split(":"),
    rid = p[0],
    i = +p[1],
    l = UI.stat[rid] || [],
    s = l[i];
  if (!s) return;
  if (s.k === "alerts") {
    b.appendChild(
      textRow(
        "edit",
        _T("label"),
        s.l,
        function (v) {
          if (v) {
            s.l = v.slice(0, 30);
            uiChanged();
          }
        },
        30
      )
    );
    var rmAlert = pill("trash", _T("remove_tile"), {
      tap: function () {
        l.splice(i, 1);
        uiChanged();
        popBack();
      },
    });
    stgActions(b, [rmAlert], [rmAlert]);
    return;
  }
  stgIdentity(
    b,
    textRow(
      "edit",
      _T("label"),
      s.l,
      function (v) {
        if (v) {
          s.l = v.slice(0, 30);
          uiChanged();
        }
      },
      30
    ),
    textRow(
      "tune",
      _T("unit_for_example_c_or"),
      (s.u || "").trim(),
      function (v) {
        s.u = v ? (/^[%°]/.test(v) ? v : " " + v) : "";
        uiChanged();
      },
      10
    )
  );
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(sep(_T("what_it_shows"), "info"));
    box.appendChild(
      entRow(_T("entity"), function () {
        return s.id;
      })
    );
    box.appendChild(
      entRow(_T("value_now"), function () {
        return statValue(s);
      })
    );
    box.appendChild(
      seg(
        [
          ["0", _T("no_decimals")],
          ["1", _T("1_decimal")],
          ["2", _T("2_decimals")],
        ],
        String(s.dp === undefined ? 1 : s.dp),
        function (v) {
          s.dp = +v;
          delete s.text;
          uiChanged();
          redrawBox(box, draw);
        }
      )
    );
    box.appendChild(
      pill("edit", _T("show_as_text"), {
        on: function () {
          return !!s.text;
        },
        sub: function () {
          return s.text ? _T("shows_the_state_as_words") : _T("shows_a_number");
        },
        tap: function () {
          if (s.text) delete s.text;
          else s.text = 1;
          uiChanged();
          redrawBox(box, draw);
        },
      })
    );
    var rmTile = pill("trash", _T("remove_tile"), {
      tap: function () {
        l.splice(i, 1);
        uiChanged();
        popBack();
      },
    });
    stgActions(box, [rmTile], [rmTile]);
  }
  redrawBox(box, draw);
}

/* home climate tiles */
function chipEdit(b, i) {
  var c = UI.chips[i];
  if (!c) return;
  stgIdentity(
    b,
    textRow(
      "edit",
      _T("label"),
      c.l,
      function (v) {
        if (v) {
          c.l = v.slice(0, 40);
          uiChanged();
        }
      },
      40
    ),
    textRow(
      "tune",
      _T("unit_when_it_is_not_a_temperature"),
      (c.u || "").trim(),
      function (v) {
        if (v) c.u = " " + v;
        else delete c.u;
        uiChanged();
      },
      10
    )
  );
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(sep(_T("what_it_shows"), "info"));
    box.appendChild(
      pill("thermo", _T("main_sensor"), {
        sub: function () {
          return c.t;
        },
        val: function () {
          return entVal(c.t);
        },
        tap: function () {
          pickEntity(_T("main_sensor"), ["sensor", "number", "input_number"], null, function (id) {
            c.t = id;
            uiChanged();
          });
        },
      })
    );
    box.appendChild(
      pill("drop", _T("humidity_sensor"), {
        sub: function () {
          return c.h || _T("none");
        },
        val: function () {
          return c.h ? entVal(c.h) : "";
        },
        tap: function () {
          pickEntity(_T("humidity_sensor"), ["sensor"], ["humidity"], function (id) {
            c.h = id;
            uiChanged();
          });
        },
      })
    );
    var acts = [];
    if (c.h)
      acts.push(
        pill("close", _T("remove_the_humidity_sensor"), {
          tap: function () {
            delete c.h;
            uiChanged();
            redrawBox(box, draw);
          },
        })
      );
    var rmChip = pill("trash", _T("remove_tile"), {
      tap: function () {
        UI.chips.splice(i, 1);
        uiChanged();
        popBack();
      },
    });
    acts.push(rmChip);
    stgActions(box, acts, [rmChip]);
  }
  redrawBox(box, draw);
}

