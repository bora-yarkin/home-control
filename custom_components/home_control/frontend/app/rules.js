/* Show rules: a section appears only while conditions hold. */

/* Show rules: a section can appear only while an entity is (or is not) in a given state. While editing it always shows, marked. */
var RULEDOMS = [
  "light",
  "switch",
  "input_boolean",
  "binary_sensor",
  "sensor",
  "person",
  "device_tracker",
  "media_player",
  "climate",
  "vacuum",
  "cover",
  "lock",
  "fan",
  "sun",
  "alarm_control_panel",
  "weather",
];

var STATEOPT = {
  light: ["on", "off"],
  switch: ["on", "off"],
  input_boolean: ["on", "off"],
  binary_sensor: ["on", "off"],
  fan: ["on", "off"],
  person: ["home", "not_home"],
  device_tracker: ["home", "not_home"],
  media_player: ["playing", "paused", "idle", "off"],
  climate: ["off", "heat", "cool", "auto"],
  vacuum: ["cleaning", "docked", "returning", "paused", "error"],
  cover: ["open", "closed"],
  lock: ["locked", "unlocked"],
  sun: ["above_horizon", "below_horizon"],
  alarm_control_panel: ["disarmed", "armed_home", "armed_away", "triggered"],
};

/* A section shows only while its device rule and every extra condition hold. */
function ruleOk(s) {
  var w = s.when;
  if (w) {
    var m = V_(w.id) === w.is;
    if (w.not ? m : !m) return false;
  }
  return !(s.and || []).some(function (c) {
    return !ruleEvalCond(c);
  });
}

function minsOf(t) {
  var p = String(t).split(":");
  return +p[0] * 60 + +p[1];
}

var RULE_DAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/* Minutes since midnight and weekday (Monday = 0) of a moment in Home Assistant's time zone, so rules mean the same on a phone abroad as on the wall panel. */
function haClock(date) {
  var tz = H() && H().config && H().config.time_zone,
    parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || undefined,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    }).formatToParts(date);
  } catch (e) {
    return { m: date.getHours() * 60 + date.getMinutes(), dow: (date.getDay() + 6) % 7 };
  }
  var p = {};
  parts.forEach(function (x) {
    p[x.type] = x.value;
  });
  return { m: (+p.hour % 24) * 60 + +p.minute, dow: RULE_DAYS[p.weekday] };
}

function ruleEvalCond(c) {
  var clock = haClock(new Date()),
    m = clock.m;
  if (c.c === "days") return !!c.days[clock.dow];
  if (c.c === "between") {
    var f = minsOf(c.from),
      t = minsOf(c.to);
    return f <= t ? m >= f && m < t : m >= f || m < t;
  }
  if (c.c === "home") {
    var P = persons();
    return c.v === "someone"
      ? P.some(function (id) {
          return V_(id) === "home";
        })
      : c.v === "nobody"
        ? !P.some(function (id) {
            return V_(id) === "home";
          })
        : V_(c.v) === "home";
  }
  if (c.c === "sun") return V_("sun.sun") === (c.v === "dark" ? "below_horizon" : "above_horizon");
  if (c.c === "sunrise") {
    var r = new Date(A("sun.sun").next_rising);
    if (isNaN(r)) return false;
    /* Before sunrise this is today's; after it, tomorrow's, which differs by a minute or two. */
    var rm = haClock(r).m;
    return c.op === "after" ? rm > minsOf(c.at) : rm < minsOf(c.at);
  }
  if (c.c === "users") {
    var me = H() && H().user ? H().user.id : "";
    return !c.ids.length || c.ids.indexOf(me) >= 0;
  }
  if (c.c === "state") return V_(c.id) === c.is;
  if (c.c === "sensor") {
    var x = parseFloat(V_(c.id));
    if (!isFinite(x)) return false;
    return c.op === "above" ? x > c.val : c.op === "below" ? x < c.val : x >= c.val && x <= c.val2;
  }
  return false;
}

/* Rules that depend on the clock or on states are checked again while a page is open, so a section appears and disappears by itself. */
function ruleSig(scope) {
  return secOrder(scope)
    .map(function (s) {
      return s.hide ? "h" : ruleOk(s) ? "1" : "0";
    })
    .join("");
}

var RULESIG = {};

/* Checked on every refresh: when a section's show rule starts or stops holding, the page is brought up to date. */
function ruleTick() {
  var scope = VIEW !== "home" && UIROOM[VIEW] ? "room:" + VIEW : "home";
  if (editing() || RULESIG[scope] === undefined) return;
  var sig = ruleSig(scope);
  if (sig !== RULESIG[scope]) {
    RULESIG[scope] = sig;
    setTimeout(livePatch, 0);
  }
}

function ruleStateText(v) {
  return cap(String(v).replace(/_/g, " "));
}

/* While editing, a hidden section stays on the page, dimmed and tagged, so it can be shown again from where it is. */
function hideMark(el) {
  el.classList.add("sec-hid");
  var h = el.querySelector(".sec-h");
  if (h) {
    var t = mk("span", "edtag2");
    t.textContent = _T("hidden");
    h.appendChild(t);
  }
}

function ruleMark(el) {
  el.classList.add("ed-rule");
  var h = el.querySelector(":scope>.sec-h");
  if (h) {
    var t = mk("span", "edtag2");
    t.textContent = _T("hidden_by_rule");
    h.appendChild(t);
  }
}

function ruleControls(box, e, save, redraw, key) {
  box.appendChild(sep(_T("when_to_show"), "info"));
  function choose(then) {
    pickEntity(_T("choose_what_decides"), RULEDOMS, null, function (id) {
      var o = STATEOPT[dom(id)];
      then(id, o ? o[0] : V_(id));
    });
  }
  box.appendChild(
    seg(
      [
        ["always", _T("always")],
        ["when", _T("only_when")],
      ],
      e.when ? "when" : "always",
      function (v) {
        if (v === "always") {
          if (e.when) {
            delete e.when;
            save();
            redraw();
          }
          return;
        }
        if (e.when) return;
        choose(function (id, st) {
          e.when = { id: id, is: st, not: false };
          save();
        });
      }
    )
  );
  if (!e.when) {
    ruleMore(box, e, save, key);
    return;
  }
  var w = e.when,
    o = STATEOPT[dom(w.id)];
  box.appendChild(
    pill(sensorIcon(w.id), entName(w.id), {
      sub: function () {
        return _T("tap_to_choose_another");
      },
      tap: function () {
        choose(function (id, st) {
          w.id = id;
          w.is = st;
          save();
        });
      },
    })
  );
  box.appendChild(
    seg(
      [
        ["is", _T("is")],
        ["not", _T("is_not")],
      ],
      w.not ? "not" : "is",
      function (v) {
        w.not = v === "not";
        save();
        redraw();
      }
    )
  );
  if (o)
    box.appendChild(
      seg(
        (o.indexOf(w.is) >= 0 ? o : o.concat([w.is])).slice(0, 5).map(function (x) {
          return [x, ruleStateText(x)];
        }),
        w.is,
        function (v) {
          w.is = v;
          save();
          redraw();
        }
      )
    );
  else
    box.appendChild(
      textRow(
        "edit",
        _T("state_to_match"),
        w.is,
        function (v) {
          if (v) {
            w.is = v.slice(0, 40);
            save();
          }
        },
        40
      )
    );
  var hn = mk("div", "hint");
  hn.textContent = _T("while_editing_the_section_always_sho");
  box.appendChild(hn);
  ruleMore(box, e, save, key);
}

function ruleMore(box, e, save, key) {
  box.appendChild(sep(_T("time_people_and_more"), "clock"));
  (e.and || []).forEach(function (c, i) {
    box.appendChild(
      pill("clock", condText(c), {
        sub: function () {
          return _T("all_of_these_must_be_true");
        },
        tap: function () {
          showPopup("sec-cond:" + key + ":" + i, true);
        },
      })
    );
  });
  if ((e.and || []).length < 4)
    box.appendChild(
      pill("plus", _T("add_a_condition"), {
        tap: function () {
          (e.and = e.and || []).push({ c: "between", from: "22:00", to: "07:00" });
          save();
          showPopup("sec-cond:" + key + ":" + (e.and.length - 1), true);
        },
      })
    );
}

function secCondPage(b, id) {
  var q = id.split(":"),
    e = secById(q[0], q[1]),
    i = +q[2];
  if (!e || !e.and || !e.and[i]) return;
  condBody(
    b,
    e.and[i],
    function () {
      setSecOrder(scopeKey(q[0]), secOrder(scopeKey(q[0])));
      uiChanged();
    },
    function (box) {
      box.appendChild(
        pill("trash", _T("remove_this_condition"), {
          tap: function () {
            e.and.splice(i, 1);
            if (!e.and.length) delete e.and;
            uiChanged();
            popBack();
          },
        })
      );
    },
    true
  );
}
