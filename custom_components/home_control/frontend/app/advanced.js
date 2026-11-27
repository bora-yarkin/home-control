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
    if (eid === RBM || eid === RBF || eid === RBW || (typeof vacapDriven === "function" && vacapDriven(id).indexOf(eid) >= 0)) return true;
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

/* ---- whether an Advanced settings button is shown (decision D-38) ----
   Every such button, anywhere, asks advButton and advDevOff: one switch for the whole dashboard (Settings, Devices; kept in the dashboard as meta.noadv) and one for a device
   (its settings, `noadv` on it). A new button goes through them too (tests/frontend/advbutton.test.mjs). */
function advAllOff() {
  return !!(UI && UI.meta && UI.meta.noadv);
}

/* Every place the pages hold this entity as a device. */
function advCopies(id) {
  var out = [];
  allSectionLists().forEach(function (secs) {
    (secs || []).forEach(function (s) {
      (s.devs || []).forEach(function (d) {
        if (d.id === id) out.push(d);
      });
    });
  });
  return out;
}

/* A device's own switch: off on any page it is on is off for the device. */
function advDevOff(id) {
  return advCopies(id).some(function (d) {
    return !!d.noadv;
  });
}

/* Whether there is a button to show at all: an administrator, the dashboard's switch on, and something behind it. The device's own switch is the caller's (a device, or an
   appliance, which is a device without an entity of its own). */
function advButton(id) {
  return ISADMIN && !advAllOff() && advList(id).length > 0;
}

/* What the administrator changed about this entity's Advanced settings (decision D-47): items hidden, their order and names, and entities added. */
function advCfg(id) {
  return (UI && UI.adv && UI.adv[id]) || null;
}

/* The items as they are shown: what Home Assistant has plus what was added, less what is hidden, in the order chosen. */
function advList(id) {
  var found = advFound(id),
    c = advCfg(id);
  if (!c || dom(id) === "light") return found;
  var h = H(),
    have = {};
  found.forEach(function (e) {
    have[e.entity_id] = 1;
  });
  (c.add || []).forEach(function (eid) {
    if (!have[eid] && h.states[eid]) found.push(h.entities[eid] || { entity_id: eid });
  });
  var shown = found.filter(function (e) {
    return (c.hide || []).indexOf(e.entity_id) < 0;
  });
  if (c.order) {
    var at = function (e) {
      var i = c.order.indexOf(e.entity_id);
      return i < 0 ? c.order.length : i;
    };
    shown.sort(function (a, b) {
      return at(a) - at(b);
    });
  }
  return shown;
}

/* What Home Assistant has for the device. */
function advFound(id) {
  var dev = advDevice(id);
  /* Light popups have no Advanced menu: the light panel covers them. */
  var master = typeof rmLinks === "function" ? rmLinks(id) : [],
    linked = ((UIDEV[id] && UIDEV[id].links) || []).concat(master);
  if ((!dev && !linked.length) || dom(id) === "light") return [];
  var h = H();
  return Object.values(h.entities)
    .filter(function (e) {
      return (
        ((dev && e.device_id === dev) || linked.indexOf(e.entity_id) >= 0) &&
        e.entity_id !== id &&
        (ADV_DOM.test(e.entity_id) || (linked.indexOf(e.entity_id) >= 0 && /^(sensor|binary_sensor)\./.test(e.entity_id))) &&
        !advLeftOut(id, e.entity_id) &&
        (e.entity_category !== "diagnostic" || linked.indexOf(e.entity_id) >= 0) &&
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

function advRow(eid, name) {
  var dm = dom(eid),
    nm = name || advName(eid),
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
  if (dm === "sensor" || dm === "binary_sensor")
    return pill("info", nm, {
      sub: function () {
        var v = V_(eid);
        return gone() ? _T("unavailable") : dm === "binary_sensor" ? (v === "on" ? _T("on_cap") : _T("off")) : v + (a.unit_of_measurement ? " " + a.unit_of_measurement : "");
      },
    });
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
  /* an entity that was added and is not a setting is drawn as its own kind of row */
  if (!ADV_DOM.test(eid)) {
    var kind = DOMKIND[dm] || "sensor",
      row = devRow({ id: eid, name: nm, icon: defIcon(kind, nm, eid), kind: kind });
    if (row) return row;
  }
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
    cfg = advCfg(id) || {},
    hidden = cfg.hide || [],
    names = cfg.name || {},
    care = dom(id) === "vacuum" && hidden.indexOf("__care") < 0 ? devInfo(id, { battery: true }) : null;
  function label(eid) {
    return names[eid] || advName(eid);
  }
  if (dom(id) === "camera" && hidden.indexOf("__pad") < 0) {
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
      return !q || norm(label(e.entity_id) + " " + e.entity_id).indexOf(q) >= 0;
    });
    /* an order of one's own is one list; otherwise controls, then settings */
    if (cfg.order)
      shown.forEach(function (e) {
        box.appendChild(advRow(e.entity_id, names[e.entity_id]));
      });
    else [
      ["", _T("controls"), "play"],
      ["config", _T("settings"), "cog"],
    ].forEach(function (g) {
      var l = shown.filter(function (e) {
        return (e.entity_category ? "config" : "") === g[0];
      });
      if (!l.length) return;
      box.appendChild(sep(g[1], g[2]));
      l.forEach(function (e) {
        box.appendChild(advRow(e.entity_id, names[e.entity_id]));
      });
    });
    if (!shown.length) box.appendChild(pill("info", _T("nothing_found"), {}));
  }
  redrawBox(box, draw);
}

/* ---- customising it ---- */

function advEdit(id, change) {
  UI.adv = UI.adv || {};
  var c = UI.adv[id] || {};
  change(c);
  UI.adv[id] = c;
  UI.adv = cleanAdv(UI.adv);
  uiChanged();
}

function advToggleHidden(id, item) {
  advEdit(id, function (c) {
    var l = c.hide || [],
      i = l.indexOf(item);
    if (i < 0) l.push(item);
    else l.splice(i, 1);
    c.hide = l;
  });
}

/* Every item that could be there, in the order shown now, the hidden ones last. */
function advAllItems(id) {
  var c = advCfg(id) || {},
    out = advList(id).map(function (e) {
      return e.entity_id;
    });
  advFound(id)
    .map(function (e) {
      return e.entity_id;
    })
    .concat(c.add || [])
    .forEach(function (e) {
      if (out.indexOf(e) < 0 && H().states[e]) out.push(e);
    });
  return out;
}

function advSetPage(b, id) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var c = advCfg(id) || {},
      hidden = c.hide || [],
      items = advAllItems(id),
      list = mk("div"),
      rows = [];
    box.appendChild(hintRow(_T("advset_hint")));
    var extras = [];
    if (dom(id) === "vacuum") extras.push(["__care", _T("advset_care")]);
    if (dom(id) === "camera") extras.push(["__pad", _T("advset_pad")]);
    extras.forEach(function (x) {
      box.appendChild(
        partPill(
          x[1],
          function () {
            return ((advCfg(id) || {}).hide || []).indexOf(x[0]) < 0;
          },
          function () {
            advToggleHidden(id, x[0]);
            redrawBox(box, draw);
          }
        )
      );
    });
    items.forEach(function (eid) {
      var row = pill(hidden.indexOf(eid) >= 0 ? "info" : "tune", (c.name && c.name[eid]) || advName(eid), {
        sub: function () {
          return hidden.indexOf(eid) >= 0 ? _T("hidden") : eid;
        },
        tap: function () {
          showPopup("advitem:" + id + "|" + eid, true);
        },
      });
      rows.push(row);
      list.appendChild(row);
    });
    box.appendChild(list);
    if (rows.length > 1)
      makeSortable(list, rows, function (from, to) {
        items.splice(to, 0, items.splice(from, 1)[0]);
        advEdit(id, function (x) {
          x.order = items;
        });
        setTimeout(function () {
          redrawBox(box, draw);
        }, 250);
      });
    box.appendChild(
      pill("plus", _T("act_add_entity"), {
        tap: function () {
          pickEntity(_T("act_add_entity"), allDomains(), null, function (eid) {
            advEdit(id, function (x) {
              x.add = (x.add || []).concat([eid]);
              x.hide = (x.hide || []).filter(function (h) {
                return h !== eid;
              });
            });
          });
        },
      })
    );
    box.appendChild(sep(_T("more_blocks"), "apps"));
    var at = UIDEV[id] && UIDEV[id].room;
    moreRows(box, "adv:" + id, at && (UI.layout.rooms[at] || at === "home") ? at : "home", _T("advanced"), function () {
      redrawBox(box, draw);
    });
    if (advCfg(id))
      box.appendChild(
        pill("repeat", _T("advset_reset"), {
          tap: function () {
            delete UI.adv[id];
            uiChanged();
            redrawBox(box, draw);
          },
        })
      );
  }
  draw();
}

function advItemPage(b, key) {
  var at = key.indexOf("|"),
    id = key.slice(0, at),
    eid = key.slice(at + 1),
    c = advCfg(id) || {};
  if (at < 0) return;
  b.appendChild(
    visiblePill(
      function () {
        return ((advCfg(id) || {}).hide || []).indexOf(eid) < 0;
      },
      function () {
        advToggleHidden(id, eid);
      }
    )
  );
  b.appendChild(sep(_T("act_name"), "edit"));
  b.appendChild(
    textRow(
      "edit",
      advName(eid),
      (c.name && c.name[eid]) || "",
      function (v) {
        advEdit(id, function (x) {
          x.name = x.name || {};
          if (v.trim()) x.name[eid] = v.trim();
          else delete x.name[eid];
        });
      },
      30
    )
  );
  if ((c.add || []).indexOf(eid) >= 0) {
    var rm = pill("trash", _T("ap_clear"), {
      tap: function () {
        advEdit(id, function (x) {
          x.add = x.add.filter(function (e) {
            return e !== eid;
          });
        });
        popBack();
      },
    });
    stgActions(b, [rm], [rm]);
  }
}
