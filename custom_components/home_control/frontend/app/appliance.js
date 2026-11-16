/* Appliances (an oven, a washer, a dryer, a dishwasher, anything with programs): a device whose popup is made of slots, each bound by the administrator to any entity of any brand with the entity selector. Only the slots that are bound are shown; what a control is follows the entity's own domain, so nothing here knows a brand. */

/* Every slot an appliance can have: what it is called, which kinds of entity can fill it, and whether it is something to read or something to operate. */
var AP_SLOTS = {
  state: { l: "ap_state", doms: ["sensor", "binary_sensor", "select", "input_select"], read: true },
  program: { l: "ap_program", doms: ["select", "input_select"] },
  temperature: { l: "ap_temperature", doms: ["number", "input_number", "select", "input_select"] },
  duration: { l: "ap_duration", doms: ["number", "input_number", "input_datetime", "select", "input_select"] },
  start: { l: "ap_start", doms: ["button", "input_button", "script", "switch", "input_boolean"] },
  stop: { l: "ap_stop", doms: ["button", "input_button", "script", "switch", "input_boolean"] },
  progress: { l: "ap_progress", doms: ["sensor", "number", "input_number"], read: true },
  current: { l: "ap_current_temperature", doms: ["sensor", "number", "input_number"], read: true },
  remaining: { l: "ap_remaining", doms: ["sensor", "input_datetime"], read: true },
  door: { l: "ap_door", doms: ["binary_sensor", "sensor"], read: true },
  permission: { l: "ap_remote_start_allowed", doms: ["binary_sensor", "switch", "input_boolean"], read: true },
};

/* A type only chooses which slots the editor offers first and the icon: every slot can still be used on any type. */
var AP_TYPES = {
  oven: { l: "ap_oven", icon: "plug", slots: ["state", "program", "temperature", "current", "duration", "start", "stop", "remaining", "progress", "door", "permission"] },
  washer: { l: "ap_washer", icon: "drop", slots: ["program", "start", "stop", "state", "progress", "remaining", "door", "permission", "temperature", "duration"] },
  dryer: { l: "ap_dryer", icon: "drop", slots: ["program", "start", "stop", "state", "progress", "remaining", "door", "permission", "temperature", "duration"] },
  dishwasher: { l: "ap_dishwasher", icon: "drop", slots: ["program", "start", "stop", "state", "progress", "remaining", "door", "permission", "temperature", "duration"] },
  other: { l: "ap_appliance", icon: "plug", slots: ["state", "program", "start", "stop", "progress", "remaining", "door", "permission", "temperature", "duration"] },
};
var AP_EXTRA_DOMS = ["select", "input_select", "number", "input_number", "switch", "input_boolean", "binary_sensor", "sensor", "button", "input_button", "script"];

function apNew(type) {
  var t = AP_TYPES[type] || AP_TYPES.other;
  return { id: "", aid: newKey("ap"), name: _T(t.l), icon: t.icon, kind: "appliance", ap: { type: type in AP_TYPES ? type : "other", slots: {}, extra: [] } };
}

function apFind(aid) {
  var found = null;
  function look(d) {
    if (d.kind === "appliance" && d.aid === aid) found = d;
  }
  allSectionLists().forEach(function (secs) {
    secs.forEach(function (s) {
      (s.devs || []).forEach(look);
    });
  });
  Object.keys(UI.devs || {}).forEach(function (r) {
    (UI.devs[r] || []).forEach(look);
  });
  return found;
}

function apHas(id) {
  return !!id && !!H().states[id];
}

/* Seconds until a timestamp, or the seconds a duration sensor holds; null when the entity does not say. */
function apSecs(id) {
  if (!apHas(id) || !svOk(id)) return null;
  var s = V_(id),
    a = A(id);
  if (a.device_class === "timestamp") {
    var t = Date.parse(s);
    return isFinite(t) ? Math.round((t - Date.now()) / 1000) : null;
  }
  if (a.device_class === "duration" && isFinite(Number(s))) {
    var u = a.unit_of_measurement;
    return Number(s) * (u === "h" ? 3600 : u === "min" ? 60 : u === "d" ? 86400 : u === "ms" ? 0.001 : 1);
  }
  return null;
}

/* "1 h 12 min", "8 min": a number of seconds as it is read. */
function apSpan(secs) {
  var h = Math.floor(secs / 3600),
    m = Math.round((secs % 3600) / 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return ((h ? h + " h " : "") + (m || !h ? m + " min" : "")).trim();
}

/* What a timestamp or a number of seconds left means to read: "1 h 12 min", "8 min", "now". */
function apLeft(id) {
  if (!svOk(id)) return "–";
  var secs = apSecs(id);
  if (secs === null) return entVal(id);
  return secs <= 0 ? _T("ap_now") : apSpan(secs);
}

/* Whether a program is under way, from what the appliance reports and no word of any language: time left above zero, else progress between 0 and 100.
   An appliance with no program says "unknown" for its time left, which is idle; "unavailable" and a missing entity say nothing (null). */
function apActive(ap) {
  var s = ap.slots;
  if (s.remaining && apHas(s.remaining)) {
    if (V_(s.remaining) === "unknown") return false;
    var left = apSecs(s.remaining);
    if (left !== null) return left > 0;
  }
  if (s.progress && apHas(s.progress) && svOk(s.progress)) {
    var p = Number(V_(s.progress));
    if (isFinite(p)) return p > 0 && p < 100;
  }
  return null;
}

/* A state as Home Assistant itself writes it for the person's language (it knows an enum sensor's states and a door's open and closed), else the value made readable. */
function apStateText(id) {
  if (!svOk(id)) return _T("ap_not_available");
  var h = H();
  if (typeof h.formatEntityState === "function") {
    try {
      var t = h.formatEntityState(h.states[id]);
      if (t) return t;
    } catch (x) {}
  }
  var dc = A(id).device_class,
    on = V_(id) === "on";
  if (dom(id) === "binary_sensor") {
    if (["door", "window", "garage_door", "opening"].indexOf(dc) >= 0) return on ? _T("ap_open") : _T("ap_closed");
    if (dc === "lock") return on ? _T("unlocked_2") : _T("ap_locked");
  }
  var v = entVal(id);
  return dom(id) === "binary_sensor" ? v : v.replace(/_/g, " ");
}

function apIsDoor(id) {
  return dom(id) === "binary_sensor" && ["door", "window", "garage_door", "opening"].indexOf(A(id).device_class) >= 0;
}

/* A number of seconds, minutes or hours as it is read, from the entity's own unit. */
function apDurationText(v, unit) {
  var secs = Number(v) * (unit === "h" ? 3600 : unit === "min" ? 60 : unit === "d" ? 86400 : 1);
  return secs <= 0 ? "0 min" : apSpan(secs);
}

/* Start can be pressed only when its entity can be reached and, if a "remote start allowed" entity is bound, that one says on. The reason is shown instead of a
   button that would do nothing. A button has no state until it is first pressed ("unknown" is what Home Assistant shows for one that works), so it is reached unless it is unavailable. */
function apStartGate(ap) {
  var s = ap.slots;
  if (!s.start || !apHas(s.start)) return { ok: false, why: "" };
  if (s.permission && apHas(s.permission)) {
    var p = V_(s.permission);
    if (p === "off") return { ok: false, why: _T("ap_remote_start_is_off_on_the_appliance") };
    if (!svOk(s.permission)) return { ok: false, why: _T("ap_remote_start_cannot_be_read") };
  }
  if (!remoteUsable(s.start)) return { ok: false, why: _T("ap_start_is_not_available_now") };
  return { ok: true, why: "" };
}

/* Start and Stop through whatever was bound: a button is pressed, a script runs, a switch is turned on to start and off to stop (not toggled, so a tap cannot undo itself). */
function apAct(e, role) {
  if (!remoteUsable(e)) {
    toast(_T("rm_not_available_right_now"));
    return;
  }
  var d = dom(e);
  if (d === "switch" || d === "input_boolean") call(d, role === "start" ? "turn_on" : "turn_off", { entity_id: e });
  else remotePress({ e: e });
}

function apRow(d) {
  var ap = d.ap;
  return pill(d.icon || "plug", d.name, {
    val: function () {
      var s = ap.slots;
      if (apActive(ap) && s.remaining) return apLeft(s.remaining);
      if (s.state && apHas(s.state)) return apStateText(s.state);
      if (s.program && apHas(s.program)) return entVal(s.program);
      return "";
    },
    tap: function () {
      showPopup("appliance:" + d.aid, true);
    },
  });
}

/* How far along it is: a bar, with the value in it. A value that is not a percentage is only written. */
function apProgressBar(id) {
  var bar = mk("div", "ap-bar pane"),
    fill = mk("i"),
    tx = mk("span");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", _T("ap_progress"));
  bar.appendChild(fill);
  bar.appendChild(tx);
  function paint() {
    var v = Number(V_(id)),
      u = A(id).unit_of_measurement,
      ok = svOk(id) && isFinite(v),
      pct = ok && (u === "%" || !u);
    bar.style.display = ok ? "" : "none";
    fill.style.width = pct ? Math.max(0, Math.min(100, v)) + "%" : "0";
    tx.textContent = ok ? entVal(id) : "";
    if (pct) bar.setAttribute("aria-valuenow", String(Math.max(0, Math.min(100, Math.round(v)))));
  }
  paint();
  reg(paint);
  return bar;
}

/* A chip row of readings: only the ones that are bound. */
function apChips(b, items) {
  if (items.length) b.appendChild(glance(items, items.length));
}

/* An oven with a temperature it can be set to: a dial to turn, the temperature now as a dot on it, the state under the number. */
function apOvenDial(ap) {
  var s = ap.slots,
    t = s.temperature,
    a0 = A(t);
  return apDial({
    label: _T("ap_temperature"),
    set: {
      min: isFinite(Number(a0.min)) ? Number(a0.min) : 0,
      max: isFinite(Number(a0.max)) ? Number(a0.max) : 300,
      step: Number(a0.step) > 0 ? Number(a0.step) : 1,
      fmt: function (v) {
        return v + (A(t).unit_of_measurement || "");
      },
      get: function () {
        var v = Number(V_(t));
        return svOk(t) && isFinite(v) ? v : null;
      },
      commit: function (v) {
        call(dom(t) === "input_number" ? "input_number" : "number", "set_value", { entity_id: t, value: v });
      },
    },
    big: function () {
      var v = Number(V_(t));
      return svOk(t) && isFinite(v) ? v + (A(t).unit_of_measurement || "") : "–";
    },
    small: function () {
      return s.current && apHas(s.current) && svOk(s.current) ? _T("ap_now_at") + entVal(s.current) : "";
    },
    /* The state, and while a program runs the time left in front of it. */
    note: function () {
      var st = s.state && apHas(s.state) ? apStateText(s.state) : "",
        left = apActive(ap) === true && s.remaining && apHas(s.remaining) ? apLeft(s.remaining) : "";
      return left && st ? left + " · " + st : left || st;
    },
    mark: function () {
      return s.current && apHas(s.current) && svOk(s.current) ? Number(V_(s.current)) : null;
    },
  });
}

/* A washer, a dryer or a dishwasher (or an oven with no temperature to set): a ring that fills as the cycle goes, the time left in the middle while it runs and the state when it does not. */
function apCycleRing(ap) {
  var s = ap.slots;
  return apDial({
    label: _T("ap_progress"),
    big: function () {
      if (apActive(ap) === true && s.remaining && apHas(s.remaining)) return apLeft(s.remaining);
      if (s.state && apHas(s.state)) return apStateText(s.state);
      if (s.program && apHas(s.program)) return entVal(s.program);
      return "–";
    },
    note: function () {
      return apActive(ap) === true && s.state && apHas(s.state) ? apStateText(s.state) : "";
    },
    ring: function () {
      if (!s.progress || !apHas(s.progress) || !svOk(s.progress)) return null;
      var v = Number(V_(s.progress)),
        u = A(s.progress).unit_of_measurement;
      return isFinite(v) && (u === "%" || !u) ? v / 100 : null;
    },
  });
}

/* Whether the appliance lets a remote start it, as a word. */
function apAllowedText(id) {
  if (!svOk(id)) return _T("ap_not_available");
  return V_(id) === "on" ? _T("ap_allowed") : _T("ap_not_allowed");
}

/* What can be set before it starts, as a grid of tiles: the program, the temperature (unless the dial has it) and the duration. */
function apSettings(b, ap, dialHasTemperature) {
  var s = ap.slots,
    tiles = [];
  if (s.program && apHas(s.program)) tiles.push(settingTile(s.program, _T("ap_program")));
  if (!dialHasTemperature && s.temperature && apHas(s.temperature)) tiles.push(settingTile(s.temperature, _T("ap_temperature")));
  if (s.duration && apHas(s.duration)) {
    var du = s.duration,
      unit = A(du).unit_of_measurement;
    tiles.push(
      dom(du) === "number" || dom(du) === "input_number"
        ? numberTile(du, _T("ap_duration"), {
            /* a tap is five minutes, or the entity's own step when that is larger */
            uiStep: Math.max(Number(A(du).step) || 0, unit === "h" ? 0.25 : unit === "min" ? 5 : 300),
            fmt: function (v) {
              return apDurationText(v, unit);
            },
          })
        : settingTile(du, _T("ap_duration"))
    );
  }
  tiles = tiles.filter(Boolean);
  if (!tiles.length) return;
  var g = mk("div", "ap-grid");
  tiles.forEach(function (t) {
    g.appendChild(t);
  });
  b.appendChild(g);
}

/* Everything else the person added: kept behind one line that says how many there are. What can be set is a grid of tiles, what can only be read is one list. */
function apDetails(b, ap, aid) {
  var ids = ap.extra
    .map(function (x) {
      return x.e;
    })
    .filter(apHas);
  if (!ids.length) return;
  var names = {};
  ap.extra.forEach(function (x) {
    names[x.e] = x.l;
  });
  foldBlock(b, aid, _T("ap_details"), ids.length, function (body) {
    entityGroups(
      body,
      ids,
      function (id) {
        return names[id] || A(id).friendly_name || id;
      },
      function (id) {
        return function () {
          return apStateText(id);
        };
      }
    );
  });
}

/* The action: Start while idle, Stop while a program runs; both when the appliance does not say. The reason Start is off is written under it. */
function apActions(b, ap) {
  var s = ap.slots,
    hasStart = s.start && apHas(s.start),
    hasStop = s.stop && apHas(s.stop);
  if (!hasStart && !hasStop) return;
  var wrap = mk("div", "ap-actw"),
    row = mk("div", "ap-act"),
    start =
      hasStart &&
      rbtn("play", function () {
        if (apStartGate(ap).ok) apAct(s.start, "start");
      }, _T("ap_start")),
    stop =
      hasStop &&
      rbtn("stop", function () {
        apAct(s.stop, "stop");
      }, _T("ap_stop")),
    why = mk("div", "hint");
  if (start) row.appendChild(start);
  if (stop) row.appendChild(stop);
  wrap.appendChild(row);
  wrap.appendChild(why);
  b.appendChild(wrap);
  function paint() {
    var active = apActive(ap),
      gate = apStartGate(ap);
    if (start) {
      start.style.display = active === true && hasStop ? "none" : "";
      start.classList.toggle("na", !gate.ok);
      start.setAttribute("aria-disabled", gate.ok ? "false" : "true");
    }
    if (stop) stop.style.display = active === false && hasStart ? "none" : "";
    var reason = start && start.style.display !== "none" && !gate.ok ? gate.why : "";
    why.textContent = reason;
    why.style.display = reason ? "" : "none";
  }
  paint();
  reg(paint);
}

/* The popup is made for the kind of appliance. An oven: a dial for its temperature, then state, time left and door. A washer, a dryer, a dishwasher: a ring of the cycle, then
   door and remote start. Any other appliance: readings and a progress bar. Then what can be set, and the action. */
function apPage(b, aid) {
  var d = apFind(aid);
  if (!d) return;
  var ap = d.ap,
    s = ap.slots,
    bound = Object.keys(s).filter(function (k) {
      return apHas(s[k]);
    });
  if (!bound.length && !ap.extra.length) {
    var h = mk("div", "hint");
    h.textContent = ISADMIN ? _T("ap_nothing_is_bound_yet_choose_set_up") : _T("ap_nothing_is_bound_yet");
    b.appendChild(h);
  }
  var state = s.state && apHas(s.state),
    left = s.remaining && apHas(s.remaining),
    door = s.door && apHas(s.door),
    perm = s.permission && apHas(s.permission),
    chips = [],
    dial = ap.type === "oven" && s.temperature && apHas(s.temperature) && (dom(s.temperature) === "number" || dom(s.temperature) === "input_number"),
    cycle = ["oven", "washer", "dryer", "dishwasher"].indexOf(ap.type) >= 0;
  if (dial) b.appendChild(apOvenDial(ap));
  else if (cycle && (state || left || s.progress || s.program)) b.appendChild(apCycleRing(ap));
  /* The ring says the state and the time left, the oven's dial says its state; any other appliance has chips for both. */
  if (state && !cycle)
    chips.push([
      _T("ap_state"),
      function () {
        return apStateText(s.state);
      },
    ]);
  if (left && !cycle)
    chips.push([
      _T("ap_remaining"),
      function () {
        return apActive(ap) === false ? "–" : apLeft(s.remaining);
      },
    ]);
  /* With a Start, the permission speaks through the reason Start is off. */
  if (perm && !s.start)
    chips.push([
      _T("ap_remote_start"),
      function () {
        return apAllowedText(s.permission);
      },
    ]);
  if (!s.temperature && s.current && apHas(s.current))
    chips.push([
      _T("ap_current_temperature"),
      function () {
        return entVal(s.current);
      },
    ]);
  apChips(b, chips);
  /* A door that is shut is the usual state and says nothing: its chip is there while the door is open (and always for a sensor that is not a door by its class). */
  if (door) {
    var doorChip = glance(
      [
        [
          _T("ap_door"),
          function () {
            return apStateText(s.door);
          },
        ],
      ],
      1
    );
    b.appendChild(doorChip);
    var paintDoor = function () {
      doorChip.style.display = apIsDoor(s.door) && V_(s.door) === "off" ? "none" : "";
    };
    paintDoor();
    reg(paintDoor);
  }
  if (!dial && !cycle && s.progress && apHas(s.progress)) b.appendChild(apProgressBar(s.progress));
  apActions(b, ap);
  apSettings(b, ap, dial);
  apDetails(b, ap, aid);
  if (ISADMIN) b.appendChild(pill("tune", _T("ap_set_up"), { tap: function () { showPopup("ap-edit:" + aid, true); } }));
}

/* The entities already chosen for an appliance: a new choice is looked for among the entities of the same devices first. */
function apChosen(ap) {
  return Object.keys(ap.slots)
    .map(function (k) {
      return ap.slots[k];
    })
    .concat(
      ap.extra.map(function (x) {
        return x.e;
      })
    );
}

/* What a bound entity is, in the editor: the entity, or that it is gone. */
function apBoundText(e) {
  return apHas(e) ? e : e + " · " + _T("ap_entity_missing");
}

/* The editor: the type, then one row for every slot (the ones the type needs first), then free extra rows. */
function apEditPage(b, aid) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var d = apFind(aid);
    if (!d) return;
    var ap = d.ap;
    box.appendChild(
      seg(
        Object.keys(AP_TYPES).map(function (k) {
          return [k, _T(AP_TYPES[k].l)];
        }),
        ap.type,
        function (v) {
          ap.type = v;
          uiChanged();
          redrawBox(box, draw);
        }
      )
    );
    AP_TYPES[ap.type].slots
      .filter(function (k) {
        return k in AP_SLOTS;
      })
      .forEach(function (k) {
        box.appendChild(
          pill("plug", _T(AP_SLOTS[k].l), {
            sub: function () {
              return ap.slots[k] ? apBoundText(ap.slots[k]) : _T("ap_not_set");
            },
            tap: function () {
              showPopup("ap-slot:" + aid + ":" + k, true);
            },
          })
        );
      });
    /* A slot the type does not list first but that was filled (the type was changed afterwards) stays visible. */
    Object.keys(ap.slots)
      .filter(function (k) {
        return AP_TYPES[ap.type].slots.indexOf(k) < 0;
      })
      .forEach(function (k) {
        box.appendChild(
          pill("plug", _T(AP_SLOTS[k].l), {
            sub: function () {
              return apBoundText(ap.slots[k]);
            },
            tap: function () {
              showPopup("ap-slot:" + aid + ":" + k, true);
            },
          })
        );
      });
    ap.extra.forEach(function (x, i) {
      box.appendChild(
        pill("tune", x.l || A(x.e).friendly_name || x.e, {
          sub: function () {
            return apBoundText(x.e);
          },
          tap: function () {
            showPopup("ap-extra:" + aid + ":" + i, true);
          },
        })
      );
    });
    if (ap.extra.length < 12)
      box.appendChild(
        pill("plus", _T("ap_add_a_row"), {
          sub: function () {
            return _T("ap_add_a_row_sub");
          },
          tap: function () {
            pickEntity(_T("ap_choose_an_entity"), AP_EXTRA_DOMS, null, function (id) {
              ap.extra.push({ e: id, l: "" });
              uiChanged();
              redrawBox(box, draw);
            }, null, apChosen(ap));
          },
        })
      );
  }
  draw();
}

function apSlotPage(b, key) {
  var p = key.split(":"),
    aid = p[0],
    k = p[1],
    d = apFind(aid),
    def = AP_SLOTS[k];
  if (!d || !def) return;
  var s = d.ap.slots;
  b.appendChild(
    pill("plug", s[k] ? A(s[k]).friendly_name || s[k] : _T("ap_not_set"), {
      sub: function () {
        return s[k] ? apBoundText(s[k]) : "";
      },
    })
  );
  b.appendChild(
    pill("search", _T("ap_choose_an_entity"), {
      tap: function () {
        pickEntity(_T(def.l), def.doms, null, function (id) {
          s[k] = id;
          uiChanged();
          popBack();
        }, null, apChosen(d.ap));
      },
    })
  );
  if (s[k])
    b.appendChild(
      pill("trash", _T("ap_clear"), {
        tap: function () {
          delete s[k];
          uiChanged();
          popBack();
        },
      })
    );
}

function apExtraPage(b, key) {
  var p = key.split(":"),
    d = apFind(p[0]),
    x = d && d.ap.extra[+p[1]];
  if (!x) return;
  b.appendChild(
    textRow(
      "edit",
      _T("rm_label"),
      x.l,
      function (v) {
        x.l = v.slice(0, 30);
        uiChanged();
      },
      30
    )
  );
  b.appendChild(
    pill("trash", _T("ap_clear"), {
      tap: function () {
        d.ap.extra.splice(+p[1], 1);
        uiChanged();
        popBack();
      },
    })
  );
}
