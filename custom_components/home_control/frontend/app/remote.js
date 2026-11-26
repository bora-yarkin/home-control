/* Remotes: a device that is a grid of buttons or a picture of a real remote with touch areas over it. A button presses an entity (a script, a button, a scene, a switch), sends a key to a remote entity, controls a media player or selects one of its sources.
   The popup (remotePage) only uses the remote. It is built in the device's settings (Buttons, remoteBuild): the grid with its columns, each button's size and place, five-way pads, gaps, ready-made sets of keys for the
   integration behind a remote entity (app/integrations.js, Integrations.remote), and for a picture its touch areas. What a button does is an action `a` (cleanRmAct in app/model.js). */

var REMOTE_DOMS = ["script", "button", "input_button", "scene", "switch"];
var REMOTE_PICK_DOMS = REMOTE_DOMS.concat(["remote", "media_player"]);
var REMOTE_ACT = {
  script: ["script", "turn_on"],
  button: ["button", "press"],
  input_button: ["input_button", "press"],
  scene: ["scene", "turn_on"],
  switch: ["switch", "toggle"],
};
var RM_MEDIA_SVC = {
  volume_up: "volume_up",
  volume_down: "volume_down",
  volume_mute: "volume_mute",
  play_pause: "media_play_pause",
  play: "media_play",
  pause: "media_pause",
  stop: "media_stop",
  next: "media_next_track",
  previous: "media_previous_track",
  turn_on: "turn_on",
  turn_off: "turn_off",
  toggle: "toggle",
};
var RM_MEDIA_LABEL = {
  volume_up: "rm_m_volume_up",
  volume_down: "rm_m_volume_down",
  volume_mute: "rm_m_volume_mute",
  play_pause: "rm_m_play_pause",
  play: "rm_m_play",
  pause: "rm_m_pause",
  stop: "rm_m_stop",
  next: "rm_m_next",
  previous: "rm_m_previous",
  turn_on: "rm_m_turn_on",
  turn_off: "rm_m_turn_off",
  toggle: "rm_m_toggle",
};
var RM = { sel: null, keys: null, keysSet: null };

/* The remote device with this id, wherever the layout keeps it. */
function remoteFind(rid) {
  var found = null;
  /* An appliance can carry a remote too: it is found by its own id. */
  function look(d) {
    if ((d.kind === "remote" && d.rid === rid) || (d.kind === "appliance" && d.aid === rid)) found = d;
    /* and a remote master may keep remotes of its own */
    if (d.kind === "widget" && d.w === "rmaster")
      ((d.wx && d.wx.own) || []).forEach(function (o) {
        if (o.rid === rid) found = o;
      });
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

function remoteNew() {
  return {
    id: "",
    rid: newKey("rm"),
    name: _T("remote"),
    icon: "media",
    kind: "remote",
    rm: { cols: 4, btns: [] },
  };
}

/* What a button or touch area does: its action, or, for one made before actions had a kind, the entity on it. */
function rmAct(b) {
  return b.a || (b.e ? { t: "ent", e: b.e } : null);
}

/* A button has no state until it is first pressed ("unknown" is what Home Assistant shows for one that works), so only "unavailable" holds it back; for anything else "unknown" means no reading. */
function remoteUsable(e) {
  var s = H().states[e];
  if (!s || s.state === "unavailable") return false;
  return s.state !== "unknown" || ["button", "input_button", "scene", "script"].indexOf(dom(e)) >= 0;
}

/* Whether an action can run now: a key needs its remote entity, a media control its player, a press its entity. */
function rmUsable(a) {
  if (!a || a.t === "room") return false;
  if (a.t === "ent" || !a.t) return remoteUsable(a.e);
  var s = H().states[a.e];
  if (s && s.state !== "unavailable") return true;
  /* A key that wakes a media player can run while its remote entity cannot. */
  var w = a.w && H().states[a.w];
  return !!(w && w.state !== "unavailable");
}

/* The service call of an action, as [domain, service, data]. */
function rmCall(a) {
  /* a room on a vacuum's map is chosen on its own card, it calls nothing */
  if (a.t === "room") return null;
  if (a.t === "key") {
    /* A power key goes over the TV's network socket, which is closed while the TV is off: the media player is turned on instead. */
    if (a.w && V_(a.w) === "off") return ["media_player", "turn_on", { entity_id: a.w }];
    var kd = { entity_id: a.e, command: a.c };
    if (a.hs) kd.hold_secs = a.hs;
    return ["remote", "send_command", kd];
  }
  if (a.t === "media") {
    var data = { entity_id: a.e };
    if (a.m === "volume_mute") data.is_volume_muted = !A(a.e).is_volume_muted;
    return ["media_player", RM_MEDIA_SVC[a.m], data];
  }
  if (a.t === "src") return ["media_player", "select_source", { entity_id: a.e, source: a.v }];
  if (a.t === "webos") return Integrations.remote.button(a.e, a.b);
  var e = REMOTE_ACT[dom(a.e)];
  return e ? [e[0], e[1], { entity_id: a.e }] : null;
}

/* A press (of a button or a touch area). An action that cannot run says so; one that fails says so (call shows the error); one that goes through says nothing. A button set to ask first (a garage door) asks before it runs. */
function remotePress(b) {
  /* a remote master may send this button's role to the device on the screen */
  if (b.a && b.a.hook && b.a.hook()) return;
  if (b.hook && b.hook()) return;
  var a = rmAct(b),
    c = a && rmCall(a);
  if (!c) return;
  if (!rmUsable(a)) {
    toast(_T("rm_not_available_right_now"));
    return;
  }
  function run() {
    call(c[0], c[1], c[2]);
  }
  if (b.q) confirmDlg((b.l || A(a.e).friendly_name || a.e) + "?", run);
  else run();
}

/* A key that repeats while it is held (volume, channels): the press at once, then every 160 ms after half a second, until it is let go. */
function rmHold(el, b, after) {
  var timer = 0,
    again = 0;
  function stop() {
    clearTimeout(timer);
    clearInterval(again);
    timer = again = 0;
  }
  el.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    remotePress(b);
    if (after) after();
    timer = setTimeout(function () {
      again = setInterval(function () {
        remotePress(b);
      }, 160);
    }, 500);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
    el.addEventListener(ev, stop);
  });
  /* The keyboard works too, one press per key. */
  el.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      remotePress(b);
    }
  });
}

/* What an action is called, for lists: "KEY_UP · Living TV". */
function rmActName(a) {
  if (!a) return "";
  if (a.t === "room") {
    var vd = RM.vacuum && apFind(RM.vacuum),
      vr = vd && vacapConf(vd.ap).rooms.filter(function (r) { return r.k === a.r; })[0];
    return _T("vacap_room") + " " + ((vr && vr.l) || a.r);
  }
  var who = A(a.e).friendly_name || a.e;
  if (a.t === "key") return a.c + " · " + who;
  if (a.t === "media") return _T(RM_MEDIA_LABEL[a.m]) + " · " + who;
  if (a.t === "src") return _T("rm_source") + " " + a.v + " · " + who;
  if (a.t === "webos") return a.b + " · " + who;
  return who;
}

function rmDefaultIcon(a) {
  if (a.t === "media") return { volume_up: "volup", volume_down: "voldown", volume_mute: "mute", play_pause: "playpause", play: "play", pause: "pause", stop: "stop", next: "next", previous: "prev", turn_on: "power", turn_off: "power", toggle: "power" }[a.m] || "info";
  if (a.t === "src") return "swap";
  return "info";
}

function remoteRow(d) {
  return pill(d.icon || "media", d.name, {
    tap: function () {
      showPopup("remote:" + d.rid, true);
    },
  });
}

/* Text typed for a TV: how it is sent depends on the integration (integrations.js); one that cannot say so. */
function rmSendText(media, text) {
  var e = (H().entities || {})[media] || {},
    p = e.platform;
  function remoteOf() {
    return sibBy(media, function (x) {
      return dom(x.entity_id) === "remote";
    });
  }
  var dv = e.device_id && H().devices[e.device_id],
    own = Integrations.media.textCall(p, media, dv && dv.config_entries && dv.config_entries[0], text);
  if (own) return call(own[0], own[1], own[2]);
  var key = remoteOf() ? Integrations.media.textKey(p, text) : null;
  if (key !== null) return send(remoteOf(), key);
  toast(_T("rm_text_unsupported"));
}

/* ---- the buttons ---- */

function rmSpan(el, x) {
  if (x.s > 1) el.style.gridColumn = "span " + x.s;
  if (x.h > 1) el.style.gridRow = "span " + x.h;
}

/* A five-way pad: four arrows around an OK. Each part runs its own action; a part without one is left out. */
function rmDpad(x, edit, onTap) {
  var pad = mk("div", "rm-dpad pane" + (edit ? " ed" : ""));
  [
    ["u", "up", 1, 2],
    ["l", "left", 2, 1],
    ["o", "", 2, 2],
    ["r", "right", 2, 3],
    ["d", "down", 3, 2],
  ].forEach(function (p) {
    var a = x.a[p[0]],
      cell = mk("div", "rm-dp rm-dp-" + p[0] + (a && !edit && !rmUsable(a) ? " na" : ""), p[1] ? svg(p[1]) : "<span>OK</span>");
    cell.style.gridRow = String(p[2]);
    cell.style.gridColumn = String(p[3]);
    cell.setAttribute("role", "button");
    cell.tabIndex = 0;
    cell.setAttribute("aria-label", p[1] || "OK");
    if (!a) cell.classList.add("none");
    else if (!edit) {
      var b = { a: a };
      if (a.r) rmHold(cell, b);
      else {
        cell.addEventListener("click", function () {
          remotePress(b);
        });
        cell.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            remotePress(b);
          }
        });
      }
    }
    pad.appendChild(cell);
  });
  if (edit) pad.addEventListener("click", onTap);
  rmSpan(pad, x);
  return pad;
}

/* A touchpad: swipe for the arrows (repeating while the finger stays out), tap for OK, hold for the hold action. */
function rmTouch(x, edit, onTap) {
  var t = mk("div", "touch pane rm-touch" + (edit ? " ed" : ""));
  if (edit) {
    t.innerHTML = svg("target");
    t.addEventListener("click", onTap);
  } else
    swipePad(
      t,
      function (d) {
        var a = x.a[{ up: "u", down: "d", left: "l", right: "r" }[d]];
        if (a) remotePress({ a: a });
      },
      function () {
        if (x.a.o) remotePress({ a: x.a.o });
      },
      null,
      x.a.h
        ? function () {
            remotePress({ a: x.a.h });
          }
        : null
    );
  rmSpan(t, x);
  return t;
}

/* A part that shows a media player or a number (now playing, source menu, keyboard, slider). In the builder it is a placeholder that opens its editor. */
function rmComponent(x, edit, onTap) {
  var a = x.a,
    nm = A(a.e).friendly_name || a.e;
  if (edit) {
    var ph = mk("div", "rm-t pane ed", svg(x.i || "info"));
    var l = mk("span", "rm-l");
    l.textContent = _T("rm_c_" + a.t) + " · " + (x.l || nm);
    ph.appendChild(l);
    ph.addEventListener("click", onTap);
    rmSpan(ph, x);
    return ph;
  }
  var el;
  if (a.t === "now") el = nowPlaying(a.e, "tv", a.m === "apps" ? tvSourceMenu(a.e) : null) || mk("div");
  else if (a.t === "source") el = tvSources(a.e);
  else if (a.t === "text") {
    el = mk("div", "rm-t pane", svg(x.i || "keyboard"));
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", x.l || _T("rm_c_text"));
    if (x.l) el.appendChild(mk("span", "rm-l")).textContent = x.l;
    el.addEventListener("click", function () {
      kbDlg(function (v) {
        rmSendText(a.e, v);
      });
    });
  } else if (a.t === "slider" && a.m === "pop") {
    el = numberButton(a.e, "rm:" + a.e);
    el.setAttribute("aria-label", x.l || nm);
  } else {
    var at = A(a.e),
      lo = typeof at.min === "number" ? at.min : 0,
      hi = typeof at.max === "number" && at.max > lo ? at.max : lo + 100;
    el = sliderRow({
      icon: x.i || "bright",
      name: x.l || nm,
      min: lo,
      max: hi,
      step: Number(at.step) || 1,
      get: function () {
        var v = Number(V_(a.e));
        return isNaN(v) ? null : v;
      },
      commit: function (v) {
        call(dom(a.e), "set_value", { entity_id: a.e, value: v });
      },
      readonly: V_(a.e) === "unavailable",
    });
  }
  el.classList.add("rm-comp");
  rmSpan(el, x);
  return el;
}

/* One button of the grid. In use it presses; in the builder (edit) a tap calls onTap. */
function rmTile(x, edit, onTap) {
  if (x.a.t === "dpad") return rmDpad(x, edit, onTap);
  if (x.a.t === "touch") return rmTouch(x, edit, onTap);
  if (["now", "source", "text", "slider"].indexOf(x.a.t) >= 0) return rmComponent(x, edit, onTap);
  if (x.a.t === "gap") {
    var gap = mk("div", "rm-gap" + (edit ? " ed" : ""));
    if (edit) {
      gap.textContent = _T("rm_gap");
      gap.addEventListener("click", onTap);
    }
    rmSpan(gap, x);
    return gap;
  }
  var t = mk("div", "rm-t pane" + (x.k ? " rm-k rm-k-" + x.k : "") + (!edit && !rmUsable(x.a) ? " na" : "") + (edit ? " ed" : "") + (x.i ? "" : " txt"));
  t.setAttribute("role", "button");
  t.tabIndex = 0;
  if (x.i) t.innerHTML = svg(x.i);
  if (x.l || (!x.i && !x.k)) {
    var lab = mk("span", "rm-l");
    lab.textContent = x.l || A(x.a.e).friendly_name || x.a.e;
    t.appendChild(lab);
  }
  t.setAttribute("aria-label", x.l || rmActName(x.a));
  rmSpan(t, x);
  if (edit) t.addEventListener("click", onTap);
  else if (x.a.r) rmHold(t, x);
  else {
    t.addEventListener("click", function () {
      remotePress(x);
    });
    t.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        remotePress(x);
      }
    });
  }
  return t;
}

/* The grid. `tiles` collects each button's element, in order, so the builder can make them draggable. */
function rmGrid(d, edit, onTap, tiles) {
  var rm = d.rm,
    grid = mk("div", "rm-grid");
  grid.style.setProperty("--rc", rm.cols);
  rm.btns.forEach(function (x, i) {
    var t = rmTile(x, edit, function () {
      onTap(i);
    });
    if (tiles) tiles.push(t);
    grid.appendChild(t);
  });
  return grid;
}

/* ---- the picture ---- */

/* The picture layout: the picture of a real remote with touch areas over it. In use a touch area is invisible and glows for a moment when pressed. In the builder a tap on the picture adds a touch area, a touch area is dragged to move and by its corner to resize, and a second tap on the selected one opens it. */
function remotePicture(box, d, edit, redraw) {
  var img = d.rm.img;
  if (!img) return;
  /* an appliance that carries a remote is known by its own id */
  var id = d.rid || d.aid;
  var wrap = mk("div", "rm-img"),
    pic = mk("img");
  pic.src = img.u;
  pic.alt = d.name;
  pic.draggable = false;
  wrap.appendChild(pic);
  var sel = RM.sel && RM.sel.rid === id ? RM.sel.i : -1;
  function place(el, h) {
    el.style.left = h.x + "%";
    el.style.top = h.y + "%";
    el.style.width = h.w + "%";
    el.style.height = h.h + "%";
    el.style.borderRadius = h.r === "ellipse" ? "50%" : "10%";
  }
  img.hs.forEach(function (h, i) {
    var a = rmAct(h),
      t = mk("div", "rm-hs" + (!edit && !rmUsable(a) ? " na" : "") + (edit ? " ed" : "") + (edit && i === sel ? " sel" : ""));
    t.setAttribute("role", "button");
    t.tabIndex = 0;
    t.setAttribute("aria-label", rmActName(a));
    place(t, h);
    if (!edit) {
      var pulse = function () {
        t.classList.add("pulse");
        setTimeout(function () {
          t.classList.remove("pulse");
        }, 400);
      };
      if (a.r) rmHold(t, h, pulse);
      else {
        var press = function () {
          remotePress(h);
          pulse();
        };
        t.addEventListener("click", press);
        t.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            press();
          }
        });
      }
    } else {
      t.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
        e.preventDefault();
        var already = RM.sel && RM.sel.rid === id && RM.sel.i === i;
        RM.sel = { rid: id, i: i };
        var r = wrap.getBoundingClientRect(),
          sx = e.clientX,
          sy = e.clientY,
          ox = h.x,
          oy = h.y,
          moved = false;
        t.setPointerCapture(e.pointerId);
        t.onpointermove = function (m) {
          if (!moved && Math.abs(m.clientX - sx) + Math.abs(m.clientY - sy) < 4) return;
          moved = true;
          h.x = Math.max(0, Math.min(100 - h.w, Math.round((ox + ((m.clientX - sx) / r.width) * 100) * 100) / 100));
          h.y = Math.max(0, Math.min(100 - h.h, Math.round((oy + ((m.clientY - sy) / r.height) * 100) * 100) / 100));
          place(t, h);
        };
        t.onpointerup = t.onpointercancel = function () {
          t.onpointermove = t.onpointerup = t.onpointercancel = null;
          if (moved) uiChanged();
          else if (already) showPopup("remote-btn:" + id + ":h" + i, true);
          redraw();
        };
      });
      if (i === sel) {
        var grip = mk("span", "rm-grip");
        grip.addEventListener("pointerdown", function (e) {
          e.stopPropagation();
          e.preventDefault();
          var r = wrap.getBoundingClientRect(),
            sx = e.clientX,
            sy = e.clientY,
            ow = h.w,
            oh = h.h;
          grip.setPointerCapture(e.pointerId);
          grip.onpointermove = function (m) {
            h.w = Math.max(1, Math.min(100 - h.x, Math.round((ow + ((m.clientX - sx) / r.width) * 100) * 100) / 100));
            h.h = Math.max(1, Math.min(100 - h.y, Math.round((oh + ((m.clientY - sy) / r.height) * 100) * 100) / 100));
            place(t, h);
          };
          grip.onpointerup = grip.onpointercancel = function () {
            grip.onpointermove = grip.onpointerup = grip.onpointercancel = null;
            uiChanged();
            redraw();
          };
        });
        t.appendChild(grip);
      }
    }
    wrap.appendChild(t);
  });
  if (edit)
    wrap.addEventListener("click", function (e) {
      if (e.target !== pic || img.hs.length >= 120) return;
      var r = wrap.getBoundingClientRect(),
        px = ((e.clientX - r.left) / r.width) * 100,
        py = ((e.clientY - r.top) / r.height) * 100;
      rmChooseAction(function (a) {
        var h = { x: Math.max(0, Math.min(88, px - 6)), y: Math.max(0, Math.min(94, py - 3)), w: 12, h: 6, r: "rect", a: a };
        img.hs.push(h);
        RM.sel = { rid: id, i: img.hs.length - 1 };
        uiChanged();
      });
    });
  box.appendChild(wrap);
}

/* ---- using a remote ---- */

/* The popup: the grid or the picture, used. Nothing here edits; the remote is built in the device's settings. */
/* `given`: show this remote (a remote master's copy) instead of looking the id up. */
function remotePage(b, rid, given) {
  var box = mk("div");
  b.appendChild(box);
  var d = given || remoteFind(rid);
  if (!d || !d.rm) return;
  var rm = d.rm;
  if (rm.v === "i" && rm.img) remotePicture(box, d, false, function () {});
  else if (!rm.btns.length) box.appendChild(hintRow(ISADMIN ? _T("rm_no_buttons_yet_admin") : _T("rm_no_buttons_yet")));
  else box.appendChild(rmGrid(d, false, null));
  reg(function () {
    /* A button whose entity became unavailable (or came back) is dimmed (or not) at once. */
    var cur = given || remoteFind(rid);
    if (!cur) return;
    var plain = cur.rm.btns.filter(function (y) {
      return ["gap", "dpad", "touch", "now", "source", "text", "slider"].indexOf(y.a.t) < 0;
    });
    box.querySelectorAll(".rm-t:not(.rm-comp)").forEach(function (t, i) {
      if (plain[i]) t.classList.toggle("na", !rmUsable(plain[i].a));
    });
    box.querySelectorAll(".rm-hs").forEach(function (t, i) {
      var h = cur.rm.img && cur.rm.img.hs[i];
      if (h) t.classList.toggle("na", !rmUsable(rmAct(h)));
    });
  });
}

/* ---- the builder ---- */

/* Where the remote is built: opened from the device's settings. The grid or the picture in editing, and what can be added. */
function remoteBuild(b, rid) {
  var vd = apFind(rid);
  RM.vacuum = vd && vd.ap && vd.ap.type === "vacuum" ? rid : null;
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var d = remoteFind(rid);
    if (!d) return;
    if (!d.rm) d.rm = { cols: 4, btns: [] };
    redrawBox(box, function () {
      var rm = d.rm,
        picture = rm.v === "i";
      box.appendChild(sep(_T("rm_layout"), "tune"));
      box.appendChild(
        seg(
          [
            [false, _T("rm_grid")],
            [true, _T("rm_picture")],
          ],
          picture,
          function (v) {
            if (v) rm.v = "i";
            else delete rm.v;
            uiChanged();
            draw();
          }
        )
      );
      if (picture) {
        rmBuildPicture(box, d, draw);
        return;
      }
      box.appendChild(
        dropRow(
          _T("rm_columns_label"),
          [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(String),
          function () {
            return String(rm.cols);
          },
          function (v) {
            rm.cols = +v;
            rm.btns.forEach(function (x) {
              if (x.s > rm.cols) x.s = rm.cols;
            });
            uiChanged();
            draw();
          },
          "tune"
        )
      );
      box.appendChild(hintRow(_T("rm_columns_hint")));
      box.appendChild(sep(_T("rm_buttons"), "play"));
      var tiles = [];
      if (rm.btns.length) {
        var grid = rmGrid(
          d,
          true,
          function (i) {
            showPopup("remote-btn:" + rid + ":" + i, true);
          },
          tiles
        );
        box.appendChild(grid);
        makeSortable(grid, tiles, function (from, to) {
          rm.btns.splice(to, 0, rm.btns.splice(from, 1)[0]);
          uiChanged();
          draw();
        });
      } else box.appendChild(hintRow(_T("rm_no_buttons_yet_admin")));
      var full = function () {
        if (rm.btns.length < 150) return false;
        toast(_T("rm_too_many"));
        return true;
      };
      function addAction(icon, label, make) {
        return pill(icon, label, {
          tap: function () {
            if (full()) return;
            make();
          },
        });
      }
      /* A part that shows a media player or a number: ask for the entity, then add it. */
      function addPart(icon, label, type, doms, base) {
        return addAction(icon, label, function () {
          pickEntity(label, doms, null, function (id) {
            setTimeout(function () {
              /* The apps menu goes in the now-playing card, as on the dashboard's own TV remotes. */
              var part = { t: type, e: id };
              if (type === "now") part.m = "apps";
              rm.btns.push(Object.assign({ a: part, i: type === "text" ? "keyboard" : type === "slider" ? "bright" : "info", l: "", s: 1, h: 1 }, base));
              uiChanged();
              showPopup(CURRENT, false);
            }, 0);
          });
        });
      }
      stgActions(box, [
        addAction("plus", _T("rm_add_a_button"), function () {
          rmChooseAction(function (a) {
            rm.btns.push({ a: a, i: rmDefaultIcon(a), l: "", s: 1, h: 1 });
            uiChanged();
            return "remote-btn:" + rid + ":" + (rm.btns.length - 1);
          });
        }),
        addAction("tune", _T("rm_add_keys"), function () {
          showPopup("remote-keys:" + rid, true);
        }),
        addAction("plus", _T("rm_add_a_gap"), function () {
          rm.btns.push({ a: { t: "gap" }, i: "info", l: "", s: 1, h: 1 });
          uiChanged();
          draw();
        }),
        addAction("target", _T("rm_add_a_pad"), function () {
          rm.btns.push({ a: { t: "dpad" }, i: "info", l: "", s: Math.min(3, rm.cols), h: 3 });
          uiChanged();
          showPopup("remote-btn:" + rid + ":" + (rm.btns.length - 1), true);
        }),
        addAction("target", _T("rm_add_a_touchpad"), function () {
          rm.btns.push({ a: { t: "touch" }, i: "info", l: "", s: rm.cols, h: 4 });
          uiChanged();
          showPopup("remote-btn:" + rid + ":" + (rm.btns.length - 1), true);
        }),
        addPart("media", _T("rm_add_now_playing"), "now", ["media_player"], { s: rm.cols }),
        addPart("apps", _T("rm_add_a_source_menu"), "source", ["media_player"], { s: Math.min(2, rm.cols) }),
        addPart("keyboard", _T("rm_add_a_keyboard"), "text", ["media_player"], {}),
        addPart("bright", _T("rm_add_a_slider"), "slider", ["number", "input_number"], { s: Math.min(2, rm.cols) }),
      ]);
    });
  }
  draw();
}

/* The picture in the builder: upload one, tap it to add touch areas, drag them. */
function rmBuildPicture(box, d, redraw) {
  var rm = d.rm;
  if (!rm.img) {
    var file = mk("input");
    file.type = "file";
    file.accept = "image/png,image/jpeg,image/webp";
    file.style.display = "none";
    file.addEventListener("change", function () {
      if (!file.files[0]) return;
      HA.remotePictures.upload(file.files[0]).then(
        function (url) {
          rm.img = { u: url, hs: [] };
          rm.v = "i";
          uiChanged();
          redraw();
        },
        function (e) {
          toast((e && e.message) || _T("rm_the_picture_could_not_be_uploaded"));
        }
      );
    });
    box.appendChild(file);
    box.appendChild(
      pill("plus", _T("rm_upload_a_picture"), {
        sub: function () {
          return _T("rm_upload_a_picture_sub");
        },
        tap: function () {
          file.click();
        },
      })
    );
    box.appendChild(
      textRow(
        "edit",
        _T("rm_or_a_file_path"),
        "",
        function (v) {
          if (!v) return;
          var c = cleanRemote({ cols: rm.cols, btns: [], img: { u: v, hs: [] } });
          if (!c.img) {
            toast(_T("rm_that_path_is_not_allowed"));
            return;
          }
          rm.img = c.img;
          rm.v = "i";
          uiChanged();
          redraw();
        },
        150
      )
    );
    return;
  }
  remotePicture(box, d, true, redraw);
  box.appendChild(hintRow(rm.img.hs.length ? _T("rm_touch_areas_hint") : _T("rm_tap_the_picture_to_add_a_touch_area")));
  var del = pill("trash", _T("rm_remove_the_picture"), {
    tap: function () {
      var u = rm.img.u;
      delete rm.img;
      delete rm.v;
      RM.sel = null;
      uiChanged();
      if (/^\/home_control_remotes\//.test(u)) HA.remotePictures.remove(u).catch(function () {});
      redraw();
    },
  });
  stgActions(box, [del], [del]);
}

/* ---- choosing what a button does ---- */

/* Asks for the entity, then what to do with it (a key for a remote entity, a control or a source for a media player), and gives the action to `done`. `done` changes the data and may give the key of a popup to open next;
   otherwise the popup the choice was started from is drawn again with the change. (The list of entities goes back by itself after its callback, so what follows waits until it has.) */
function rmChooseAction(done) {
  function finish(a) {
    var next = done(a);
    if (next) showPopup(next, true);
    else if (CURRENT) showPopup(CURRENT, false);
  }
  /* On a robot vacuum's picture (its map) an area picks one of its rooms. */
  var vacap = RM.vacuum && apFind(RM.vacuum);
  if (vacap) {
    VACAPPICK = { rooms: vacapConf(vacap.ap).rooms, done: finish };
    showPopup("vacap-pick", true);
    return;
  }
  pickEntity(_T("rm_choose_what_the_button_runs"), REMOTE_PICK_DOMS, null, function (id) {
    var d = dom(id);
    setTimeout(function () {
      if (d === "remote" || d === "media_player") {
        RM.keys = {
          e: id,
          done: function (a) {
            popBack();
            finish(a);
          },
        };
        showPopup((d === "remote" ? "remote-key:" : "remote-media:") + id, true);
      } else finish({ t: "ent", e: id });
    }, 0);
  });
}

/* The keys a remote entity can send, by group: the integration's list (ready to tap) and any other key typed in. The chosen key goes to RM.keys.done as an action. */
function remoteKeyPage(b, id) {
  var K = RM.keys;
  if (!K || K.e !== id) return;
  var fam = Integrations.remote.family(((H().entities || {})[id] || {}).platform),
    groups = Integrations.remote.groups(fam);
  b.appendChild(hintRow(fam ? _T("rm_keys_of") + " " + Integrations.remote.label(fam) : _T("rm_keys_unknown")));
  groups.forEach(function (g) {
    b.appendChild(sep(_T("rm_g_" + g[0]), "play"));
    var grid = mk("div", "ap-grid");
    g[1].forEach(function (k) {
      grid.appendChild(
        pill(k[2] || "info", k[1] || k[0], {
          sub: function () {
            return k[0];
          },
          tap: function () {
            K.done({ t: "key", e: id, c: k[0] });
          },
        })
      );
    });
    b.appendChild(grid);
  });
  b.appendChild(sep(_T("rm_other_key"), "edit"));
  b.appendChild(hintRow(_T("rm_other_key_hint")));
  b.appendChild(
    textRow(
      "edit",
      _T("rm_type_a_key"),
      "",
      function (v) {
        if (v) K.done({ t: "key", e: id, c: v });
      },
      40
    )
  );
}

/* What to do with a media player: a control, a source (from its list) or, for an LG webOS TV, a button. */
function remoteMediaPage(b, id) {
  var K = RM.keys;
  if (!K || K.e !== id) return;
  b.appendChild(sep(_T("rm_control"), "play"));
  var grid = mk("div", "ap-grid");
  Object.keys(RM_MEDIA_SVC).forEach(function (m) {
    grid.appendChild(
      pill(rmDefaultIcon({ t: "media", m: m }), _T(RM_MEDIA_LABEL[m]), {
        tap: function () {
          K.done({ t: "media", e: id, m: m });
        },
      })
    );
  });
  b.appendChild(grid);
  var src = A(id).source_list;
  if (Array.isArray(src) && src.length) {
    b.appendChild(sep(_T("rm_source"), "swap"));
    src.slice(0, 40).forEach(function (s) {
      b.appendChild(
        pill("swap", String(s), {
          tap: function () {
            K.done({ t: "src", e: id, v: String(s) });
          },
        })
      );
    });
  }
  if (Integrations.remote.family(((H().entities || {})[id] || {}).platform) === "webos")
    Integrations.remote.groups("webos").forEach(function (g) {
      b.appendChild(sep(_T("rm_g_" + g[0]), "play"));
      var gr = mk("div", "ap-grid");
      g[1].forEach(function (k) {
        gr.appendChild(
          pill(k[2] || "info", k[1] || k[0], {
            sub: function () {
              return k[0];
            },
            tap: function () {
              K.done({ t: "webos", e: id, b: k[0] });
            },
          })
        );
      });
      b.appendChild(gr);
    });
}

/* ---- a ready-made set of keys ---- */

/* Adds the keys of an integration to the grid: pick the remote entity (for LG webOS the media player), tick the keys, add them. The first five navigation keys can go in as one five-way pad. */
function remoteKeysPage(b, rid) {
  var d = remoteFind(rid);
  if (!d) return;
  var rm = d.rm,
    st = RM.keysSet && RM.keysSet.rid === rid ? RM.keysSet : (RM.keysSet = { rid: rid, e: "", picked: {} }),
    box = mk("div");
  b.appendChild(box);
  function draw() {
    redrawBox(box, function () {
      var fam = st.e ? Integrations.remote.family(((H().entities || {})[st.e] || {}).platform) : "",
        webos = fam === "webos",
        groups = Integrations.remote.groups(fam),
        mkAct = function (k) {
          return webos ? { t: "webos", e: st.e, b: k[0] } : { t: "key", e: st.e, c: k[0] };
        };
      box.appendChild(
        pill("plug", st.e ? A(st.e).friendly_name || st.e : _T("rm_choose_the_remote_entity"), {
          sub: function () {
            return st.e ? (fam ? Integrations.remote.label(fam) : _T("rm_keys_unknown_short")) : "";
          },
          tap: function () {
            pickEntity(_T("rm_choose_the_remote_entity"), ["remote", "media_player"], null, function (id) {
              st.e = id;
              st.picked = {};
            });
          },
        })
      );
      if (!st.e) return;
      if (dom(st.e) !== (webos ? "media_player" : "remote")) {
        box.appendChild(hintRow(webos ? _T("rm_needs_media_player") : _T("rm_needs_remote_entity")));
        return;
      }
      if (!groups.length) {
        box.appendChild(hintRow(_T("rm_keys_unknown")));
        return;
      }
      groups.forEach(function (g) {
        box.appendChild(sep(_T("rm_g_" + g[0]), "play"));
        var all = g[1].every(function (k) {
          return st.picked[k[0]];
        });
        stgActions(box, [
          pill(all ? "check" : "plus", all ? _T("rm_untick_all") : _T("rm_tick_all"), {
            tap: function () {
              g[1].forEach(function (k) {
                if (all) delete st.picked[k[0]];
                else st.picked[k[0]] = 1;
              });
              draw();
            },
          }),
        ]);
        var keys = mk("div", "ap-grid");
        g[1].forEach(function (k) {
          keys.appendChild(
            pill(k[2] || "info", k[1] || k[0], {
              on: function () {
                return !!st.picked[k[0]];
              },
              sub: function () {
                return k[0];
              },
              tap: function () {
                if (st.picked[k[0]]) delete st.picked[k[0]];
                else st.picked[k[0]] = 1;
                draw();
              },
            })
          );
        });
        box.appendChild(keys);
      });
      var n = Object.keys(st.picked).length,
        nav = groups.filter(function (g) {
          return g[0] === "nav";
        })[0],
        acts = [
          pill("check", n ? _T("rm_add_selected") + " (" + n + ")" : _T("rm_add_selected"), {
            tap: function () {
              if (!n) return toast(_T("rm_tick_some_keys"));
              groups.forEach(function (g) {
                g[1].forEach(function (k) {
                  if (!st.picked[k[0]] || rm.btns.length >= 150) return;
                  var a = mkAct(k);
                  if (g[0] === "volume" && /UP|DOWN|up|down/.test(k[0])) a.r = 1;
                  /* A TV's power key needs the TV to listen: its media player is turned on instead while it is off. */
                  var mp = !webos && fam === "samsung" && /POWER$/.test(k[0]) ? sibBy(st.e, function (x) { return dom(x.entity_id) === "media_player"; }) : "";
                  if (mp) a.w = mp;
                  var btn = { a: a, i: k[2], l: k[3] ? "" : k[1], s: 1, h: 1 };
                  if (k[3]) btn.k = k[3];
                  rm.btns.push(btn);
                });
              });
              st.picked = {};
              uiChanged();
              popBack();
            },
          }),
        ];
      if (nav && nav[1].length >= 5)
        acts.push(
          pill("target", _T("rm_add_a_pad_of_these"), {
            tap: function () {
              if (rm.btns.length >= 150) return toast(_T("rm_too_many"));
              var pad = { t: "dpad" };
              nav[1].slice(0, 5).forEach(function (k, i) {
                pad["udlro"[i]] = mkAct(k);
                if (i < 4 && !webos) pad["udlro"[i]].r = 1;
              });
              rm.btns.push({ a: pad, i: "info", l: "", s: Math.min(3, rm.cols), h: 3 });
              uiChanged();
              popBack();
            },
          })
        );
      if (nav && nav[1].length >= 5)
        acts.push(
          pill("target", _T("rm_add_a_touchpad_of_these"), {
            tap: function () {
              if (rm.btns.length >= 150) return toast(_T("rm_too_many"));
              var tp = { t: "touch" };
              nav[1].slice(0, 5).forEach(function (k, i) {
                tp["udlro"[i]] = mkAct(k);
              });
              /* A hold on the touchpad holds OK. */
              tp.h = Object.assign({}, tp.o, webos ? {} : { hs: 1 });
              rm.btns.push({ a: tp, i: "info", l: "", s: rm.cols, h: 4 });
              uiChanged();
              popBack();
            },
          })
        );
      stgActions(box, acts);
    });
  }
  draw();
}

/* ---- one button ---- */

/* The editor of a button of the grid ("5") or of a touch area of the picture ("h5"): what it does, how it looks, its size, and where it sits. */
function remoteBtnPage(b, key) {
  var p = key.split(":"),
    rid = p[0],
    hot = p[1].charAt(0) === "h",
    i = +p[1].replace("h", ""),
    d = remoteFind(rid),
    list = d && (hot ? d.rm.img && d.rm.img.hs : d.rm.btns),
    x = list && list[i];
  if (!x) return;
  var box = mk("div");
  b.appendChild(box);
  function save() {
    uiChanged();
  }
  function remove() {
    return pill("trash", _T(hot ? "rm_remove_touch_area" : "rm_remove_button"), {
      tap: function () {
        list.splice(i, 1);
        RM.sel = null;
        save();
        popBack();
      },
    });
  }
  function moveRows() {
    return [
      [_T("rm_move_earlier"), -1, "up"],
      [_T("rm_move_later"), 1, "down"],
    ].map(function (m) {
      return pill(m[2], m[0], {
        tap: function () {
          var j = i + m[1];
          if (j < 0 || j >= list.length) return;
          list.splice(j, 0, list.splice(i, 1)[0]);
          save();
          popBack();
        },
      });
    });
  }
  function sizeRows() {
    box.appendChild(sep(_T("rm_size_and_place"), "tune"));
    var g = mk("div", "ap-grid");
    g.appendChild(
      dropRow(
        _T("rm_width"),
        Array.from({ length: d.rm.cols }, function (_, k) {
          return String(k + 1);
        }),
        function () {
          return String(Math.min(x.s, d.rm.cols));
        },
        function (v) {
          x.s = +v;
          save();
        },
        "swap"
      )
    );
    g.appendChild(
      dropRow(
        _T("rm_height"),
        ["1", "2", "3", "4", "5", "6", "7", "8"],
        function () {
          return String(x.h || 1);
        },
        function (v) {
          x.h = +v;
          save();
        },
        "swap"
      )
    );
    box.appendChild(g);
  }
  function ending() {
    var rows = hot ? [] : moveRows(),
      rm = remove();
    rows.push(rm);
    stgActions(box, rows, [rm]);
  }
  /* The action: what it is, whether it repeats while held, whether it asks first. */
  function actionRows(a) {
    box.appendChild(
      pill("plug", rmActName(a), {
        sub: function () {
          return _T("rm_change_what_it_does");
        },
        tap: function () {
          rmChooseAction(function (n) {
            x.a = n;
            delete x.e;
            if (!hot && !x.i && !x.l) x.i = rmDefaultIcon(n);
            save();
          });
        },
      })
    );
    if (a.t === "room") return;
    var sw = [];
    if (["key", "media", "webos"].indexOf(a.t) >= 0)
      sw.push(
        pill("repeat", _T("rm_repeat_while_held"), {
          on: function () {
            return !!a.r;
          },
          sub: function () {
            return a.r ? _T("on_cap") : _T("off");
          },
          tap: function () {
            if (a.r) delete a.r;
            else a.r = 1;
            save();
            draw();
          },
        })
      );
    sw.push(
      pill("alert", _T("rm_ask_first"), {
        on: function () {
          return !!x.q;
        },
        sub: function () {
          return x.q ? _T("on_cap") : _T("off");
        },
        tap: function () {
          if (x.q) delete x.q;
          else x.q = 1;
          save();
          draw();
        },
      })
    );
    stgActions(box, sw);
    if (a.t === "key") {
      var kx = [
        pill("clock", _T("rm_hold_the_key"), {
          on: function () {
            return !!a.hs;
          },
          sub: function () {
            return a.hs ? a.hs + " s" : _T("off");
          },
          tap: function () {
            if (a.hs) delete a.hs;
            else a.hs = 1;
            save();
            draw();
          },
        }),
        pill("power", _T("rm_wake_a_player"), {
          on: function () {
            return !!a.w;
          },
          sub: function () {
            return a.w ? A(a.w).friendly_name || a.w : _T("rm_wake_a_player_sub");
          },
          tap: function () {
            if (a.w) {
              delete a.w;
              save();
              draw();
              return;
            }
            pickEntity(_T("rm_wake_a_player"), ["media_player"], null, function (id) {
              a.w = id;
              save();
            });
          },
        }),
      ];
      stgActions(box, kx);
    }
  }
  /* A part that shows a media player or a number: which one, how it is called, and its size. */
  function compEditor(a) {
    box.appendChild(sep(_T("rm_what_it_does"), "play"));
    box.appendChild(
      pill("plug", A(a.e).friendly_name || a.e, {
        sub: function () {
          return _T("rm_c_" + a.t) + " · " + _T("rm_change_what_it_does");
        },
        tap: function () {
          pickEntity(_T("rm_choose_the_entity"), a.t === "slider" ? ["number", "input_number"] : ["media_player"], null, function (id) {
            a.e = id;
            save();
          });
        },
      })
    );
    if (a.t === "now")
      box.appendChild(
        pill("apps", _T("rm_apps_in_the_card"), {
          on: function () {
            return a.m === "apps";
          },
          sub: function () {
            return a.m === "apps" ? _T("rm_apps_in_the_card_on") : _T("rm_apps_in_the_card_off");
          },
          tap: function () {
            if (a.m === "apps") delete a.m;
            else a.m = "apps";
            save();
            draw();
          },
        })
      );
    if (a.t === "slider")
      box.appendChild(
        pill("bright", _T("rm_slider_as_button"), {
          on: function () {
            return a.m === "pop";
          },
          sub: function () {
            return a.m === "pop" ? _T("rm_slider_as_button_on") : _T("rm_slider_as_button_off");
          },
          tap: function () {
            if (a.m === "pop") delete a.m;
            else a.m = "pop";
            save();
            draw();
          },
        })
      );
    if (a.t === "slider" || a.t === "text")
      box.appendChild(
        textRow(
          "edit",
          _T("rm_label"),
          x.l,
          function (v) {
            x.l = v ? v.slice(0, 24) : "";
            save();
          },
          24
        )
      );
    sizeRows();
    ending();
  }
  /* A five-way pad or a touchpad: the action of each of its parts. */
  function padEditor() {
    var pad = x.a;
    box.appendChild(sep(_T("rm_pad_parts"), "target"));
    [
      ["u", "up", "rm_pad_up"],
      ["d", "down", "rm_pad_down"],
      ["l", "left", "rm_pad_left"],
      ["r", "right", "rm_pad_right"],
      ["o", "info", "rm_pad_ok"],
    ]
      .concat(pad.t === "touch" ? [["h", "target", "rm_pad_hold"]] : [])
      .forEach(function (pt) {
      box.appendChild(
        pill(pt[1], _T(pt[2]), {
          sub: function () {
            return pad[pt[0]] ? rmActName(pad[pt[0]]) : _T("rm_not_set");
          },
          tap: function () {
            rmChooseAction(function (n) {
              pad[pt[0]] = n;
              save();
            });
          },
        })
      );
    });
    if (pad.t === "touch" && pad.h && pad.h.t === "key")
      box.appendChild(
        pill("clock", _T("rm_hold_the_key"), {
          on: function () {
            return !!pad.h.hs;
          },
          sub: function () {
            return pad.h.hs ? pad.h.hs + " s" : _T("off");
          },
          tap: function () {
            if (pad.h.hs) delete pad.h.hs;
            else pad.h.hs = 1;
            save();
            draw();
          },
        })
      );
    var arrows = ["u", "d", "l", "r"].filter(function (k) {
        return pad[k] && pad[k].t !== "ent" && pad[k].t !== "src";
      }),
      rep = arrows.length > 0 && arrows.every(function (k) {
        return pad[k].r;
      });
    if (arrows.length)
      box.appendChild(
        pill("repeat", _T("rm_repeat_while_held"), {
          on: function () {
            return rep;
          },
          sub: function () {
            return _T("rm_repeat_arrows");
          },
          tap: function () {
            arrows.forEach(function (k) {
              if (rep) delete pad[k].r;
              else pad[k].r = 1;
            });
            save();
            draw();
          },
        })
      );
    sizeRows();
    ending();
  }
  function draw() {
    redrawBox(box, function () {
      var a = rmAct(x);
      if (!hot && a.t === "gap") {
        box.appendChild(hintRow(_T("rm_gap_hint")));
        sizeRows();
        ending();
        return;
      }
      if (!hot && (a.t === "dpad" || a.t === "touch")) return padEditor();
      if (!hot && ["now", "source", "text", "slider"].indexOf(a.t) >= 0) return compEditor(a);
      if (!hot) {
        stgIdentity(
          box,
          textRow(
            "edit",
            _T("rm_label"),
            x.l,
            function (v) {
              x.l = v ? v.slice(0, 24) : "";
              if (!x.l && !x.i) x.i = "info";
              save();
            },
            24
          ),
          iconPick(DEVICONS, x.i || "", function (n) {
            x.i = n;
            save();
          })
        );
        box.appendChild(
          dropRow(
            _T("rm_colour"),
            ["", "red", "green", "yellow", "blue"],
            function () {
              return x.k || "";
            },
            function (v) {
              if (v) x.k = v;
              else delete x.k;
              save();
            },
            "palette",
            function (v) {
              return _T(v ? "rm_c_" + v : "rm_c_none");
            }
          )
        );
      } else
        box.appendChild(
          seg(
            [
              ["rect", _T("rm_rectangle")],
              ["ellipse", _T("rm_ellipse")],
            ],
            x.r,
            function (v) {
              x.r = v;
              save();
              draw();
            }
          )
        );
      box.appendChild(sep(_T("rm_what_it_does"), "play"));
      actionRows(a);
      if (!hot) sizeRows();
      ending();
    });
  }
  draw();
}
