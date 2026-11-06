/* What the Hue Plus menu and the dashboard's areas share: whether Hue Plus is there, asking the bridge for what it holds, and the exchange of areas with the bridge. The menu pages themselves are in huemenu.js. */

var HP_ICON = "lights";

/* The pages: key -> [title, icon, builder(b, id)]. A key may carry an id after a colon ("hue-light:light.desk_lamp"). huemenu.js adds the menu's own pages. */
var HP_PAGES = {
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

/* A service call that says whether it went through: a promise that rejects when it was not sent (callRaw gives nothing back when Home Assistant cannot be reached) or failed. callRaw tells the user of both itself. */
function hpCall(domain, service, data) {
  var p = callRaw(domain, service, data);
  return p ? Promise.resolve(p) : Promise.reject(new Error("not sent"));
}

/* A change to the bridge, then the list is read again. The service finishes when the bridge has answered, so the list is read after the change succeeded or failed, never before. */
function hpDo(again, service, data) {
  var done = callRaw("hue_plus", service, data);
  Promise.resolve(done).then(again, again);
}

/* ---- the dashboard's areas and the bridge's entertainment areas ----
 The dashboard's areas hold any light, Hue or not, and work without Hue Plus. When it is installed they can exchange their Hue lights and positions with the
 bridge's entertainment areas: nothing below runs, or is shown, without it. */

/* The bridge and the area editor count y the other way round. The bridge's y runs from the left corner of the room (-1) to the back corner (1), as the Hue app draws it; the editor's
 runs from the back corner (-1) to the left corner (1). x and the height are the same. A light is turned over with this on its way in and on its way out, so it stands where the Hue app shows it. */
function hpFlip(y) {
  return y ? -y : 0;
}

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
        return { light: hpHueId(l.id), x: l.x, y: hpFlip(l.y), z: l.z };
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
    out.push({ id: id, x: eaClamp(l.x || 0), y: eaClamp(hpFlip(l.y || 0)), z: eaClamp(l.z || 0) });
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

/* ---- editing an entertainment area on the bridge itself ----
 The placement editor opens on the bridge's area, not on one of the dashboard's: its lights are the Hue lights, what is saved goes to the bridge, and the dashboard's own areas do not change. */

/* The editor's draft of a bridge area. A light of the area that Home Assistant has no entity for cannot be moved here; it is kept as it is (`kept`) and sent back with the others. */
function hpBridgeDraft(area) {
  var lights = [],
    kept = [];
  (area.lights || []).forEach(function (l) {
    var id = hpEntityOf(l.light_id);
    if (id) lights.push({ id: id, x: eaClamp(l.x || 0), y: eaClamp(hpFlip(l.y || 0)), z: eaClamp(l.z || 0), balance: l.balance });
    else kept.push({ light: l.light_id, x: l.x, y: l.y, z: l.z, balance: l.balance });
  });
  return { id: area.id, name: area.name, room: "", lights: lights, dummies: [], kept: kept };
}

function hpEditOnBridge(area, after) {
  EAD = { room: "", isNew: false, sel: null, draft: hpBridgeDraft(area), bridge: { id: area.id, after: after || null } };
  showPopup("area-edit", true);
}

/* The lights that can be put in a bridge area: the Hue Plus lights (the ones Hue lights, not groups). */
function hpBridgeLights() {
  return Integrations.hueplus.lights(H()).map(function (id) {
    return { id: id, name: hpName(id), icon: "lamp" };
  });
}

/* Saves the area to the bridge and goes on to `leave`. Gives back false when it cannot be saved (no name, no light), else a promise of whether the bridge took it. */
function hpSaveBridge(leave) {
  var d = EAD.draft,
    name = String(d.name || "").trim();
  if (!name) {
    toast(_T("give_the_area_a_name"));
    return false;
  }
  var lights = d.kept
    .concat(
      d.lights.map(function (l) {
        return { light: hpHueId(l.id), x: l.x, y: hpFlip(l.y), z: l.z, balance: l.balance };
      })
    )
    .map(function (l) {
      var o = { light: l.light, x: l.x, y: l.y, z: l.z };
      if (typeof l.balance === "number") o.balance = l.balance;
      return o;
    });
  if (!lights.length) {
    toast(_T("add_at_least_one_light"));
    return false;
  }
  var after = EAD.bridge.after;
  return hpCall("hue_plus", "update_entertainment_area", { area: EAD.bridge.id, name: name, lights: lights }).then(
    function () {
      toast(_T("hm_saved_to_the_bridge"));
      eaIdentifyOff();
      EAD.saved = JSON.stringify(EAD.draft);
      if (after) after();
      POPGUARD = null;
      leave();
      return true;
    },
    function () {
      toast(_T("hm_the_bridge_did_not_accept_this"));
      return false;
    }
  );
}
