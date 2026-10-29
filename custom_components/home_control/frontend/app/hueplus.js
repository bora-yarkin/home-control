/* Philips Hue Plus in Settings: the bridge, firmware, lights, routines, entertainment areas and motion areas. Built from the shared controls only; the lists the bridge itself holds come from hue_plus.get_resources, the rest from the integration's entities. */

var HP_ICON = "lights";

/* The pages: key -> [title, icon, builder(b, id)]. A key may carry an id after a colon ("hue-light:light.desk_lamp"). */
var HP_PAGES = {
  "stg-hue": ["hue_plus", HP_ICON, hpRoot],
  "hue-bridge": ["hue_bridge", "plug", hpBridge],
  "hue-updates": ["firmware_updates", "restart", hpUpdates],
  "hue-lights": ["lights", "lamp", hpLights],
  "hue-light": ["light_setup", "lamp", hpLight],
  "hue-routines": ["routines_and_automations", "clock", hpRoutines],
  "hue-routine": ["routine", "clock", hpRoutine],
  "hue-ent": ["entertainment_areas", "target", hpAreas],
  "hue-area": ["entertainment_area", "target", hpArea],
  "hue-motion": ["motion_areas", "motion", hpMotion],
  "hue-marea": ["motion_area", "motion", hpMotionArea],
  "hue-apps": ["authorized_apps", "lock", hpApps],
  "hue-matter": ["matter", "scene", hpMatter],
  "hue-import": ["import_from_the_hue_bridge", "target", hpImportList],
  "hue-read": ["read_from_the_hue_bridge", "target", hpReadList],
};

function hpShown() {
  return Integrations.hueplus.has(H(), "get_resources") && !!Integrations.hueplus.bridge(H());
}

function hpBridgeEnts() {
  return Integrations.hueplus.bridge(H()) || {};
}

function hpNote(text) {
  return pill("info", text, {});
}

function hpName(id) {
  return A(id).friendly_name || id;
}

/* Draws what the bridge says into a box, after asking for it; a failed or empty answer says so instead of leaving the page blank. `again()` asks once more (after a change). */
function hpLoad(b, kinds, draw) {
  var box = mk("div");
  b.appendChild(box);
  function ask() {
    box.innerHTML = "";
    box.appendChild(hpNote(_T("loading")));
    Integrations.hueplus.resources(kinds).then(
      function (r) {
        box.innerHTML = "";
        draw(box, r || {}, ask);
      },
      function () {
        box.innerHTML = "";
        box.appendChild(hpNote(_T("couldn_t_read_the_hue_bridge")));
      }
    );
  }
  ask();
  return box;
}

/* A change to the bridge, then the list is read again once the bridge has taken it. */
function hpDo(again, service, data) {
  call("hue_plus", service, data);
  setTimeout(again, 900);
}

function hpUpdateText(id) {
  var s = V_(id),
    a = A(id);
  if (s === "on") return _T("update_available") + (a.latest_version ? " · " + a.latest_version : "");
  return s === "off" ? _T("up_to_date") : "";
}

/* ---- the first page: where everything of Hue Plus is ---- */

function hpRoot(b) {
  var n = Integrations.hueplus.updates(H()).filter(function (u) {
    return V_(u) === "on";
  }).length;
  stgRows(b, [
    [
      "plug",
      _T("hue_bridge"),
      function () {
        return _T("firmware_zigbee_matter_and_apps");
      },
      "hue-bridge",
    ],
    [
      "restart",
      _T("firmware_updates"),
      function () {
        return n ? cntS(n, _T("update_available_2"), _T("updates_available")) : _T("up_to_date");
      },
      "hue-updates",
    ],
    [
      "lamp",
      _T("lights"),
      function () {
        return _T("what_each_light_is_for_and_how_it_starts");
      },
      "hue-lights",
    ],
    [
      "clock",
      _T("routines_and_automations"),
      function () {
        return _T("the_bridge_s_own_routines_on_or_off");
      },
      "hue-routines",
    ],
    [
      "target",
      _T("entertainment_areas"),
      function () {
        return _T("what_the_lights_do_when_a_sync_ends");
      },
      "hue-ent",
    ],
    [
      "motion",
      _T("motion_areas"),
      function () {
        return _T("lights_used_as_a_motion_sensor");
      },
      "hue-motion",
    ],
  ]);
}

/* ---- the bridge ---- */

function hpVal(icon, name, fn, tap) {
  return pill(icon, name, { val: fn, tap: tap });
}

function hpBridge(b) {
  var E = hpBridgeEnts();
  if (E.bridge_update)
    b.appendChild(
      pill("restart", _T("bridge_firmware"), {
        sub: function () {
          return A(E.bridge_update).installed_version || "";
        },
        val: function () {
          return hpUpdateText(E.bridge_update);
        },
        tap:
          V_(E.bridge_update) === "on"
            ? function () {
                confirmDlg(_T("install_the_bridge_update_the_bridge_restarts"), function () {
                  call("update", "install", { entity_id: E.bridge_update });
                });
              }
            : null,
      })
    );
  if (E.auto_update) b.appendChild(switchPill("restart", _T("automatic_updates"), E.auto_update));
  if (E.auto_update_time)
    b.appendChild(
      hpVal("clock", _T("automatic_update_time"), function () {
        return (V_(E.auto_update_time) || "").slice(0, 5);
      })
    );
  if (E.check_update)
    b.appendChild(
      actionPill("search", _T("check_for_an_update"), function () {
        call("button", "press", { entity_id: E.check_update });
      })
    );
  if (E.search)
    b.appendChild(
      actionPill("plus", _T("search_for_new_devices"), function () {
        call("button", "press", { entity_id: E.search });
      })
    );
  if (E.zigbee_channel)
    b.appendChild(
      hpVal("axis", _T("zigbee_channel"), function () {
        return V_(E.zigbee_channel);
      })
    );
  if (E.matter_fabrics)
    b.appendChild(
      hpVal(
        "scene",
        _T("matter"),
        function () {
          return V_(E.matter_fabrics) + " / " + (A(E.matter_fabrics).max_fabrics || "–");
        },
        function () {
          showPopup("hue-matter", true);
        }
      )
    );
  if (E.authorized_apps)
    b.appendChild(
      hpVal(
        "lock",
        _T("authorized_apps"),
        function () {
          return V_(E.authorized_apps);
        },
        function () {
          showPopup("hue-apps", true);
        }
      )
    );
  if (E.home_and_away)
    b.appendChild(
      hpVal("home", _T("home_and_away"), function () {
        return V_(E.home_and_away) === "configured" ? _T("set_up") : _T("not_set_up");
      })
    );
  if (E.service_internet)
    b.appendChild(
      hpVal("info", _T("internet"), function () {
        return isOn(E.service_internet) ? _T("on_2") : _T("off");
      })
    );
}

function hpApps(b) {
  hpLoad(b, ["apps"], function (box, r, again) {
    if (!(r.apps || []).length) box.appendChild(hpNote(_T("nothing_found")));
    (r.apps || []).forEach(function (a) {
      box.appendChild(
        actionPill(
          "lock",
          a.name || a.id,
          function () {
            hpDo(again, "revoke_app", { app: a.id, confirm: true });
          },
          _T("take_this_app_s_access_away_it_can_no_longer_use_the_bridge")
        )
      );
    });
  });
}

function hpMatter(b) {
  var E = hpBridgeEnts(),
    f = (E.matter_fabrics && A(E.matter_fabrics).fabrics) || [];
  if (!f.length) b.appendChild(hpNote(_T("nothing_connected")));
  f.forEach(function (x) {
    b.appendChild(
      pill("scene", x.label || x.vendor || x.id, {
        sub: function () {
          return [x.vendor, x.status].filter(Boolean).join(" · ");
        },
        tap: function () {
          confirmDlg(_T("disconnect_this_matter_app_from_the_bridge"), function () {
            call("hue_plus", "remove_matter_fabric", { fabric: x.id, confirm: true });
            closeLayer();
          });
        },
      })
    );
  });
}

/* ---- firmware updates ---- */

function hpUpdates(b) {
  var list = Integrations.hueplus.updates(H());
  if (!list.length) b.appendChild(hpNote(_T("nothing_found")));
  list.forEach(function (id) {
    b.appendChild(
      pill("restart", hpName(id).replace(/ firmware$/i, ""), {
        on: function () {
          return V_(id) === "on";
        },
        sub: function () {
          return A(id).installed_version || "";
        },
        val: function () {
          return hpUpdateText(id);
        },
        tap: function () {
          if (V_(id) !== "on") return;
          confirmDlg(_T("install_this_update"), function () {
            call("update", "install", { entity_id: id });
          });
        },
      })
    );
  });
}

/* ---- lights ---- */

function hpLights(b) {
  var list = Integrations.hueplus.lights(H());
  if (!list.length) b.appendChild(hpNote(_T("nothing_found")));
  list.forEach(function (id) {
    b.appendChild(
      pill("lamp", hpName(id), {
        sub: function () {
          return A(id).hue_function ? _T("fn_" + A(id).hue_function) : "";
        },
        tap: function () {
          showPopup("hue-light:" + id, true);
        },
      })
    );
  });
}

function hpSelect(label, icon, opts, cur, pick, fmt) {
  return selectTile(
    label,
    function () {
      return opts;
    },
    cur,
    pick,
    icon,
    fmt
  );
}

function hpLight(b, id) {
  var X = Integrations.hueplus.forLight(H(), id),
    hue = A(id).hue_light_id,
    a = function () {
      return A(id);
    };
  if (X.powerup)
    b.appendChild(
      selectTile(
        _T("when_it_gets_power"),
        function () {
          return A(X.powerup).options || [];
        },
        function () {
          return V_(X.powerup);
        },
        function (v) {
          call("select", "select_option", { entity_id: X.powerup, option: v });
        },
        "power",
        function (v) {
          return _T("pw_" + v) || cap(String(v).replace(/_/g, " "));
        }
      )
    );
  if (a().hue_function)
    b.appendChild(
      hpSelect(
        _T("used_for"),
        "tune",
        ["decorative", "functional", "mixed"],
        function () {
          return a().hue_function;
        },
        function (v) {
          call("hue_plus", "configure_light", { light: hue, function: v });
        },
        function (v) {
          return _T("fn_" + v);
        }
      )
    );
  if (a().hue_gradient_orientation && a().hue_gradient_orientation_configurable)
    b.appendChild(
      hpSelect(
        _T("mounting_direction"),
        "axis",
        ["horizontal", "vertical"],
        function () {
          return a().hue_gradient_orientation;
        },
        function (v) {
          call("hue_plus", "configure_light", { light: hue, gradient_orientation: v });
        }
      )
    );
  if (a().hue_gradient_order && a().hue_gradient_order_configurable)
    b.appendChild(
      hpSelect(
        _T("segment_order"),
        "swap",
        ["forward", "reversed"],
        function () {
          return a().hue_gradient_order;
        },
        function (v) {
          call("hue_plus", "configure_light", { light: hue, gradient_order: v });
        }
      )
    );
  if (a().hue_function || a().hue_gradient_order) b.appendChild(hpNote(_T("experimental_not_yet_tried_on_a_real_bridge")));
  if (a().hue_min_brightness !== undefined)
    b.appendChild(
      hpVal("bright", _T("lowest_brightness"), function () {
        return Math.round(a().hue_min_brightness * 100) / 100 + "%";
      })
    );
  if (X.identify)
    b.appendChild(
      actionPill("sparkle", _T("identify"), function () {
        call("button", "press", { entity_id: X.identify });
      })
    );
  var minutes = 15;
  b.appendChild(
    hpSelect(
      _T("sunrise_or_sunset_takes"),
      "clock",
      [5, 15, 30, 60],
      function () {
        return minutes;
      },
      function (v) {
        minutes = v;
      },
      function (v) {
        return v + " min";
      }
    )
  );
  [
    ["sunrise", "bright"],
    ["sunset", "moon"],
    ["no_effect", "stop"],
  ].forEach(function (x) {
    b.appendChild(
      actionPill(x[1], _T("hp_" + x[0]), function () {
        call("hue_plus", "timed_effect", { light: hue, effect: x[0], duration: minutes * 60 });
      })
    );
  });
  if (X.update)
    b.appendChild(
      hpVal("restart", _T("firmware"), function () {
        return hpUpdateText(X.update);
      })
    );
}

/* ---- routines ---- */

function hpRoutines(b) {
  hpLoad(b, ["automations"], function (box, r) {
    var list = r.automations || [];
    if (!list.length) box.appendChild(hpNote(_T("nothing_found")));
    list.forEach(function (x) {
      box.appendChild(
        pill("clock", x.name, {
          on: function () {
            return !!x.enabled;
          },
          sub: function () {
            return x.script || "";
          },
          val: function () {
            return x.enabled ? _T("on_2") : _T("off");
          },
          tap: function () {
            showPopup("hue-routine:" + x.id, true);
          },
        })
      );
    });
  });
}

function hpRoutine(b, id) {
  hpLoad(b, ["automations"], function (box, r, again) {
    var x = (r.automations || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hpNote(_T("nothing_found")));
      return;
    }
    box.appendChild(
      pill("clock", x.name, {
        on: function () {
          return !!x.enabled;
        },
        sub: function () {
          return x.script || "";
        },
        val: function () {
          return x.enabled ? _T("on_2") : _T("off");
        },
        tap: function () {
          x.enabled = !x.enabled;
          hpDo(again, "update_automation", { automation: x.id, enabled: x.enabled });
        },
      })
    );
    if (x.last_error) box.appendChild(hpNote(x.last_error));
    box.appendChild(
      actionPill(
        "trash",
        _T("delete_from_the_bridge"),
        function () {
          call("hue_plus", "delete_automation", { automation: x.id, confirm: true });
          closeLayer();
        },
        _T("delete_this_routine_from_the_bridge")
      )
    );
  });
}

/* ---- entertainment areas ---- */

var HP_END = ["last_state", "off", "pause", "scene"];

function hpAreas(b) {
  hpLoad(b, ["entertainment_areas"], function (box, r) {
    var list = r.entertainment_areas || [];
    if (!list.length) box.appendChild(hpNote(_T("nothing_found")));
    list.forEach(function (x) {
      box.appendChild(
        pill("target", x.name, {
          sub: function () {
            return x.end_state ? _T("end_" + x.end_state) : "";
          },
          tap: function () {
            showPopup("hue-area:" + x.id, true);
          },
        })
      );
    });
  });
}

function hpArea(b, id) {
  hpLoad(b, ["entertainment_areas", "scenes"], function (box, r, again) {
    var x = (r.entertainment_areas || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hpNote(_T("nothing_found")));
      return;
    }
    var scenes = (r.scenes || []).filter(function (s) {
        return s.group_id;
      }),
      end = x.end_state || "last_state",
      sceneTile = hpSelect(
        _T("hp_scene"),
        "scene",
        scenes.map(function (s) {
          return s.name;
        }),
        function () {
          return "";
        },
        function (v) {
          var sc = scenes.filter(function (s) {
            return s.name === v;
          })[0];
          if (sc) hpDo(again, "set_streaming_end_state", { area: x.id, end_state: "scene", scene: sc.id });
        },
        function (v) {
          return v || "–";
        }
      );
    box.appendChild(
      hpSelect(
        _T("after_the_sync"),
        "target",
        HP_END,
        function () {
          return end;
        },
        function (v) {
          end = v;
          sceneTile.style.display = v === "scene" ? "" : "none";
          if (v !== "scene") hpDo(again, "set_streaming_end_state", { area: x.id, end_state: v });
        },
        function (v) {
          return _T("end_" + v);
        }
      )
    );
    sceneTile.style.display = end === "scene" ? "" : "none";
    box.appendChild(sceneTile);
    box.appendChild(hpNote(_T("experimental_only_the_last_state_has_been_seen_on_a_real_bridge")));
    box.appendChild(
      hpVal("lights", _T("lights"), function () {
        return String((x.lights || []).length);
      })
    );
    box.appendChild(
      actionPill("palette", _T("show_red_for_5_seconds"), function () {
        call("hue_plus", "stream_colors", { area: x.id, colors: [[255, 0, 0]], duration: 5 });
      })
    );
    box.appendChild(
      actionPill("stop", _T("stop_streaming"), function () {
        call("hue_plus", "stop_streaming", { area: x.id });
      })
    );
  });
}

/* ---- motion areas ---- */

function hpMotion(b) {
  hpLoad(b, ["motion_areas"], function (box, r) {
    var list = (r.motion_areas || {}).areas || [];
    if (!list.length) box.appendChild(hpNote(_T("no_motion_areas")));
    list.forEach(function (x) {
      var name = (x.metadata || {}).name || x.id;
      box.appendChild(
        pill("motion", name, {
          on: function () {
            return !!x.enabled;
          },
          val: function () {
            return x.enabled ? _T("on_2") : _T("off");
          },
          tap: function () {
            showPopup("hue-marea:" + x.id, true);
          },
        })
      );
    });
  });
}

function hpMotionArea(b, id) {
  hpLoad(b, ["motion_areas"], function (box, r, again) {
    var x = ((r.motion_areas || {}).areas || []).filter(function (y) {
      return y.id === id;
    })[0];
    if (!x) {
      box.appendChild(hpNote(_T("nothing_found")));
      return;
    }
    var name = (x.metadata || {}).name || x.id;
    box.appendChild(
      pill("motion", name, {
        on: function () {
          return !!x.enabled;
        },
        val: function () {
          return x.enabled ? _T("on_2") : _T("off");
        },
        tap: function () {
          x.enabled = !x.enabled;
          hpDo(again, "set_motion_area", { area: x.id, enabled: x.enabled });
        },
      })
    );
    box.appendChild(
      actionPill(
        "trash",
        _T("delete_from_the_bridge"),
        function () {
          call("hue_plus", "delete_motion_area", { area: x.id, confirm: true });
          closeLayer();
        },
        _T("delete_this_motion_area")
      )
    );
  });
}

/* ---- the dashboard's areas and the bridge's entertainment areas ----
 The dashboard's areas hold any light, Hue or not, and work without Hue Plus. When it is installed they can exchange their Hue lights and positions with the
 bridge's entertainment areas: nothing below runs, or is shown, without it. */

function hpHueId(entity) {
  return A(entity).hue_light_id || null;
}

function hpEntityOf(hueId) {
  return (
    Integrations.hueplus.lights(H()).filter(function (id) {
      return hpHueId(id) === hueId;
    })[0] || null
  );
}

/* Rows at the end of the area editor: send this area's Hue lights to the bridge, or take positions from a bridge area. */
function hpAreaActions(box, draft) {
  if (!hpShown() || !ISADMIN) return;
  var hue = draft.lights.filter(function (l) {
    return hpHueId(l.id);
  });
  box.appendChild(
    pill("target", _T("send_to_the_hue_bridge"), {
      sub: function () {
        var other = draft.lights.length - hue.length;
        return cntS(hue.length, _T("hue_light"), _T("hue_lights")) + (other ? " · " + other + " " + _T("stay_here") : "");
      },
      tap: function () {
        hpSendArea(draft);
      },
    })
  );
  box.appendChild(
    pill("restart", _T("read_from_the_hue_bridge"), {
      sub: function () {
        return _T("takes_the_positions_of_its_lights");
      },
      tap: function () {
        showPopup("hue-read", true);
      },
    })
  );
}

/* The bridge's area of the same name is changed, or one is made. Only the area's Hue lights go: the others stay on the dashboard. */
function hpSendArea(draft) {
  var name = String(draft.name || "").trim(),
    lights = draft.lights
      .filter(function (l) {
        return hpHueId(l.id);
      })
      .map(function (l) {
        return { light: hpHueId(l.id), x: l.x, y: l.y, z: l.z };
      });
  if (!name) {
    toast(_T("give_the_area_a_name"));
    return;
  }
  if (!lights.length) {
    toast(_T("no_hue_lights_in_this_area"));
    return;
  }
  Integrations.hueplus.resources(["entertainment_areas"]).then(
    function (r) {
      var found = ((r && r.entertainment_areas) || []).filter(function (a) {
        return String(a.name).toLowerCase() === name.toLowerCase();
      })[0];
      if (found) call("hue_plus", "update_entertainment_area", { area: found.id, lights: lights });
      else call("hue_plus", "create_entertainment_area", { name: name, area_type: "other", lights: lights });
      toast(_T("sent_to_the_hue_bridge"));
    },
    function () {
      toast(_T("couldn_t_read_the_hue_bridge"));
    }
  );
}

/* A bridge area's lights as dashboard lights {id, x, y, z}: those Home Assistant has, and (when `only` is given) that belong to it. */
function hpAreaLightsOf(area, only) {
  var out = [];
  (area.lights || []).forEach(function (l) {
    var id = hpEntityOf(l.light_id);
    if (!id || (only && !only[id])) return;
    out.push({ id: id, x: eaClamp(l.x || 0), y: eaClamp(l.y || 0), z: eaClamp(l.z || 0) });
  });
  return out;
}

function hpBridgeAreas(b, draw) {
  hpLoad(b, ["entertainment_areas"], function (box, r) {
    var list = r.entertainment_areas || [];
    if (!list.length) box.appendChild(hpNote(_T("nothing_found")));
    list.forEach(function (a) {
      draw(box, a);
    });
  });
}

/* In a room's list of areas: a new area made from one of the bridge. It opens in the editor, so nothing is saved until the user says so. */
function hpAreaImport(box, room) {
  if (!hpShown() || !ISADMIN) return;
  box.appendChild(
    pill("plus", _T("import_from_the_hue_bridge"), {
      sub: function () {
        return _T("an_entertainment_area_of_the_bridge");
      },
      tap: function () {
        showPopup("hue-import:" + room, true);
      },
    })
  );
}

function hpImportList(b, room) {
  var here = {};
  eaRoomLights(room).forEach(function (l) {
    here[l.id] = 1;
  });
  hpBridgeAreas(b, function (box, a) {
    var lights = hpAreaLightsOf(a, here);
    box.appendChild(
      pill("target", a.name, {
        sub: function () {
          return cntS(lights.length, _T("light"), _T("lights")) + " " + _T("in_this_room");
        },
        tap: function () {
          if (!lights.length) {
            toast(_T("none_of_its_lights_are_in_this_room"));
            return;
          }
          closeLayer();
          eaOpen(room, null, { id: "", name: a.name, room: room, lights: lights, dummies: [] });
        },
      })
    );
  });
}

/* In the area editor: the positions of a bridge area's lights, for the lights of this room. */
function hpReadList(b) {
  hpBridgeAreas(b, function (box, a) {
    box.appendChild(
      pill("target", a.name, {
        sub: function () {
          return cntS((a.lights || []).length, _T("light"), _T("lights"));
        },
        tap: function () {
          var have = {};
          eaRoomLights(EAD.room).forEach(function (l) {
            have[l.id] = 1;
          });
          EAD.draft.lights.forEach(function (l) {
            have[l.id] = 1;
          });
          var got = hpAreaLightsOf(a, have);
          if (!got.length) {
            toast(_T("none_of_its_lights_are_in_this_room"));
            return;
          }
          got.forEach(function (g) {
            var mine = EAD.draft.lights.filter(function (l) {
              return l.id === g.id;
            })[0];
            if (mine) {
              mine.x = g.x;
              mine.y = g.y;
              mine.z = g.z;
            } else EAD.draft.lights.push(g);
          });
          closeLayer();
          eaBuild();
          eaTray();
          eaInfo();
          eaActions();
        },
      })
    );
  });
}
