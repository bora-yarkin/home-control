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
  remaining: { l: "ap_remaining", doms: ["sensor", "input_datetime"], read: true },
  door: { l: "ap_door", doms: ["binary_sensor", "sensor"], read: true },
  permission: { l: "ap_remote_start_allowed", doms: ["binary_sensor", "switch", "input_boolean"], read: true },
};

/* A type only chooses which slots the editor offers first and the icon: every slot can still be used on any type. */
var AP_TYPES = {
  oven: { l: "ap_oven", icon: "plug", slots: ["program", "temperature", "duration", "start", "stop", "state", "progress", "remaining", "door", "permission"] },
  washer: { l: "ap_washer", icon: "drop", slots: ["program", "start", "stop", "state", "progress", "remaining", "door", "permission", "temperature", "duration"] },
  dryer: { l: "ap_dryer", icon: "drop", slots: ["program", "start", "stop", "state", "progress", "remaining", "door", "permission", "temperature", "duration"] },
  dishwasher: { l: "ap_dishwasher", icon: "drop", slots: ["program", "start", "stop", "state", "progress", "remaining", "door", "permission", "temperature", "duration"] },
  other: { l: "ap_appliance", icon: "plug", slots: ["state", "program", "start", "stop", "progress", "remaining", "door", "permission", "temperature", "duration"] },
};
var AP_EXTRA_DOMS = ["select", "input_select", "number", "input_number", "switch", "input_boolean", "binary_sensor", "sensor", "button", "input_button", "script"];
var AP = { more: {} };

function apNew(type) {
  var t = AP_TYPES[type] || AP_TYPES.other;
  return { id: "", aid: "ap" + Date.now().toString(36).slice(-7), name: _T(t.l), icon: t.icon, kind: "appliance", ap: { type: type in AP_TYPES ? type : "other", slots: {}, extra: [] } };
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

/* What a timestamp or a number of seconds left means to read: "1 h 12 min", "8 min", "now". */
function apLeft(id) {
  var s = V_(id),
    a = A(id);
  if (!svOk(id)) return "–";
  var secs = null;
  if (a.device_class === "timestamp") {
    var t = Date.parse(s);
    if (isFinite(t)) secs = Math.round((t - Date.now()) / 1000);
  } else if (a.device_class === "duration" && isFinite(Number(s))) {
    var u = a.unit_of_measurement;
    secs = Number(s) * (u === "h" ? 3600 : u === "min" ? 60 : u === "d" ? 86400 : u === "ms" ? 0.001 : 1);
  }
  if (secs === null) return entVal(id);
  if (secs <= 0) return _T("ap_now");
  var h = Math.floor(secs / 3600),
    m = Math.round((secs % 3600) / 60);
  return (h ? h + " h " : "") + (m || !h ? m + " min" : "").trim();
}

/* Start can be pressed only when its entity can be reached and, if a "remote start allowed" entity is bound, that one says on. The reason is shown instead of a button that would do nothing. */
function apStartGate(ap) {
  var s = ap.slots;
  if (!s.start || !apHas(s.start)) return { ok: false, why: "" };
  if (!svOk(s.start)) return { ok: false, why: _T("ap_start_is_not_available_now") };
  if (s.permission && apHas(s.permission)) {
    var p = V_(s.permission);
    if (p === "off") return { ok: false, why: _T("ap_remote_start_is_off_on_the_appliance") };
    if (!svOk(s.permission)) return { ok: false, why: _T("ap_remote_start_cannot_be_read") };
  }
  return { ok: true, why: "" };
}

/* A bound entity as the row the dashboard already has for its kind. */
function apRowOf(id, label, icon) {
  var kind = DOMKIND[dom(id)] || "sensor";
  if (dom(id) === "input_datetime") return datetimeRow({ id: id, name: label, icon: icon });
  if (dom(id) === "script") kind = "button";
  var r = devRowRaw({ id: id, name: label, icon: icon, kind: kind });
  return r || pill(icon || "info", label, { val: function () { return entVal(id); } });
}

function apRow(d) {
  var ap = d.ap;
  return pill(d.icon || "plug", d.name, {
    val: function () {
      var s = ap.slots;
      if (s.remaining && apHas(s.remaining) && svOk(s.remaining) && s.state && /run|active|cycle|work|on/i.test(String(V_(s.state)))) return apLeft(s.remaining);
      if (s.state && apHas(s.state)) return entVal(s.state);
      if (s.program && apHas(s.program)) return entVal(s.program);
      return "";
    },
    tap: function () {
      showPopup("appliance:" + d.aid, true);
    },
  });
}

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
  /* What it is doing: the state, how far, how long, the door. Rows only for what is bound. */
  ["state", "door"].forEach(function (k) {
    if (s[k] && apHas(s[k])) b.appendChild(apRowOf(s[k], _T(AP_SLOTS[k].l), k === "door" ? "lock" : "info"));
  });
  if (s.progress && apHas(s.progress))
    b.appendChild(
      sliderRow({
        icon: "clock",
        name: _T("ap_progress"),
        min: 0,
        max: 100,
        step: 1,
        readonly: true,
        get: function () {
          var v = Number(V_(s.progress));
          return svOk(s.progress) && isFinite(v) ? v : null;
        },
        fmt: function (v) {
          return Math.round(v) + "%";
        },
        off: "–",
      })
    );
  if (s.remaining && apHas(s.remaining))
    b.appendChild(
      pill("clock", _T("ap_remaining"), {
        val: function () {
          return apLeft(s.remaining);
        },
      })
    );
  /* What can be set before it starts. */
  ["program", "temperature", "duration"].forEach(function (k) {
    if (s[k] && apHas(s[k])) b.appendChild(apRowOf(s[k], _T(AP_SLOTS[k].l), k === "program" ? "tune" : k === "temperature" ? "thermo" : "clock"));
  });
  ap.extra.forEach(function (x) {
    if (apHas(x.e)) b.appendChild(apRowOf(x.e, x.l || A(x.e).friendly_name || x.e, "tune"));
  });
  var gate = apStartGate(ap);
  if (s.start && apHas(s.start)) {
    if (gate.ok) b.appendChild(apRowOf(s.start, _T("ap_start"), "play"));
    else {
      var off = pill("play", _T("ap_start"), {
        sub: function () {
          return gate.why;
        },
      });
      off.classList.add("static", "na");
      b.appendChild(off);
    }
  }
  if (s.stop && apHas(s.stop)) b.appendChild(apRowOf(s.stop, _T("ap_stop"), "stop"));
  if (s.permission && apHas(s.permission) && !s.start) b.appendChild(apRowOf(s.permission, _T("ap_remote_start_allowed"), "lock"));
  if (ISADMIN) b.appendChild(pill("tune", _T("ap_set_up"), { tap: function () { showPopup("ap-edit:" + aid, true); } }));
}

/* The editor: the type, then one row for each slot (the ones the type offers first, the rest under "More"), then free extra rows. */
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
    var order = AP_TYPES[ap.type].slots,
      shown = AP.more[aid] ? Object.keys(AP_SLOTS) : order.filter(function (k) { return k in AP_SLOTS; }).slice(0, 7);
    shown.forEach(function (k) {
      box.appendChild(
        pill("plug", _T(AP_SLOTS[k].l), {
          sub: function () {
            return ap.slots[k] || _T("ap_not_set");
          },
          tap: function () {
            showPopup("ap-slot:" + aid + ":" + k, true);
          },
        })
      );
    });
    if (!AP.more[aid])
      box.appendChild(
        pill("plus", _T("ap_more_slots"), {
          tap: function () {
            AP.more[aid] = true;
            redrawBox(box, draw);
          },
        })
      );
    ap.extra.forEach(function (x, i) {
      box.appendChild(
        pill("tune", x.l || A(x.e).friendly_name || x.e, {
          sub: function () {
            return x.e;
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
            });
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
        return s[k] || "";
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
        });
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
