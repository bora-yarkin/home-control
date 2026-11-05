/* The Hue Plus menu in Settings, laid out like the settings of the Hue app: a big heading, labelled groups of flat rows (icon, name, value, arrow), tiles for lights,
 checklists for a choice, and a few buttons at the end. Everything shown comes from Hue Plus: its entities and what `hue_plus.get_resources` asks the bridge.
 hueplus.js keeps what the area editor needs (hpShown, hpLoad, hpDo, hpName, the bridge-area import); this file only draws the menu pages. */

/* What the bridge said, by kind of resource, for the rows that show a count or a name. Filled when the first page opens and read again after a change. */
var HM = {};

function hmFetch(kinds) {
  return Integrations.hueplus.resources(kinds).then(
    function (r) {
      kinds.forEach(function (k) {
        HM[k] = (r || {})[k];
      });
      refresh();
    },
    function () {}
  );
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

/* Reads what the bridge holds for a page, draws it, and draws it again after a change (the same as hpLoad, but also keeps what it read in HM). */
function hmLoad(b, kinds, draw) {
  var box = mk("div");
  b.appendChild(box);
  function ask() {
    Integrations.hueplus.resources(kinds).then(
      function (r) {
        kinds.forEach(function (k) {
          HM[k] = (r || {})[k];
        });
        box.innerHTML = "";
        draw(box, r || {}, ask);
        refresh();
      },
      function () {
        box.innerHTML = "";
        box.appendChild(hmCallout(_T("couldn_t_read_the_hue_bridge")));
      }
    );
  }
  box.appendChild(hmCallout(_T("loading")));
  ask();
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

/* ---- the first page ---- */

function hmUpdatesDue() {
  return Integrations.hueplus.updates(H()).filter(function (u) {
    return V_(u) === "on";
  }).length;
}

function hmRoot(b) {
  hmBox(b);
  hmFetch(["accessories", "entertainment_areas", "motion_areas", "automations", "apps", "bridge"]);
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
  hmFetch(["accessories"]);
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
      t.querySelector("i").textContent = V_(id) === "unavailable" ? _T("hm_unreachable") : isOn(id) ? _T("on_2") : _T("off");
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
    return V_(id) === "unavailable" ? _T("hm_unreachable") : "";
  }));
  if (area && H().areas && H().areas[area])
    b.appendChild(hmGroup([hmRow({ icon: "home", title: _T("hm_room"), val: H().areas[area].name })]));
  var general = [];
  if (a().hue_function)
    general.push(
      hmRow({
        title: _T("hm_function"),
        sub: _T("hm_how_you_use_this_light"),
        val: function () {
          return _T("fn_" + a().hue_function);
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
          return _T("hm_pw_" + V_(X.powerup));
        },
        tap: "hue-pw:" + id,
      })
    );
  if (a().hue_gradient_orientation && a().hue_gradient_orientation_configurable)
    general.push(
      hmRow({
        title: _T("mounting_direction"),
        val: function () {
          return _T("hm_" + a().hue_gradient_orientation);
        },
        tap: "hue-or:" + id,
      })
    );
  if (a().hue_gradient_order && a().hue_gradient_order_configurable)
    general.push(
      hmRow({
        title: _T("segment_order"),
        val: function () {
          return _T("hm_" + a().hue_gradient_order);
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

/* kind -> how to read, write and describe the choice. The page key is "<kind>:<light or area>". */
var HM_PICKS = {
  "hue-fn": {
    title: "hm_function",
    options: function () {
      return HM_FUNCTIONS;
    },
    cur: function (id) {
      return A(id).hue_function;
    },
    set: function (id, v) {
      call("hue_plus", "configure_light", { light: A(id).hue_light_id, function: v });
    },
    name: function (v) {
      return _T("fn_" + v);
    },
    sub: function (v) {
      return _T("hm_fn_" + v);
    },
  },
  "hue-pw": {
    title: "hm_power_on",
    options: function (id) {
      var X = Integrations.hueplus.forLight(H(), id);
      return X.powerup ? (A(X.powerup).options || HM_POWER) : HM_POWER;
    },
    cur: function (id) {
      var X = Integrations.hueplus.forLight(H(), id);
      return X.powerup ? V_(X.powerup) : "";
    },
    set: function (id, v) {
      call("select", "select_option", { entity_id: Integrations.hueplus.forLight(H(), id).powerup, option: v });
    },
    name: function (v) {
      return _T("hm_pw_" + v);
    },
    sub: function (v) {
      return _T("hm_pw_" + v + "_sub");
    },
  },
  "hue-or": {
    title: "mounting_direction",
    options: function () {
      return ["horizontal", "vertical"];
    },
    cur: function (id) {
      return A(id).hue_gradient_orientation;
    },
    set: function (id, v) {
      call("hue_plus", "configure_light", { light: A(id).hue_light_id, gradient_orientation: v });
    },
    name: function (v) {
      return _T("hm_" + v);
    },
  },
  "hue-od": {
    title: "segment_order",
    options: function () {
      return ["forward", "reversed"];
    },
    cur: function (id) {
      return A(id).hue_gradient_order;
    },
    set: function (id, v) {
      call("hue_plus", "configure_light", { light: A(id).hue_light_id, gradient_order: v });
    },
    name: function (v) {
      return _T("hm_" + v);
    },
  },
};

function hmPick(kind) {
  return function (b, id) {
    hmBox(b);
    var cfg = HM_PICKS[kind];
    b.appendChild(
      hmGroup(
        cfg.options(id).map(function (v) {
          return hmRow({
            title: cfg.name(v),
            sub: cfg.sub ? cfg.sub(v) : "",
            check: function () {
              return cfg.cur(id) === v;
            },
            tap: function () {
              cfg.set(id, v);
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
  hmFetch(["bridge"]);
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
              val: x.enabled ? _T("on_2") : _T("off"),
              tap: "hue-marea:" + x.id,
            });
          })
        )
      );
  });
}

function hmMotionArea(b, id) {
  hmBox(b);
  hmLoad(b, ["motion_areas"], function (box, r, again) {
    var x = ((r.motion_areas || {}).areas || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    box.appendChild(hmTitle("motion", (x.metadata || {}).name || x.id));
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
              hpDo(again, "set_motion_area", { area: x.id, enabled: x.enabled });
            },
          },
        }),
      ])
    );
    box.appendChild(
      hmActions([
        hmButton(_T("hm_delete"), "danger", function () {
          confirmDlg(_T("delete_this_motion_area"), function () {
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
              sub: cntS((x.buttons || []).length, _T("hm_button"), _T("hm_buttons")) + (x.dials ? " · " + cntS(x.dials, _T("hm_dial"), _T("hm_dials")) : ""),
              tap: "hue-switch:" + x.id,
            });
          })
        )
      );
  });
}

function hmPresses(x, button) {
  return Object.keys((x.actions || {})[button.id] || {}).length;
}

function hmSwitch(b, id) {
  hmBox(b);
  hmLoad(b, ["accessories"], function (box, r) {
    var x = (r.accessories || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hmCallout(_T("nothing_found")));
      return;
    }
    box.appendChild(hmTitle("cog", x.name));
    box.appendChild(hmLabel(_T("hm_buttons")));
    box.appendChild(
      hmGroup(
        (x.buttons || []).map(function (btn) {
          var n = hmPresses(x, btn);
          return hmRow({
            title: _T("hm_button_label") + " " + btn.number,
            sub: btn.last_event ? _T("hm_last_press") + " · " + String(btn.last_event).replace(/_/g, " ") : "",
            val: n ? cntS(n, _T("hm_press_set"), _T("hm_presses_set")) : _T("hm_nothing_set"),
          });
        })
      )
    );
    box.appendChild(hmCallout(_T("hm_what_the_buttons_do_note")));
  });
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
HP_PAGES["hue-bridge"] = ["hm_bridges", "plug", hmBridge];
HP_PAGES["hue-updates"] = ["hm_software_update", "restart", hmUpdates];
HP_PAGES["hue-matter"] = ["hm_smart_home", "scene", hmMatter];
HP_PAGES["hue-apps"] = ["hm_applications", "lock", hmApps];
HP_PAGES["hue-routines"] = ["routines_and_automations", "clock", hmRoutines];
HP_PAGES["hue-routine"] = ["routine", "clock", hmRoutine];
HP_PAGES["hue-ent"] = ["entertainment_areas", "target", hmAreas];
HP_PAGES["hue-area"] = ["entertainment_area", "target", hmArea];
HP_PAGES["hue-end"] = ["hm_when_sync_stops", "target", hmEnd];
HP_PAGES["hue-escene"] = ["hp_scene", "scene", hmEndScene];
HP_PAGES["hue-motion"] = ["hm_motionaware_areas", "motion", hmMotion];
HP_PAGES["hue-marea"] = ["motion_area", "motion", hmMotionArea];
