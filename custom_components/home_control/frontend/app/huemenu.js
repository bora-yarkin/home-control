/* The Hue Plus menu in Settings, laid out like the settings of the Hue app: a big heading, labelled groups of flat rows (icon, name, value, arrow), tiles for lights,
 checklists for a choice, and a few buttons at the end. Everything shown comes from Hue Plus: its entities and what `hue_plus.get_resources` asks the bridge.
 hueplus.js keeps what the area editor needs (hpShown, hpLoad, hpDo, hpName, the bridge-area import); this file only draws the menu pages. */

/* What the bridge said, by kind of resource. Everything the menu shows is read once, when the menu opens (one loading screen); after that every page draws at once from here.
   The edits of a device are not written here but kept as a draft (hmdraft.js) until that device is saved. */
var HM = {};
var HM_KINDS = ["accessories", "scenes", "rooms", "zones", "entertainment_areas", "motion_areas", "automations", "apps", "bridge"];
var HM_READY = false;
var HM_READING = null;

/* The one read. Every page that needs the data waits for the same answer. */
function hmReady() {
  if (HM_READY) return Promise.resolve();
  if (!HM_READING)
    HM_READING = Integrations.hueplus.resources(HM_KINDS).then(
      function (r) {
        HM_KINDS.forEach(function (k) {
          HM[k] = (r || {})[k];
        });
        HM_READY = true;
        HM_READING = null;
      },
      function (e) {
        HM_READING = null;
        throw e;
      }
    );
  return HM_READING;
}

/* A page that draws from HM by itself (its rows read it when they refresh) only needs the data to be there. */
function hmEnsure() {
  hmReady().then(refresh, function () {});
}

/* The menu is open from the first page drawn until the popup closes (or the user goes back out of the first page). A new one reads the bridge again and starts with no drafts. */
function hmSession() {
  if (SHEETGUARD === hmLeave) return;
  hmEndSession();
  SHEETGUARD = hmLeave;
}

function hmEndSession() {
  HM = {};
  HM_READY = false;
  HM_READING = null;
  hmdClear();
  if (SHEETGUARD === hmLeave) SHEETGUARD = null;
}

/* Asked before the menu is left, by closing the popup or by going back out of the first page. With edits that were not saved it asks whether to save them (every device that has some) or throw them away. */
function hmLeave(proceed) {
  var keys = hmdDirtyKeys();
  if (!keys.length) {
    POPGUARD = null;
    hmEndSession();
    return false;
  }
  var leave = function () {
    POPGUARD = null;
    hmEndSession();
    proceed();
  };
  askSheet(_T("unsaved_changes"), [
    {
      label: _T("save"),
      fn: function () {
        hmSaveAll(keys).then(function (ok) {
          if (ok) leave();
        });
      },
    },
    { label: _T("discard_changes"), fn: leave },
  ]);
  return true;
}

function hmList(kind) {
  var v = HM[kind];
  return Array.isArray(v) ? v : [];
}

function hmMotionAreas() {
  return (HM.motion_areas && HM.motion_areas.areas) || [];
}

/* ---- the pieces ---- */

function hmBox(b) {
  b.classList.add("hm");
  hmSession();
}

/* The big heading under the popup's title bar: an icon, a name and, when given, a second line. `name` may be a function (read again whenever the page refreshes). */
function hmTitle(icon, name, sub) {
  var t = mk("div", "hm-title", "<span class='hm-bigi'>" + svg(icon) + "</span><span class='hm-tt'><b></b><i></i></span>");
  var nm = t.querySelector("b"),
    sb = t.querySelector("i");
  t.refresh = function () {
    nm.textContent = typeof name === "function" ? name() : name;
    var s = typeof sub === "function" ? sub() : sub;
    sb.textContent = s || "";
    sb.style.display = s ? "" : "none";
  };
  reg(t.refresh);
  return t;
}

function hmLabel(text) {
  return mk("div", "hm-label").appendChild(document.createTextNode(text)).parentNode;
}

function hmGroup(rows) {
  var g = mk("div", "hm-group");
  rows.forEach(function (r) {
    if (r) g.appendChild(r);
  });
  return g;
}

/* One row. o: icon, title, sub, val (text or function), tap (a popup key or a function), toggle {get, set}, check (function), danger.
   An arrow shows when a tap opens another page (a popup key); a toggle or a tick shows at the end of the row. */
function hmRow(o) {
  var key = typeof o.tap === "string" ? o.tap : null,
    r = mk("div", "hm-row" + (o.tap || o.toggle ? " tap" : "") + (o.danger ? " danger" : "") + (o.stack ? " stack" : ""));
  r.innerHTML =
    (o.icon ? "<span class='hm-i'>" + svg(o.icon) + "</span>" : "") +
    "<span class='hm-t'><span class='hm-n'></span><span class='hm-s'></span></span><span class='hm-v'></span>" +
    (o.toggle ? "<span class='hm-sw'><i></i></span>" : "") +
    (o.check ? "<span class='hm-ck'>" + svg("check") + "</span>" : "") +
    (key ? "<span class='hm-c'>" + svg("chev") + "</span>" : "");
  var nm = r.querySelector(".hm-n"),
    sb = r.querySelector(".hm-s"),
    vl = r.querySelector(".hm-v");
  if (o.tap || o.toggle) {
    r.setAttribute("role", o.toggle ? "switch" : o.check ? "radio" : "button");
    r.tabIndex = 0;
    var act = function () {
      if (o.toggle) o.toggle.set();
      else if (key) showPopup(key, true);
      else o.tap();
    };
    r.addEventListener("click", act);
    r.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        act();
      }
    });
  }
  r.refresh = function () {
    nm.textContent = typeof o.title === "function" ? o.title() : o.title;
    var s = typeof o.sub === "function" ? o.sub() : o.sub;
    sb.textContent = s || "";
    sb.style.display = s ? "" : "none";
    var v = typeof o.val === "function" ? o.val() : o.val;
    vl.textContent = v === undefined || v === null ? "" : v;
    if (o.toggle) {
      var on = !!o.toggle.get();
      r.classList.toggle("on", on);
      r.setAttribute("aria-checked", on ? "true" : "false");
    }
    if (o.check) {
      var ck = !!o.check();
      r.classList.toggle("checked", ck);
      r.setAttribute("aria-checked", ck ? "true" : "false");
    }
    if (o.good) r.classList.toggle("good", !!o.good());
  };
  reg(r.refresh);
  return r;
}

/* A line of information: what it is above, what it says below. Not pressable. */
function hmInfo(label, value, good) {
  return hmRow({
    title: label,
    sub: value,
    good: good,
    stack: true,
  });
}

/* kind: "primary" (the accent colour), "ghost" or "danger" (red outline). */
function hmButton(text, kind, fn) {
  var b = mk("button", "hm-btn " + (kind || "ghost"));
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", fn);
  return b;
}

function hmActions(buttons) {
  var a = mk("div", "hm-actions");
  buttons.forEach(function (b) {
    if (b) a.appendChild(b);
  });
  return a;
}

/* An information box. */
function hmCallout(text) {
  var n = mk("div", "hm-note", "<span class='hm-ni'>" + svg("info") + "</span><span class='hm-nt'></span>");
  n.querySelector(".hm-nt").textContent = text;
  return n;
}

/* A short list of choices on one line (for a few numbers of minutes). */
function hmChips(options, cur, set, fmt) {
  var box = mk("div", "hm-chips");
  options.forEach(function (o) {
    var c = mk("button", "hm-chip");
    c.type = "button";
    c.textContent = fmt ? fmt(o) : String(o);
    c.addEventListener("click", function () {
      set(o);
      refresh();
    });
    c.refresh = function () {
      c.classList.toggle("on", cur() === o);
    };
    reg(c.refresh);
    box.appendChild(c);
  });
  return box;
}

/* Draws a page from what was read when the menu opened, at once; the first page of a menu waits for that read and says so. `again()` reads the page's kinds once more and draws it again,
   for the pages whose buttons act at once (a routine, an app, an area) and so change what the bridge holds. */
function hmLoad(b, kinds, draw) {
  var box = mk("div");
  b.appendChild(box);
  function failed() {
    box.innerHTML = "";
    box.appendChild(hmCallout(_T("couldn_t_read_the_hue_bridge")));
  }
  function show() {
    box.innerHTML = "";
    draw(box, HM, ask);
    refresh();
  }
  function ask() {
    Integrations.hueplus.resources(kinds).then(function (r) {
      kinds.forEach(function (k) {
        HM[k] = (r || {})[k];
      });
      show();
    }, failed);
  }
  if (HM_READY) show();
  else {
    box.appendChild(hmCallout(_T("loading")));
    hmReady().then(show, failed);
  }
  return box;
}

function hmUpdateText(id) {
  var s = V_(id);
  if (s === "on") return _T("update_available") + (A(id).latest_version ? " · " + A(id).latest_version : "");
  return s === "off" ? _T("up_to_date") : "";
}

function hmBridgeId() {
  var E = hpBridgeEnts(),
    e = E.zigbee_channel && H().entities[E.zigbee_channel],
    uid = (e && e.unique_id) || "";
  return uid.replace(/_zigbee_channel$/, "").toUpperCase();
}

/* ---- the edits of one device: shown from its draft, sent to the bridge when that device is saved ---- */

/* A service call that says whether it went through. callRaw gives nothing back when Home Assistant cannot be reached and rejects when the call fails; it tells the user of both itself. */
function hmCall(domain, service, data) {
  var p = callRaw(domain, service, data);
  return p ? Promise.resolve(p) : Promise.reject(new Error("not sent"));
}

/* The setting of a light as the bridge holds it: its entity says (the power-on behaviour is a select entity of its own). */
function hmLightActual(id, field) {
  if (field === "powerup") {
    var X = Integrations.hueplus.forLight(H(), id);
    return X.powerup ? V_(X.powerup) : "";
  }
  return A(id)["hue_" + field];
}

/* What a light's page shows: the draft's value, else what was just saved, else what the light says. */
function hmLightValue(id, field) {
  return hmdValue(hmdKey("light", id), field, hmLightActual(id, field));
}

function hmAccessory(id) {
  return hmList("accessories").filter(function (x) {
    return x.id === id;
  })[0];
}

function hmMotionArea1(id) {
  return hmMotionAreas().filter(function (x) {
    return x.id === id;
  })[0];
}

/* Puts one record read again from the bridge in place of the one held, and leaves every other device as it was. A failed read is no failure of the save: the held record has been updated by hand. */
function hmReread(kind, id) {
  return Integrations.hueplus.resources([kind]).then(
    function (r) {
      var fresh = (r || {})[kind];
      if (kind === "accessories" && Array.isArray(fresh)) {
        var mine = fresh.filter(function (y) { return y.id === id; })[0];
        if (mine) HM.accessories = hmList("accessories").map(function (x) { return x.id === id ? mine : x; });
      }
      if (kind === "motion_areas" && fresh && Array.isArray(fresh.areas)) {
        var area = fresh.areas.filter(function (y) { return y.id === id; })[0];
        if (area && HM.motion_areas) HM.motion_areas.areas = hmMotionAreas().map(function (x) { return x.id === id ? area : x; });
      }
    },
    function () {}
  );
}

function hmSaveLight(id, ch) {
  var fields = {},
    X = Integrations.hueplus.forLight(H(), id),
    job = Promise.resolve();
  ["function", "gradient_orientation", "gradient_order"].forEach(function (f) {
    if (ch[f] !== undefined) fields[f] = ch[f];
  });
  if (Object.keys(fields).length) job = hmCall("hue_plus", "configure_light", Object.assign({ light: A(id).hue_light_id }, fields));
  if (ch.powerup !== undefined && X.powerup)
    job = job.then(function () {
      return hmCall("select", "select_option", { entity_id: X.powerup, option: ch.powerup });
    });
  return job;
}

/* A switch is saved press by press: each press that was changed is one call to the bridge. */
function hmSaveSwitch(id, ch) {
  var x = hmAccessory(id),
    job = Promise.resolve();
  Object.keys(ch).forEach(function (field) {
    var st = ch[field];
    job = job
      .then(function () {
        return hmCall("hue_plus", "configure_button", Object.assign({ accessory: st.k.acc, button: st.k.n, press: st.k.press }, st.what));
      })
      .then(function () {
        var p = field.split("|"),
          f = HM_PRESSES.filter(function (y) { return y[0] === p[1]; })[0][2];
        if (x) {
          x.actions = x.actions || {};
          (x.actions[p[0]] = x.actions[p[0]] || {})[f] = hmSpecFrom(st.what);
        }
      });
  });
  return job.then(function () {
    return hmReread("accessories", id);
  });
}

function hmSaveMotion(id, ch) {
  return hmCall("hue_plus", "set_motion_area", { area: id, enabled: ch.enabled }).then(function () {
    var x = hmMotionArea1(id);
    if (x) x.enabled = ch.enabled;
    return hmReread("motion_areas", id);
  });
}

/* Sends one device's draft to the bridge. Resolves true when it all went through (the draft is then gone), false when something did not, and the draft stays so it can be saved again. */
function hmSaveDraft(key) {
  var kind = key.split(":")[0],
    id = key.slice(kind.length + 1),
    ch = hmdChanges(key),
    job = kind === "light" ? hmSaveLight(id, ch) : kind === "acc" ? hmSaveSwitch(id, ch) : kind === "marea" ? hmSaveMotion(id, ch) : Promise.resolve();
  return job.then(
    function () {
      hmdSaved(key);
      refresh();
      return true;
    },
    function () {
      return false;
    }
  );
}

/* One device after the other, so a failed one stops the rest. */
function hmSaveAll(keys) {
  return keys.reduce(function (p, key) {
    return p.then(function (ok) {
      return ok ? hmSaveDraft(key) : false;
    });
  }, Promise.resolve(true));
}

/* "Unsaved changes" with Save and Discard, shown only while the device has edits that are not saved. The edits are the device's own: Save sends this device, nothing else. */
function hmSaveBar(key) {
  var bar = mk("div", "hm-save"),
    busy = false;
  var save = hmButton(_T("save"), "primary", function () {
    if (busy) return;
    busy = true;
    save.disabled = true;
    hmSaveDraft(key).then(function (ok) {
      busy = false;
      save.disabled = false;
      if (ok) toast(_T("hm_saved_to_the_bridge"));
      refresh();
    });
  });
  bar.appendChild(hmCallout(_T("hm_unsaved_note")));
  bar.appendChild(
    hmActions([
      save,
      hmButton(_T("discard_changes"), "ghost", function () {
        hmdDiscard(key);
        refresh();
      }),
    ])
  );
  bar.refresh = function () {
    bar.style.display = hmdDirty(key) ? "" : "none";
  };
  reg(bar.refresh);
  return bar;
}

/* ---- the first page ---- */

function hmUpdatesDue() {
  return Integrations.hueplus.updates(H()).filter(function (u) {
    return V_(u) === "on";
  }).length;
}

function hmRoot(b) {
  hmBox(b);
  /* Going back out of the first page leaves the menu. */
  POPGUARD = hmLeave;
  hmLoad(b, HM_KINDS, function (box) {
    hmRootPage(box);
  });
}

function hmRootPage(b) {
  var E = hpBridgeEnts(),
    lights = function () {
      return Integrations.hueplus.lights(H()).length;
    };
  b.appendChild(hmLabel(_T("hm_in_this_home")));
  b.appendChild(
    hmGroup([
      hmRow({
        icon: "lights",
        title: _T("hm_devices"),
        sub: function () {
          return cntS(lights(), _T("hm_light"), _T("hm_lights")) + " · " + cntS(hmList("accessories").length, _T("hm_switch"), _T("hm_switches_n"));
        },
        tap: "hue-devices",
      }),
      hmRow({
        icon: "plug",
        title: _T("hm_bridges"),
        sub: function () {
          return (HM.bridge && HM.bridge.name) || _T("hue_bridge");
        },
        tap: "hue-bridge",
      }),
      hmRow({
        icon: "motion",
        title: _T("hm_motionaware_areas"),
        val: function () {
          return HM.motion_areas ? String(hmMotionAreas().length) : "";
        },
        tap: "hue-motion",
      }),
      hmRow({
        icon: "target",
        title: _T("entertainment_areas"),
        val: function () {
          return HM.entertainment_areas ? String(hmList("entertainment_areas").length) : "";
        },
        tap: "hue-ent",
      }),
      hmRow({
        icon: "clock",
        title: _T("routines_and_automations"),
        val: function () {
          return HM.automations ? String(hmList("automations").length) : "";
        },
        tap: "hue-routines",
      }),
      hmRow({
        icon: "scene",
        title: _T("hm_smart_home"),
        sub: _T("hm_matter_and_linked_apps"),
        tap: "hue-matter",
      }),
      hmRow({
        icon: "restart",
        title: _T("hm_software_update"),
        sub: function () {
          var n = hmUpdatesDue();
          return n ? cntS(n, _T("update_available_2"), _T("updates_available")) : _T("hm_everything_is_up_to_date");
        },
        tap: "hue-updates",
      }),
    ])
  );
  b.appendChild(hmLabel(_T("hm_advanced")));
  b.appendChild(
    hmGroup([
      hmRow({
        icon: "lock",
        title: _T("hm_applications"),
        val: function () {
          return HM.apps ? String(hmList("apps").length) : E.authorized_apps ? V_(E.authorized_apps) : "";
        },
        tap: "hue-apps",
      }),
    ])
  );
}

/* ---- devices: lights and switches ---- */

function hmDevices(b) {
  hmBox(b);
  hmEnsure();
  var E = hpBridgeEnts();
  b.appendChild(
    hmGroup([
      hmRow({
        icon: "lamp",
        title: _T("hm_lights_and_smart_plugs"),
        val: function () {
          return String(Integrations.hueplus.lights(H()).length);
        },
        tap: "hue-lights",
      }),
      hmRow({
        icon: "cog",
        title: _T("hm_switches"),
        val: function () {
          return HM.accessories ? String(hmList("accessories").length) : "";
        },
        tap: "hue-switches",
      }),
    ])
  );
  if (E.search)
    b.appendChild(
      hmActions([
        hmButton(_T("search_for_new_devices"), "primary", function () {
          call("button", "press", { entity_id: E.search });
        }),
      ])
    );
}

function hmLights(b) {
  hmBox(b);
  var list = Integrations.hueplus.lights(H());
  if (!list.length) b.appendChild(hmCallout(_T("nothing_found")));
  var grid = mk("div", "hm-tiles");
  list.forEach(function (id) {
    var t = mk("div", "hm-tile tap", "<span class='hm-ti'>" + svg("lamp") + "</span><b></b><i></i>"),
      gear = mk("button", "hm-gear", svg("tune"));
    gear.type = "button";
    gear.setAttribute("aria-label", _T("light_setup"));
    gear.addEventListener("click", function (e) {
      e.stopPropagation();
      showPopup("hue-light:" + id, true);
    });
    t.querySelector("b").textContent = hpName(id);
    t.appendChild(gear);
    t.addEventListener("click", function () {
      showPopup("light:" + id, true);
    });
    t.refresh = function () {
      t.classList.toggle("on", isOn(id));
      t.querySelector("i").textContent = hmdDirty(hmdKey("light", id))
        ? _T("unsaved_changes")
        : V_(id) === "unavailable"
          ? _T("hm_unreachable")
          : isOn(id)
            ? _T("on_2")
            : _T("off");
    };
    reg(t.refresh);
    grid.appendChild(t);
  });
  b.appendChild(grid);
}

/* ---- the settings of one light ---- */

var HM_FUNCTIONS = ["decorative", "functional", "mixed"];
var HM_POWER = ["safety", "last_on_state", "powerfail"];

function hmLight(b, id) {
  hmBox(b);
  var X = Integrations.hueplus.forLight(H(), id),
    hue = A(id).hue_light_id,
    a = function () {
      return A(id);
    },
    area = H().entities && H().entities[id] && H().entities[id].area_id,
    minutes = 15;
  b.appendChild(hmTitle("lamp", hpName(id), function () {
    return V_(id) === "unavailable" ? _T("hm_unreachable") : hmdDirty(hmdKey("light", id)) ? _T("unsaved_changes") : "";
  }));
  b.appendChild(hmSaveBar(hmdKey("light", id)));
  if (area && H().areas && H().areas[area])
    b.appendChild(hmGroup([hmRow({ icon: "home", title: _T("hm_room"), val: H().areas[area].name })]));
  var general = [];
  if (a().hue_function)
    general.push(
      hmRow({
        title: _T("hm_function"),
        sub: _T("hm_how_you_use_this_light"),
        val: function () {
          return _T("fn_" + hmLightValue(id, "function"));
        },
        tap: "hue-fn:" + id,
      })
    );
  if (X.powerup)
    general.push(
      hmRow({
        title: _T("hm_power_on"),
        sub: _T("hm_light_behavior_at_power_on"),
        val: function () {
          return _T("hm_pw_" + hmLightValue(id, "powerup"));
        },
        tap: "hue-pw:" + id,
      })
    );
  if (a().hue_gradient_orientation && a().hue_gradient_orientation_configurable)
    general.push(
      hmRow({
        title: _T("mounting_direction"),
        val: function () {
          return _T("hm_" + hmLightValue(id, "gradient_orientation"));
        },
        tap: "hue-or:" + id,
      })
    );
  if (a().hue_gradient_order && a().hue_gradient_order_configurable)
    general.push(
      hmRow({
        title: _T("segment_order"),
        val: function () {
          return _T("hm_" + hmLightValue(id, "gradient_order"));
        },
        tap: "hue-od:" + id,
      })
    );
  if (general.length) {
    b.appendChild(hmLabel(_T("hm_general")));
    b.appendChild(hmGroup(general));
  }
  if (a().hue_function || a().hue_gradient_order) b.appendChild(hmCallout(_T("experimental_not_yet_tried_on_a_real_bridge")));
  var info = [];
  if (a().hue_min_brightness !== undefined)
    info.push(
      hmRow({
        title: _T("lowest_brightness"),
        val: function () {
          return Math.round(a().hue_min_brightness * 100) / 100 + "%";
        },
      })
    );
  if (X.update)
    info.push(
      hmRow({
        title: _T("firmware"),
        sub: function () {
          return A(X.update).installed_version || "";
        },
        val: function () {
          return hmUpdateText(X.update);
        },
        tap:
          V_(X.update) === "on"
            ? function () {
                confirmDlg(_T("install_this_update"), function () {
                  call("update", "install", { entity_id: X.update });
                });
              }
            : null,
      })
    );
  if (info.length) {
    b.appendChild(hmLabel(_T("hm_device_info")));
    b.appendChild(hmGroup(info));
  }
  b.appendChild(hmLabel(_T("hm_timed_effects")));
  b.appendChild(hmChips([5, 15, 30, 60], function () { return minutes; }, function (v) { minutes = v; }, function (v) { return v + " " + _T("hm_min"); }));
  b.appendChild(
    hmGroup(
      [
        ["sunrise", "bright"],
        ["sunset", "moon"],
        ["no_effect", "stop"],
      ].map(function (x) {
        return hmRow({
          icon: x[1],
          title: _T("hp_" + x[0]),
          tap: function () {
            call("hue_plus", "timed_effect", { light: hue, effect: x[0], duration: minutes * 60 });
          },
        });
      })
    )
  );
  if (X.identify)
    b.appendChild(
      hmActions([
        hmButton(_T("identify"), "ghost", function () {
          call("button", "press", { entity_id: X.identify });
        }),
      ])
    );
}

/* ---- a choice, shown as a checklist (like the Hue app's "Power on") ---- */

/* kind -> the light setting it picks (a field of the light's draft, see hmLightValue) and how to list and describe the choices. The page key is "<kind>:<light>". */
var HM_PICKS = {
  "hue-fn": {
    field: "function",
    title: "hm_function",
    options: function () {
      return HM_FUNCTIONS;
    },
    name: function (v) {
      return _T("fn_" + v);
    },
    sub: function (v) {
      return _T("hm_fn_" + v);
    },
  },
  "hue-pw": {
    field: "powerup",
    title: "hm_power_on",
    options: function (id) {
      var X = Integrations.hueplus.forLight(H(), id);
      return X.powerup ? (A(X.powerup).options || HM_POWER) : HM_POWER;
    },
    name: function (v) {
      return _T("hm_pw_" + v);
    },
    sub: function (v) {
      return _T("hm_pw_" + v + "_sub");
    },
  },
  "hue-or": {
    field: "gradient_orientation",
    title: "mounting_direction",
    options: function () {
      return ["horizontal", "vertical"];
    },
    name: function (v) {
      return _T("hm_" + v);
    },
  },
  "hue-od": {
    field: "gradient_order",
    title: "segment_order",
    options: function () {
      return ["forward", "reversed"];
    },
    name: function (v) {
      return _T("hm_" + v);
    },
  },
};

function hmPick(kind) {
  return function (b, id) {
    hmBox(b);
    var cfg = HM_PICKS[kind],
      key = hmdKey("light", id);
    b.appendChild(
      hmGroup(
        cfg.options(id).map(function (v) {
          return hmRow({
            title: cfg.name(v),
            sub: cfg.sub ? cfg.sub(v) : "",
            check: function () {
              return hmLightValue(id, cfg.field) === v;
            },
            tap: function () {
              hmdStage(key, cfg.field, v, hmLightActual(id, cfg.field));
              popBack();
            },
          });
        })
      )
    );
  };
}

/* ---- the bridge ---- */

function hmBridge(b) {
  hmBox(b);
  hmEnsure();
  var E = hpBridgeEnts();
  b.appendChild(
    hmTitle("plug", function () {
      return (HM.bridge && HM.bridge.name) || _T("hue_bridge");
    })
  );
  b.appendChild(hmLabel(_T("hm_info")));
  b.appendChild(
    hmGroup([
      hmInfo(
        _T("hm_status"),
        function () {
          return E.firmware && V_(E.firmware) !== "unavailable" ? _T("hm_connected") : _T("hm_unreachable");
        },
        function () {
          return E.firmware && V_(E.firmware) !== "unavailable";
        }
      ),
      hmInfo(_T("hm_id"), hmBridgeId),
      E.bridge_update
        ? hmInfo(_T("hm_software"), function () {
            return A(E.bridge_update).installed_version || "";
          })
        : null,
    ])
  );
  b.appendChild(hmLabel(_T("hm_settings")));
  b.appendChild(
    hmGroup([
      E.zigbee_channel
        ? hmRow({
            title: _T("zigbee_channel"),
            val: function () {
              return V_(E.zigbee_channel);
            },
          })
        : null,
      hmRow({
        title: _T("hm_time_zone"),
        val: function () {
          return (HM.bridge && HM.bridge.time_zone) || "";
        },
      }),
      E.service_internet
        ? hmRow({
            title: _T("internet"),
            val: function () {
              return isOn(E.service_internet) ? _T("on_2") : _T("off");
            },
          })
        : null,
      E.home_and_away
        ? hmRow({
            title: _T("home_and_away"),
            val: function () {
              return V_(E.home_and_away) === "configured" ? _T("set_up") : _T("not_set_up");
            },
          })
        : null,
      hmRow({
        title: _T("matter"),
        val: function () {
          return E.matter_fabrics ? V_(E.matter_fabrics) + " / " + (A(E.matter_fabrics).max_fabrics || "–") : "";
        },
        tap: "hue-matter",
      }),
      hmRow({
        title: _T("hm_applications"),
        val: function () {
          return E.authorized_apps ? V_(E.authorized_apps) : "";
        },
        tap: "hue-apps",
      }),
    ])
  );
  b.appendChild(
    hmActions([
      E.search
        ? hmButton(_T("search_for_new_devices"), "primary", function () {
            call("button", "press", { entity_id: E.search });
          })
        : null,
    ])
  );
}

/* ---- software update ---- */

function hmUpdates(b) {
  hmBox(b);
  var E = hpBridgeEnts(),
    list = Integrations.hueplus.updates(H());
  var status = hmRow({
    title: function () {
      var n = hmUpdatesDue();
      return n ? cntS(n, _T("update_available_2"), _T("updates_available")) : _T("hm_everything_is_up_to_date");
    },
    good: function () {
      return !hmUpdatesDue();
    },
    check: function () {
      return !hmUpdatesDue();
    },
  });
  b.appendChild(hmGroup([status]));
  var auto = [];
  if (E.auto_update)
    auto.push(
      hmRow({
        title: _T("automatic_updates"),
        toggle: {
          get: function () {
            return isOn(E.auto_update);
          },
          set: function () {
            toggleEnt(E.auto_update);
          },
        },
      })
    );
  if (E.auto_update_time)
    auto.push(
      hmRow({
        title: _T("automatic_update_time"),
        val: function () {
          return (V_(E.auto_update_time) || "").slice(0, 5);
        },
      })
    );
  if (auto.length) {
    b.appendChild(hmGroup(auto));
    b.appendChild(hmCallout(_T("hm_updates_are_installed_at_this_time")));
  }
  b.appendChild(hmLabel(_T("hm_devices")));
  if (!list.length) b.appendChild(hmCallout(_T("nothing_found")));
  b.appendChild(
    hmGroup(
      list.map(function (id) {
        return hmRow({
          icon: "restart",
          title: hpName(id).replace(/ firmware$/i, ""),
          sub: function () {
            return A(id).installed_version || "";
          },
          val: function () {
            return V_(id) === "on" ? hmUpdateText(id) : "";
          },
          tap: function () {
            if (V_(id) !== "on") return;
            confirmDlg(_T("install_this_update"), function () {
              call("update", "install", { entity_id: id });
            });
          },
        });
      })
    )
  );
  if (E.check_update)
    b.appendChild(
      hmActions([
        hmButton(_T("check_for_an_update"), "ghost", function () {
          call("button", "press", { entity_id: E.check_update });
        }),
      ])
    );
}

/* ---- smart home (Matter) and applications ---- */

function hmMatter(b) {
  hmBox(b);
  var E = hpBridgeEnts(),
    f = (E.matter_fabrics && A(E.matter_fabrics).fabrics) || [];
  b.appendChild(hmLabel(_T("hm_linked_to_hue")));
  if (!f.length) b.appendChild(hmCallout(_T("nothing_connected")));
  else
    b.appendChild(
      hmGroup(
        f.map(function (x) {
          return hmRow({
            icon: "scene",
            title: x.label || x.vendor || x.id,
            sub: [x.vendor, x.status].filter(Boolean).join(" · "),
            tap: function () {
              confirmDlg(_T("disconnect_this_matter_app_from_the_bridge"), function () {
                call("hue_plus", "remove_matter_fabric", { fabric: x.id, confirm: true });
                closeLayer();
              });
            },
          });
        })
      )
    );
  b.appendChild(hmCallout(_T("hm_matter_pairing_code_note")));
}

function hmApps(b) {
  hmBox(b);
  hmLoad(b, ["apps"], function (box, r, again) {
    var list = r.apps || [];
    if (!list.length) box.appendChild(hmCallout(_T("nothing_found")));
    else
      box.appendChild(
        hmGroup(
          list.map(function (a) {
            return hmRow({
              icon: "lock",
              title: a.name || a.id,
              sub: a.last_used ? _T("hm_last_used") + " " + String(a.last_used).slice(0, 10) : "",
              tap: function () {
                confirmDlg(_T("take_this_app_s_access_away_it_can_no_longer_use_the_bridge"), function () {
                  hpDo(again, "revoke_app", { app: a.id, confirm: true });
                });
              },
            });
          })
        )
      );
    box.appendChild(hmCallout(_T("hm_tap_an_app_to_remove_its_access")));
  });
}

/* ---- routines and automations ---- */

function hmRoutines(b) {
  hmBox(b);
  hmLoad(b, ["automations"], function (box, r) {
    var list = r.automations || [];
    if (!list.length) box.appendChild(hmCallout(_T("nothing_found")));
    else
      box.appendChild(
        hmGroup(
          list.map(function (x) {
            return hmRow({
              icon: "clock",
              title: x.name,
              sub: x.script || "",
              val: x.enabled ? _T("on_2") : _T("off"),
              tap: "hue-routine:" + x.id,
            });
          })
        )
      );
  });
}

function hmRoutine(b, id) {
  hmBox(b);
  hmLoad(b, ["automations"], function (box, r, again) {
    var x = (r.automations || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    box.appendChild(hmTitle("clock", x.name, x.script || ""));
    box.appendChild(
      hmGroup([
        hmRow({
          title: _T("hm_enabled"),
          toggle: {
            get: function () {
              return !!x.enabled;
            },
            set: function () {
              x.enabled = !x.enabled;
              hpDo(again, "update_automation", { automation: x.id, enabled: x.enabled });
            },
          },
        }),
      ])
    );
    if (x.last_error) box.appendChild(hmCallout(x.last_error));
    box.appendChild(
      hmActions([
        hmButton(_T("hm_delete"), "danger", function () {
          confirmDlg(_T("delete_this_routine_from_the_bridge"), function () {
            call("hue_plus", "delete_automation", { automation: x.id, confirm: true });
            closeLayer();
          });
        }),
      ])
    );
  });
}

/* ---- entertainment areas ---- */

var HM_END = ["last_state", "off", "pause", "scene"];

function hmAreas(b) {
  hmBox(b);
  hmLoad(b, ["entertainment_areas"], function (box, r) {
    var list = r.entertainment_areas || [];
    if (!list.length) box.appendChild(hmCallout(_T("nothing_found")));
    else
      box.appendChild(
        hmGroup(
          list.map(function (x) {
            return hmRow({
              icon: "eq",
              title: x.name,
              sub: cntS((x.lights || []).length, _T("hm_light"), _T("hm_lights")),
              tap: "hue-area:" + x.id,
            });
          })
        )
      );
  });
}

function hmArea(b, id) {
  hmBox(b);
  hmLoad(b, ["entertainment_areas", "scenes"], function (box, r, again) {
    var x = (r.entertainment_areas || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    var end = x.end_state || "last_state";
    box.appendChild(hmTitle("eq", x.name));
    box.appendChild(
      hmGroup([
        hmRow({
          title: _T("hm_lights_label"),
          val: String((x.lights || []).length),
        }),
        hmRow({
          title: _T("hm_light_placement"),
          sub: _T("hm_where_the_lights_are_in_the_room"),
          tap: function () {
            hpEditOnBridge(x, again);
          },
        }),
        hmRow({
          title: _T("hm_performance"),
          val: x.performance === "manual" ? _T("hm_manual") : _T("hm_auto"),
          tap: function () {
            HM_AREA = { area: x, scenes: [], again: again };
            showPopup("hue-perf:" + x.id, true);
          },
        }),
        hmRow({
          title: _T("hm_when_sync_stops"),
          val: _T("end_" + end),
          tap: function () {
            HM_AREA = { area: x, scenes: (r.scenes || []).filter(function (s) { return s.group_id; }), again: again };
            showPopup("hue-end:" + x.id, true);
          },
        }),
      ])
    );
    box.appendChild(hmCallout(_T("experimental_only_the_last_state_has_been_seen_on_a_real_bridge")));
    box.appendChild(
      hmActions([
        hmButton(_T("show_red_for_5_seconds"), "ghost", function () {
          call("hue_plus", "stream_colors", { area: x.id, colors: [[255, 0, 0]], duration: 5 });
        }),
        hmButton(_T("stop_streaming"), "ghost", function () {
          call("hue_plus", "stop_streaming", { area: x.id });
        }),
      ])
    );
  });
}

/* What the area page read, for the page that picks what happens when a sync stops (it is opened from there, so the answer is still at hand). */
var HM_AREA = null;

function hmEnd(b, id) {
  hmBox(b);
  if (!HM_AREA || HM_AREA.area.id !== id) {
    b.appendChild(hmCallout(_T("nothing_found")));
    return;
  }
  var x = HM_AREA.area,
    again = HM_AREA.again;
  b.appendChild(
    hmGroup(
      HM_END.map(function (v) {
        return hmRow({
          title: _T("end_" + v),
          sub: _T("hm_end_" + v),
          check: function () {
            return (x.end_state || "last_state") === v;
          },
          tap: function () {
            if (v === "scene") {
              showPopup("hue-escene:" + id, true);
              return;
            }
            x.end_state = v;
            hpDo(again, "set_streaming_end_state", { area: x.id, end_state: v });
            popBack();
          },
        });
      })
    )
  );
}

function hmEndScene(b, id) {
  hmBox(b);
  if (!HM_AREA || HM_AREA.area.id !== id) {
    b.appendChild(hmCallout(_T("nothing_found")));
    return;
  }
  var x = HM_AREA.area,
    again = HM_AREA.again;
  if (!HM_AREA.scenes.length) b.appendChild(hmCallout(_T("nothing_found")));
  b.appendChild(
    hmGroup(
      HM_AREA.scenes.map(function (s) {
        return hmRow({
          icon: "scene",
          title: s.name,
          tap: function () {
            x.end_state = "scene";
            hpDo(again, "set_streaming_end_state", { area: x.id, end_state: "scene", scene: s.id });
            popBack();
            popBack();
          },
        });
      })
    )
  );
}

/* Who streams for an area: the bridge picks (auto), or one light of the area does (manual). */
function hmPerf(b, id) {
  hmBox(b);
  if (!HM_AREA || HM_AREA.area.id !== id) {
    b.appendChild(hmCallout(_T("nothing_found")));
    return;
  }
  var x = HM_AREA.area,
    again = HM_AREA.again,
    set = function (mode, light) {
      x.performance = mode;
      x.performance_light = light || null;
      hpDo(again, "update_entertainment_area", mode === "manual" ? { area: x.id, performance: mode, performance_light: light } : { area: x.id, performance: mode });
      popBack();
    };
  b.appendChild(
    hmGroup(
      [
        hmRow({
          title: _T("hm_auto"),
          sub: _T("hm_the_bridge_picks"),
          check: function () {
            return x.performance !== "manual";
          },
          tap: function () {
            set("auto");
          },
        }),
      ].concat(
        (x.lights || [])
          .filter(function (l) {
            return l.light_id;
          })
          .map(function (l) {
            return hmRow({
              title: l.name || l.light_id,
              sub: _T("hm_this_light_streams"),
              check: function () {
                return x.performance === "manual" && x.performance_light === l.light_id;
              },
              tap: function () {
                set("manual", l.light_id);
              },
            });
          })
      )
    )
  );
  b.appendChild(hmCallout(_T("experimental_not_yet_tried_on_a_real_bridge")));
}

/* ---- MotionAware areas ---- */

function hmMotion(b) {
  hmBox(b);
  hmLoad(b, ["motion_areas"], function (box, r) {
    var list = (r.motion_areas || {}).areas || [];
    if (!list.length) box.appendChild(hmCallout(_T("no_motion_areas")));
    else
      box.appendChild(
        hmGroup(
          list.map(function (x) {
            return hmRow({
              icon: "motion",
              title: (x.metadata || {}).name || x.id,
              sub: function () {
                return hmdDirty(hmdKey("marea", x.id)) ? _T("unsaved_changes") : "";
              },
              val: function () {
                return hmdValue(hmdKey("marea", x.id), "enabled", !!x.enabled) ? _T("on_2") : _T("off");
              },
              tap: "hue-marea:" + x.id,
            });
          })
        )
      );
  });
}

function hmMotionArea(b, id) {
  hmBox(b);
  hmLoad(b, ["motion_areas"], function (box, r) {
    var x = ((r.motion_areas || {}).areas || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    var key = hmdKey("marea", x.id),
      enabled = function () {
        return hmdValue(key, "enabled", !!x.enabled);
      };
    box.appendChild(
      hmTitle("motion", (x.metadata || {}).name || x.id, function () {
        return hmdDirty(key) ? _T("unsaved_changes") : "";
      })
    );
    box.appendChild(hmSaveBar(key));
    box.appendChild(
      hmGroup([
        hmRow({
          title: _T("hm_enabled"),
          toggle: {
            get: enabled,
            set: function () {
              hmdStage(key, "enabled", !enabled(), !!x.enabled);
              refresh();
            },
          },
        }),
      ])
    );
    box.appendChild(
      hmActions([
        hmButton(_T("hm_delete"), "danger", function () {
          confirmDlg(_T("delete_this_motion_area"), function () {
            hmdDiscard(key);
            call("hue_plus", "delete_motion_area", { area: x.id, confirm: true });
            closeLayer();
          });
        }),
      ])
    );
  });
}

/* ---- switches ---- */

function hmSwitches(b) {
  hmBox(b);
  hmLoad(b, ["accessories"], function (box, r) {
    var list = r.accessories || [];
    if (!list.length) box.appendChild(hmCallout(_T("nothing_found")));
    else
      box.appendChild(
        hmGroup(
          list.map(function (x) {
            return hmRow({
              icon: "cog",
              title: x.name,
              sub: function () {
                return (
                  cntS((x.buttons || []).length, _T("hm_button"), _T("hm_buttons")) +
                  (x.dials ? " · " + cntS(x.dials, _T("hm_dial"), _T("hm_dials")) : "") +
                  (hmdDirty(hmdKey("acc", x.id)) ? " · " + _T("unsaved_changes") : "")
                );
              },
              tap: "hue-switch:" + x.id,
            });
          })
        )
      );
  });
}

/* What a press does, from the way the bridge writes it: "brighten", "dim", "off", "nothing", "scene", "cycle" or "time" (a kind this menu shows but cannot write yet). */
function hmPressKind(spec) {
  if (!spec) return "nothing";
  if (spec.recall_single_extended) return "scene";
  if (spec.scene_cycle_extended) return "cycle";
  if (spec.time_based_extended) return "time";
  return { dim_up: "brighten", dim_down: "dim", all_off: "off", home_off: "homeoff" }[spec.action] || "nothing";
}

/* The scene ids a press recalls, in order. */
function hmPressScenes(spec) {
  var cfg = spec && (spec.recall_single_extended || spec.scene_cycle_extended || spec.time_based_extended);
  if (!cfg) return [];
  var slots = spec.scene_cycle_extended ? cfg.slots || [] : spec.time_based_extended ? (cfg.slots || []).map(function (s) { return s.actions || []; }) : [cfg.actions || []];
  return slots
    .map(function (slot) {
      var a = (slot[0] || {}).action || {};
      return a.recall && a.recall.rid;
    })
    .filter(Boolean);
}

function hmPressWithOff(spec) {
  var cfg = spec && (spec.recall_single_extended || spec.scene_cycle_extended || spec.time_based_extended);
  return !!(cfg && cfg.with_off && cfg.with_off.enabled);
}

var HM_PRESSES = [
  ["short", "hm_press", "on_short_release"],
  ["long", "hm_long_press", "on_long_press"],
];

/* The accessory, button and press a button page is about, from the page key "<accessory>|<button number>|<press>|<slot>". */
function hmBtnKey(id) {
  var p = String(id).split("|");
  return { acc: p[0], n: Number(p[1]), press: p[2] || "short", slot: p[3] === undefined ? -1 : Number(p[3]) };
}

/* What a press does: the staged choice if the switch has one (the bridge's way of writing it, see hmSpecFrom), else what the bridge holds. */
function hmPressSpec(acc, btn, press) {
  var staged = hmdStaged(hmdKey("acc", acc.id), btn.id + "|" + press);
  if (staged) return hmSpecFrom(staged.what);
  return ((acc.actions || {})[btn.id] || {})[HM_PRESSES.filter(function (x) { return x[0] === press; })[0][2]];
}

/* The press a page is about is read again whenever it is asked for, so it shows a choice staged since the page was drawn. */
function hmBtnFind(r, k) {
  var acc = (r.accessories || []).filter(function (x) {
      return x.id === k.acc;
    })[0],
    btn = acc && (acc.buttons || []).filter(function (b) {
      return b.number === k.n;
    })[0];
  return { acc: acc, btn: btn, spec: acc && btn ? hmPressSpec(acc, btn, k.press) : null };
}

function hmSceneName(r, id) {
  var s = (r.scenes || []).filter(function (x) {
    return x.id === id;
  })[0];
  return s ? s.name : _T("hm_unknown_scene");
}

/* What the bridge calls the rooms and zones a button acts on, and the scenes that belong to them (a button recalls scenes of its own room). */
function hmBtnTargets(r, acc, btn) {
  var ids = ((acc.targets || {})[btn.id] || []).slice(),
    names = {};
  (r.rooms || []).concat(r.zones || []).forEach(function (g) {
    names[g.id] = g.name;
  });
  return {
    ids: ids,
    name: ids
      .map(function (i) {
        return names[i] || _T("hm_the_whole_home");
      })
      .join(", "),
  };
}

function hmBtnScenes(r, targets) {
  return (r.scenes || []).filter(function (s) {
    return !targets.ids.length || targets.ids.indexOf(s.group_id) >= 0;
  });
}

function hmPressSummary(r, spec) {
  var kind = hmPressKind(spec),
    names = hmPressScenes(spec).map(function (id) {
      return hmSceneName(r, id);
    });
  if (kind === "scene") return _T("hm_single_scene") + (names[0] ? " · " + names[0] : "");
  if (kind === "cycle") return _T("hm_scene_cycle") + " · " + cntS(names.length, _T("hm_scene"), _T("hm_scenes"));
  if (kind === "time") return _T("hm_time_based_light") + " · " + cntS(names.length, _T("hm_time"), _T("hm_times"));
  return _T("hm_kind_" + kind);
}

function hmSwitch(b, id) {
  hmBox(b);
  hmLoad(b, ["accessories", "scenes", "rooms", "zones"], function (box, r) {
    var x = (r.accessories || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    box.appendChild(
      hmTitle("cog", x.name, function () {
        return hmdDirty(hmdKey("acc", x.id)) ? _T("unsaved_changes") : "";
      })
    );
    box.appendChild(hmSaveBar(hmdKey("acc", x.id)));
    box.appendChild(hmLabel(_T("hm_buttons")));
    box.appendChild(
      hmGroup(
        (x.buttons || []).map(function (btn) {
          return hmRow({
            title: _T("hm_button_label") + " " + btn.number,
            sub: function () {
              return hmPressSummary(r, hmPressSpec(x, btn, "short"));
            },
            tap: "hue-button:" + x.id + "|" + btn.number,
          });
        })
      )
    );
  });
}

function hmButtonPage(b, id) {
  hmBox(b);
  hmLoad(b, ["accessories", "scenes", "rooms", "zones"], function (box, r) {
    var k = hmBtnKey(id),
      f = hmBtnFind(r, Object.assign({}, k, { press: "short" }));
    if (!f.acc || !f.btn) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    var t = hmBtnTargets(r, f.acc, f.btn);
    box.appendChild(hmTitle("cog", _T("hm_button_label") + " " + k.n, f.acc.name));
    box.appendChild(hmSaveBar(hmdKey("acc", f.acc.id)));
    box.appendChild(
      hmGroup(
        HM_PRESSES.map(function (p) {
          return hmRow({
            title: _T(p[1]),
            val: function () {
              return hmPressSummary(r, hmPressSpec(f.acc, f.btn, p[0]));
            },
            tap: "hue-press:" + f.acc.id + "|" + k.n + "|" + p[0],
          });
        })
      )
    );
    box.appendChild(hmLabel(_T("hm_behavior")));
    box.appendChild(hmGroup([hmRow({ title: _T("hm_selected_lights"), val: t.name || _T("hm_the_whole_home") })]));
    box.appendChild(hmCallout(_T("hm_experimental_buttons")));
  });
}

/* Stages what a press does, in what configure_button is given. It is sent when the switch is saved (hmSaveSwitch). */
function hmStagePress(k, f, what) {
  hmdStage(hmdKey("acc", k.acc), f.btn.id + "|" + k.press, { k: { acc: k.acc, n: k.n, press: k.press }, what: what });
}

var HM_CHOICES = [
  ["hm_lights_turn_on", [["time", "time_based", "hm_time_based_light"], ["cycle", "scene_cycle", "hm_scene_cycle"], ["scene", "scene", "hm_single_scene"]]],
  ["hm_lights_brighten_or_dim", [["brighten", "dim_up", "hm_brighten"], ["dim", "dim_down", "hm_dim"]]],
  ["hm_lights_turn_off", [["off", "all_off", "hm_lights_off"], ["homeoff", "home_off", "hm_entire_home_off"]]],
  ["hm_nothing_happens", [["nothing", "do_nothing", "hm_do_nothing"]]],
];

function hmPress(b, id) {
  hmBox(b);
  hmLoad(b, ["accessories", "scenes", "rooms", "zones"], function (box, r) {
    var k = hmBtnKey(id),
      f = hmBtnFind(r, k);
    if (!f.acc || !f.btn) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    var kind = hmPressKind(f.spec),
      cur = function () {
        return hmPressSpec(f.acc, f.btn, k.press);
      },
      done = function () {
        popBack();
      };
    HM_CHOICES.forEach(function (group) {
      box.appendChild(hmLabel(_T(group[0])));
      box.appendChild(
        hmGroup(
          group[1].map(function (c) {
            return hmRow({
              title: _T(c[2]),
              sub: _T(c[2] + "_sub"),
              check: function () {
                return kind === c[0];
              },
              tap: function () {
                if (c[0] === "scene") showPopup("hue-scene:" + id, true);
                else if (c[0] === "cycle") showPopup("hue-cycle:" + id, true);
                else if (c[0] === "time") showPopup("hue-time:" + id, true);
                else {
                  hmStagePress(k, f, { action: c[1] });
                  done();
                }
              },
            });
          })
        )
      );
    });
    if (kind === "scene" || kind === "cycle" || kind === "time") {
      box.appendChild(hmLabel(_T("hm_advanced")));
      box.appendChild(
        hmGroup([
          hmRow({
            title: _T("hm_smart_on_off"),
            toggle: {
              get: function () {
                return hmPressWithOff(cur());
              },
              set: function () {
                var spec = cur(),
                  off = !hmPressWithOff(spec),
                  ids = hmPressScenes(spec),
                  seconds = ((spec.scene_cycle_extended || spec.time_based_extended || {}).repeat_timeout || {}).seconds || 3;
                hmStagePress(
                  k,
                  f,
                  kind === "scene"
                    ? { action: "scene", scene: ids[0], with_off: off }
                    : kind === "cycle"
                      ? { action: "scene_cycle", scenes: ids, with_off: off, repeat_timeout: seconds }
                      : { action: "time_based", slots: hmTimeSlots(spec), with_off: off, repeat_timeout: seconds }
                );
                refresh();
              },
            },
          }),
        ])
      );
      box.appendChild(hmCallout(_T("hm_smart_on_off_note")));
    }
  });
}

/* One scene for a press. */
function hmScenePick(b, id) {
  hmBox(b);
  hmLoad(b, ["accessories", "scenes", "rooms", "zones"], function (box, r) {
    var k = hmBtnKey(id),
      f = hmBtnFind(r, k);
    if (!f.acc || !f.btn) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    var scenes = hmBtnScenes(r, hmBtnTargets(r, f.acc, f.btn)),
      current = hmPressScenes(f.spec)[0];
    if (!scenes.length) box.appendChild(hmCallout(_T("nothing_found")));
    box.appendChild(
      hmGroup(
        scenes.map(function (s) {
          return hmRow({
            icon: "scene",
            title: s.name,
            check: function () {
              return current === s.id;
            },
            tap: function () {
              hmStagePress(k, f, { action: "scene", scene: s.id, with_off: hmPressWithOff(f.spec) });
              popBack();
              popBack();
            },
          });
        })
      )
    );
  });
}

/* A cycle of scenes: the order is the order of the presses. The draft is kept here and written when it is saved, since a cycle needs at least two scenes. */
var HM_CYCLE = null;

function hmCycle(b, id) {
  hmBox(b);
  hmLoad(b, ["accessories", "scenes", "rooms", "zones"], function (box, r) {
    var k = hmBtnKey(id),
      f = hmBtnFind(r, k);
    if (!f.acc || !f.btn) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    var scenes = hmBtnScenes(r, hmBtnTargets(r, f.acc, f.btn));
    if (!HM_CYCLE || HM_CYCLE.id !== id) {
      var cfg = (f.spec && f.spec.scene_cycle_extended) || {};
      HM_CYCLE = {
        id: id,
        scenes: hmPressScenes(f.spec).slice(),
        with_off: hmPressWithOff(f.spec),
        timeout: (cfg.repeat_timeout && cfg.repeat_timeout.seconds) || 3,
        names: r,
        pool: scenes,
      };
    }
    HM_CYCLE.names = r;
    HM_CYCLE.pool = scenes;
    var d = HM_CYCLE,
      ords = ["hm_first", "hm_second", "hm_third", "hm_fourth", "hm_fifth", "hm_sixth", "hm_seventh", "hm_eighth", "hm_ninth", "hm_tenth"];
    box.appendChild(hmLabel(_T("hm_behavior")));
    box.appendChild(
      hmGroup(
        d.scenes.map(function (sid, i) {
          return hmRow({
            icon: "scene",
            title: _T(ords[i]) + " " + _T("hm_press_word"),
            val: hmSceneName(r, sid),
            tap: "hue-cslot:" + id + "|" + i,
          });
        })
      )
    );
    if (d.scenes.length < 10)
      box.appendChild(
        hmGroup([
          hmRow({
            icon: "plus",
            title: _T("hm_add_a_scene"),
            tap: "hue-cslot:" + id + "|" + d.scenes.length,
          }),
        ])
      );
    box.appendChild(hmLabel(_T("hm_advanced")));
    box.appendChild(
      hmGroup([
        hmRow({
          title: _T("hm_smart_on_off"),
          toggle: {
            get: function () {
              return d.with_off;
            },
            set: function () {
              d.with_off = !d.with_off;
              refresh();
            },
          },
        }),
      ])
    );
    box.appendChild(
      hmChips([2, 3, 5, 10], function () { return d.timeout; }, function (v) { d.timeout = v; }, function (v) { return v + " " + _T("hm_sec"); })
    );
    box.appendChild(hmCallout(_T("hm_cycle_timeout_note")));
    box.appendChild(
      hmActions([
        hmButton(_T("hm_done"), "primary", function () {
          if (d.scenes.length < 2) {
            toast(_T("hm_a_cycle_needs_two_scenes"));
            return;
          }
          hmStagePress(k, f, { action: "scene_cycle", scenes: d.scenes.slice(), with_off: d.with_off, repeat_timeout: d.timeout });
          HM_CYCLE = null;
          popBack();
          popBack();
        }),
      ])
    );
  });
}

/* One place of a cycle: which scene it is, and moving or removing it. A new place (one past the end) only asks for the scene. */
function hmCycleSlot(b, id) {
  hmBox(b);
  var parts = String(id).split("|"),
    slot = Number(parts.pop()),
    key = parts.join("|"),
    d = HM_CYCLE;
  if (!d || d.id !== key) {
    b.appendChild(hmCallout(_T("nothing_found")));
    return;
  }
  var isNew = slot >= d.scenes.length,
    back = function () {
      popBack();
    };
  b.appendChild(
    hmGroup(
      d.pool.map(function (s) {
        return hmRow({
          icon: "scene",
          title: s.name,
          check: function () {
            return d.scenes[slot] === s.id;
          },
          tap: function () {
            d.scenes[slot] = s.id;
            back();
          },
        });
      })
    )
  );
  if (!isNew) {
    var moves = [];
    if (slot > 0)
      moves.push(
        hmRow({
          icon: "up",
          title: _T("hm_move_earlier"),
          tap: function () {
            d.scenes.splice(slot - 1, 0, d.scenes.splice(slot, 1)[0]);
            back();
          },
        })
      );
    if (slot < d.scenes.length - 1)
      moves.push(
        hmRow({
          icon: "down",
          title: _T("hm_move_later"),
          tap: function () {
            d.scenes.splice(slot + 1, 0, d.scenes.splice(slot, 1)[0]);
            back();
          },
        })
      );
    moves.push(
      hmRow({
        icon: "trash",
        title: _T("hm_remove_from_the_cycle"),
        danger: true,
        tap: function () {
          d.scenes.splice(slot, 1);
          back();
        },
      })
    );
    b.appendChild(hmLabel(_T("hm_order")));
    b.appendChild(hmGroup(moves));
  }
}

/* The times of a time-based light as {time: "07:00", scene} items, in the order of the day. */
function hmTimeSlots(spec) {
  return (((spec || {}).time_based_extended || {}).slots || []).map(function (s) {
    var a = ((s.actions || [])[0] || {}).action || {};
    return {
      time: String((s.start_time || {}).hour).padStart(2, "0") + ":" + String((s.start_time || {}).minute).padStart(2, "0"),
      scene: a.recall && a.recall.rid,
    };
  });
}

/* The schedule the Hue app starts with: these scenes of the button's room, by name. */
var HM_DEFAULT_TIMES = [["07:00", "Energize"], ["10:00", "Concentrate"], ["17:00", "Read"], ["20:00", "Relax"], ["23:00", "Nightlight"]];

function hmDefaultTimes(pool) {
  var out = [];
  HM_DEFAULT_TIMES.forEach(function (d) {
    var s = pool.filter(function (x) {
      return String(x.name).toLowerCase() === d[1].toLowerCase();
    })[0];
    if (s) out.push({ time: d[0], scene: s.id });
  });
  return out.length === HM_DEFAULT_TIMES.length ? out : [];
}

var HM_TIME = null;

function hmTimeSort(d) {
  d.slots.sort(function (a, b) {
    return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
  });
}

function hmTimePage(b, id) {
  hmBox(b);
  hmLoad(b, ["accessories", "scenes", "rooms", "zones"], function (box, r) {
    var k = hmBtnKey(id),
      f = hmBtnFind(r, k);
    if (!f.acc || !f.btn) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    var pool = hmBtnScenes(r, hmBtnTargets(r, f.acc, f.btn));
    if (!HM_TIME || HM_TIME.id !== id) {
      var cfg = (f.spec && f.spec.time_based_extended) || {},
        own = hmTimeSlots(f.spec);
      HM_TIME = {
        id: id,
        slots: own.length ? own : hmDefaultTimes(pool),
        with_off: hmPressWithOff(f.spec),
        timeout: (cfg.repeat_timeout && cfg.repeat_timeout.seconds) || 3,
      };
    }
    HM_TIME.names = r;
    HM_TIME.pool = pool;
    var d = HM_TIME;
    box.appendChild(hmLabel(_T("hm_behavior")));
    box.appendChild(
      hmGroup(
        d.slots.map(function (s, i) {
          return hmRow({ icon: "clock", title: s.time, val: hmSceneName(r, s.scene), tap: "hue-tslot:" + id + "|" + i });
        })
      )
    );
    if (d.slots.length < 10)
      box.appendChild(hmGroup([hmRow({ icon: "plus", title: _T("hm_add_a_time"), tap: "hue-tslot:" + id + "|" + d.slots.length })]));
    var def = hmDefaultTimes(pool);
    if (def.length)
      box.appendChild(
        hmGroup([
          hmRow({
            icon: "restart",
            title: _T("hm_use_the_default_schedule"),
            sub: _T("hm_the_hue_apps_own_times"),
            tap: function () {
              d.slots = def.slice();
              refresh();
              showPopup("hue-time:" + id, false);
            },
          }),
        ])
      );
    box.appendChild(hmLabel(_T("hm_advanced")));
    box.appendChild(
      hmGroup([
        hmRow({
          title: _T("hm_smart_on_off"),
          toggle: {
            get: function () {
              return d.with_off;
            },
            set: function () {
              d.with_off = !d.with_off;
              refresh();
            },
          },
        }),
      ])
    );
    box.appendChild(hmChips([2, 3, 5, 10], function () { return d.timeout; }, function (v) { d.timeout = v; }, function (v) { return v + " " + _T("hm_sec"); }));
    box.appendChild(hmCallout(_T("hm_time_based_note")));
    box.appendChild(
      hmActions([
        hmButton(_T("hm_done"), "primary", function () {
          if (d.slots.length < 2) {
            toast(_T("hm_a_time_based_light_needs_two_times"));
            return;
          }
          var seen = {};
          for (var i = 0; i < d.slots.length; i++) {
            if (seen[d.slots[i].time]) {
              toast(_T("hm_two_times_cannot_be_the_same"));
              return;
            }
            seen[d.slots[i].time] = 1;
          }
          hmStagePress(k, f, {
            action: "time_based",
            slots: d.slots.map(function (s) {
              return { time: s.time, scene: s.scene };
            }),
            with_off: d.with_off,
            repeat_timeout: d.timeout,
          });
          HM_TIME = null;
          popBack();
          popBack();
        }),
      ])
    );
  });
}

/* One time of a time-based light: the time (a time input) and the scene, and removing it. */
function hmTimeSlot(b, id) {
  hmBox(b);
  var parts = String(id).split("|"),
    slot = Number(parts.pop()),
    key = parts.join("|"),
    d = HM_TIME;
  if (!d || d.id !== key) {
    b.appendChild(hmCallout(_T("nothing_found")));
    return;
  }
  var isNew = slot >= d.slots.length,
    cur = isNew ? { time: "12:00", scene: (d.pool[0] || {}).id } : d.slots[slot];
  var inp = mk("input", "hm-time");
  inp.type = "time";
  inp.value = cur.time;
  inp.setAttribute("aria-label", _T("hm_time"));
  b.appendChild(hmLabel(_T("hm_time")));
  b.appendChild(hmGroup([(function () { var w = mk("div", "hm-row"); w.appendChild(inp); return w; })()]));
  b.appendChild(hmLabel(_T("hm_scene")));
  b.appendChild(
    hmGroup(
      d.pool.map(function (s) {
        return hmRow({
          icon: "scene",
          title: s.name,
          check: function () {
            return cur.scene === s.id;
          },
          tap: function () {
            cur.scene = s.id;
            refresh();
          },
        });
      })
    )
  );
  var actions = [
    hmButton(_T("hm_done"), "primary", function () {
      if (!/^\d\d:\d\d$/.test(inp.value)) {
        toast(_T("hm_pick_a_time"));
        return;
      }
      if (!cur.scene) {
        toast(_T("hm_pick_a_scene"));
        return;
      }
      cur.time = inp.value;
      if (isNew) d.slots.push(cur);
      hmTimeSort(d);
      popBack();
    }),
  ];
  if (!isNew)
    actions.push(
      hmButton(_T("hm_remove_this_time"), "danger", function () {
        d.slots.splice(slot, 1);
        popBack();
      })
    );
  b.appendChild(hmActions(actions));
}

/* ---- the pages ---- */

HP_PAGES["stg-hue"] = ["hue_plus", HP_ICON, hmRoot];
HP_PAGES["hue-devices"] = ["hm_devices", "lights", hmDevices];
HP_PAGES["hue-lights"] = ["hm_lights_and_smart_plugs", "lamp", hmLights];
HP_PAGES["hue-light"] = ["light_setup", "lamp", hmLight];
HP_PAGES["hue-fn"] = ["hm_function", "lamp", hmPick("hue-fn")];
HP_PAGES["hue-pw"] = ["hm_power_on", "power", hmPick("hue-pw")];
HP_PAGES["hue-or"] = ["mounting_direction", "axis", hmPick("hue-or")];
HP_PAGES["hue-od"] = ["segment_order", "swap", hmPick("hue-od")];
HP_PAGES["hue-switches"] = ["hm_switches", "cog", hmSwitches];
HP_PAGES["hue-switch"] = ["hm_switch_one", "cog", hmSwitch];
HP_PAGES["hue-button"] = ["hm_button_label", "cog", hmButtonPage];
HP_PAGES["hue-press"] = ["hm_press", "cog", hmPress];
HP_PAGES["hue-scene"] = ["hm_single_scene", "scene", hmScenePick];
HP_PAGES["hue-cycle"] = ["hm_scene_cycle", "scene", hmCycle];
HP_PAGES["hue-time"] = ["hm_time_based_light", "clock", hmTimePage];
HP_PAGES["hue-tslot"] = ["hm_time", "clock", hmTimeSlot];
HP_PAGES["hue-cslot"] = ["hm_scene", "scene", hmCycleSlot];
HP_PAGES["hue-bridge"] = ["hm_bridges", "plug", hmBridge];
HP_PAGES["hue-updates"] = ["hm_software_update", "restart", hmUpdates];
HP_PAGES["hue-matter"] = ["hm_smart_home", "scene", hmMatter];
HP_PAGES["hue-apps"] = ["hm_applications", "lock", hmApps];
HP_PAGES["hue-routines"] = ["routines_and_automations", "clock", hmRoutines];
HP_PAGES["hue-routine"] = ["routine", "clock", hmRoutine];
HP_PAGES["hue-ent"] = ["entertainment_areas", "target", hmAreas];
HP_PAGES["hue-area"] = ["entertainment_area", "target", hmArea];
HP_PAGES["hue-end"] = ["hm_when_sync_stops", "target", hmEnd];
HP_PAGES["hue-perf"] = ["hm_performance", "target", hmPerf];
HP_PAGES["hue-escene"] = ["hp_scene", "scene", hmEndScene];
HP_PAGES["hue-motion"] = ["hm_motionaware_areas", "motion", hmMotion];
HP_PAGES["hue-marea"] = ["motion_area", "motion", hmMotionArea];
