/* Advanced settings: the other controls Home Assistant has for a device. */

/* ---- Advanced settings ----
 The other controls Home Assistant has for a device (switches, option lists, numbers, buttons, sirens) in a separate
 popup, so the main device popups stay simple. Admins only. Diagnostic entities are left out. */
var ADV_DOM = /^(switch|select|number|button|siren|light|input_boolean)\./,
  ADV_ORDER = ["switch", "input_boolean", "light", "select", "number", "siren", "button"];

function areaIdOf(id) {
  var h = H(),
    e = h.entities && h.entities[id];
  return e
    ? e.area_id || (e.device_id && h.devices[e.device_id] ? h.devices[e.device_id].area_id : null)
    : null;
}

function advDevice(id) {
  var h = H(),
    e = h.entities && h.entities[id];
  if (e && e.device_id) return e.device_id;
  /* Template entities (an AC driven by a separate integration, for example) have no device of their own:
    use the device of the same kind of entity in the same room, if there is exactly one. */
  var ar = areaIdOf(id);
  if (!ar) return null;
  var c = Object.values(h.entities).filter(function (x) {
    return (
      x.entity_id !== id &&
      x.device_id &&
      dom(x.entity_id) === dom(id) &&
      areaIdOf(x.entity_id) === ar
    );
  });
  return c.length === 1 ? c[0].device_id : null;
}

/* What a robot vacuum's own card already does (start, pause, resume, stop, dock and its mode, suction and water selectors) is not repeated in its advanced settings. */
/* Entities that Advanced settings leaves out: those the main popup already controls (the robot's buttons and selects, the camera's arrow pad) and the fans' countdown timer, which is not shown anywhere. */
function advLeftOut(id, eid) {
  var d = dom(eid);
  if (dom(id) === "vacuum") {
    if (eid === RBM || eid === RBF || eid === RBW) return true;
    return (
      d === "button" &&
      /(start|stop|pause|continue|resume|go_?charge|dock|return)/.test(eid) &&
      !/(find|locate|reset)/.test(eid)
    );
  }
  if (dom(id) === "fan") return d === "number" && /_countdown$/.test(eid);
  if (dom(id) === "camera")
    return (
      d === "button" &&
      /_move_(up|down|left|right)$/.test(eid) &&
      ["up", "down", "left", "right"].every(function (x) {
        return !!sibEnds(id, "button", "_move_" + x);
      })
    );
  return false;
}

function advList(id) {
  var dev = advDevice(id);
  /* Light popups have no Advanced menu: the light panel covers them. */
  if (!dev || dom(id) === "light") return [];
  var h = H();
  return Object.values(h.entities)
    .filter(function (e) {
      return (
        e.device_id === dev &&
        e.entity_id !== id &&
        ADV_DOM.test(e.entity_id) &&
        !advLeftOut(id, e.entity_id) &&
        e.entity_category !== "diagnostic" &&
        !e.hidden &&
        !e.disabled_by &&
        h.states[e.entity_id]
      );
    })
    .sort(function (a, b) {
      var ca = a.entity_category ? 1 : 0,
        cb = b.entity_category ? 1 : 0;
      if (ca !== cb) return ca - cb;
      var da = ADV_ORDER.indexOf(dom(a.entity_id)),
        db = ADV_ORDER.indexOf(dom(b.entity_id));
      return da !== db ? da - db : advName(a.entity_id).localeCompare(advName(b.entity_id));
    });
}

function advName(eid) {
  var h = H(),
    e = h.entities[eid],
    dv = e && e.device_id && h.devices[e.device_id],
    n = A(eid).friendly_name || eid,
    dn = dv && (dv.name_by_user || dv.name);
  [dn, dv && dv.name].forEach(function (p) {
    if (p && n.toLowerCase().indexOf(p.toLowerCase()) === 0 && n.length > p.length)
      n = n.slice(p.length).replace(/^[\s·:-]+/, "");
  });
  return cap(n);
}

function advRow(eid) {
  var dm = dom(eid),
    nm = advName(eid),
    a = A(eid),
    gone = function () {
      return V_(eid) === "unavailable";
    };
  if (dm === "select") return selectEnt(eid, nm, "tune");
  if (dm === "number") {
    var lo = typeof a.min === "number" ? a.min : 0,
      hi = typeof a.max === "number" ? a.max : 100,
      st = typeof a.step === "number" && a.step > 0 ? a.step : 1,
      un = a.unit_of_measurement ? " " + a.unit_of_measurement : "";
    return sliderRow({
      icon: "tune",
      name: nm,
      min: lo,
      max: hi,
      step: st,
      get: function () {
        var v = parseFloat(V_(eid));
        return isFinite(v) ? v : lo;
      },
      fmt: function (v) {
        return v + un;
      },
      commit: function (v) {
        call("number", "set_value", { entity_id: eid, value: v });
      },
    });
  }
  if (dm === "button")
    return actionPill(
      "play",
      nm,
      function () {
        call("button", "press", { entity_id: eid });
      },
      _T("press") + " “" + nm + "”?"
    );
  if (dm === "siren")
    return pill("alert", nm, {
      on: function () {
        return isOn(eid);
      },
      sub: function () {
        return gone() ? _T("unavailable") : stAgo(eid);
      },
      tap: function () {
        if (isOn(eid)) call("siren", "turn_off", { entity_id: eid });
        else
          confirmDlg(_T("sound_the_siren_now"), function () {
            call("siren", "turn_on", { entity_id: eid });
          });
      },
    });
  return pill(dm === "light" ? "bright" : "power", nm, {
    on: function () {
      return isOn(eid);
    },
    sub: function () {
      return gone() ? _T("unavailable") : stAgo(eid);
    },
    tap: function () {
      call(dm, "toggle", { entity_id: eid });
    },
  });
}

function advPopup(b, id) {
  var items = advList(id),
    q = "",
    box = mk("div"),
    care = dom(id) === "vacuum" ? devInfo(id, { battery: true }) : null;
  if (dom(id) === "camera") {
    var pad = camPad(id);
    if (pad) b.appendChild(pad);
  }
  if (care) careBlock(b, care);
  if (!items.length) {
    if (!(care && care.care.length))
      b.appendChild(pill("info", _T("no_other_settings_for_this_device"), {}));
    return;
  }
  if (items.length > 12) {
    var w = mk("div", "sqw pane", svg("search")),
      inp = mk("input", "sq");
    inp.type = "text";
    inp.placeholder = _T("search_settings");
    inp.setAttribute("aria-label", _T("search_settings"));
    inp.setAttribute("autocomplete", "off");
    inp.addEventListener("input", function () {
      q = norm(inp.value).trim();
      redrawBox(box, draw);
    });
    w.appendChild(inp);
    b.appendChild(w);
  }
  b.appendChild(box);
  function draw() {
    var shown = items.filter(function (e) {
      return !q || norm(advName(e.entity_id) + " " + e.entity_id).indexOf(q) >= 0;
    });
    [
      ["", _T("controls"), "play"],
      ["config", _T("settings"), "cog"],
    ].forEach(function (g) {
      var l = shown.filter(function (e) {
        return (e.entity_category ? "config" : "") === g[0];
      });
      if (!l.length) return;
      box.appendChild(sep(g[1], g[2]));
      l.forEach(function (e) {
        box.appendChild(advRow(e.entity_id));
      });
    });
    if (!shown.length) box.appendChild(pill("info", _T("nothing_found"), {}));
  }
  redrawBox(box, draw);
}
