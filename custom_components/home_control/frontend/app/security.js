/* Security (locks, alarm, open doors and windows) and energy (power and consumption) views. */

/* ---- security view (optional feature) ---- */
var SEC_OPEN = ["door", "window", "garage_door", "opening"],
  SEC_SAFE = ["smoke", "gas", "carbon_monoxide", "moisture", "safety", "tamper"],
  SEC_SAFE_LAB = {
    smoke: _T("smoke"),
    gas: _T("gas"),
    carbon_monoxide: _T("carbon_monoxide"),
    moisture: _T("water_leak"),
    safety: _T("safety"),
    tamper: _T("tamper"),
  };

function secEnts() {
  var h = H(),
    o = { alarm: [], lock: [], open: [], safety: [], cover: [] };
  Object.keys(h.states).forEach(function (id) {
    var d = dom(id),
      a = h.states[id].attributes || {};
    if (!ISADMIN && modeOf(id).mode === "hide") return;
    if (d === "alarm_control_panel") o.alarm.push(id);
    else if (d === "lock") o.lock.push(id);
    else if (d === "binary_sensor") {
      if (SEC_OPEN.indexOf(a.device_class) >= 0) o.open.push(id);
      else if (SEC_SAFE.indexOf(a.device_class) >= 0) o.safety.push(id);
    } else if (d === "cover" && ["garage", "gate", "door"].indexOf(a.device_class) >= 0)
      o.cover.push(id);
  });
  Object.keys(o).forEach(function (k) {
    o[k].sort(function (a, b) {
      return entName(a).localeCompare(entName(b));
    });
  });
  return o;
}

function secAlarmWord(s) {
  return (
    {
      disarmed: _T("disarmed"),
      armed_home: _T("armed_home"),
      armed_away: _T("armed_away"),
      armed_night: _T("armed_night"),
      armed_vacation: _T("armed_vacation"),
      armed_custom_bypass: _T("armed_custom"),
      pending: _T("pending"),
      arming: _T("arming"),
      triggered: _T("triggered"),
      disarming: _T("disarming"),
    }[s] || cap(String(s).replace(/_/g, " "))
  );
}

function secRO(row, id) {
  if (row && !ISADMIN && modeOf(id).mode === "view") row.classList.add("ro");
  return row;
}

function openNow(E) {
  var o = [];
  E.open.forEach(function (id) {
    if (isOn(id)) o.push(entName(id));
  });
  E.lock.forEach(function (id) {
    var s = V_(id);
    if (s !== "locked" && s !== "unavailable" && s !== "unknown")
      o.push(entName(id) + _T("unlocked"));
  });
  E.cover.forEach(function (id) {
    var s = V_(id);
    if (s !== "closed" && s !== "unavailable" && s !== "unknown") o.push(entName(id));
  });
  return o;
}

function lockTap(id) {
  var nm = entName(id);
  if (V_(id) !== "locked") call("lock", "lock", { entity_id: id });
  else if (!slidesToUnlock(id))
    confirmDlg(_T("unlock") + nm + "?", function () {
      callConfirmed("lock", "unlock", { entity_id: id });
    });
}

/* Security, energy and cameras are cards: add one to any page from the page editor (Add section, then pick its type). */
function cardStack(list) {
  var st = mk("div", "cstack");
  list.forEach(function (x) {
    if (!x.el) return;
    x.el.classList.remove("sec");
    x.el.classList.add("subsec");
    st.appendChild(x.el);
  });
  return st;
}

function cardSection(s, list, title, icon) {
  return section(s.t || title, s.i && iconOk(s.i) ? s.i : icon, [cardStack(list)]);
}

function securityList() {
  var E = secEnts(),
    list = [],
    total = E.alarm.length + E.lock.length + E.open.length + E.safety.length + E.cover.length;
  function add(el) {
    if (el) list.push({ el: el, wide: false });
  }
  if (!total) {
    list.push({
      el: section(_T("security"), "lock", [
        pill("info", _T("nothing_to_show_yet"), {
          sub: function () {
            return _T("locks_alarm_panels_and_door_and_wind");
          },
        }),
      ]),
      wide: true,
    });
    return list;
  }
  var line = mk("div", "hint");
  line.refresh = function () {
    var o = openNow(E);
    line.textContent = o.length
      ? _T("open_now") + o.join(", ")
      : _T("everything_is_closed_and_locked");
  };
  reg(line.refresh);
  var g = glance(
    [
      [
        _T("open"),
        function () {
          return String(
            E.open.filter(isOn).length +
              E.cover.filter(function (i) {
                var s = V_(i);
                return s !== "closed" && s !== "unavailable" && s !== "unknown";
              }).length
          );
        },
      ],
      [
        _T("unlocked_2"),
        function () {
          return String(
            E.lock.filter(function (i) {
              var s = V_(i);
              return s !== "locked" && s !== "unavailable" && s !== "unknown";
            }).length
          );
        },
      ],
      [
        _T("alarm"),
        function () {
          return E.alarm.length ? secAlarmWord(V_(E.alarm[0])) : _T("none");
        },
      ],
    ],
    3
  );
  list.push({ el: section(_T("right_now"), "lock", [g, line]), wide: true });
  if (E.alarm.length)
    add(
      section(
        _T("alarm"),
        "lock",
        E.alarm.map(function (id) {
          return secRO(
            pill("lock", entName(id), {
              on: function () {
                return V_(id).indexOf("armed") === 0 || V_(id) === "triggered";
              },
              sub: function () {
                return secAlarmWord(V_(id));
              },
              tap: function () {
                showPopup("alarm:" + id, true);
              },
            }),
            id
          );
        })
      )
    );
  if (E.lock.length)
    add(
      section(
        _T("locks"),
        "lock",
        E.lock.map(function (id) {
          return secRO(
            pill(
              "lock",
              entName(id),
              lockSlide(id, {
                on: function () {
                  var s = V_(id);
                  return s !== "locked" && s !== "unavailable" && s !== "unknown";
                },
                sub: function () {
                  return cap(V_(id));
                },
                tap: function () {
                  lockTap(id);
                },
              })
            ),
            id
          );
        })
      )
    );
  if (E.open.length)
    add(
      section(
        _T("doors_and_windows"),
        "home",
        E.open.map(function (id) {
          return pill("home", entName(id), {
            on: function () {
              return isOn(id);
            },
            sub: function () {
              var s = V_(id);
              return s === "unavailable"
                ? _T("unavailable")
                : s === "on"
                  ? _T("open")
                  : _T("closed");
            },
          });
        })
      )
    );
  if (E.cover.length)
    add(
      section(
        _T("garage_and_gates"),
        "home",
        E.cover.map(function (id) {
          return secRO(
            pill("home", entName(id), {
              on: function () {
                var s = V_(id);
                return s !== "closed" && s !== "unavailable" && s !== "unknown";
              },
              sub: function () {
                return cap(V_(id));
              },
              tap: function () {
                var s = V_(id);
                confirmDlg(
                  (s === "closed" ? _T("open_2") : _T("close_2")) + entName(id) + "?",
                  function () {
                    callConfirmed("cover", s === "closed" ? "open_cover" : "close_cover", {
                      entity_id: id,
                    });
                  }
                );
              },
            }),
            id
          );
        })
      )
    );
  if (E.safety.length)
    add(
      section(
        _T("safety_sensors"),
        "alert",
        E.safety.map(function (id) {
          return pill("alert", entName(id), {
            on: function () {
              return isOn(id);
            },
            sub: function () {
              var s = V_(id);
              return s === "unavailable"
                ? _T("unavailable")
                : s === "on"
                  ? SEC_SAFE_LAB[A(id).device_class] + _T("detected")
                  : _T("clear");
            },
          });
        })
      )
    );
  return list;
}

function alarmPopup(b, id) {
  var a = A(id),
    code = null,
    st = mk("div", "hint");
  st.refresh = function () {
    st.textContent = _T("status_2") + secAlarmWord(V_(id));
  };
  reg(st.refresh);
  b.appendChild(st);
  if (a.code_format) {
    var w = mk("div", "sqw pane", svg("lock"));
    code = mk("input", "sq");
    code.type = "password";
    code.placeholder = _T("code");
    code.setAttribute("autocomplete", "off");
    w.appendChild(code);
    b.appendChild(w);
  }
  function run(svc) {
    var data = { entity_id: id };
    if (code && code.value) data.code = code.value;
    call("alarm_control_panel", svc, data);
    if (code) code.value = "";
  }
  var f = a.supported_features || 0;
  [
    [1, "alarm_arm_home", _T("arm_home"), "home"],
    [2, "alarm_arm_away", _T("arm_away"), "leave"],
    [4, "alarm_arm_night", _T("arm_night"), "moon"],
  ].forEach(function (x) {
    if (f & x[0])
      b.appendChild(
        pill(x[3], x[2], {
          tap: function () {
            run(x[1]);
          },
        })
      );
  });
  b.appendChild(
    pill("lock", _T("disarm"), {
      tap: function () {
        confirmDlg(_T("disarm_2") + entName(id) + "?", function () {
          run("alarm_disarm");
        });
      },
    })
  );
}

/* ---- energy view (optional feature) ---- */
var ENERGY = { t: 0, ok: null, days: [0, 0, 0, 0, 0, 0, 0], by: {} };

function toKwh(v, u) {
  v = +v;
  return u === "Wh" ? v / 1000 : u === "MWh" ? v * 1000 : v;
}

function toW(v, u) {
  v = +v;
  return u === "kW" ? v * 1000 : u === "MW" ? v * 1e6 : v;
}

function energyEnts() {
  var h = H(),
    p = [],
    e = [];
  Object.keys(h.states).forEach(function (id) {
    if (id.indexOf("sensor.") !== 0) return;
    var a = h.states[id].attributes || {};
    if (!ISADMIN && modeOf(id).mode === "hide") return;
    if (a.device_class === "power") p.push(id);
    else if (a.device_class === "energy" && a.state_class) e.push(id);
  });
  return { power: p, energy: e };
}

function energyFetch() {
  var ids = energyEnts().energy;
  ENERGY.t = Date.now();
  if (!ids.length) {
    ENERGY.ok = true;
    return;
  }
  var d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  var w0 = d0.getTime() - 6 * 86400000;
  HA.statistics({
    start_time: new Date(w0).toISOString(),
    end_time: new Date(Date.now() + 3600000).toISOString(),
    statistic_ids: ids,
    period: "day",
    types: ["change"],
  })
    .then(function (r) {
      var days = [0, 0, 0, 0, 0, 0, 0],
        by = {};
      ids.forEach(function (id) {
        var u = A(id).unit_of_measurement,
          tot = 0,
          today = 0;
        (r[id] || []).forEach(function (x) {
          var st = typeof x.start === "number" ? x.start : Date.parse(x.start),
            i = Math.max(0, Math.min(6, Math.round((st - w0) / 86400000))),
            v = toKwh(x.change || 0, u);
          days[i] += v;
          tot += v;
          if (i === 6) today += v;
        });
        by[id] = { today: today, week: tot };
      });
      ENERGY.days = days;
      ENERGY.by = by;
      ENERGY.ok = true;
    })
    .catch(function () {
      ENERGY.ok = false;
    });
}

function kwhStr(v) {
  return (v < 10 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10) + _T("kwh");
}

function energyList(s) {
  var E = energyEnts(),
    list = [];
  if (!E.power.length && !E.energy.length) {
    list.push({
      el: section(_T("energy"), "plug", [
        pill("info", _T("nothing_to_show_yet"), {
          sub: function () {
            return _T("power_and_energy_sensors_appear_here");
          },
        }),
      ]),
      wide: true,
    });
    return list;
  }
  energyFetch();
  var g = glance(
    [
      [
        _T("power_now"),
        function () {
          var w = 0;
          E.power.forEach(function (id) {
            var s = V_(id);
            if (!isNaN(parseFloat(s))) w += toW(s, A(id).unit_of_measurement);
          });
          return w >= 1000 ? Math.round(w / 10) / 100 + " kW" : Math.round(w) + " W";
        },
      ],
      [
        _T("today"),
        function () {
          return ENERGY.ok === null ? "…" : ENERGY.ok === false ? "n/a" : kwhStr(ENERGY.days[6]);
        },
      ],
      [
        _T("7_days"),
        function () {
          return ENERGY.ok === null
            ? "…"
            : ENERGY.ok === false
              ? "n/a"
              : kwhStr(
                  ENERGY.days.reduce(function (a, b) {
                    return a + b;
                  }, 0)
                );
        },
      ],
    ],
    3
  );
  var card = mk("div", "hcard pane");
  card.innerHTML =
    "<div class='hbig'></div><div class='hsub'>" +
    _T("last_7_days_all_energy_sensors") +
    "</div><div class='hbars'></div><div class='haxis'></div>";
  var sig = "";
  card.refresh = function () {
    var sg = ENERGY.days.join(",") + ENERGY.ok;
    if (sg === sig) return;
    sig = sg;
    card.querySelector(".hsub").textContent =
      _T("last_7_days_all_energy_sensors") +
      (s && s.price > 0 && ENERGY.ok
        ? " · " +
          (s.cur || "") +
          Math.round(
            ENERGY.days.reduce(function (a, b) {
              return a + b;
            }, 0) *
              s.price *
              100
          ) /
            100
        : "");
    card.querySelector(".hbig").textContent =
      ENERGY.ok === false ? _T("no_usage_history_yet") : kwhStr(ENERGY.days[6]) + _T("today_2");
    var max = Math.max.apply(null, ENERGY.days.concat([0.001])),
      bars = card.querySelector(".hbars"),
      ax = card.querySelector(".haxis");
    bars.innerHTML = "";
    ax.innerHTML = "";
    ENERGY.days.forEach(function (v, i) {
      var b = mk("div", "hbar" + (v <= 0 ? " z" : ""));
      b.style.height = Math.max(4, Math.round((v / max) * 100)) + "%";
      bars.appendChild(b);
      var d = new Date();
      d.setDate(d.getDate() - (6 - i));
      ax.appendChild(mk("span", "", d.toLocaleDateString(LOC(), { weekday: "short" })));
    });
  };
  reg(card.refresh);
  reg(function () {
    if (Date.now() - ENERGY.t > 300000) energyFetch();
  });
  list.push({ el: section(_T("usage"), "plug", [g, card]), wide: true });
  if (E.energy.length)
    list.push({
      el: section(
        _T("energy"),
        "plug",
        E.energy.map(function (id) {
          return pill("plug", entName(id), {
            sub: function () {
              var b = ENERGY.by[id];
              return b
                ? _T("today_3") + kwhStr(b.today) + _T("7_days_2") + kwhStr(b.week)
                : _T("loading");
            },
            val: function () {
              var s = V_(id);
              return isNaN(parseFloat(s))
                ? ""
                : parseFloat(s).toFixed(1) + " " + (A(id).unit_of_measurement || "");
            },
          });
        })
      ),
      wide: false,
    });
  if (E.power.length)
    list.push({
      el: section(
        _T("power"),
        "plug",
        E.power.map(function (id) {
          return pill("plug", entName(id), {
            on: function () {
              return parseFloat(V_(id)) > 0;
            },
            val: function () {
              var s = V_(id);
              return isNaN(parseFloat(s))
                ? ""
                : Math.round(parseFloat(s) * 10) / 10 + " " + (A(id).unit_of_measurement || "");
            },
          });
        })
      ),
      wide: false,
    });
  return list;
}
