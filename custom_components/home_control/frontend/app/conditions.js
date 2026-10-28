/* Conditions and plain-language summaries shared by rules, scenes and notifications. */

var DAYLAB = [_T("mon"), _T("tue"), _T("wed"), _T("thu"), _T("fri"), _T("sat"), _T("sun")];

/* ---- Conditions: shared by the section visibility rules ---- */
var HHMM = /^([01]\d|2[0-3]):[0-5]\d$/,
  RE_STATE =
    /^(light|switch|fan|binary_sensor|input_boolean|media_player|climate|cover|lock|vacuum|person|device_tracker|alarm_control_panel|sensor|camera|input_select|weather)\.[a-z0-9_]+$/,
  RE_SENS = /^sensor\.[a-z0-9_]+$/,
  RE_WHO = /^person\.[a-z0-9_]+$/;

function numIn(x, lo, hi) {
  return typeof x === "number" && isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null;
}

function personName(id) {
  return id === "anyone" ? _T("anyone") : id === "everyone" ? _T("everyone") : entName(id);
}

function persons() {
  return Object.keys(H().states).filter(function (k) {
    return k.indexOf("person.") === 0;
  });
}

var RE_SVAL = /^[A-Za-z0-9_ .:\/-]{1,40}$/,
  STATE_DOMS = [
    "light",
    "switch",
    "fan",
    "binary_sensor",
    "input_boolean",
    "media_player",
    "climate",
    "cover",
    "lock",
    "vacuum",
    "person",
    "device_tracker",
    "alarm_control_panel",
    "sensor",
    "camera",
    "input_select",
    "weather",
  ];

function stateOptions(id) {
  var o = STATEOPT[dom(id)];
  return (o || ["on", "off"]).concat(["unavailable"]);
}

function stateWordT(v, verb) {
  return v === "on"
    ? verb
      ? _T("turns_on_2")
      : _T("is_on")
    : v === "off"
      ? verb
        ? _T("turns_off_2")
        : _T("is_off")
      : (verb ? _T("becomes") : _T("is")) + " " + ruleStateText(v);
}

function statePick(box, obj, key, redraw) {
  var opts = stateOptions(obj.id);
  if (obj[key] && opts.indexOf(obj[key]) < 0) opts = opts.concat([obj[key]]);
  box.appendChild(
    selectTile(
      _T("state"),
      function () {
        return opts;
      },
      function () {
        return obj[key];
      },
      function (v) {
        obj[key] = v;
        redraw();
      },
      "info",
      function (v) {
        return ruleStateText(v);
      }
    )
  );
  if (!STATEOPT[dom(obj.id)])
    box.appendChild(
      textRow(
        "edit",
        _T("or_type_the_exact_state"),
        obj[key] || "",
        function (v) {
          if (RE_SVAL.test(v)) {
            obj[key] = v;
            redraw();
          }
        },
        40
      )
    );
}

function notifyNice(t) {
  var sfx = t.replace(/^mobile_app_/, "");
  try {
    var dv = H().devices || {},
      k;
    for (k in dv) {
      var nm = dv[k].name_by_user || dv[k].name;
      if (
        nm &&
        String(nm)
          .toLowerCase()
          .replace(/[’']/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "") === sfx
      )
        return nm;
    }
  } catch (e) {}
  return notifyNiceRaw(t);
}

function notifyNiceRaw(t) {
  return t === "persistent_notification"
    ? _T("home_assistant_notifications")
    : t
        .replace(/^mobile_app_/, "")
        .replace(/_/g, " ")
        .replace(/\b[a-z]/g, function (c) {
          return c.toUpperCase();
        })
        .replace(/\bIp(hone|ad)\b/g, function (m) {
          return "iP" + m.slice(2);
        });
}

/* The people who can be chosen: every active person of Home Assistant. Only an admin can list them; the names are kept for the summaries. */
var RULE_USERS = null;

function ruleUsers(cb) {
  if (RULE_USERS) return cb(RULE_USERS);
  HA.users()
    .then(function (l) {
      RULE_USERS = l
        .filter(function (u) {
          return !u.system_generated && u.is_active;
        })
        .map(function (u) {
          return { id: u.id, name: u.name };
        });
      cb(RULE_USERS);
    })
    .catch(function () {
      cb([]);
    });
}

function ruleUserName(id) {
  var u = (RULE_USERS || []).filter(function (x) {
    return x.id === id;
  })[0];
  return u ? u.name : _T("user");
}

function cleanCond(c) {
  if (!c) return null;
  if (c.c === "days") {
    var d = Array.isArray(c.days) && c.days.length === 7 ? c.days.map(Boolean) : null;
    return d && d.some(Boolean) && !d.every(Boolean) ? { c: "days", days: d } : null;
  }
  if (c.c === "between")
    return HHMM.test(c.from) && HHMM.test(c.to) && c.from !== c.to
      ? { c: "between", from: c.from, to: c.to }
      : null;
  if (c.c === "home")
    return c.v === "someone" || c.v === "nobody" || RE_WHO.test(c.v) ? { c: "home", v: c.v } : null;
  if (c.c === "users") {
    var ids = (Array.isArray(c.ids) ? c.ids : []).filter(function (x, i, a) {
      return typeof x === "string" && /^[a-f0-9]{32}$/.test(x) && a.indexOf(x) === i;
    });
    /* Nobody chosen yet is kept: it means everyone, and keeps the condition being edited from vanishing. */
    return { c: "users", ids: ids.slice(0, 40) };
  }
  if (c.c === "sun") return c.v === "dark" || c.v === "light" ? { c: "sun", v: c.v } : null;
  if (c.c === "sunrise")
    return (c.op === "after" || c.op === "before") && HHMM.test(c.at)
      ? { c: "sunrise", op: c.op, at: c.at }
      : null;
  if (c.c === "state") {
    var is = typeof c.is === "string" ? c.is.trim() : "";
    return RE_STATE.test(c.id) && RE_SVAL.test(is) ? { c: "state", id: c.id, is: is } : null;
  }
  if (c.c === "sensor") {
    var v = numIn(c.val, -1e6, 1e6);
    if (!(RE_SENS.test(c.id) && v !== null)) return null;
    if (c.op === "above" || c.op === "below") return { c: "sensor", id: c.id, op: c.op, val: v };
    if (c.op === "between") {
      var v2 = numIn(c.val2, -1e6, 1e6);
      return v2 !== null && v2 > v
        ? { c: "sensor", id: c.id, op: "between", val: v, val2: v2 }
        : null;
    }
    return null;
  }
  return null;
}

/* A service step can call any Home Assistant service, so the ones that run commands, restart or stop the system, or wipe the database are not offered from here. */
/* ---- plain-language summaries ---- */
function daysText(d) {
  return d.every(function (x, i) {
    return x === i < 5;
  })
    ? _T("weekdays_2")
    : d.every(function (x, i) {
          return x === i >= 5;
        })
      ? _T("weekends_2")
      : DAYLAB.filter(function (x, i) {
          return d[i];
        }).join(", ");
}

function condText(c) {
  if (c.c === "days") return daysText(c.days);
  if (c.c === "between") return _T("between") + " " + c.from + "–" + c.to;
  if (c.c === "home")
    return c.v === "someone"
      ? _T("someone_is_home")
      : c.v === "nobody"
        ? _T("nobody_is_home")
        : personName(c.v) + " " + _T("is_home_2");
  if (c.c === "users")
    return (
      _T("only_for") +
      " " +
      (c.ids.length
        ? c.ids
            .map(function (id) {
              return ruleUserName(id);
            })
            .join(", ")
        : _T("choose_who_sees_it"))
    );
  if (c.c === "sun") return c.v === "dark" ? _T("after_dark_3") : _T("in_daylight_2");
  if (c.c === "sunrise")
    return (c.op === "after" ? _T("sunrise_is_after") : _T("sunrise_is_before")) + " " + c.at;
  if (c.c === "state") return entName(c.id) + " " + stateWordT(c.is, false);
  if (c.c === "sensor")
    return c.op === "between"
      ? entName(c.id) + " " + _T("is_between") + " " + c.val + "–" + c.val2
      : entName(c.id) + " " + (c.op === "above" ? _T("is_above") : _T("is_below")) + " " + c.val;
  return "";
}

/* Where notifications send you: this dashboard's own page, wherever it is installed. */
/* Dates and times follow the language and 12/24-hour choice of the Home Assistant user. */
function LOC() {
  var h = H();
  return (h && h.locale && h.locale.language) || undefined;
}

function tfmt(d, o) {
  var h = H(),
    tf = PREFS.tf !== "auto" ? PREFS.tf : h && h.locale && h.locale.time_format,
    x = Object.assign({}, o);
  if (tf === "12") x.hour12 = true;
  else if (tf === "24") x.hour12 = false;
  return d.toLocaleTimeString(LOC(), x);
}

/* Temperatures use the unit Home Assistant is set to, and a sensible starting point comes from the device itself. */
function TEMPU() {
  var h = H(),
    u = h && h.config && h.config.unit_system && h.config.unit_system.temperature;
  return u || "°C";
}

function defTemp(id) {
  var x = A(id);
  if (typeof x.temperature === "number") return x.temperature;
  var lo = x.min_temp || 16,
    hi = x.max_temp || 30;
  return Math.round((lo + hi) / 2);
}

function compileScene(sc) {
  var listed = {},
    acts = [],
    rooms =
      sc.room === "home"
        ? ORDER.filter(function (k) {
            return k !== "home" && !!UIROOM[k];
          })
        : [sc.room],
    offL = [],
    byDom = {};
  sc.acts.forEach(function (a) {
    listed[a.id] = 1;
    var m = A(a.id).entity_id;
    if (Array.isArray(m))
      m.forEach(function (x) {
        listed[x] = 1;
      });
  });
  if (sc.others === "lights" || sc.others === "all")
    rooms.forEach(function (r) {
      (ROOMLIGHTS[r] || []).forEach(function (i) {
        if (!listed[i] && offL.indexOf(i) < 0) offL.push(i);
      });
    });
  if (offL.length) acts.push({ action: "light.turn_off", target: { entity_id: offL } });
  if (sc.others === "all")
    rooms.forEach(function (r) {
      roomDevs(r).forEach(function (x) {
        if (x.type === "light" || x.keep || listed[x.id]) return;
        (byDom[x.type] = byDom[x.type] || []).push(x.id);
      });
    });
  Object.keys(byDom).forEach(function (dm) {
    acts.push({ action: dm + ".turn_off", target: { entity_id: byDom[dm] } });
  });
  if (acts.length && sc.acts.length) acts.push({ delay: { milliseconds: 350 } });
  sc.acts.forEach(function (a) {
    var dm = dom(a.id);
    if (dm === "light") {
      if (a.on === false) acts.push({ action: "light.turn_off", target: { entity_id: a.id } });
      else {
        var d = {};
        if (a.bri) d.brightness_pct = a.bri;
        if (a.col) applyPresetData(d, a.col, a.id);
        acts.push({ action: "light.turn_on", target: { entity_id: a.id }, data: d });
      }
    } else if (dm === "climate") {
      if (a.mode === "cool" || a.mode === "heat")
        acts.push({
          action: "climate.set_temperature",
          target: { entity_id: a.id },
          data: { hvac_mode: a.mode, temperature: a.temp || 24 },
        });
      else acts.push({ action: "climate.turn_off", target: { entity_id: a.id } });
    } else
      acts.push({
        action: dm + "." + (a.on === false ? "turn_off" : "turn_on"),
        target: { entity_id: a.id },
      });
  });
  return acts;
}

function one(x) {
  return Array.isArray(x) && x.length === 1 ? x[0] : x;
}

function timeRow(icon, val, fn) {
  var w = mk("div", "sqw pane", svg(icon)),
    i = mk("input", "sq");
  i.type = "time";
  i.value = val || "";
  i.addEventListener("change", function () {
    if (HHMM.test(i.value)) fn(i.value);
  });
  w.appendChild(i);
  return w;
}

function numRow(icon, ph, val, fn, lo, hi) {
  var w = mk("div", "sqw pane", svg(icon)),
    i = mk("input", "sq");
  i.type = "number";
  i.step = "any";
  i.placeholder = ph;
  i.setAttribute("aria-label", ph);
  if (val !== null && val !== undefined) i.value = val;
  i.addEventListener("change", function () {
    var v = i.value.trim() === "" ? null : parseFloat(i.value);
    fn(v === null || !isFinite(v) ? null : Math.max(lo, Math.min(hi, v)));
  });
  w.appendChild(i);
  return w;
}

/* Rows that open something when tapped and carry their own on/off switch (notifications). */
function swtEl(isOn, onToggle) {
  var s = mk("span", "swt");
  s.setAttribute("role", "switch");
  s.tabIndex = 0;
  s.addEventListener("click", function (e) {
    e.stopPropagation();
    onToggle();
  });
  s.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    }
  });
  s.refresh = function () {
    var on = !!isOn();
    s.classList.toggle("on", on);
    s.setAttribute("aria-checked", on ? "true" : "false");
  };
  s.refresh();
  reg(s.refresh);
  return s;
}

function swRow(icon, name, o) {
  var p = pill(icon, name, { sub: o.sub, tap: o.open });
  p.classList.add("hasact");
  p.appendChild(swtEl(o.on, o.toggle));
  return p;
}

/* The editor for one condition. It edits the object in place and reports each change; where the condition lives is up to the caller. */
function condBody(b, c, onChange, footer) {
  var box = mk("div"),
    ch = function () {
      if (onChange) onChange();
    };
  b.appendChild(box);
  function set(v) {
    if (c.c === v) return;
    Object.keys(c).forEach(function (k) {
      delete c[k];
    });
    c.c = v;
    if (v === "days") c.days = [true, true, true, true, true, false, false];
    if (v === "between") {
      c.from = "22:00";
      c.to = "07:00";
    }
    if (v === "users") c.ids = [];
    if (v === "home") c.v = "someone";
    if (v === "sun") c.v = "dark";
    if (v === "sunrise") {
      c.op = "after";
      c.at = "06:30";
    }
    if (v === "state") c.is = "on";
    if (v === "sensor") c.op = "above";
    redraw();
  }
  function redraw() {
    ch();
    redrawBox(box, draw);
  }
  function draw() {
    box.appendChild(
      seg(
        [
          ["days", _T("days")],
          ["between", _T("time_window")],
          ["home", _T("who_s_home")],
        ],
        c.c,
        set
      )
    );
    box.appendChild(
      seg(
        [
          ["sun", _T("dark_or_light")],
          ["sunrise", _T("sunrise_time")],
          ["users", _T("who_sees_it")],
        ],
        c.c,
        set
      )
    );
    box.appendChild(
      seg(
        [
          ["state", _T("device_is")],
          ["sensor", _T("sensor_value")],
        ],
        c.c,
        set
      )
    );
    if (c.c === "users") {
      var uh = mk("div", "hint");
      uh.textContent = _T("the_section_shows_only_to_the_people_chosen_here");
      box.appendChild(uh);
      var uw = mk("div");
      box.appendChild(uw);
      ruleUsers(function (list) {
        var prev = CUR;
        CUR = SLIVE;
        list.forEach(function (u) {
          uw.appendChild(
            pill("person", u.name, {
              on: function () {
                return c.ids.indexOf(u.id) >= 0;
              },
              tap: function () {
                var i = c.ids.indexOf(u.id);
                if (i >= 0) c.ids.splice(i, 1);
                else c.ids.push(u.id);
                ch();
              },
            })
          );
        });
        if (!list.length) uw.appendChild(pill("info", _T("no_users_found"), {}));
        CUR = prev;
        refresh();
      });
    }
    if (c.c === "days") {
      var r = mk("div", "pre");
      DAYLAB.forEach(function (l, k) {
        var x = mk("div", "rbtn pane keepc" + (c.days[k] ? " act" : ""));
        x.textContent = l;
        x.setAttribute("role", "button");
        x.addEventListener("click", function () {
          c.days[k] = !c.days[k];
          ch();
          x.classList.toggle("act", c.days[k]);
        });
        r.appendChild(x);
      });
      box.appendChild(r);
    }
    if (c.c === "between") {
      box.appendChild(sep(_T("from_2"), "clock"));
      box.appendChild(
        timeRow("clock", c.from, function (v) {
          c.from = v;
          ch();
        })
      );
      box.appendChild(sep(_T("until"), "clock"));
      box.appendChild(
        timeRow("clock", c.to, function (v) {
          c.to = v;
          ch();
        })
      );
      var h = mk("div", "hint");
      h.textContent = _T("a_window_that_ends_earlier_than_it_s");
      box.appendChild(h);
    }
    if (c.c === "home") {
      box.appendChild(
        seg(
          [
            ["someone", _T("someone_home")],
            ["nobody", _T("nobody_home")],
          ],
          RE_WHO.test(c.v) ? "" : c.v,
          function (v) {
            c.v = v;
            redraw();
          }
        )
      );
      persons().forEach(function (id) {
        box.appendChild(
          pill("person", personName(id) + " " + _T("is_home_2"), {
            on: function () {
              return c.v === id;
            },
            tap: function () {
              c.v = id;
              redraw();
            },
          })
        );
      });
    }
    if (c.c === "sun")
      box.appendChild(
        seg(
          [
            ["dark", _T("after_dark_2")],
            ["light", _T("daylight")],
          ],
          c.v,
          function (v) {
            c.v = v;
            redraw();
          }
        )
      );
    if (c.c === "sunrise") {
      box.appendChild(
        seg(
          [
            ["after", _T("sunrise_is_after_2")],
            ["before", _T("sunrise_is_before_2")],
          ],
          c.op,
          function (v) {
            c.op = v;
            redraw();
          }
        )
      );
      box.appendChild(
        timeRow("bright", c.at, function (v) {
          c.at = v;
          ch();
        })
      );
      var h3 = mk("div", "hint");
      h3.textContent = _T("uses_today_s_sunrise_for_your_home_s");
      box.appendChild(h3);
    }
    if (c.c === "state") {
      box.appendChild(
        pill("plug", c.id ? entName(c.id) : _T("choose_a_device"), {
          sub: function () {
            return c.id ? _T("currently") + V_(c.id) : _T("required");
          },
          tap: function () {
            pickEntity(_T("choose_a_device"), STATE_DOMS, null, function (id) {
              c.id = id;
              var o = stateOptions(id);
              if (o.indexOf(c.is) < 0) c.is = o[0];
              ch();
            });
          },
        })
      );
      if (c.id) statePick(box, c, "is", redraw);
    }
    if (c.c === "sensor") {
      box.appendChild(
        pill("thermo", c.id ? entName(c.id) : _T("choose_a_sensor"), {
          sub: function () {
            return c.id
              ? _T("currently") + V_(c.id) + " " + (A(c.id).unit_of_measurement || "")
              : _T("required");
          },
          tap: function () {
            pickEntity(_T("choose_a_sensor"), ["sensor"], null, function (id) {
              c.id = id;
              var n = parseFloat(V_(id));
              if (c.val === undefined && isFinite(n)) c.val = Math.round(n * 10) / 10;
              ch();
            });
          },
        })
      );
      if (c.id) {
        box.appendChild(
          seg(
            [
              ["above", _T("is_above_2")],
              ["below", _T("is_below_2")],
              ["between", _T("between_2")],
            ],
            c.op,
            function (v) {
              c.op = v;
              if (v === "between" && c.val2 === undefined && c.val !== undefined)
                c.val2 = c.val + 10;
              redraw();
            }
          )
        );
        box.appendChild(
          numRow(
            "tune",
            c.op === "between" ? _T("from_2") : _T("value"),
            c.val,
            function (v) {
              c.val = v === null ? undefined : v;
              ch();
            },
            -1e6,
            1e6
          )
        );
        if (c.op === "between")
          box.appendChild(
            numRow(
              "tune",
              _T("up_to"),
              c.val2,
              function (v) {
                c.val2 = v === null ? undefined : v;
                ch();
              },
              -1e6,
              1e6
            )
          );
      }
    }
    if (footer) footer(box);
  }
  redraw();
}
