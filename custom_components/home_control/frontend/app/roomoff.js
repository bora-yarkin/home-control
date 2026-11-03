/* Everything off in a room: a button at the top right of the page's header, and a script in Home Assistant for the same thing (script.home_control_<room>_off), kept up to date by the dashboard, so an automation, a button or a voice assistant can run it too. Both are built from one list of actions, roomOffActs(). */

/* The order devices are switched off in; the lights first. */
var ROOMOFF_DOMAINS = ["light", "media_player", "climate", "fan", "switch"];
var ROOMOFF_MARK = "home_control_room_off";
var ROOMOFF = { t: 0 };

/* The devices on the room's pages that "everything off" can switch off (not the hidden ones), in the order they are switched off in. A light group and its lights count once. */
function roomOffDevices(room) {
  var by = {};
  roomDevs(room).forEach(function (d) {
    if (ROOMOFF_DOMAINS.indexOf(d.type) >= 0) (by[d.type] = by[d.type] || []).push(d);
  });
  var out = [];
  ROOMOFF_DOMAINS.forEach(function (dm) {
    var list = by[dm] || [],
      units =
        dm === "light"
          ? lightUnits(
              list.map(function (d) {
                return d.id;
              })
            )
          : null;
    list.forEach(function (d) {
      if (units && units.indexOf(d.id) < 0) return;
      if (
        !out.some(function (x) {
          return x.id === d.id;
        })
      )
        out.push(d);
    });
  });
  return out;
}

/* What an administrator chose to leave alone in this room (for example an air purifier). */
function roomOffLeft(room) {
  return (UI.offx && UI.offx[room]) || [];
}

/* One turn_off for each kind of device that is not left alone. */
function roomOffActs(room) {
  var left = roomOffLeft(room),
    by = {};
  roomOffDevices(room).forEach(function (d) {
    if (left.indexOf(d.id) >= 0) return;
    (by[d.type] = by[d.type] || []).push(d.id);
  });
  return ROOMOFF_DOMAINS.filter(function (dm) {
    return by[dm];
  }).map(function (dm) {
    return { action: dm + ".turn_off", target: { entity_id: by[dm] } };
  });
}

function roomOffScriptId(room) {
  return "home_control_" + room.replace(/[^a-z0-9_]/g, "_") + "_off";
}

/* The script Home Assistant keeps for a room, or null when the room has nothing to switch off. A device that fails does not stop the others. */
function roomOffScript(room) {
  var acts = roomOffActs(room);
  if (!acts.length) return null;
  return {
    alias: (TITLES[room] || room) + " · " + _T("everything_off"),
    description: ROOMOFF_MARK + ": " + _T("managed_by_the_dashboard_room_off"),
    icon: "mdi:power",
    mode: "single",
    max_exceeded: "silent",
    sequence: acts.map(function (a) {
      return { action: a.action, target: a.target, continue_on_error: true };
    }),
  };
}

function roomOffRooms() {
  return ORDER.filter(function (r) {
    return r !== "home" && UIROOM[r];
  });
}

function roomOffWatch(p) {
  return JSON.stringify(stableForm({ alias: p.alias, sequence: p.sequence }));
}

/* Brings Home Assistant's scripts to what the dashboard's rooms hold now: reads each first and writes only what differs, makes one that is missing, and removes the dashboard's script of a room that is gone or has nothing left to switch off (only one that carries the dashboard's mark). */
function roomOffReconcile() {
  if (!ISADMIN || !STORE_READY || !H() || OFFLINE) return;
  var want = {};
  roomOffRooms().forEach(function (r) {
    var p = roomOffScript(r);
    if (p) want[roomOffScriptId(r)] = p;
  });
  Object.keys(want).forEach(function (id) {
    window.HA.scripts
      .get(id)
      .then(
        function (cur) {
          return roomOffWatch(cur) === roomOffWatch(want[id]) ? null : window.HA.scripts.save(id, want[id]);
        },
        function (e) {
          /* Only a script that is not there is made again; a failed read says nothing about it. */
          return e && e.status_code === 404 ? window.HA.scripts.save(id, want[id]) : null;
        }
      )
      .catch(function () {});
  });
  Object.keys(H().entities || {}).forEach(function (eid) {
    var e = H().entities[eid],
      id = e.platform === "script" && e.unique_id;
    if (!id || want[id] || !/^home_control_.+_off$/.test(id)) return;
    window.HA.scripts
      .get(id)
      .then(function (cur) {
        if (cur && String(cur.description || "").indexOf(ROOMOFF_MARK) === 0) return window.HA.scripts.remove(id);
        return null;
      })
      .catch(function () {});
  });
}

function roomOffReconcileSoon() {
  clearTimeout(ROOMOFF.t);
  ROOMOFF.t = setTimeout(roomOffReconcile, 3000);
}

function roomOffRun(room) {
  var f = filterActs(roomOffActs(room)),
    ids = actionIds(f.acts);
  if (!ids.length) {
    toast(_T("this_is_view_only_for_you"));
    return;
  }
  if (f.dropped) toast(_T("some_devices_are_view_only_and_were_"));
  gate(ids, function () {
    liveStopOn(ids);
    execActs(f.acts);
    toast(_T("turning_everything_off"));
  });
}

/* The button sits first in the header's group of round buttons, and shows on a room's page that has something to switch off. */
function roomOffInit() {
  var group = document.querySelector(".hb");
  if (!group || document.getElementById("obtn")) return;
  var b = mk("div", "rnd pane");
  b.id = "obtn";
  b.style.display = "none";
  b.setAttribute("role", "button");
  b.innerHTML = svg("power");
  b.addEventListener("click", function () {
    if (VIEW === "home" || !UIROOM[VIEW]) return;
    /* In the page editor the button opens its settings instead of switching things off. */
    if (editing()) showPopup("roomoff:" + VIEW, true);
    else roomOffRun(VIEW);
  });
  group.insertBefore(b, group.firstChild);
}

function roomOffSync() {
  var b = document.getElementById("obtn");
  if (!b) return;
  var show = VIEW !== "home" && !!UIROOM[VIEW] && roomOffActs(VIEW).length > 0;
  b.style.display = show ? "" : "none";
  if (show) {
    var label = _T("turn_everything_off_in_this_room");
    b.title = label;
    b.setAttribute("aria-label", label);
  }
}

/* The settings of the button: opened by tapping it in the page editor. Every device it can switch off, each with a switch; one switched off here is left alone by the button and by the room's script. */
function roomOffPage(b, room) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var hint = mk("div", "hint");
    hint.textContent = _T("the_button_at_the_top_of_this_room_s_") + " script." + roomOffScriptId(room);
    box.appendChild(hint);
    var devs = roomOffDevices(room);
    if (!devs.length) box.appendChild(pill("info", _T("nothing_here_can_be_switched_off"), {}));
    devs.forEach(function (d) {
      box.appendChild(
        swRow(d.icon || "plug", d.name, {
          sub: function () {
            return roomOffLeft(room).indexOf(d.id) >= 0 ? _T("left_as_it_is") : _T("switched_off");
          },
          on: function () {
            return roomOffLeft(room).indexOf(d.id) < 0;
          },
          toggle: function () {
            var list = roomOffLeft(room).slice(),
              i = list.indexOf(d.id);
            if (i >= 0) list.splice(i, 1);
            else list.push(d.id);
            UI.offx = UI.offx || {};
            if (list.length) UI.offx[room] = list;
            else delete UI.offx[room];
            if (!Object.keys(UI.offx).length) delete UI.offx;
            uiChanged();
            redrawBox(box, draw);
          },
        })
      );
    });
  }
  draw();
}
