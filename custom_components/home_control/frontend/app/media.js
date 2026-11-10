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
function addNowPlaying(b, id, icon) {
  var np = nowPlaying(id, icon);
  if (np) b.appendChild(np);
}

function nowPlaying(id, icon) {
  if ((UIDEV[id] || {}).nonp) return null;
  if ((UIDEV[id] || {}).art) return artCard(id, icon);
  var p = pill(icon, _T("now_playing"), {
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

function touchpad(remote, keys, onHold) {
  var t = mk("div", "touch pane");
  swipePad(
    t,
    function (d) {
      send(remote, keys[d]);
    },
    function () {
      send(remote, keys.ok);
    },
    null,
    function () {
      if (onHold) onHold();
      else send(remote, keys.ok, 1);
    }
  );
  return t;
}

function kbDlg(sendText) {
  var bg = mk("div", "scrim");
  bg.style.zIndex = 69;
  var d = mk(
    "div",
    "dlg pane",
    "<textarea rows='3' enterkeyhint='send' placeholder='" +
      _T("type_to_send_to_the_tv") +
      "'></textarea><div class='rrow'></div>"
  );
  var ta = d.querySelector("textarea");
  function close() {
    bg.remove();
    d.remove();
  }
  /* Text is sent only on Send: live per-keystroke sending left half-typed text on the TV when the dialog closed mid-typing. */
  function submit() {
    var v = ta.value;
    if (!v.trim()) {
      ta.focus();
      return;
    }
    sendText(v);
    close();
  }
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  var row = d.querySelector(".rrow");
  row.style.gridTemplateColumns = "1fr 1fr";
  var cl = mk("div", "rbtn pane", _T("close"));
  cl.addEventListener("click", close);
  row.appendChild(cl);
  var ok = mk("div", "rbtn pane", _T("send_btn"));
  ok.addEventListener("click", submit);
  row.appendChild(ok);
  /* A stray tap outside must not throw away typed text. */
  bg.addEventListener("click", function () {
    if (!ta.value) close();
  });
  document.body.appendChild(bg);
  document.body.appendChild(d);
  requestAnimationFrame(function () {
    bg.classList.add("in");
    ta.focus();
  });
}

/* The apps and inputs a TV can switch to (the source list of its media player), as a dropdown over the two cells beside Power. */
function tvSources(id) {
  var r = selectTile(
    _T("apps"),
    function () {
      var l = A(id).source_list;
      return Array.isArray(l)
        ? l.filter(function (x) {
            return typeof x === "string" && x;
          })
        : [];
    },
    function () {
      return A(id).source;
    },
    function (v) {
      call("media_player", "select_source", { entity_id: id, source: v });
    },
    "play",
    String
  );
  r.classList.add("tvsrc");
  return r;
}

/* The brightness of the lights in the TV's room, with the brightness button of the light popup (its slider rises from the button), in the cell under Home. Left empty when the room has no lights. */
function tvRoomBrightness(media) {
  var room = UIOWN[media],
    cell = mk("div", "tvbri");
  if (!lightsAll(room).length) return cell;
  function ids() {
    return lightsAll(room);
  }
  cell.appendChild(
    briControl({
      pct: function () {
        return lightsMasterPct(ids());
      },
      lit: function () {
        return countOn(ids()) > 0;
      },
      live: function (v) {
        if (v > 0)
          callLive("tv:" + media, "light", "turn_on", {
            entity_id: lightTargets(ids(), false),
            brightness_pct: v,
          });
      },
      commit: function (v) {
        if (v <= 0) call("light", "turn_off", { entity_id: lightTargets(ids(), false) });
        else call("light", "turn_on", { entity_id: lightTargets(ids(), false), brightness_pct: v });
      },
      stage: function () {
        return null;
      },
    })
  );
  return cell;
}

function samsungRemote(b, remote, media) {
  addNowPlaying(b, media, "tv");
  var r1 = mk(
    "div",
    "rrow"
  ); /* KEY_POWER goes over the TV's network socket, which is closed while the TV is off; turn_on uses the integration's wake path instead. */
  r1.appendChild(
    rbtn("power", function () {
      if (V_(media) === "off") call("media_player", "turn_on", { entity_id: media });
      else send(remote, "KEY_POWER");
    })
  );
  r1.appendChild(tvSources(media));
  b.appendChild(r1);
  var r2 = mk("div", "rrow");
  r2.appendChild(
    rbtn("cog", function () {
      send(remote, Integrations.media.samsungSettingsKey((H().entities[media] || {}).platform));
    })
  );
  r2.appendChild(
    rbtn("mute", function () {
      send(remote, "KEY_MUTE");
    })
  );
  if (Integrations.media.samsungCanType((H().entities[media] || {}).platform))
    r2.appendChild(
      rbtn("keyboard", function () {
        kbDlg(function (v) {
          call.apply(null, Integrations.media.samsungText(media, v));
        });
      })
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
    })
  );
  var r3 = mk("div", "rrow");
  r3.appendChild(
    rbtn("back", function () {
      send(remote, "KEY_RETURN");
    })
  );
  r3.appendChild(
    rbtn("home", function () {
      send(remote, "KEY_HOME");
    })
  );
  r3.appendChild(
    rbtn("playpause", function () {
      call("media_player", "media_play_pause", { entity_id: media });
    })
  );
  b.appendChild(r3);
  var r4 = mk("div", "rrow");
  var l = mk("div", "rstack"),
    m = tvRoomBrightness(media),
    rr = mk("div", "rstack");
  l.appendChild(
    rbtn(
      "volup",
      function () {
        send(remote, "KEY_VOLUP");
      },
      "",
      true
    )
  );
  l.appendChild(
    rbtn(
      "voldown",
      function () {
        send(remote, "KEY_VOLDOWN");
      },
      "",
      true
    )
  );
  rr.appendChild(
    rbtn(
      "chup",
      function () {
        send(remote, "KEY_CHUP");
      },
      "CH",
      true
    )
  );
  rr.appendChild(
    rbtn(
      "chdown",
      function () {
        send(remote, "KEY_CHDOWN");
      },
      "CH",
      true
    )
  );
  r4.appendChild(l);
  r4.appendChild(m);
  r4.appendChild(rr);
  b.appendChild(r4);
}

function appleRemote(b, remote, media, tvRemote, entry) {
  addNowPlaying(b, media, "apple");
  var r1 = mk("div", "rrow");
  r1.appendChild(
    rbtn("power", function () {
      send(remote, V_(media) === "off" ? "wakeup" : "suspend");
    })
  );
  b.appendChild(r1);
  var r2 = mk("div", "rrow");
  r2.appendChild(
    rbtn("cog", function () {
      send(remote, "control_center");
    })
  );
  r2.appendChild(
    rbtn("mute", function () {
      if (tvRemote) send(tvRemote, "KEY_MUTE");
      else
        call("media_player", "volume_mute", {
          entity_id: media,
          is_volume_muted: !A(media).is_volume_muted,
        });
    })
  );
  r2.appendChild(
    rbtn("keyboard", function () {
      kbDlg(function (v) {
        call.apply(null, Integrations.media.appleText(entry, v));
      });
    })
  );
  b.appendChild(r2);
  b.appendChild(
    touchpad(remote, { ok: "select", up: "up", down: "down", left: "left", right: "right" })
  );
  var r3 = mk("div", "rrow");
  r3.appendChild(
    rbtn("back", function () {
      send(remote, "menu");
    })
  );
  r3.appendChild(
    rbtn("home", function () {
      send(remote, "home");
    })
  );
  r3.appendChild(
    rbtn("playpause", function () {
      send(remote, "play_pause");
    })
  );
  b.appendChild(r3);
  var r4 = mk("div", "rrow");
  r4.appendChild(
    rbtn(
      "voldown",
      function () {
        send(remote, "volume_down");
      },
      "",
      true
    )
  );
  r4.appendChild(mk("div"));
  r4.appendChild(
    rbtn(
      "volup",
      function () {
        send(remote, "volume_up");
      },
      "",
      true
    )
  );
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
  var h = mk("div", "hint");
  h.textContent = _T("turn_off_the_ones_that_do_not_belong");
  b.appendChild(h);
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

function mediaHub(b) {
  var list = gxDevs("media", devsOf("media")).filter(function (d) {
    return d.id;
  });
  if (!list.length) {
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
    list.forEach(function (d) {
      if (rooms.indexOf(d.room) < 0) rooms.push(d.room);
    });
    rooms.forEach(function (rid) {
      box.appendChild(sep(TITLES[rid] || rid, (UIROOM[rid] && UIROOM[rid].icon) || "home"));
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
    dv = e.device_id && h.devices[e.device_id];
  return Integrations.media.kind(e.platform, dv && dv.model);
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

function mediaPopup(b, id) {
  var k = mediaKind(id),
    rem = sibBy(id, function (e) {
      return dom(e.entity_id) === "remote";
    }),
    h = H(),
    e = h.entities[id] || {},
    dv = e.device_id && h.devices[e.device_id];
  if (k === "samsung" && rem) samsungRemote(b, rem, id);
  else if (k === "apple" && rem)
    appleRemote(b, rem, id, roomTvRemote(id), dv && dv.config_entries && dv.config_entries[0]);
  else if (k === "android" && rem) androidRemote(b, rem, id);
  else mediaGeneric(b, id, (UIDEV[id] || {}).icon);
}

function androidRemote(b, remote, media) {
  addNowPlaying(b, media, "tv");
  var r1 = mk("div", "rrow");
  r1.appendChild(
    rbtn("power", function () {
      call("media_player", V_(media) === "off" ? "turn_on" : "turn_off", { entity_id: media });
    })
  );
  b.appendChild(r1);
  var r2 = mk("div", "rrow");
  r2.appendChild(
    rbtn("cog", function () {
      send(remote, "SETTINGS");
    })
  );
  r2.appendChild(
    rbtn("mute", function () {
      send(remote, "MUTE");
    })
  );
  r2.appendChild(
    rbtn("keyboard", function () {
      kbDlg(function (v) {
        send(remote, "text:" + v);
      });
    })
  );
  b.appendChild(r2);
  b.appendChild(
    touchpad(remote, {
      ok: "DPAD_CENTER",
      up: "DPAD_UP",
      down: "DPAD_DOWN",
      left: "DPAD_LEFT",
      right: "DPAD_RIGHT",
    })
  );
  var r3 = mk("div", "rrow");
  r3.appendChild(
    rbtn("back", function () {
      send(remote, "BACK");
    })
  );
  r3.appendChild(
    rbtn("home", function () {
      send(remote, "HOME");
    })
  );
  r3.appendChild(
    rbtn("playpause", function () {
      send(remote, "MEDIA_PLAY_PAUSE");
    })
  );
  b.appendChild(r3);
  var r4 = mk("div", "rrow"),
    l = mk("div", "rstack"),
    rr = mk("div", "rstack");
  l.appendChild(
    rbtn(
      "volup",
      function () {
        send(remote, "VOLUME_UP");
      },
      "",
      true
    )
  );
  l.appendChild(
    rbtn(
      "voldown",
      function () {
        send(remote, "VOLUME_DOWN");
      },
      "",
      true
    )
  );
  rr.appendChild(
    rbtn(
      "chup",
      function () {
        send(remote, "CHANNEL_UP");
      },
      "CH",
      true
    )
  );
  rr.appendChild(
    rbtn(
      "chdown",
      function () {
        send(remote, "CHANNEL_DOWN");
      },
      "CH",
      true
    )
  );
  r4.appendChild(l);
  r4.appendChild(mk("div"));
  r4.appendChild(rr);
  b.appendChild(r4);
}

function mediaGeneric(b, id, icon) {
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
  addNowPlaying(b, id, icon || "media");
  var tr = mk("div", "rrow");
  tr.appendChild(
    rbtn("prev", function () {
      call("media_player", "media_previous_track", { entity_id: id });
    })
  );
  tr.appendChild(
    rbtn("playpause", function () {
      call("media_player", "media_play_pause", { entity_id: id });
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
}
