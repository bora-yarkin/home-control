/* Access rules: who can control, confirm, only view or not see what. */

/* ---- access rules: who can control, confirm, only view, or not see what (enforced in this app only) ---- */
var ACCESS_ME = null,
  APPROVED = {},
  OWNALL = {},
  SEEDACC = 0,
  ACC_USERS = null;

var AMODES = ["allow", "confirm", "view", "hide"],
  MODELAB = {
    allow: _T("allowed"),
    confirm: _T("ask_first"),
    view: _T("view_only"),
    hide: _T("hidden"),
  };

var ADMINPOP = /^(manage|pick-|access-|scene-edit|scene-pick|live-|areas|area-edit|lpscene:|stg-|adv:|settings$)/;

function cleanRule(r) {
  if (!r || AMODES.indexOf(r.m) < 0) return null;
  var o = { m: r.m };
  if (typeof r.msg === "string" && r.msg && r.msg.length <= 140) o.msg = r.msg;
  return o;
}

function cleanAccess(a) {
  if (!a || typeof a !== "object") return null;
  var o = { users: {}, prefs: !!a.prefs };
  Object.keys(a.users || {})
    .slice(0, 40)
    .forEach(function (uid) {
      if (!/^[a-f0-9]{16,40}$/.test(uid)) return;
      var u = a.users[uid] || {},
        c = { rooms: {}, devs: {} },
        d = cleanRule(u.def);
      if (d) c.def = d;
      Object.keys(u.rooms || {})
        .slice(0, 24)
        .forEach(function (rid) {
          if (/^[a-z0-9_-]{1,24}$/.test(rid)) {
            var r = cleanRule(u.rooms[rid]);
            if (r) c.rooms[rid] = r;
          }
        });
      Object.keys(u.devs || {})
        .slice(0, 300)
        .forEach(function (id) {
          if (ENTRE.test(id)) {
            var r = cleanRule(u.devs[id]);
            if (r) c.devs[id] = r;
          }
        });
      o.users[uid] = c;
    });
  return o;
}

function accessInit() {
  ACCESS_ME = null;
  if (ISADMIN) return;
  var u = H() && H().user;
  if (u && STORE.access && STORE.access.users) ACCESS_ME = STORE.access.users[u.id] || null;
}

function ctxRoom() {
  return VIEW !== "home" ? VIEW : "";
}

/* The room an entity belongs to: the room whose device list holds it, else the room that holds another entity of the same device (a TV's remote), else the room of its Home Assistant area. */
function ownerRoom(id) {
  if (!id) return "";
  if (OWNALL[id]) return OWNALL[id];
  var h = H(),
    e = h && h.entities[id];
  if (!e) return "";
  if (e.device_id) {
    var mate = Object.keys(OWNALL).filter(function (o) {
      return h.entities[o] && h.entities[o].device_id === e.device_id;
    })[0];
    if (mate) return OWNALL[mate];
  }
  var area = areaIdOf(id),
    rm = area && UI.rooms.filter(function (x) {
      return x.area === area;
    })[0];
  return rm ? rm.id : "";
}

function modeOf(id, room) {
  if (ISADMIN || !ACCESS_ME) return { mode: "allow" };
  var r = ACCESS_ME,
    dv = id && r.devs[id];
  if (dv) return { mode: dv.m, msg: dv.msg, key: "d:" + id, room: ownerRoom(id) || room || "" };
  var rm = ownerRoom(id) || room || ctxRoom(),
    rr = rm && r.rooms[rm];
  if (rr) return { mode: rr.m, msg: rr.msg, key: "r:" + rm, room: rm };
  if (r.def) return { mode: r.def.m, msg: r.def.msg, key: "def:" + rm, room: rm };
  return { mode: "allow" };
}

function roomHidden(rid) {
  var r = ACCESS_ME;
  if (ISADMIN || !r) return false;
  var rule = r.rooms[rid] || r.def;
  return !!rule && rule.m === "hide";
}

function visDevs(rid) {
  return (UI.devs[rid] || []).filter(function (d) {
    return !(d.id && modeOf(d.id, rid).mode === "hide");
  });
}

function defaultMsg(m) {
  var r = m.room && TITLES[m.room];
  return r ? _T("are_you_sure_this_controls") + r + "." : _T("are_you_sure");
}

function gate(ids, proceed) {
  if (ISADMIN || !ACCESS_ME) {
    proceed();
    return true;
  }
  var block = false,
    need = null,
    keys = [];
  (ids.length ? ids : [""]).forEach(function (id) {
    var m = modeOf(id);
    if (m.mode === "view" || m.mode === "hide") block = true;
    else if (m.mode === "confirm" && !APPROVED[m.key]) {
      need = need || m;
      if (keys.indexOf(m.key) < 0) keys.push(m.key);
    }
  });
  if (block) {
    toast(_T("this_is_view_only_for_you"));
    return false;
  }
  if (need) {
    if (document.querySelector(".dlg")) return false;
    confirmDlg(need.msg || defaultMsg(need), function () {
      keys.forEach(function (k) {
        APPROVED[k] = 1;
      });
      proceed();
    });
    return false;
  }
  proceed();
  return true;
}

function accName(uid) {
  var u = (ACC_USERS || []).filter(function (x) {
    return x.id === uid;
  })[0];
  return u ? u.name : _T("user");
}

function accessUsers(cb) {
  if (ACC_USERS) return cb(ACC_USERS);
  HA.users()
    .then(function (l) {
      ACC_USERS = l
        .filter(function (u) {
          return (
            !u.system_generated && u.is_active && (u.group_ids || []).indexOf("system-admin") < 0
          );
        })
        .map(function (u) {
          return { id: u.id, name: u.name };
        });
      cb(ACC_USERS);
    })
    .catch(function () {
      cb([]);
    });
}

function accEnsure(uid) {
  if (!STORE.access) STORE.access = { users: {}, prefs: false };
  var u = STORE.access.users[uid];
  if (!u) u = STORE.access.users[uid] = { rooms: {}, devs: {} };
  return u;
}

function accSet(uid, kind, key, mode, msg) {
  var u = accEnsure(uid),
    tgt = kind === "def" ? null : kind === "room" ? u.rooms : u.devs;
  if (kind === "def") {
    if (mode) {
      u.def = { m: mode };
      if (msg) u.def.msg = msg;
    } else delete u.def;
  } else if (mode) {
    tgt[key] = { m: mode };
    if (msg) tgt[key].msg = msg;
  } else delete tgt[key];
  storeChanged();
}

function accSummary(uid) {
  var u = STORE.access && STORE.access.users[uid];
  if (!u) return _T("full_access");
  var n = Object.keys(u.rooms).length + Object.keys(u.devs).length;
  return (
    _T("everything_else") +
    (u.def ? MODELAB[u.def.m] : _T("allowed")) +
    (n ? " · " + n + (n === 1 ? " exception" : " exceptions") : "")
  );
}

function seedAccess() {
  STORE.access = { users: {}, prefs: false };
  storeChanged();
}

function accessRoot(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var hint = mk("div", "hint");
    hint.textContent = _T("these_rules_are_enforced_in_this_app");
    box.appendChild(hint);
    box.appendChild(
      pill("pin", _T("let_standard_users_pin_devices_and_c"), {
        on: function () {
          return !!(STORE.access && STORE.access.prefs);
        },
        sub: function () {
          return STORE.access && STORE.access.prefs
            ? _T("allowed_on_their_own_device")
            : _T("only_administrators_can_change_anyth");
        },
        tap: function () {
          if (!STORE.access) STORE.access = { users: {}, prefs: false };
          STORE.access.prefs = !STORE.access.prefs;
          storeChanged();
        },
      })
    );
    box.appendChild(sep(_T("standard_users"), "person"));
    var ph = pill("info", _T("loading_users"), {});
    box.appendChild(ph);
    accessUsers(function (us) {
      if (!box.isConnected) return;
      ph.remove();
      if (!us.length) box.appendChild(pill("info", _T("no_standard_users_found"), {}));
      us.forEach(function (u) {
        box.appendChild(
          pill("person", u.name, {
            sub: function () {
              return accSummary(u.id);
            },
            tap: function () {
              showPopup("access-user:" + u.id, true);
            },
          })
        );
      });
      refresh();
    });
  }
  redrawBox(box, draw);
}

function accessUser(b, uid) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var u = accEnsure(uid),
      d = u.def || { m: "allow" };
    box.appendChild(sep(_T("everything_not_listed_below"), "tune"));
    box.appendChild(
      seg(
        AMODES.map(function (m) {
          return [m, MODELAB[m]];
        }),
        d.m,
        function (v) {
          accSet(uid, "def", null, v === "allow" ? null : v, v === "confirm" ? d.msg : null);
          redrawBox(box, draw);
        }
      )
    );
    if (d.m === "confirm")
      box.appendChild(
        textRow(
          "edit",
          _T("message_for_the_are_you_sure_popup"),
          d.msg || "",
          function (v) {
            accSet(uid, "def", null, "confirm", v);
            redrawBox(box, draw);
          },
          140
        )
      );
    box.appendChild(sep(_T("rooms"), "home"));
    UI.rooms.forEach(function (r) {
      var rr = u.rooms[r.id];
      box.appendChild(
        pill(r.icon || "home", r.name, {
          sub: function () {
            var n = u.devs
              ? Object.keys(u.devs).filter(function (id) {
                  return OWNALL[id] === r.id;
                }).length
              : 0;
            return (
              (rr ? MODELAB[rr.m] : _T("same_as_everything_else")) +
              (n ? " · " + n + (n === 1 ? _T("device_exception") : _T("device_exceptions")) : "")
            );
          },
          tap: function () {
            showPopup("access-room:" + uid + ":" + r.id, true);
          },
        })
      );
    });
    box.appendChild(
      pill("trash", _T("remove_all_rules_for_this_user"), {
        tap: function () {
          confirmDlg(_T("give_this_user_full_access_again"), function () {
            if (STORE.access) delete STORE.access.users[uid];
            storeChanged();
            popBack();
          });
        },
      })
    );
  }
  redrawBox(box, draw);
}

function accessRoom(b, key) {
  var p = key.split(":"),
    uid = p[0],
    rid = p[1],
    r = roomById(rid);
  if (!r) return;
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var u = accEnsure(uid),
      rr = u.rooms[rid];
    box.appendChild(sep(_T("this_room"), "home"));
    box.appendChild(
      seg(
        [
          ["inherit", _T("same")],
          ["allow", _T("allow")],
          ["confirm", _T("ask_first")],
          ["view", _T("view_only")],
          ["hide", _T("hidden")],
        ],
        rr ? rr.m : "inherit",
        function (v) {
          accSet(
            uid,
            "room",
            rid,
            v === "inherit" ? null : v,
            v === "confirm" && rr ? rr.msg : null
          );
          redrawBox(box, draw);
        }
      )
    );
    if (rr && rr.m === "confirm")
      box.appendChild(
        textRow(
          "edit",
          _T("message_for_the_are_you_sure_popup"),
          rr.msg || "",
          function (v) {
            accSet(uid, "room", rid, "confirm", v);
            redrawBox(box, draw);
          },
          140
        )
      );
    box.appendChild(sep(_T("devices_in_this_room"), "plug"));
    var hint = mk("div", "hint");
    hint.textContent = _T("tap_a_device_to_cycle_same_as_the_ro");
    box.appendChild(hint);
    (UI.devs[rid] || []).forEach(function (d) {
      if (!d.id) return;
      box.appendChild(
        pill(d.icon || "plug", d.name, {
          sub: function () {
            var m = u.devs[d.id];
            return m ? MODELAB[m.m] : _T("same_as_the_room");
          },
          tap: function () {
            var cur = u.devs[d.id] ? u.devs[d.id].m : null,
              seq = [null].concat(AMODES),
              n = seq[(seq.indexOf(cur) + 1) % seq.length];
            accSet(uid, "dev", d.id, n, null);
            redrawBox(box, draw);
          },
        })
      );
    });
  }
  redrawBox(box, draw);
}

function roomAccessList(b, rid) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    accessUsers(function (us) {
      if (!box.isConnected) return;
      redrawBox(box, function () {
        var hint = mk("div", "hint");
        hint.textContent = _T("pick_a_user_to_set_what_they_can_do_");
        box.appendChild(hint);
        if (!us.length) box.appendChild(pill("info", _T("no_standard_users_found"), {}));
        us.forEach(function (u) {
          box.appendChild(
            pill("person", u.name, {
              sub: function () {
                var s = STORE.access && STORE.access.users[u.id],
                  rr = s && s.rooms[rid];
                return rr
                  ? MODELAB[rr.m]
                  : s && s.def
                    ? _T("same_as_everything_else_2") + MODELAB[s.def.m]
                    : _T("full_access");
              },
              tap: function () {
                showPopup("access-room:" + u.id + ":" + rid, true);
              },
            })
          );
        });
      });
    });
  }
  draw();
}

function sceneAllowed(sc) {
  if (ISADMIN || !ACCESS_ME || sc.room === "home") return true;
  var m = modeOf("", sc.room).mode;
  return m !== "view" && m !== "hide";
}
