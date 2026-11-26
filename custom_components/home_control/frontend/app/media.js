/* Media players: the TV and Apple TV remotes, now-playing, the media hub and the media popup. */

function send(remote, cmd, holdSecs) {
  var data = { entity_id: remote, command: cmd };
  if (holdSecs) data.hold_secs = holdSecs;
  call("remote", "send_command", data);
}

function artCard(id, icon) {
  var c = mk(
      "div",
      "art pane",
      "<div class='art-img'></div><div class='art-t'></div><div class='art-a'></div>"
    ),
    im = c.querySelector(".art-img"),
    t1 = c.querySelector(".art-t"),
    a1 = c.querySelector(".art-a"),
    last = "";
  c.refresh = function () {
    var a = A(id),
      s = V_(id),
      pic = a.entity_picture_local || a.entity_picture || "";
    if (pic !== last) {
      last = pic;
      im.innerHTML = "";
      if (typeof pic === "string" && /^(\/(?!\/)|https:\/\/)/.test(pic)) {
        var i = new Image();
        i.alt = "";
        i.onerror = function () {
          im.innerHTML = svg(icon);
        };
        i.src = pic;
        im.appendChild(i);
      } else im.innerHTML = svg(icon);
    }
    var ti = typeof a.media_title === "string" ? a.media_title.trim() : "",
      ar = typeof a.media_artist === "string" ? a.media_artist.trim() : "";
    t1.textContent =
      ti ||
      (s === "playing"
        ? _T("playing")
        : s === "paused"
          ? _T("paused")
          : s === "off"
            ? _T("off")
            : s === "unavailable"
              ? _T("unavailable")
              : _T("nothing_playing"));
    a1.textContent = ar || (s !== "off" && s !== "unavailable" && a.source ? a.source : "");
  };
  reg(c.refresh);
  return c;
}

/* The now-playing block of a remote popup, as the device's Now playing setting says: nothing (off), a row with the title (on), or the artwork card. */
/* A remote master's combined view (app/remotemaster.js) may take a key for the player on the screen: true when it did. A remote on its own has no hooks. */
function rmo(hooks, role, arg) {
  return !!(hooks && hooks.ovr && hooks.ovr(role, arg));
}

function playingBlock(b, hooks, id, icon, onTap) {
  if (hooks && hooks.np) hooks.np(b, id, icon, onTap);
  else addNowPlaying(b, id, icon, onTap);
}

function addNowPlaying(b, id, icon, onTap) {
  var np = nowPlaying(id, icon, onTap);
  if (np) b.appendChild(np);
  return np;
}

/* A player's now playing style: "on" (a row), "off" or "art" (the artwork card); a remote master may say another than the page. */
function npMode(id) {
  var u = UIDEV[id] || {};
  return (typeof RMNP === "object" && RMNP[id]) || (u.art ? "art" : u.nonp ? "off" : "on");
}

function nowPlaying(id, icon, onTap) {
  if (npMode(id) === "off") return null;
  if (npMode(id) === "art") return artCard(id, icon);
  var p = pill(icon, _T("now_playing"), {
    tap: onTap
      ? function () {
          onTap(p);
        }
      : undefined,
    sub: function () {
      var a = A(id);
      var t = typeof a.media_title === "string" ? a.media_title.trim() : "";
      var ar = typeof a.media_artist === "string" ? a.media_artist.trim() : "";
      if (t && ar) return t + " · " + ar;
      if (t) return t;
      if (ar) return ar;
      var s = V_(id);
      if (s !== "off" && s !== "unavailable" && a.source) return a.source;
      if (s === "unavailable") return _T("unavailable");
      if (s === "playing") return _T("playing");
      if (s === "paused") return _T("paused");
      if (s === "off") return _T("off");
      return _T("nothing_playing");
    },
  });
  if (onTap) p.appendChild(mk("span", "chev", svg("chev")));
  return p;
}

/* Swipe or hold on an element: the direction dragged is sent at once and repeated while the finger stays out; a short tap is passed on. A stationary 450 ms hold gets its own action. Used by the TV touchpad and by the camera picture. */
function swipePad(t, fire, onTap, onDir, onHold) {
  var sx = 0,
    sy = 0,
    down = false,
    moved = false,
    held = false,
    pressedAt = 0,
    dir = null,
    delay = null,
    rep = null,
    hold = null;
  function stop() {
    clearTimeout(delay);
    clearInterval(rep);
    delay = null;
    rep = null;
  }
  function setDir(d) {
    if (d === dir) return;
    stop();
    dir = d;
    if (onDir) onDir(d);
    if (!d) return;
    fire(d);
    delay = setTimeout(function () {
      rep = setInterval(function () {
        fire(d);
      }, 130);
    }, 380);
  }
  function stopHold() {
    clearTimeout(hold);
    hold = null;
  }
  t.addEventListener("pointerdown", function (e) {
    /* Touch pointers do not consistently report button 0 across browsers. */
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    down = true;
    moved = false;
    held = false;
    dir = null;
    sx = e.clientX;
    sy = e.clientY;
    pressedAt = Date.now();
    capturePointer(t, e);
    stopHold();
    if (onHold)
      hold = setTimeout(function () {
        if (!down || moved) return;
        held = true;
        onHold();
      }, 450);
  });
  t.addEventListener("pointermove", function (e) {
    if (!down || held) return;
    e.preventDefault();
    var dx = e.clientX - sx,
      dy = e.clientY - sy;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
      if (moved) setDir(null);
      return;
    }
    stopHold();
    moved = true;
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  });
  t.addEventListener("pointerup", function (e) {
    if (!down) return;
    e.preventDefault();
    down = false;
    stop();
    stopHold();
    if (onDir) onDir(null);
    /* A release at the hold boundary can arrive before a delayed browser timer.
       Preserve the same 450 ms threshold and action rather than turning that
       gesture into a normal click. */
    if (!moved && !held && onHold && Date.now() - pressedAt >= 450) {
      held = true;
      onHold();
    }
    if (!moved && !held && onTap) onTap();
    dir = null;
  });
  t.addEventListener("pointercancel", function () {
    down = false;
    stop();
    stopHold();
    if (onDir) onDir(null);
    dir = null;
  });
  t.addEventListener("lostpointercapture", function () {
    if (!down) return;
    down = false;
    stop();
    stopHold();
    if (onDir) onDir(null);
    dir = null;
  });
}

function touchpad(remote, keys, onHold, hooks) {
  var t = mk("div", "touch pane");
  swipePad(
    t,
    function (d) {
      if (!rmo(hooks, "dir", d)) send(remote, keys[d]);
    },
    function () {
      if (!rmo(hooks, "ok")) send(remote, keys.ok);
    },
    null,
    function () {
      if (rmo(hooks, "hold")) return;
      if (onHold) onHold();
      else send(remote, keys.ok, 1);
    }
  );
  return t;
}

/* A bottom sheet that asks for some text: a field (a few lines tall), the button that takes it (`label`) and Cancel. Empty text is not taken, and a stray tap outside does not throw away what was typed. */
function textDlg(placeholder, value, label, take, rows) {
  var ta = mk("textarea");
  ta.rows = rows || 3;
  ta.setAttribute("enterkeyhint", "send");
  ta.placeholder = placeholder;
  ta.value = value || "";
  var closeIt = null;
  function submit() {
    var v = ta.value;
    if (!v.trim()) {
      ta.focus();
      return;
    }
    take(v);
    closeIt();
  }
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  closeIt = bottomSheet(
    function (box, close) {
      var wrap = mk("div", "as-t");
      wrap.appendChild(ta);
      box.appendChild(wrap);
      var ok = mk("div", "as-b");
      ok.setAttribute("role", "button");
      ok.textContent = label;
      ok.addEventListener("click", submit);
      var no = mk("div", "as-b cancel");
      no.setAttribute("role", "button");
      no.textContent = _T("cancel");
      no.addEventListener("click", close);
      box.appendChild(ok);
      box.appendChild(no);
    },
    function () {
      return ta.value !== (value || "");
    }
  );
  setTimeout(function () {
    ta.focus();
  }, 380);
}

/* Text for the TV's keyboard: sent only on Send, since sending every keystroke left half-typed text on the TV when the dialog closed mid-typing. */
function kbDlg(sendText) {
  textDlg(_T("type_to_send_to_the_tv"), "", _T("send_btn"), sendText, 3);
}

/* The apps and inputs a TV can switch to: the source list of its media player. */
function tvSourceList(id) {
  var l = A(id).source_list;
  return Array.isArray(l)
    ? l.filter(function (x) {
        return typeof x === "string" && x;
      })
    : [];
}

function tvPickSource(id, v) {
  call("media_player", "select_source", { entity_id: id, source: v });
}

/* Where the apps go depends on the Now playing setting of the TV: as the artwork or off, a dropdown beside Power; as the normal row, the row itself opens the dropdown and the cell beside Power stays empty. */
function tvAppsInNowPlaying(id) {
  return npMode(id) === "on";
}

/* Tapping the now-playing card opens the TV's apps and inputs, when they are in the card instead of a row of their own. */
function tvSourceMenu(media) {
  return function (row) {
    var o = tvSourceList(media);
    if (o.length)
      openMenu(
        row,
        o,
        A(media).source,
        function (v) {
          tvPickSource(media, v);
        },
        String
      );
  };
}

function tvSources(id) {
  var r = selectTile(
    _T("apps"),
    function () {
      return tvSourceList(id);
    },
    function () {
      return A(id).source;
    },
    function (v) {
      tvPickSource(id, v);
    },
    "apps",
    String
  );
  r.classList.add("tvsrc");
  return r;
}

/* The round brightness button of the light popup (its slider rises from the button) for any number entity, on the number's own scale: a TV's backlight, a projector's lamp. It does nothing while the number is unavailable. `key` names its live updates. */
function numberButton(num, key) {
  var cell = mk("div", "tvbri");
  function range() {
    var a = A(num),
      lo = typeof a.min === "number" ? a.min : 0,
      hi = typeof a.max === "number" && a.max > lo ? a.max : lo + 100;
    return [lo, hi];
  }
  function usable() {
    return V_(num) !== "unavailable" && V_(num) !== "unknown";
  }
  function toValue(pct) {
    var r = range();
    return Math.round(r[0] + (pct / 100) * (r[1] - r[0]));
  }
  cell.appendChild(
    briControl({
      pct: function () {
        var r = range(),
          v = parseFloat(V_(num));
        return usable() && isFinite(v) ? Math.max(0, Math.min(100, Math.round(((v - r[0]) / (r[1] - r[0])) * 100))) : 0;
      },
      lit: usable,
      fmt: toValue,
      live: function (v) {
        if (usable()) callLive(key, dom(num), "set_value", { entity_id: num, value: toValue(v) });
      },
      commit: function (v) {
        if (usable()) call(dom(num), "set_value", { entity_id: num, value: toValue(v) });
      },
      stage: function () {
        return null;
      },
    })
  );
  return cell;
}

/* The TV's own screen brightness: on a Samsung that is its Backlight number (its Brightness number is the black level), in the cell under Home. Left empty when the TV has no Backlight number. */
function tvBrightness(media) {
  var num = sibBy(media, function (e) {
    return dom(e.entity_id) === "number" && (e.name === "Backlight" || /_backlight$/.test(e.entity_id));
  });
  return num ? numberButton(num, "tv:" + media) : mk("div", "tvbri");
}

function samsungRemote(b, remote, media, hooks) {
  var inRow = rappsInRow(media);
  playingBlock(b, hooks, media, "tv", inRow ? tvSourceMenu(media) : undefined);
  /* A key of the TV's remote, for one button: a remote master may give its role to the device on the screen. */
  function key(k, role) {
    return function () {
      if (!role || !rmo(hooks, role)) send(remote, k);
    };
  }
  var r1 = mk(
    "div",
    "rrow"
  ); /* KEY_POWER goes over the TV's network socket, which is closed while the TV is off; turn_on uses the integration's wake path instead. */
  r1.appendChild(
    rkey(media, "power", function () {
      if (V_(media) === "off") call("media_player", "turn_on", { entity_id: media });
      else send(remote, "KEY_POWER");
    })
  );
  if (!inRow) {
    var apps = rapps(media, true);
    if (apps) r1.appendChild(apps);
  }
  b.appendChild(r1);
  if (hooks) hooks.beside(b, r1);
  var platform = (H().entities[media] || {}).platform,
    r2 = mk("div", "rrow");
  r2.appendChild(rkey(media, "settings", key(Integrations.media.samsungSettingsKey(platform), "settings"), hooks));
  r2.appendChild(rkey(media, "mute", key("KEY_MUTE"), hooks));
  r2.appendChild(
    rkeyboard(
      media,
      Integrations.media.samsungCanType(platform)
        ? function (v) {
            call.apply(null, Integrations.media.samsungText(media, v));
          }
        : null,
      hooks
    )
  );
  b.appendChild(r2);
  b.appendChild(
    touchpad(remote, {
      ok: "KEY_ENTER",
      up: "KEY_UP",
      down: "KEY_DOWN",
      left: "KEY_LEFT",
      right: "KEY_RIGHT",
    }, function () {
      call("media_player", "play_media", {
        entity_id: media,
        media_content_type: "send_key",
        media_content_id: "KEY_ENTER, 900",
      });
    }, hooks)
  );
  var r3 = mk("div", "rrow");
  r3.appendChild(rkey(media, "back", key("KEY_RETURN", "back"), hooks));
  r3.appendChild(rkey(media, "home", key("KEY_HOME", "home"), hooks));
  r3.appendChild(
    rkey(media, "playpause", function () {
      if (!rmo(hooks, "playpause")) call("media_player", "media_play_pause", { entity_id: media });
    }, hooks)
  );
  b.appendChild(r3);
  var r4 = mk("div", "rrow");
  var l = mk("div", "rstack"),
    rr = mk("div", "rstack");
  l.appendChild(rkey(media, "volup", key("KEY_VOLUP"), hooks, "", true));
  l.appendChild(rkey(media, "voldown", key("KEY_VOLDOWN"), hooks, "", true));
  rr.appendChild(rkey(media, "chup", key("KEY_CHUP"), hooks, "CH", true));
  rr.appendChild(rkey(media, "chdown", key("KEY_CHDOWN"), hooks, "CH", true));
  r4.appendChild(l);
  r4.appendChild(rbright(media));
  r4.appendChild(rr);
  b.appendChild(r4);
}

function appleRemote(b, remote, media, tvRemote, entry, hooks) {
  playingBlock(b, hooks, media, "apple");
  function key(k, role) {
    return function () {
      if (!role || !rmo(hooks, role)) send(remote, k);
    };
  }
  var r1 = mk("div", "rrow");
  r1.appendChild(
    rkey(media, "power", function () {
      send(remote, V_(media) === "off" ? "wakeup" : "suspend");
    })
  );
  var apps = rapps(media, false);
  if (apps) r1.appendChild(apps);
  b.appendChild(r1);
  if (hooks) hooks.beside(b, r1);
  var r2 = mk("div", "rrow");
  r2.appendChild(rkey(media, "settings", key("control_center", "settings"), hooks));
  /* The Apple TV remote sends no mute key: the TV in the room mutes, else the player's own mute where it says it has one. */
  r2.appendChild(
    rkey(
      media,
      "mute",
      tvRemote
        ? function () {
            send(tvRemote, "KEY_MUTE");
          }
        : tvLacks(media, 8)
          ? null
          : function () {
              call("media_player", "volume_mute", {
                entity_id: media,
                is_volume_muted: !A(media).is_volume_muted,
              });
            },
      hooks
    )
  );
  r2.appendChild(
    rkeyboard(
      media,
      entry
        ? function (v) {
            call.apply(null, Integrations.media.appleText(entry, v));
          }
        : null,
      hooks
    )
  );
  b.appendChild(r2);
  b.appendChild(
    touchpad(remote, { ok: "select", up: "up", down: "down", left: "left", right: "right" }, undefined, hooks)
  );
  var r3 = mk("div", "rrow");
  r3.appendChild(rkey(media, "back", key("menu", "back"), hooks));
  r3.appendChild(rkey(media, "home", key("home", "home"), hooks));
  r3.appendChild(rkey(media, "playpause", key("play_pause", "playpause"), hooks));
  b.appendChild(r3);
  var r4 = mk("div", "rrow"),
    l = mk("div", "rstack"),
    rr = mk("div", "rstack");
  l.appendChild(rkey(media, "volup", key("volume_up"), hooks, "", true));
  l.appendChild(rkey(media, "voldown", key("volume_down"), hooks, "", true));
  /* no channel keys of its own: they show when another integration is given for them */
  rr.appendChild(rkey(media, "chup", null, hooks, "CH", true));
  rr.appendChild(rkey(media, "chdown", null, hooks, "CH", true));
  r4.appendChild(l);
  r4.appendChild(rbright(media));
  r4.appendChild(rr);
  b.appendChild(r4);
}

/* ---- Media hub ----
 Every media player on the dashboard, by room: what is playing, transport, volume and input, using the controls each
 player reports it supports. Tapping a player opens its full remote. */
var MF = { PAUSE: 1, VOLUME_SET: 4, PREV: 16, NEXT: 32, SOURCE: 2048, PLAY: 16384 };

function mediaLine(id) {
  var a = A(id),
    s = V_(id),
    t = typeof a.media_title === "string" ? a.media_title.trim() : "",
    ar = typeof a.media_artist === "string" ? a.media_artist.trim() : "";
  if (t && ar) return t + " · " + ar;
  if (t) return t;
  if (s !== "off" && s !== "unavailable" && a.source) return a.source;
  return s === "unavailable"
    ? _T("unavailable")
    : s === "playing"
      ? _T("playing")
      : s === "paused"
        ? _T("paused")
        : s === "off"
          ? _T("off")
          : _T("nothing_playing");
}

/* Devices left out of a tile and its popup (a purifier is a fan to Home Assistant, but not a fan to you). Set from the tile's settings. */
function gxOff(key, id) {
  var g = STORE.cfg && STORE.cfg.gx;
  return !!(g && g[key] && g[key].indexOf(id) >= 0);
}

function gxSet(key, id, off) {
  var g = JSON.parse(JSON.stringify((STORE.cfg && STORE.cfg.gx) || {})),
    l = g[key] || [],
    i = l.indexOf(id);
  if (off && i < 0) l.push(id);
  if (!off && i >= 0) l.splice(i, 1);
  g[key] = l;
  STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { gx: g }));
  storeChanged();
}

function gxItem(d) {
  return { id: d.id, name: d.name, icon: d.icon, room: TITLES[d.room] || "" };
}

function gxDevs(key, list) {
  return list.filter(function (d) {
    return !gxOff(key, d.id);
  });
}

function gxPage(b, key, items) {
  if (!items.length) return;
  b.appendChild(sep(_T("devices_in_this_tile_and_its_popup"), "plug"));
  b.appendChild(hintRow(_T("turn_off_the_ones_that_do_not_belong")));
  items.forEach(function (x) {
    b.appendChild(
      pill(x.icon || "plug", x.name, {
        on: function () {
          return !gxOff(key, x.id);
        },
        sub: function () {
          return (
            (x.room ? x.room + " · " : "") +
            (gxOff(key, x.id) ? _T("not_counted_or_listed") : _T("counted_and_listed"))
          );
        },
        tap: function () {
          gxSet(key, x.id, !gxOff(key, x.id));
        },
      })
    );
  });
}

/* One switch for the Media popup, offered both there and in the Media tile's settings. */
function mediaCtlPill(after) {
  return pill("playpause", _T("controls_in_the_media_popup"), {
    on: function () {
      return !!(STORE.cfg && STORE.cfg.mediaCtl);
    },
    sub: function () {
      return STORE.cfg && STORE.cfg.mediaCtl
        ? _T("playback_volume_and_inputs_show_unde_2")
        : _T("only_the_devices_are_shown_tap_one_t");
    },
    tap: function () {
      STORE.cfg = cleanCfg(
        Object.assign({}, STORE.cfg, { mediaCtl: !(STORE.cfg && STORE.cfg.mediaCtl) })
      );
      storeChanged();
      if (after) after();
    },
  });
}

/* The remotes of the pages: the Remote masters and the remotes built by hand, each with the room of its page and its row. A hidden one, or one in a hidden section or room, is left out. */
function hubRemotes() {
  var out = [];
  ["home"].concat(Object.keys(UIROOM)).forEach(function (rid) {
    var secs = rid === "home" ? UI.layout.home : UI.layout.rooms[rid];
    (secs || []).forEach(function (s) {
      if (s.hide) return;
      (s.devs || []).forEach(function (d) {
        if (d.hide) return;
        if (d.kind === "remote")
          out.push({
            room: rid,
            row: function () {
              return remoteRow(d);
            },
          });
        else if (d.kind === "widget" && d.w === "rmaster" && d.wx && d.wx.def && rmExists(d.wx, d.wx.def) && rmVisible(d.wx, d.wx.def))
          out.push({
            room: rid,
            row: function () {
              return remoteMasterRow(d, rid + ":" + s.id + ":" + d.wid);
            },
          });
      });
    });
  });
  return out;
}

function mediaHub(b) {
  var list = gxDevs("media", devsOf("media")).filter(function (d) {
      return d.id;
    }),
    remotes = hubRemotes();
  if (!list.length && !remotes.length) {
    b.appendChild(pill("info", _T("no_media_players_on_the_dashboard"), {}));
    return;
  }
  var box = mk("div");
  b.appendChild(box);
  /* The controls shown depend on whether each player is on and which inputs it has; redraw only when that changes, never while dragging volume. */
  function sig() {
    return list
      .map(function (d) {
        return (
          mediaOn(d.id) +
          "|" +
          (A(d.id).supported_features || 0) +
          "|" +
          (A(d.id).source || "") +
          "|" +
          (A(d.id).source_list || []).join(",")
        );
      })
      .join(";");
  }
  function draw() {
    var s0 = sig(),
      rooms = [];
    list.concat(remotes).forEach(function (d) {
      if (rooms.indexOf(d.room) < 0) rooms.push(d.room);
    });
    /* in the order of the pages */
    var order = Object.keys(UIROOM).concat("home");
    rooms.sort(function (a, c) {
      return order.indexOf(a) - order.indexOf(c);
    });
    rooms.forEach(function (rid) {
      box.appendChild(sep(TITLES[rid] || rid, (UIROOM[rid] && UIROOM[rid].icon) || "home"));
      remotes
        .filter(function (r) {
          return r.room === rid;
        })
        .forEach(function (r) {
          box.appendChild(r.row());
        });
      list
        .filter(function (d) {
          return d.room === rid;
        })
        .forEach(function (d) {
          mediaCard(box, d);
        });
    });
    reg(function () {
      if (sig() !== s0) redrawBox(box, draw);
    });
  }
  redrawBox(box, draw);
}

function mediaCard(box, d) {
  var id = d.id,
    a = A(id),
    f = a.supported_features || 0,
    has = function (bit) {
      return (f & bit) === bit;
    };
  box.appendChild(
    pill(d.icon || "media", d.name, {
      on: function () {
        return mediaOn(id);
      },
      sub: function () {
        return mediaLine(id);
      },
      tap: function () {
        showPopup(devPop(d) || "gmedia:" + id, true);
      },
      iconTap: function () {
        toggleEnt(id);
      },
    })
  );
  /* Playback buttons, volume and inputs under a player are opt-in: the Media tile's settings. */
  if (!(STORE.cfg && STORE.cfg.mediaCtl) || !mediaOn(id)) return;
  if (has(MF.PREV) || has(MF.NEXT) || has(MF.PAUSE) || has(MF.PLAY)) {
    var tr = mk("div", "rrow");
    if (has(MF.PREV))
      tr.appendChild(
        rbtn("prev", function () {
          call("media_player", "media_previous_track", { entity_id: id });
        })
      );
    if (has(MF.PAUSE) || has(MF.PLAY))
      tr.appendChild(
        rbtn("playpause", function () {
          call("media_player", "media_play_pause", { entity_id: id });
        })
      );
    if (has(MF.NEXT))
      tr.appendChild(
        rbtn("next", function () {
          call("media_player", "media_next_track", { entity_id: id });
        })
      );
    box.appendChild(tr);
  }
  if (has(MF.VOLUME_SET) && typeof a.volume_level === "number")
    box.appendChild(
      sliderRow({
        icon: "volup",
        name: _T("volume"),
        min: 0,
        max: 100,
        step: 1,
        get: function () {
          var v = A(id).volume_level;
          return typeof v === "number" ? Math.round(v * 100) : 0;
        },
        fmt: function (v) {
          return v + "%";
        },
        commit: function (v) {
          call("media_player", "volume_set", { entity_id: id, volume_level: v / 100 });
        },
      })
    );
  var src = Array.isArray(a.source_list)
    ? a.source_list.filter(function (x) {
        return typeof x === "string" && x;
      })
    : [];
  if (has(MF.SOURCE) && src.length > 1 && src.length <= 6)
    box.appendChild(
      seg(
        src.map(function (x) {
          return [x, x];
        }),
        a.source || "",
        function (v) {
          call("media_player", "select_source", { entity_id: id, source: v });
        }
      )
    );
}

function mediaKind(id) {
  var h = H(),
    e = h.entities[id] || {},
    dv = e.device_id && h.devices[e.device_id],
    own = Integrations.media.kind(e.platform, dv && dv.model);
  if (own !== "generic" || Integrations.remote.family(e.platform)) return own;
  /* a player of an integration with no remote of its own (a cast player) takes the layout of the remote given to it */
  var rem = tvRemoteOf(id),
    r = rem && h.entities[rem],
    rd = r && r.device_id && h.devices[r.device_id];
  return r ? Integrations.media.kind(r.platform, rd && rd.model) : own;
}

/* The remote entity that sends a player's keys: one linked to it in its settings (on any page, or in a remote master), else the one on its own device. */
function tvRemoteOf(id) {
  var linked = advCopies(id)
    .reduce(function (all, d) {
      return all.concat(d.links || []);
    }, [])
    .concat(rmLinks(id))
    .filter(function (e) {
      return dom(e) === "remote" && H().states[e];
    })[0];
  return (
    linked ||
    sibBy(id, function (e) {
      return dom(e.entity_id) === "remote";
    })
  );
}

/* Apple TV has no mute of its own; use the remote of a Samsung TV in the same room if there is one. */
function roomTvRemote(id) {
  var ar = areaIdOf(id),
    h = H();
  if (!ar) return null;
  var tv = Object.keys(h.states).filter(function (e) {
    return (
      e.indexOf("media_player.") === 0 &&
      e !== id &&
      areaIdOf(e) === ar &&
      mediaKind(e) === "samsung"
    );
  })[0];
  return tv
    ? sibBy(tv, function (e) {
        return dom(e.entity_id) === "remote";
      })
    : null;
}

/* Which ready-made remote a media player's popup is: "samsung", "apple", "android", "family" (built from the integration's documentation), or "" for none. */
function mediaRemoteKind(id) {
  var k = mediaKind(id),
    rem = tvRemoteOf(id);
  if ((k === "samsung" || k === "apple" || k === "android") && rem) return k;
  var fam = tvFamily(id);
  return Integrations.remote.experimental(fam) && (rem || fam === "webos") ? "family" : "";
}

function mediaPopup(b, id, hooks) {
  var k = mediaRemoteKind(id),
    rem = tvRemoteOf(id),
    h = H(),
    e = h.entities[id] || {},
    dv = e.device_id && h.devices[e.device_id];
  if (k === "samsung") samsungRemote(b, rem, id, hooks);
  else if (k === "apple")
    appleRemote(b, rem, id, roomTvRemote(id), dv && dv.config_entries && dv.config_entries[0], hooks);
  else if (k === "android") androidRemote(b, rem, id, hooks);
  else if (k === "family") familyRemote(b, id, rem, tvFamily(id), hooks);
  else mediaGeneric(b, id, (UIDEV[id] || {}).icon, hooks);
}

/* The key family of a media player's integration (app/integrations.js): Roku, Sony Bravia, Philips, Vizio, Fire TV and LG webOS have a remote built from what their integrations document. */
function tvFamily(id) {
  var all = H().entities || {},
    own = Integrations.remote.family((all[id] || {}).platform);
  if (own) return own;
  var rem = tvRemoteOf(id);
  return rem ? Integrations.remote.family((all[rem] || {}).platform) : "";
}

/* A remote for a TV the dashboard has no native remote for: the same layout as the others, with the keys its integration documents, and the media player's own services where it lists none. It says it is experimental. */
function familyRemote(b, media, remote, fam, hooks) {
  var how = Integrations.remote.how(fam),
    platform = (H().entities[media] || {}).platform;
  function key(role) {
    return Integrations.remote.role(fam, role);
  }
  function press(role, hold) {
    var k = key(role);
    if (!k) return false;
    if (how === "webos") call.apply(null, Integrations.remote.button(media, k));
    else send(remote, k, hold);
    return true;
  }
  /* What a button does: the family's key, else the media player's own service where it says it can; null when neither. `master` is the role a remote master may take over. */
  function act(role, svc, bits, data, master) {
    if (!key(role) && (!svc || (bits && tvLacks(media, bits)))) return null;
    return function () {
      if (master && rmo(hooks, master)) return;
      if (!press(role) && svc) call("media_player", svc, Object.assign({ entity_id: media }, data ? data() : {}));
    };
  }
  b.appendChild(hintRow(_T("tv_remote_experimental")));
  var inRow = rappsInRow(media);
  playingBlock(b, hooks, media, "tv", inRow ? tvSourceMenu(media) : undefined);
  var r1 = mk("div", "rrow");
  r1.appendChild(
    rkey(media, "power", function () {
      if (V_(media) === "off") call("media_player", "turn_on", { entity_id: media });
      else if (!press("power")) call("media_player", "turn_off", { entity_id: media });
    })
  );
  if (!inRow) {
    var apps = rapps(media, true);
    if (apps) r1.appendChild(apps);
  }
  b.appendChild(r1);
  if (hooks) hooks.beside(b, r1);
  var r2 = mk("div", "rrow");
  r2.appendChild(
    rkey(
      media,
      "settings",
      key("menu")
        ? function () {
            if (!rmo(hooks, "settings")) press("menu");
          }
        : null,
      hooks
    )
  );
  r2.appendChild(
    rkey(
      media,
      "mute",
      act("mute", "volume_mute", 8, function () {
        return { is_volume_muted: !A(media).is_volume_muted };
      }),
      hooks
    )
  );
  /* Typing: by a key of the remote (Roku) or an action of the integration (Vizio). */
  var type = null;
  if (remote && Integrations.remote.text(fam, "x") !== null)
    type = function (v) {
      send(remote, Integrations.remote.text(fam, v));
    };
  else if (Integrations.media.textCall(platform, media, "", "x"))
    type = function (v) {
      call.apply(null, Integrations.media.textCall(platform, media, "", v));
    };
  r2.appendChild(rkeyboard(media, type, hooks));
  b.appendChild(r2);
  var t = mk("div", "touch pane");
  swipePad(
    t,
    function (d) {
      if (!rmo(hooks, "dir", d)) press(d);
    },
    function () {
      if (!rmo(hooks, "ok")) press("ok");
    },
    null,
    function () {
      if (!rmo(hooks, "hold")) press("ok", 1);
    }
  );
  b.appendChild(t);
  var r3 = mk("div", "rrow");
  r3.appendChild(rkey(media, "back", act("back", "", 0, null, "back"), hooks));
  r3.appendChild(rkey(media, "home", act("home", "", 0, null, "home"), hooks));
  r3.appendChild(rkey(media, "playpause", act("playpause", "media_play_pause", 0, null, "playpause"), hooks));
  b.appendChild(r3);
  var r4 = mk("div", "rrow"),
    l = mk("div", "rstack"),
    rr = mk("div", "rstack");
  /* VOLUME_SET (4) or VOLUME_STEP (1024) */
  l.appendChild(rkey(media, "volup", act("volup", "volume_up", 1028), hooks, "", true));
  l.appendChild(rkey(media, "voldown", act("voldown", "volume_down", 1028), hooks, "", true));
  rr.appendChild(rkey(media, "chup", act("chup", ""), hooks, "CH", true));
  rr.appendChild(rkey(media, "chdown", act("chdown", ""), hooks, "CH", true));
  r4.appendChild(l);
  r4.appendChild(rbright(media));
  r4.appendChild(rr);
  b.appendChild(r4);
}

function androidRemote(b, remote, media, hooks) {
  playingBlock(b, hooks, media, "tv");
  function key(k, role) {
    return function () {
      if (!role || !rmo(hooks, role)) send(remote, k);
    };
  }
  var r1 = mk("div", "rrow");
  r1.appendChild(
    rkey(media, "power", function () {
      call("media_player", V_(media) === "off" ? "turn_on" : "turn_off", { entity_id: media });
    })
  );
  var apps = rapps(media, false);
  if (apps) r1.appendChild(apps);
  b.appendChild(r1);
  if (hooks) hooks.beside(b, r1);
  var r2 = mk("div", "rrow");
  r2.appendChild(rkey(media, "settings", key("SETTINGS", "settings"), hooks));
  r2.appendChild(rkey(media, "mute", key("MUTE"), hooks));
  r2.appendChild(
    rkeyboard(
      media,
      function (v) {
        send(remote, "text:" + v);
      },
      hooks
    )
  );
  b.appendChild(r2);
  b.appendChild(
    touchpad(remote, {
      ok: "DPAD_CENTER",
      up: "DPAD_UP",
      down: "DPAD_DOWN",
      left: "DPAD_LEFT",
      right: "DPAD_RIGHT",
    }, undefined, hooks)
  );
  var r3 = mk("div", "rrow");
  r3.appendChild(rkey(media, "back", key("BACK", "back"), hooks));
  r3.appendChild(rkey(media, "home", key("HOME", "home"), hooks));
  r3.appendChild(rkey(media, "playpause", key("MEDIA_PLAY_PAUSE", "playpause"), hooks));
  b.appendChild(r3);
  var r4 = mk("div", "rrow"),
    l = mk("div", "rstack"),
    rr = mk("div", "rstack");
  l.appendChild(rkey(media, "volup", key("VOLUME_UP"), hooks, "", true));
  l.appendChild(rkey(media, "voldown", key("VOLUME_DOWN"), hooks, "", true));
  rr.appendChild(rkey(media, "chup", key("CHANNEL_UP"), hooks, "CH", true));
  rr.appendChild(rkey(media, "chdown", key("CHANNEL_DOWN"), hooks, "CH", true));
  r4.appendChild(l);
  r4.appendChild(rbright(media));
  r4.appendChild(rr);
  b.appendChild(r4);
}

/* The rest a player reports it can do: position, shuffle, repeat, sound mode, grouping, browsing (in Home Assistant's dialog). */
function mediaExtras(b, id) {
  var f = A(id).supported_features || 0,
    controls = [];
  /* SEEK (2) */
  if (f & 2 && A(id).media_duration)
    controls.push({ t: "slider", label: _T("position"), icon: "next", min: 0, max: Math.round(A(id).media_duration), step: 1, get: function () { return Math.round(A(id).media_position || 0); }, unit: " " + _T("seconds_short"), set: function (v) { call("media_player", "media_seek", { entity_id: id, seek_position: v }); } });
  /* SHUFFLE_SET (32768) */
  if (f & 32768)
    controls.push(ctlSwitch(_T("shuffle"), "swap", function () { return !!A(id).shuffle; }, function (v) { call("media_player", "shuffle_set", { entity_id: id, shuffle: v }); }));
  /* REPEAT_SET (262144) */
  if (f & 262144)
    controls.push(ctlSelect(_T("repeat"), function () { return ["off", "all", "one"]; }, function () { return A(id).repeat || "off"; }, function (v) { call("media_player", "repeat_set", { entity_id: id, repeat: v }); }, function (v) { return _T("repeat_" + v); }));
  /* SELECT_SOUND_MODE (65536) */
  if (f & 65536 && (A(id).sound_mode_list || []).length)
    controls.push(ctlSelect(_T("sound_mode"), function () { return A(id).sound_mode_list || []; }, function () { return A(id).sound_mode; }, function (v) { call("media_player", "select_sound_mode", { entity_id: id, sound_mode: v }); }, String));
  domControls(b, controls, id);
  /* GROUPING (524288): the other players that can group, each joined or not. */
  if (f & 524288)
    Object.keys(H().states)
      .filter(function (e) {
        return e !== id && dom(e) === "media_player" && (A(e).supported_features || 0) & 524288;
      })
      .forEach(function (e) {
        var joined = function () {
          return (A(id).group_members || []).indexOf(e) >= 0;
        };
        b.appendChild(
          pill("plus", A(e).friendly_name || e, {
            on: joined,
            val: function () {
              return joined() ? _T("grouped") : "";
            },
            tap: function () {
              if (joined()) call("media_player", "unjoin", { entity_id: e });
              else call("media_player", "join", { entity_id: id, group_members: [e] });
            },
          })
        );
      });
  /* BROWSE_MEDIA (131072) */
  var open = f & 131072 ? haMorePill(id) : null;
  if (open) b.appendChild(open);
}

function mediaGeneric(b, id, icon, hooks) {
  b.appendChild(
    pill("power", _T("power"), {
      on: function () {
        return mediaOn(id);
      },
      tap: function () {
        call("media_player", "toggle", { entity_id: id });
      },
    })
  );
  playingBlock(b, hooks, id, icon || "media");
  if (hooks) hooks.beside(b, b);
  var tr = mk("div", "rrow");
  tr.appendChild(
    rbtn("prev", function () {
      call("media_player", "media_previous_track", { entity_id: id });
    })
  );
  tr.appendChild(
    rbtn("playpause", function () {
      if (!rmo(hooks, "playpause")) call("media_player", "media_play_pause", { entity_id: id });
    })
  );
  tr.appendChild(
    rbtn("next", function () {
      call("media_player", "media_next_track", { entity_id: id });
    })
  );
  b.appendChild(tr);
  b.appendChild(
    sliderRow({
      icon: "volup",
      name: _T("volume"),
      min: 0,
      max: 100,
      step: 1,
      get: function () {
        var v = A(id).volume_level;
        return v === undefined ? null : Math.round(v * 100);
      },
      fmt: function (v) {
        return v + "%";
      },
      commit: function (v) {
        call("media_player", "volume_set", { entity_id: id, volume_level: v / 100 });
      },
    })
  );
  mediaExtras(b, id);
}
