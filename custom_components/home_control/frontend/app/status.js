/* Status tiles, the home summary, battery list, climate tiles, header chips, and alerts (devices left on, low batteries, offline) with their thresholds. */

function roomStatus(key) {
  var l = UI.stat[key] || [],
    it = l.map(function (s) {
      return [
        s.l,
        function () {
          if (s.text) {
            return svOk(s.id) ? cap(V_(s.id)) : "Offline";
          }
          return sv(s.id, s.u || "", s.dp === undefined ? 1 : s.dp);
        },
      ];
    });
  if (!it.length && !editing()) return null;
  var items = [];
  if (it.length) {
    var g = glance(it, it.length);
    items.push(g);
    if (editing()) {
      var bx = [].slice.call(g.children);
      bx.forEach(function (b, i) {
        edMark(b, function () {
          showPopup("manage-stat-tile:" + key + ":" + i, true);
        });
      });
      edSort(bx, function (f, t) {
        var a = UI.stat[key];
        a.splice(t, 0, a.splice(f, 1)[0]);
        uiChanged();
      });
    }
  }
  if (editing() && l.length < 6)
    items.push(
      edAdd(_T("add_status_tile"), function () {
        addStatTile(key);
      })
    );
  return section(secT("status", _T("status")), secI("status", "thermo"), items);
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

function homeStatus() {
  /* Climate tiles of a hidden room are left out like the room's devices. */
  var chips = UI.chips.filter(function (c) {
    return ISADMIN || modeOf(c.t).mode !== "hide";
  });
  if (!chips.length && !editing()) return null;
  function th(c) {
    return function () {
      var a = c.u ? sv(c.t, c.u, 0) : sv(c.t, "°"),
        b = c.h ? sv(c.h, "%", 0) : "";
      if (a === "Offline" && (!c.h || b === "Offline")) return "Offline";
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
  var items = chips.length ? [g] : [];
  if (editing()) {
    var bx = [].slice.call(g.children);
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
    low = [];
  BATLIST.forEach(function (x) {
    var v = Number(V_(x[1]));
    if (isFinite(v) && v >= 0 && v < batLow()) low.push(x[0] + " " + Math.round(v) + "%");
  });
  if (alertOn("battery") && low.length)
    out.push([
      _T("low_battery"),
      low.join(" · "),
      function () {
        showPopup("g-batteries", false);
      },
    ]);
  devsOf("vacuum").forEach(function (d) {
    if (alertOn("vacuum") && V_(d.id) === "error")
      out.push([
        d.name + _T("needs_attention"),
        "",
        function () {
          showPopup(devPop(d), false);
        },
      ]);
  });
  devsOf("camera").forEach(function (d) {
    if (alertOn("camera") && !svOk(d.id))
      out.push([
        d.name + _T("is_offline"),
        "",
        function () {
          go(d.room);
        },
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
      "",
      function () {
        showPopup("g-lights", false);
      },
    ]);
  return out;
}

function alertsBox() {
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
        editing();
    if (k === key) return;
    key = k;
    box.innerHTML = "";
    var ed = editing();
    box.style.display = list.length || ed ? "" : "none";
    if (!list.length && !ed) return;
    var sec = section(secT("alerts", _T("attention")), secI("alerts", "alert"), []);
    if (!list.length)
      sec.appendChild(
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
      sec.appendChild(p);
    });
    box.appendChild(sec);
    if (box._attach) box._attach();
  }
  reg(build);
  build();
  return box;
}

/* Thresholds shown on the dashboard come from settings, not from the code. */
function batLow() {
  return nrule("batt").thr || 20;
}

function partsLow() {
  return (STORE.cfg && STORE.cfg.partsLow) || 15;
}

var ALERT_KEYS = ["battery", "vacuum", "camera", "climate", "lights"];

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
  b.appendChild(
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
    box.appendChild(
      entRow(_T("entity"), function () {
        return s.id;
      })
    );
    box.appendChild(
      entRow(_T("value_now"), function () {
        return s.text
          ? svOk(s.id)
            ? cap(V_(s.id))
            : "Offline"
          : sv(s.id, s.u || "", s.dp === undefined ? 1 : s.dp);
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
    box.appendChild(
      pill("trash", _T("remove_tile"), {
        tap: function () {
          l.splice(i, 1);
          uiChanged();
          popBack();
        },
      })
    );
  }
  redrawBox(box, draw);
}

/* home climate tiles */
function chipEdit(b, i) {
  var c = UI.chips[i];
  if (!c) return;
  b.appendChild(
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
    )
  );
  b.appendChild(
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
    if (c.h)
      box.appendChild(
        pill("close", _T("remove_the_humidity_sensor"), {
          tap: function () {
            delete c.h;
            uiChanged();
            redrawBox(box, draw);
          },
        })
      );
    box.appendChild(
      pill("trash", _T("remove_tile"), {
        tap: function () {
          UI.chips.splice(i, 1);
          uiChanged();
          popBack();
        },
      })
    );
  }
  redrawBox(box, draw);
}

/* batteries */
function batsPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var hint = mk("div", "hint");
    hint.textContent = _T("battery_sensors_checked_for_the_low_");
    box.appendChild(hint);
    UI.bats.forEach(function (x, i) {
      box.appendChild(
        pill("battery", x[0], {
          sub: function () {
            return x[1];
          },
          val: function () {
            return entVal(x[1]);
          },
          tap: function () {
            confirmDlg(_T("stop_tracking") + x[0] + "”?", function () {
              UI.bats.splice(i, 1);
              uiChanged();
              redrawBox(box, draw);
            });
          },
        })
      );
    });
    box.appendChild(
      pill("plus", _T("add_battery_sensor"), {
        tap: function () {
          pickEntity(
            _T("choose_a_battery_sensor"),
            ["sensor"],
            ["battery"],
            function (id) {
              UI.bats.push([
                (A(id).friendly_name || id).replace(/\s*battery\s*$/i, "").slice(0, 40),
                id,
              ]);
              uiChanged();
            },
            function (id) {
              return UI.bats.some(function (x) {
                return x[1] === id;
              });
            }
          );
        },
      })
    );
  }
  redrawBox(box, draw);
}
