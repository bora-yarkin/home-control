/* Remote master (decision D-31): one remote for a TV and what is plugged into it, as a lights master is one control for many lights.
   It is a widget of a Section: a default player, supplementary players each with the input of the default they are plugged into, and speakers.
   The popup is the default's own remote. While the default is on a supplementary player's input and that player is awake, the keys it has (touchpad, settings, keyboard, back, home,
   play/pause) go to it; power, volume, mute, channel, backlight, the inputs and every key it lacks stay with the default. */

var RM_MAX = 6;
/* What the open popup is showing: { key, sel }. Cleared when the row opens it, so each opening starts anew. */
var RMS = null;

function rmPlayerId(x) {
  return typeof x === "string" && ENTRE.test(x) && x.indexOf("media_player.") === 0 ? x : "";
}

/* The settings of a remote master as they are kept: players once each, never the default twice, at most six of a kind. */
function cleanRemoteMaster(x) {
  var o = { def: rmPlayerId(x.def), subs: [], spk: [] },
    seen = {};
  if (o.def) seen[o.def] = 1;
  (Array.isArray(x.subs) ? x.subs : []).forEach(function (s) {
    var id = s && rmPlayerId(s.id);
    if (!id || seen[id] || o.subs.length >= RM_MAX) return;
    seen[id] = 1;
    o.subs.push({ id: id, src: typeof s.src === "string" ? s.src.slice(0, 80) : "" });
  });
  (Array.isArray(x.spk) ? x.spk : []).forEach(function (s) {
    var id = rmPlayerId(s);
    if (!id || seen[id] || o.spk.length >= RM_MAX) return;
    seen[id] = 1;
    o.spk.push(id);
  });
  if (x.keep) o.keep = 1;
  return o;
}

function rmAwake(id) {
  var s = V_(id);
  return !!s && ["off", "standby", "unavailable", "unknown"].indexOf(s) < 0;
}

/* The supplementary player that is on the screen: the default is on the input it is plugged into, and it is awake. */
function rmOnScreen(x) {
  if (!x.def || !rmAwake(x.def)) return "";
  var src = A(x.def).source;
  var hit = x.subs.filter(function (s) {
    return s.src && s.src === src && wxVisible(s.id) && rmAwake(s.id);
  })[0];
  return hit ? hit.id : "";
}

/* Whether a player has something to show: playing or paused, or on with a title. */
function rmShows(id) {
  var s = V_(id);
  return s === "playing" || s === "paused" || (s === "on" && !!A(id).media_title);
}

function rmContent(id) {
  var a = A(id);
  return String(a.media_title || "").trim().toLowerCase() + "|" + String(a.media_artist || "").trim().toLowerCase();
}

/* The speaker to show: the first one playing something the screen is not showing. */
function rmSpeaker(x, screen) {
  var shows = rmShows(screen);
  return (
    x.spk.filter(function (id) {
      return wxVisible(id) && V_(id) === "playing" && !(shows && A(id).media_title && rmContent(id) === rmContent(screen));
    })[0] || ""
  );
}

/* The keys a player has, as { ok, dir, hold, back, home, settings, playpause, text }: what it has no key for is left out, and stays with the default. */
function rmKeys(id) {
  var h = H(),
    kind = mediaKind(id),
    rem = sibBy(id, function (e) {
      return dom(e.entity_id) === "remote";
    }),
    e = h.entities[id] || {},
    dv = e.device_id && h.devices[e.device_id],
    out = {};
  function press(k, hold) {
    return function () {
      send(rem, k, hold);
    };
  }
  function pad(m) {
    out.ok = press(m.ok);
    out.dir = function (d) {
      send(rem, m[d]);
    };
    out.hold = press(m.ok, 1);
  }
  if (rem && kind === "samsung") {
    pad({ ok: "KEY_ENTER", up: "KEY_UP", down: "KEY_DOWN", left: "KEY_LEFT", right: "KEY_RIGHT" });
    out.back = press("KEY_RETURN");
    out.home = press("KEY_HOME");
    out.settings = press(Integrations.media.samsungSettingsKey(e.platform));
    out.playpause = function () {
      call("media_player", "media_play_pause", { entity_id: id });
    };
    if (Integrations.media.samsungCanType(e.platform))
      out.text = function (v) {
        call.apply(null, Integrations.media.samsungText(id, v));
      };
  } else if (rem && kind === "apple") {
    pad({ ok: "select", up: "up", down: "down", left: "left", right: "right" });
    out.back = press("menu");
    out.home = press("home");
    out.settings = press("control_center");
    out.playpause = press("play_pause");
    var entry = dv && dv.config_entries && dv.config_entries[0];
    if (entry)
      out.text = function (v) {
        call.apply(null, Integrations.media.appleText(entry, v));
      };
  } else if (rem && kind === "android") {
    pad({ ok: "DPAD_CENTER", up: "DPAD_UP", down: "DPAD_DOWN", left: "DPAD_LEFT", right: "DPAD_RIGHT" });
    out.back = press("BACK");
    out.home = press("HOME");
    out.settings = press("SETTINGS");
    out.playpause = press("MEDIA_PLAY_PAUSE");
    out.text = function (v) {
      send(rem, "text:" + v);
    };
  } else {
    var fam = tvFamily(id),
      how = Integrations.remote.experimental(fam) ? Integrations.remote.how(fam) : null,
      role = function (r, hold) {
        var k = how && Integrations.remote.role(fam, r);
        if (!k || (how !== "webos" && !rem)) return null;
        return function () {
          if (how === "webos") call("webostv", "button", { entity_id: id, button: k });
          else send(rem, k, hold);
        };
      };
    if (role("ok")) {
      out.ok = role("ok");
      out.hold = role("ok", 1);
      out.dir = function (d) {
        var f = role(d);
        if (f) f();
      };
    }
    if (role("back")) out.back = role("back");
    if (role("home")) out.home = role("home");
    if (role("menu")) out.settings = role("menu");
    out.playpause =
      role("playpause") ||
      function () {
        call("media_player", "media_play_pause", { entity_id: id });
      };
  }
  return out;
}

/* The volume of a speaker as a slider carrying what it plays: its artwork, the title, and the artist or the speaker's name. */
function rmSpeakerRow(id) {
  var row = sliderRow({
    icon: "media",
    name: entName(id),
    sub: function () {
      var a = A(id);
      return [String(a.media_artist || "").trim(), entName(id)].filter(Boolean).join(" · ");
    },
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
    live: function (v) {
      callLive("rmv:" + id, "media_player", "volume_set", { entity_id: id, volume_level: v / 100 });
    },
    commit: function (v) {
      call("media_player", "volume_set", { entity_id: id, volume_level: v / 100 });
    },
  });
  row.classList.add("rm-spk");
  var icon = row.querySelector(".ic"),
    name = row.querySelector(".nm"),
    plain = icon.innerHTML,
    last = "";
  reg(function () {
    var a = A(id),
      pic = a.entity_picture_local || a.entity_picture || "";
    name.textContent = String(a.media_title || "").trim() || entName(id);
    if (pic === last) return;
    last = pic;
    if (typeof pic === "string" && /^(\/(?!\/)|https:\/\/)/.test(pic)) {
      var im = new Image();
      im.alt = "";
      im.onerror = function () {
        icon.innerHTML = plain;
      };
      im.src = pic;
      icon.innerHTML = "";
      icon.appendChild(im);
    } else icon.innerHTML = plain;
  });
  return row;
}

/* A place that holds the speaker's slider when `want()` names one, made anew only when the speaker changes. The slider can be made while the popup is open, so its live updates are kept here and run with the slot's own. */
function rmSpeakerSlot(cls, want) {
  var box = mk("div", "rm-slot " + cls),
    now = null,
    mine = [];
  function up() {
    var id = want();
    if (id !== now) {
      now = id;
      box.innerHTML = "";
      box.style.display = id ? "" : "none";
      mine = [];
      if (id) {
        var prev = CUR;
        CUR = mine;
        try {
          box.appendChild(rmSpeakerRow(id));
        } finally {
          CUR = prev;
        }
      }
    }
    mine.forEach(function (f) {
      f();
    });
  }
  up();
  reg(up);
  return box;
}

/* What the combined view adds to the default's remote: the keys that go to the player on the screen, what now playing shows, and the speaker. */
function rmHooks(x) {
  function screen() {
    return rmOnScreen(x) || x.def;
  }
  function nothingShown() {
    return !rmShows(screen());
  }
  return {
    ovr: function (role, arg) {
      var sub = rmOnScreen(x);
      if (!sub) return false;
      var f = rmKeys(sub)[role];
      if (!f) return false;
      f(arg);
      return true;
    },
    np: function (b, media, icon, onTap) {
      var wrap = mk("div", "rm-np"),
        cards = {};
      [media]
        .concat(
          x.subs.map(function (s) {
            return s.id;
          })
        )
        .forEach(function (id) {
          if ((UIDEV[media] || {}).nonp) return;
          var c = nowPlaying(id, id === media ? icon : "media", onTap);
          if (c) {
            cards[id] = c;
            wrap.appendChild(c);
          }
        });
      wrap.appendChild(
        rmSpeakerSlot("rm-only", function () {
          return nothingShown() ? rmSpeaker(x, screen()) : "";
        })
      );
      function up() {
        var on = screen(),
          speakerHasRow = nothingShown() && !!rmSpeaker(x, on);
        Object.keys(cards).forEach(function (id) {
          cards[id].style.display = !speakerHasRow && id === (cards[on] ? on : media) ? "" : "none";
        });
      }
      up();
      reg(up);
      b.appendChild(wrap);
    },
    /* beside power when that room is free, under the row when the input list has it */
    beside: function (b, row) {
      var free = row !== b && !row.querySelector(".tvsrc"),
        slot = rmSpeakerSlot(free ? "rm-beside" : "rm-under", function () {
          return nothingShown() ? "" : rmSpeaker(x, screen());
        });
      if (free) row.appendChild(slot);
      else b.appendChild(slot);
    },
  };
}

/* The players the title's dropdown offers: the default, the supplementary ones and the speakers. */
function rmChoices(x) {
  return [x.def]
    .concat(
      x.subs.map(function (s) {
        return s.id;
      }),
      x.spk
    )
    .filter(function (id) {
      return id && H().states[id] && wxVisible(id);
    });
}

function rmWidget(key) {
  var p = String(key).split(":");
  return widgetOfSection(p[0], p[1], p[2]);
}

function rmStore(d) {
  return "hc-rm-" + d.wid;
}

/* The player the popup shows: what was picked while it is open (or remembered, when the master says so), else the default. */
function rmSelected(key, d) {
  var x = d.wx,
    all = rmChoices(x);
  if (!RMS || RMS.key !== key) RMS = { key: key, sel: x.keep ? deviceGet(rmStore(d), x.def) : x.def };
  return all.indexOf(RMS.sel) >= 0 ? RMS.sel : x.def;
}

function rmPick(key, d, id) {
  RMS = { key: key, sel: id };
  if (d.wx.keep) deviceSet(rmStore(d), id);
  showPopup("rmaster:" + key, false);
}

function remoteMasterPopup(key) {
  var d = rmWidget(key);
  /* the master was removed while its popup was asked for */
  if (!d || !d.wx.def) return { title: _T("rm_title"), icon: "tv", build: function () {} };
  var sel = rmSelected(key, d);
  return {
    title: entName(sel),
    icon: d.wx.spk.indexOf(sel) >= 0 ? "media" : "tv",
    titleMenu: {
      options: rmChoices(d.wx),
      current: sel,
      fmt: entName,
      pick: function (id) {
        rmPick(key, d, id);
      },
    },
    build: function (b) {
      if (!H().states[sel]) b.appendChild(pill("info", _T("unavailable"), {}));
      else if (sel === d.wx.def) mediaPopup(b, sel, rmHooks(d.wx));
      else if (d.wx.spk.indexOf(sel) >= 0) mediaGeneric(b, sel, "media");
      else mediaPopup(b, sel);
    },
  };
}

/* The row of a Section: what the master is called, and what is on the screen. */
function remoteMasterRow(d, key) {
  var x = d.wx;
  return pill("tv", d.name, {
    sub: function () {
      if (!rmAwake(x.def)) return _T("off");
      var on = rmOnScreen(x) || x.def,
        title = String(A(on).media_title || "").trim();
      return entName(on) + (title ? " · " + title : "");
    },
    on: function () {
      return rmAwake(x.def);
    },
    tap: function () {
      RMS = null;
      showPopup("rmaster:" + key, false);
    },
  });
}

/* ---- settings ---- */

function rmSettings(box, d, save) {
  var x = d.wx;
  function pickPlayer(label, done) {
    var taken = {};
    [x.def]
      .concat(
        x.subs.map(function (s) {
          return s.id;
        }),
        x.spk
      )
      .forEach(function (id) {
        if (id) taken[id] = 1;
      });
    pickEntity(label, ["media_player"], null, function (id) {
      done(id);
      save();
    }, function (id) {
      return !!taken[id];
    });
  }
  function removeRow(id, take) {
    return pill("trash", _T("rm_remove") + " " + entName(id), {
      tap: function () {
        take();
        save();
      },
    });
  }
  box.appendChild(
    pill("tv", _T("rm_default"), {
      sub: function () {
        return x.def ? entName(x.def) : _T("tap_to_choose");
      },
      tap: function () {
        pickPlayer(_T("rm_default"), function (id) {
          x.def = id;
        });
      },
    })
  );
  if (!x.def) return;
  box.appendChild(sep(_T("rm_supplementary"), "media"));
  box.appendChild(hintRow(_T("rm_supplementary_hint")));
  x.subs.forEach(function (s, i) {
    var inputs = tvSourceList(x.def).slice();
    if (s.src && inputs.indexOf(s.src) < 0) inputs.unshift(s.src);
    box.appendChild(
      dropRow(
        entName(s.id) + " · " + _T("rm_input"),
        inputs.concat(["@type"]),
        function () {
          return s.src;
        },
        function (v) {
          if (v !== "@type") {
            s.src = v;
            save();
            return;
          }
          /* a TV that is off may list no inputs: the name can be typed as the TV reports it */
          textDlg(_T("rm_input_name"), s.src, _T("save"), function (t) {
            s.src = t.trim().slice(0, 80);
            save();
          }, 1);
        },
        "media",
        function (v) {
          return v === "@type" ? _T("rm_input_type") : v || _T("tap_to_choose");
        }
      )
    );
    box.appendChild(
      removeRow(s.id, function () {
        x.subs.splice(i, 1);
      })
    );
  });
  if (x.subs.length < RM_MAX)
    box.appendChild(
      pill("plus", _T("rm_add_supplementary"), {
        tap: function () {
          pickPlayer(_T("rm_add_supplementary"), function (id) {
            x.subs.push({ id: id, src: "" });
          });
        },
      })
    );
  box.appendChild(sep(_T("rm_speakers"), "media"));
  x.spk.forEach(function (id, i) {
    box.appendChild(
      removeRow(id, function () {
        x.spk.splice(i, 1);
      })
    );
  });
  if (x.spk.length < RM_MAX)
    box.appendChild(
      pill("plus", _T("rm_add_speaker"), {
        tap: function () {
          pickPlayer(_T("rm_add_speaker"), function (id) {
            x.spk.push(id);
          });
        },
      })
    );
  box.appendChild(
    flagPill("edit", _T("rm_keep"), x, "keep", function (on) {
      return on ? _T("rm_keep_on") : _T("rm_keep_off");
    }, false)
  );
}

registerWidget("rmaster", {
  title: _T("rm_title"),
  icon: "tv",
  desc: _T("rm_desc"),
  sizes: [],
  size: "row",
  noStack: true,
  clean: cleanRemoteMaster,
  draw: function (d, x, ed) {
    if (!x.def || !H().states[x.def]) return ed ? pill("tv", d.name, { sub: function () { return _T("rm_choose_default"); } }) : null;
    if (!wxVisible(x.def)) return null;
    return remoteMasterRow(d, secKey() + ":" + CURSEC.id + ":" + d.wid);
  },
  settings: rmSettings,
});
