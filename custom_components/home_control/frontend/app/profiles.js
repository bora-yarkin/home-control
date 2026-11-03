/* What a device can have next to its own entity, bound by the administrator with the entity selector and shown only when bound: a vacuum's map, room buttons, modes and upkeep values (`vx`), a camera's intercom (answer, reject, unlock, a call indicator: `ix`) and push to talk (`talk`), and a light's scenes taken from another entity (`sx`). Nothing here knows a brand. */

/* The kinds of entity each place accepts. */
var DSLOT = {
  "vx.map": ["camera", "image"],
  "vx.rooms": ["button", "input_button", "script", "scene", "switch"],
  "vx.modes": ["select", "input_select", "number", "input_number", "switch", "input_boolean"],
  "vx.care": ["sensor", "binary_sensor", "number", "input_number"],
  "ix.answer": ["button", "input_button", "script", "switch"],
  "ix.reject": ["button", "input_button", "script", "switch"],
  "ix.unlock": ["lock", "button", "input_button", "script", "switch"],
  "ix.ring": ["binary_sensor", "input_boolean", "event", "sensor"],
  sx: ["select", "input_select"],
};
var DSLOT_LABEL = {
  "vx.map": "px_map",
  "vx.rooms": "px_rooms",
  "vx.modes": "px_modes",
  "vx.care": "px_care",
  "ix.answer": "px_answer",
  "ix.reject": "px_reject",
  "ix.unlock": "px_unlock",
  "ix.ring": "px_call_indicator",
  sx: "px_scenes_from",
};

function dslotGet(d, path) {
  var p = path.split(".");
  return p.length === 1 ? d[p[0]] : d[p[0]] && d[p[0]][p[1]];
}

function dslotSet(d, path, v) {
  var p = path.split(".");
  if (p.length === 1) {
    if (v === undefined) delete d[p[0]];
    else d[p[0]] = v;
    return;
  }
  d[p[0]] = d[p[0]] || {};
  if (v === undefined) delete d[p[0]][p[1]];
  else d[p[0]][p[1]] = v;
}

/* One entity in one place: the current one, choosing another, clearing it. The popup is "dslot:<device key>:<place>". */
function dslotPage(b, key) {
  var i = key.lastIndexOf(":"),
    d = devAt(key.slice(0, i)),
    path = key.slice(i + 1);
  if (!d || !DSLOT[path]) return;
  var cur = dslotGet(d, path);
  b.appendChild(
    pill("plug", cur ? A(cur).friendly_name || cur : _T("ap_not_set"), {
      sub: function () {
        return cur || "";
      },
    })
  );
  b.appendChild(
    pill("search", _T("ap_choose_an_entity"), {
      tap: function () {
        pickEntity(_T(DSLOT_LABEL[path]), DSLOT[path], null, function (id) {
          dslotSet(d, path, id);
          uiChanged();
          popBack();
        });
      },
    })
  );
  if (cur)
    b.appendChild(
      pill("trash", _T("ap_clear"), {
        tap: function () {
          dslotSet(d, path, undefined);
          uiChanged();
          popBack();
        },
      })
    );
}

/* A list of entities: each with (for room buttons) a label and removal, and one to add. The popup is "dlist:<device key>:<place>". */
function dlistPage(b, key) {
  var i = key.lastIndexOf(":"),
    d = devAt(key.slice(0, i)),
    path = key.slice(i + 1);
  if (!d || !DSLOT[path]) return;
  var box = mk("div");
  b.appendChild(box);
  function items() {
    var l = dslotGet(d, path);
    if (!Array.isArray(l)) {
      l = [];
      dslotSet(d, path, l);
    }
    return l;
  }
  function draw() {
    items().forEach(function (x, n) {
      var e = typeof x === "string" ? x : x.e;
      box.appendChild(
        pill("plug", (typeof x === "object" && x.l) || A(e).friendly_name || e, {
          sub: function () {
            return e;
          },
          tap: function () {
            items().splice(n, 1);
            uiChanged();
            redrawBox(box, draw);
          },
        })
      );
      if (typeof x === "object")
        box.appendChild(
          textRow("edit", _T("rm_label"), x.l, function (v) {
            x.l = v.slice(0, 24);
            uiChanged();
          }, 24)
        );
    });
    if (items().length < 40)
      box.appendChild(
        pill("plus", _T("px_add"), {
          sub: function () {
            return _T("px_tap_an_entry_to_remove_it");
          },
          tap: function () {
            pickEntity(_T(DSLOT_LABEL[path]), DSLOT[path], null, function (id) {
              items().push(path === "vx.rooms" ? { e: id, l: "" } : id);
              uiChanged();
              redrawBox(box, draw);
            });
          },
        })
      );
  }
  draw();
}

/* The vacuum's own extras under its normal popup: the map picture (nothing is drawn over it), the room buttons, the modes and the upkeep values. */
function vacProfile(b, id) {
  var d = UIDEV[id],
    vx = d && d.vx;
  if (!vx) return;
  var me = vx.map && H().states[vx.map] ? vx.map : null;
  if (me) {
    var box = mk("div", "rb-map pane"),
      img = mk("img"),
      last = "";
    img.alt = _T("map_of_the_robot_vacuum");
    img.style.width = "100%";
    box.appendChild(img);
    b.appendChild(box);
    function paint() {
      var u = A(me).entity_picture || "";
      if (u && u !== last && imgOk(u)) {
        last = u;
        img.src = u;
      }
      box.style.display = last ? "" : "none";
    }
    paint();
    reg(paint);
  }
  var rooms = (vx.rooms || []).filter(function (x) {
    return H().states[x.e];
  });
  if (rooms.length) {
    b.appendChild(sep(_T("px_rooms"), "vac"));
    var grid = mk("div", "rm-grid");
    grid.style.setProperty("--rc", 3);
    rooms.forEach(function (x) {
      var t = mk("div", "rm-t pane" + (remoteUsable(x.e) ? "" : " na"), svg("vac"));
      t.setAttribute("role", "button");
      t.tabIndex = 0;
      var lab = mk("span", "rm-l");
      lab.textContent = x.l || A(x.e).friendly_name || x.e;
      t.appendChild(lab);
      t.addEventListener("click", function () {
        remotePress(x);
      });
      grid.appendChild(t);
    });
    b.appendChild(grid);
  }
  [["modes", "tune"], ["care", "wrench"]].forEach(function (g) {
    var ids = (vx[g[0]] || []).filter(function (e) {
      return H().states[e];
    });
    if (!ids.length) return;
    b.appendChild(sep(_T(DSLOT_LABEL["vx." + g[0]]), g[1]));
    ids.forEach(function (e) {
      b.appendChild(apRowOf(e, A(e).friendly_name || e, g[1]));
    });
  });
}

function vacProfileEditor(box, d, key) {
  box.appendChild(sep(_T("px_extras"), "vac"));
  [["vx.map", "dslot"], ["vx.rooms", "dlist"], ["vx.modes", "dlist"], ["vx.care", "dlist"]].forEach(function (g) {
    box.appendChild(
      pill("tune", _T(DSLOT_LABEL[g[0]]), {
        sub: function () {
          var v = dslotGet(d, g[0]);
          return Array.isArray(v) ? v.length + " " + _T("px_entities") : v || _T("ap_not_set");
        },
        tap: function () {
          showPopup(g[1] + ":" + key + ":" + g[0], true);
        },
      })
    );
  });
}

/* ---- the camera's intercom: a call indicator, answer and reject while it rings, unlock for the chosen door only ---- */

function ixRinging(ix) {
  if (!ix.ring) return true;
  var s = H().states[ix.ring];
  if (!s) return false;
  if (dom(ix.ring) === "event") return !!s.state && isFinite(Date.parse(s.state)) && Date.now() - Date.parse(s.state) < 30000;
  if (dom(ix.ring) === "sensor") return ["", "idle", "off", "unknown", "unavailable", "0", "none"].indexOf(s.state) < 0;
  return s.state === "on";
}

/* The door opens through the one entity chosen for it and nothing else: if that is unavailable nothing happens and it says so. */
function ixUnlock(e) {
  if (!remoteUsable(e)) {
    toast(_T("rm_not_available_right_now"));
    return;
  }
  if (dom(e) === "lock") callConfirmed("lock", "unlock", { entity_id: e });
  else confirmDlg(_T("px_open_the_door"), function () {
    remotePress({ e: e });
  });
}

function camIntercom(box, id) {
  var d = UIDEV[id],
    ix = d && d.ix;
  if (!ix || !(ix.answer || ix.reject || ix.unlock)) return;
  var bar = mk("div", "cix"),
    btns = {};
  [["answer", "ix-ans", "px_answer", "check"], ["reject", "ix-rej", "px_reject", "close"], ["unlock", "ix-unl", "px_unlock", "lock"]].forEach(function (g) {
    if (!ix[g[0]]) return;
    var t = mk("div", "rnd pane " + g[1], svg(g[3]));
    t.setAttribute("role", "button");
    t.setAttribute("aria-label", _T(g[2]));
    t.title = _T(g[2]);
    t.addEventListener("click", function (e) {
      e.stopPropagation();
      if (g[0] === "unlock") ixUnlock(ix.unlock);
      else remotePress({ e: ix[g[0]] });
    });
    btns[g[0]] = t;
    bar.appendChild(t);
  });
  box.appendChild(bar);
  function up() {
    var r = ixRinging(ix);
    if (btns.answer) btns.answer.style.display = r ? "" : "none";
    if (btns.reject) btns.reject.style.display = r ? "" : "none";
    bar.classList.toggle("ring", r && !!ix.ring);
  }
  up();
  reg(up);
}

/* ---- push to talk: hold the microphone button while talking ---- */

function camTalkButton(box, id, group) {
  var d = UIDEV[id];
  if (!d || !d.talk || !window.CameraTalk) return;
  var b = mk("div", "rnd pane", svg("mic")),
    session = null,
    held = false;
  b.setAttribute("role", "button");
  b.setAttribute("aria-label", _T("px_hold_to_talk"));
  b.title = _T("px_hold_to_talk");
  b.style.touchAction = "none";
  function end() {
    held = false;
    b.classList.remove("act", "wait");
    if (session) {
      session.stop();
      session = null;
    }
  }
  b.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
    e.preventDefault();
    if (held) return;
    held = true;
    b.classList.add("act", "wait");
    try {
      b.setPointerCapture(e.pointerId);
    } catch (x) {}
    var s = window.CameraTalk.start(id);
    session = s;
    s.ready.then(
      function () {
        if (session === s) b.classList.remove("wait");
      },
      function (err) {
        if (session === s) {
          end();
          toast((err && err.userMessage) || _T("px_talking_did_not_start"));
        }
      }
    );
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) {
    b.addEventListener(ev, function (e) {
      e.stopPropagation();
      end();
    });
  });
  b.addEventListener("click", function (e) {
    e.stopPropagation();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) end();
  });
  group.appendChild(b);
}

/* ---- a light's scenes from another entity (a select) ---- */

function lightScenesRow(b, id) {
  var d = UIDEV[id];
  if (!d || !d.sx || !H().states[d.sx]) return;
  b.appendChild(selectEnt(d.sx, _T("px_scenes"), "scene"));
}

/* The setting rows of a device that offers these extras. */
function profileSettings(box, d, key) {
  if (d.kind === "vacuum") vacProfileEditor(box, d, key);
  if (d.kind === "camera") {
    box.appendChild(sep(_T("px_intercom"), "cam"));
    box.appendChild(
      pill("mic", _T("px_push_to_talk"), {
        on: function () {
          return !!d.talk;
        },
        sub: function () {
          return _T("px_push_to_talk_sub");
        },
        tap: function () {
          if (d.talk) delete d.talk;
          else d.talk = 1;
          uiChanged();
        },
      })
    );
    ["ix.answer", "ix.reject", "ix.unlock", "ix.ring"].forEach(function (path) {
      box.appendChild(
        pill("tune", _T(DSLOT_LABEL[path]), {
          sub: function () {
            return dslotGet(d, path) || _T("ap_not_set");
          },
          tap: function () {
            showPopup("dslot:" + key + ":" + path, true);
          },
        })
      );
    });
  }
  if (d.kind === "light" && d.id)
    box.appendChild(
      pill("scene", _T("px_scenes_from"), {
        sub: function () {
          return d.sx || _T("ap_not_set");
        },
        tap: function () {
          showPopup("dslot:" + key + ":sx", true);
        },
      })
    );
}
