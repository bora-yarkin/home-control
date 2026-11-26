/* Remote master (decision D-31): one remote for a TV and what is plugged into it, as a lights master is one control for many lights.
   It is a widget of a Section: a default device, supplementary devices each with the input of the default they are plugged into, and speakers. A device is a media player (its built-in
   remote) or a custom remote of the remote builder, one made inside the master or one of a page. Each keeps its own options (name, icon, now playing, linked entities, and for a custom
   remote the player that gives its state and which of its buttons are the touchpad, back, home ...).
   The popup is the default's own remote. While the default is on a supplementary device's input and that device is awake, the keys it has (touchpad, settings, keyboard, back, home,
   play/pause) go to it; power, volume, mute, channel, backlight, the inputs and every key it lacks stay with the default. */

var RM_MAX = 6;
/* What the open popup is showing: { key, sel, view }. Cleared when the row opens it, so each opening starts anew. */
var RMS = null;
/* While a master builds a device's remote: that device's now playing style, in place of the page's. */
var RMNP = {};
/* The keys that can move from one device to another. */
var RM_ROLES = ["up", "down", "left", "right", "ok", "hold", "back", "home", "settings", "playpause"];
var RM_DPAD = { u: "up", d: "down", l: "left", r: "right", o: "ok" };

function rmPlayerId(x) {
  return typeof x === "string" && ENTRE.test(x) && x.indexOf("media_player.") === 0 ? x : "";
}

/* A device of a master: a media player, or "rm:<id>" for a custom remote. */
function rmMemberId(x) {
  return rmPlayerId(x) || (typeof x === "string" && /^rm:[a-z0-9_-]{1,40}$/.test(x) ? x : "");
}

function rmIsCustom(k) {
  return String(k).indexOf("rm:") === 0;
}

function cleanRmOpt(o) {
  var c = {};
  if (typeof o.name === "string" && o.name.trim()) c.name = o.name.trim().slice(0, 40);
  if (typeof o.icon === "string" && iconOk(o.icon)) c.icon = o.icon;
  if (o.np === "on" || o.np === "off" || o.np === "art") c.np = o.np;
  var links = (Array.isArray(o.links) ? o.links : []).filter(function (x, i, a) {
    return typeof x === "string" && ENTRE.test(x) && a.indexOf(x) === i;
  });
  if (links.length) c.links = links.slice(0, 12);
  if (rmPlayerId(o.state)) c.state = o.state;
  if (o.noadv) c.noadv = 1;
  var roles = {};
  RM_ROLES.forEach(function (r) {
    var act = o.roles && o.roles[r] && cleanRmAct(o.roles[r]);
    if (act) roles[r] = act;
  });
  if (Object.keys(roles).length) c.roles = roles;
  return c;
}

/* The settings of a remote master as they are kept: devices once each, never the default twice, at most six of a kind; only the custom remotes and options of devices it has. */
function cleanRemoteMaster(x) {
  var o = { def: rmMemberId(x.def), subs: [], spk: [] },
    seen = {};
  if (o.def) seen[o.def] = 1;
  (Array.isArray(x.subs) ? x.subs : []).forEach(function (s) {
    var id = s && rmMemberId(s.id);
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
  var own = [];
  (Array.isArray(x.own) ? x.own : []).forEach(function (r) {
    if (!r || !seen["rm:" + r.rid] || own.length >= RM_MAX + 1) return;
    own.push({ rid: r.rid, name: String(r.name || _T("remote")).slice(0, 40), icon: typeof r.icon === "string" && iconOk(r.icon) ? r.icon : "media", rm: cleanRemote(r.rm) });
  });
  if (own.length) o.own = own;
  var opt = {};
  Object.keys(x.opt && typeof x.opt === "object" ? x.opt : {}).forEach(function (k) {
    if (!seen[k]) return;
    var c = cleanRmOpt(x.opt[k] || {});
    if (Object.keys(c).length) opt[k] = c;
  });
  if (Object.keys(opt).length) o.opt = opt;
  if (x.keep) o.keep = 1;
  if (x.noadv) o.noadv = 1;
  return o;
}

/* ---- a device of a master ---- */

function rmOpt(x, k) {
  return (x.opt && x.opt[k]) || {};
}

/* A custom remote device: one of the master's own, else the one of a page with that id. */
function rmCustom(x, k) {
  var rid = String(k).slice(3);
  return (
    (x.own || []).filter(function (r) {
      return r.rid === rid;
    })[0] || remoteFind(rid)
  );
}

function rmExists(x, k) {
  return rmIsCustom(k) ? !!rmCustom(x, k) : !!H().states[k];
}

function rmVisible(x, k) {
  return rmIsCustom(k) || wxVisible(k);
}

/* The media player that says a device's state, source and what it plays: itself, or the one chosen for a custom remote. */
function rmState(x, k) {
  return rmIsCustom(k) ? rmOpt(x, k).state || "" : k;
}

function rmName(x, k) {
  var o = rmOpt(x, k);
  if (o.name) return o.name;
  if (rmIsCustom(k)) {
    var c = rmCustom(x, k);
    return c ? c.name : _T("remote");
  }
  return (UIDEV[k] && UIDEV[k].name) || entName(k);
}

function rmIcon(x, k) {
  var o = rmOpt(x, k);
  if (o.icon) return o.icon;
  if (rmIsCustom(k)) {
    var c = rmCustom(x, k);
    return (c && c.icon) || "media";
  }
  return x.spk.indexOf(k) >= 0 ? "media" : "tv";
}

/* A device switched off its Advanced settings button on its page. */
function rmAdvOffOnPage(id) {
  return advDevOff(id);
}

/* The Advanced settings button of a device in a master: not when it is switched off for the dashboard, for the master, for this device in it, or on the device's own page. */
function rmHasAdv(x, id) {
  return !rmIsCustom(id) && !x.noadv && !rmOpt(x, id).noadv && !rmAdvOffOnPage(id) && advButton(id);
}

/* Entities a master's settings link to a device: its Advanced settings list them, as those linked on a page. */
function rmLinks(id) {
  var out = [];
  allSectionLists().forEach(function (secs) {
    (secs || []).forEach(function (s) {
      (s.devs || []).forEach(function (d) {
        if (d.kind === "widget" && d.w === "rmaster") out = out.concat(rmOpt(d.wx || {}, id).links || []);
      });
    });
  });
  return out;
}

/* Every button action of a custom remote, with what to call it: the grid's buttons, the parts of its pads and the areas of its picture. */
function rmActions(rm) {
  var out = [];
  function visit(o, label) {
    if (!o || typeof o !== "object") return;
    if (typeof o.e === "string" && (!o.t || ["ent", "key", "media", "webos", "src"].indexOf(o.t) >= 0)) {
      out.push({ a: o, label: label });
      return;
    }
    Object.keys(o).forEach(function (k) {
      visit(o[k], label);
    });
  }
  ((rm && rm.btns) || []).concat((rm && rm.img && rm.img.hs) || []).forEach(function (b) {
    visit(b.a || b, b.l || "");
  });
  return out;
}

/* Which action each role of a custom remote is: what was chosen, else the parts of its first five-way pad. */
function rmRoleActs(x, k) {
  var c = rmCustom(x, k),
    out = {},
    pad = ((c && c.rm && c.rm.btns) || []).filter(function (b) {
      return b.a && b.a.t === "dpad";
    })[0];
  if (pad)
    Object.keys(RM_DPAD).forEach(function (p) {
      if (pad.a[p]) out[RM_DPAD[p]] = pad.a[p];
    });
  return Object.assign(out, rmOpt(x, k).roles || {});
}

function rmAwake(id) {
  var s = V_(id);
  return !!s && ["off", "standby", "unavailable", "unknown"].indexOf(s) < 0;
}

/* The supplementary device that is on the screen: the default is on the input it is plugged into, and it is awake (a custom remote with no player of its own always is). */
function rmOnScreen(x) {
  var tv = x.def ? rmState(x, x.def) : "";
  if (!tv || !rmAwake(tv)) return "";
  var src = A(tv).source;
  var hit = x.subs.filter(function (s) {
    var st = rmState(x, s.id);
    return s.src && s.src === src && rmVisible(x, s.id) && (st ? rmAwake(st) : rmIsCustom(s.id));
  })[0];
  return hit ? hit.id : "";
}

/* Whether a player has something to show: playing or paused, or on with a title. */
function rmShows(id) {
  if (!id) return false;
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

/* The keys of any device of a master: a media player's own, or the buttons a custom remote's roles name. */
function rmMemberKeys(x, k) {
  if (!rmIsCustom(k)) return rmKeys(k);
  var acts = rmRoleActs(x, k),
    out = {};
  function press(role) {
    return function () {
      remotePress({ a: acts[role] });
    };
  }
  ["ok", "back", "home", "settings", "playpause"].forEach(function (r) {
    if (acts[r]) out[r] = press(r);
  });
  /* typed text goes to the player its keyboard button names */
  var keys = (((rmCustom(x, k) || {}).rm || {}).btns || []).filter(function (b) {
    return b.a && b.a.t === "text";
  })[0];
  if (keys)
    out.text = function (v) {
      rmSendText(keys.a.e, v);
    };
  if (acts.hold || acts.ok) out.hold = press(acts.hold ? "hold" : "ok");
  if (acts.up || acts.down || acts.left || acts.right)
    out.dir = function (d) {
      if (!acts[d]) return false;
      remotePress({ a: acts[d] });
    };
  return out;
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
          if (how === "webos") call.apply(null, Integrations.remote.button(id, k));
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
  /* the player of what is on the screen */
  function screen() {
    return rmState(x, rmOnScreen(x) || x.def);
  }
  function nothingShown() {
    return !rmShows(screen());
  }
  /* the speaker is in now playing's place */
  function speakerHasRow() {
    return nothingShown() && !!rmSpeaker(x, screen());
  }
  /* whether the default's input list is opened from now playing: then it goes with that row and must be offered elsewhere */
  var inCard = false;
  return {
    ovr: function (role, arg) {
      var sub = rmOnScreen(x);
      if (!sub) return false;
      var f = rmMemberKeys(x, sub)[role];
      if (!f) return false;
      return f(arg) !== false;
    },
    np: function (b, media, icon, onTap) {
      inCard = !!onTap;
      var wrap = mk("div", "rm-np"),
        cards = {},
        style = npMode(media);
      [media]
        .concat(
          x.subs.map(function (s) {
            return rmState(x, s.id);
          })
        )
        .forEach(function (id) {
          if (!id || cards[id] || style === "off") return;
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
          taken = speakerHasRow();
        Object.keys(cards).forEach(function (id) {
          cards[id].style.display = !taken && id === (cards[on] ? on : media) ? "" : "none";
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
      /* now playing gave its row to the speaker, and the inputs with it: they are offered beside power meanwhile */
      if (free && inCard) {
        var inputs = tvSources(rmState(x, x.def)),
          up = function () {
            inputs.style.display = speakerHasRow() ? "" : "none";
          };
        up();
        reg(up);
        row.appendChild(inputs);
      }
    },
  };
}

/* The devices the title's dropdown offers: the default, the supplementary ones and the speakers. */
function rmChoices(x) {
  return [x.def]
    .concat(
      x.subs.map(function (s) {
        return s.id;
      }),
      x.spk
    )
    .filter(function (id) {
      return id && rmExists(x, id) && rmVisible(x, id);
    });
}

function rmWidget(key) {
  var p = String(key).split(":");
  return widgetOfSection(p[0], p[1], p[2]);
}

function rmStore(d) {
  return "hc-rm-" + d.wid;
}

/* The device the popup shows: what was picked while it is open (or remembered, when the master says so), else the default. */
function rmSelected(key, d) {
  var x = d.wx,
    all = rmChoices(x);
  if (!RMS || RMS.key !== key) RMS = { key: key, sel: x.keep ? deviceGet(rmStore(d), x.def) : x.def };
  return all.indexOf(RMS.sel) >= 0 ? RMS.sel : x.def;
}

/* A custom remote as the master's popup shows it. As the default it is the combined view: now playing and the speaker above it, and the buttons that are its roles go to the device on the screen. */
function rmCustomBuild(area, x, sel) {
  var c = rmCustom(x, sel);
  if (!c || !c.rm) return;
  if (sel !== x.def) {
    remotePage(area, c.rid, c);
    return;
  }
  var hooks = rmHooks(x),
    own = rmRoleActs(x, sel),
    copy = JSON.parse(JSON.stringify(c.rm)),
    st = rmState(x, sel),
    gap = false;
  if (x.subs.length || x.spk.length) {
    /* the remote's own now playing becomes the master's, so that it is there once, opens the apps as set, and follows the screen */
    var now = (copy.btns || []).filter(function (b) {
      return b.a.t === "now";
    })[0];
    if (now) copy.btns.splice(copy.btns.indexOf(now), 1);
    hooks.np(area, now ? now.a.e : st, c.icon || "media", now && now.a.m === "apps" ? tvSourceMenu(now.a.e) : undefined);
  }
  /* the speaker's place: an empty cell of the grid (beside Power, say), else above the remote */
  if (x.spk.length) {
    gap = (copy.btns || []).some(function (b) {
      return b.a.t === "gap";
    });
    if (!gap) hooks.beside(area, area);
  }
  (copy.btns || []).forEach(function (b) {
    if (b.a.t === "text")
      b.a.hook = function (v) {
        return hooks.ovr("text", v);
      };
  });
  rmActions(copy).forEach(function (item) {
    var mine = JSON.stringify(cleanRmAct(item.a));
    var role = RM_ROLES.filter(function (r) {
      return own[r] && JSON.stringify(cleanRmAct(own[r])) === mine;
    })[0];
    if (!role) return;
    item.a.hook = function () {
      return ["up", "down", "left", "right"].indexOf(role) >= 0 ? hooks.ovr("dir", role) : hooks.ovr(role);
    };
  });
  remotePage(area, c.rid, { rid: c.rid, name: c.name, icon: c.icon, rm: copy });
  if (gap) {
    var cell = area.querySelector(".rm-grid > .rm-gap");
    if (cell) hooks.beside(area, cell);
  }
}

/* One device's remote, put into `area`: the default as the combined view, any other as its own remote, and its Advanced settings as the device's own popup has them. */
function rmBuild(area, d, sel) {
  var x = d.wx,
    np = rmOpt(x, sel).np;
  RMNP = {};
  if (np) RMNP[sel] = np;
  try {
    if (!rmExists(x, sel)) area.appendChild(pill("info", _T("unavailable"), {}));
    else if (rmIsCustom(sel)) rmCustomBuild(area, x, sel);
    else if (sel === x.def) mediaPopup(area, sel, rmHooks(x));
    else if (x.spk.indexOf(sel) >= 0) mediaGeneric(area, sel, "media");
    else mediaPopup(area, sel);
  } finally {
    RMNP = {};
  }
  if (rmHasAdv(x, sel)) {
    var n = advList(sel).length;
    area.appendChild(
      pill("tune", _T("advanced_settings"), {
        sub: function () {
          return cntS(n, _T("setting"), _T("settings_2"));
        },
        tap: function () {
          showPopup("adv:" + sel, true);
        },
      })
    );
  }
}

/* Switching device changes what is in the popup, and never closes it: the old controls are taken out with their live updates, the new ones built in their place, and the popup eases to its new height. */
function rmShow(sel) {
  var o = RMS && RMS.view;
  if (!o || !o.area.isConnected) return;
  var from = o.area.offsetHeight;
  o.draw(sel);
  var t = o.area.closest(".sheet"),
    head = t && t.querySelector(".sh-t");
  if (head) {
    head.querySelector("span:not(.ic):not(.chev)").textContent = rmName(o.d.wx, sel);
    var old = head.querySelector(".ic"),
      next = mk("div", "", ic(rmIcon(o.d.wx, sel))).firstChild;
    if (old && next) head.replaceChild(next, old);
  }
  var calm = !o.area.animate || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (calm) return;
  o.area.style.overflow = "hidden";
  o.area.animate(
    [
      { height: from + "px", opacity: 0 },
      { height: o.area.offsetHeight + "px", opacity: 1 },
    ],
    { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" }
  ).onfinish = function () {
    o.area.style.overflow = "";
  };
}

function rmPick(key, d, id) {
  var view = RMS && RMS.key === key ? RMS.view : null;
  RMS = { key: key, sel: id, view: view };
  if (d.wx.keep) deviceSet(rmStore(d), id);
  rmShow(id);
}

function remoteMasterPopup(key) {
  var d = rmWidget(key);
  /* the master was removed while its popup was asked for */
  if (!d || !d.wx.def) return { title: _T("rm_title"), icon: "tv", build: function () {} };
  var sel = rmSelected(key, d),
    menu = {
      options: rmChoices(d.wx),
      current: sel,
      fmt: function (k) {
        return rmName(d.wx, k);
      },
      pick: function (id) {
        menu.current = id;
        rmPick(key, d, id);
      },
    };
  return {
    title: rmName(d.wx, sel),
    icon: rmIcon(d.wx, sel),
    titleMenu: menu,
    build: function (b) {
      var area = mk("div", "rm-body"),
        mine = [];
      b.appendChild(area);
      function draw(id) {
        area.innerHTML = "";
        mine = [];
        var prev = CUR;
        CUR = mine;
        try {
          rmBuild(area, d, id);
        } finally {
          CUR = prev;
        }
        mine.forEach(function (f) {
          f();
        });
      }
      RMS.view = { area: area, draw: draw, d: d };
      draw(sel);
      reg(function () {
        mine.forEach(function (f) {
          f();
        });
      });
    },
  };
}

/* The row of a Section: what the master is called, and what is on the screen. */
function remoteMasterRow(d, key) {
  var x = d.wx;
  function awake() {
    var st = rmState(x, x.def);
    return st ? rmAwake(st) : true;
  }
  return pill(d.icon || "tv", d.name, {
    sub: function () {
      if (!awake()) return _T("off");
      var on = rmOnScreen(x) || x.def,
        st = rmState(x, on),
        title = st ? String(A(st).media_title || "").trim() : "";
      return rmName(x, on) + (title ? " · " + title : "");
    },
    on: function () {
      var st = rmState(x, x.def);
      return !!st && rmAwake(st);
    },
    tap: function () {
      RMS = null;
      showPopup("rmaster:" + key, false);
    },
  });
}

/* ---- settings ---- */

/* The device being chosen (RMPICK: { d, done }) and the one being edited (RMEDIT: { d, k }). */
var RMPICK = null,
  RMEDIT = null;

function rmMembers(x) {
  return [x.def]
    .concat(
      x.subs.map(function (s) {
        return s.id;
      }),
      x.spk
    )
    .filter(Boolean);
}

function rmTaken(x) {
  var t = {};
  rmMembers(x).forEach(function (k) {
    t[k] = 1;
  });
  return t;
}

/* The custom remotes on the pages (a remote device, or an appliance's remote) that have something on them. */
function rmPageRemotes() {
  var out = [];
  allSectionLists().forEach(function (secs) {
    (secs || []).forEach(function (s) {
      (s.devs || []).forEach(function (d) {
        var rid = d.kind === "remote" ? d.rid : d.kind === "appliance" ? d.aid : "";
        if (rid && d.rm && (d.rm.btns.length || d.rm.img)) out.push({ k: "rm:" + rid, name: d.name });
      });
    });
  });
  return out;
}

/* Choosing a device: a media player, a custom remote of a page, or a new custom remote built right here. */
function rmPickPage(b) {
  var p = RMPICK;
  if (!p) return;
  var x = p.d.wx,
    taken = rmTaken(x);
  b.appendChild(
    pill("tv", _T("rm_pick_player"), {
      sub: function () {
        return _T("rm_pick_player_sub");
      },
      tap: function () {
        pickEntity(_T("rm_pick_player"), ["media_player"], null, function (id) {
          p.done(id);
          uiChanged();
          popBack();
        }, function (id) {
          return !!taken[id];
        });
      },
    })
  );
  b.appendChild(
    pill("plus", _T("rm_pick_new"), {
      sub: function () {
        return _T("rm_pick_new_sub");
      },
      tap: function () {
        var rid = newKey("rm");
        x.own = (x.own || []).concat({ rid: rid, name: _T("remote"), icon: "media", rm: { cols: 4, btns: [] } });
        p.done("rm:" + rid);
        uiChanged();
        popBack();
        showPopup("remote-build:" + rid, true);
      },
    })
  );
  var there = rmPageRemotes().filter(function (r) {
    return !taken[r.k];
  });
  if (there.length) b.appendChild(sep(_T("rm_pick_page"), "media"));
  there.forEach(function (r) {
    b.appendChild(
      pill("media", r.name, {
        tap: function () {
          p.done(r.k);
          uiChanged();
          popBack();
        },
      })
    );
  });
}

function rmDrop(x, k) {
  if (x.def === k) x.def = "";
  x.subs = x.subs.filter(function (s) {
    return s.id !== k;
  });
  x.spk = x.spk.filter(function (s) {
    return s !== k;
  });
  if (x.opt) delete x.opt[k];
  if (rmIsCustom(k) && x.own)
    x.own = x.own.filter(function (r) {
      return "rm:" + r.rid !== k;
    });
}

/* One device's options. */
function rmMemberPage(b) {
  var e = RMEDIT;
  if (!e) return;
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    redrawBox(box, function () {
      var x = e.d.wx,
        k = e.k,
        custom = rmIsCustom(k),
        speaker = x.spk.indexOf(k) >= 0,
        sub = x.subs.filter(function (s) {
          return s.id === k;
        })[0];
      if (rmMembers(x).indexOf(k) < 0) return;
      function set(name, v) {
        x.opt = x.opt || {};
        var o = (x.opt[k] = x.opt[k] || {});
        if (v === "" || v === undefined || (v && v.length === 0)) delete o[name];
        else o[name] = v;
        if (!Object.keys(o).length) delete x.opt[k];
        uiChanged();
      }
      box.appendChild(
        textRow("edit", _T("fx_name"), rmName(x, k), function (v) {
          set("name", v.trim().slice(0, 40));
          draw();
        }, 40)
      );
      box.appendChild(
        iconPick(QAICONS, rmIcon(x, k), function (n) {
          set("icon", n);
        })
      );
      if (sub) {
        var tv = rmState(x, x.def),
          inputs = tv ? tvSourceList(tv).slice() : [];
        if (sub.src && inputs.indexOf(sub.src) < 0) inputs.unshift(sub.src);
        box.appendChild(
          dropRow(
            _T("rm_input_of_default"),
            inputs.concat(["@type"]),
            function () {
              return sub.src;
            },
            function (v) {
              if (v !== "@type") {
                sub.src = v;
                uiChanged();
                draw();
                return;
              }
              /* a TV that is off may list no inputs: the name can be typed as the TV reports it */
              textDlg(_T("rm_input_name"), sub.src, _T("save"), function (t) {
                sub.src = t.trim().slice(0, 80);
                uiChanged();
                draw();
              }, 1);
            },
            "media",
            function (v) {
              return v === "@type" ? _T("rm_input_type") : v || _T("tap_to_choose");
            }
          )
        );
      }
      if (custom) {
        var c = rmCustom(x, k);
        box.appendChild(
          pill("tune", _T("rm_buttons"), {
            sub: function () {
              return _T("rm_edit_buttons");
            },
            tap: function () {
              showPopup("remote-build:" + k.slice(3), true);
            },
          })
        );
        box.appendChild(
          pill("tv", _T("rm_state_player"), {
            sub: function () {
              var st = rmOpt(x, k).state;
              return st ? entName(st) : _T("rm_state_none");
            },
            tap: function () {
              pickEntity(_T("rm_state_player"), ["media_player"], null, function (id) {
                set("state", id);
              });
            },
          })
        );
        var acts = rmActions(c && c.rm),
          chosen = rmOpt(x, k).roles || {};
        box.appendChild(sep(_T("rm_roles"), "tune"));
        box.appendChild(hintRow(_T("rm_roles_hint")));
        RM_ROLES.forEach(function (role) {
          var at = "none";
          acts.forEach(function (item, i) {
            if (chosen[role] && JSON.stringify(cleanRmAct(item.a)) === JSON.stringify(cleanRmAct(chosen[role]))) at = String(i);
          });
          box.appendChild(
            dropRow(
              _T("rm_role_" + role),
              ["none"].concat(
                acts.map(function (_, i) {
                  return String(i);
                })
              ),
              function () {
                return at;
              },
              function (v) {
                var roles = Object.assign({}, chosen);
                if (v === "none") delete roles[role];
                else roles[role] = cleanRmAct(acts[+v].a);
                set("roles", Object.keys(roles).length ? roles : undefined);
                draw();
              },
              "tune",
              function (v) {
                if (v === "none") return rmRoleActs(x, k)[role] ? _T("rm_role_auto") : _T("none");
                var item = acts[+v];
                return (item.label ? item.label + " · " : "") + rmActName(item.a);
              }
            )
          );
        });
      } else if (!speaker) {
        box.appendChild(
          dropRow(
            _T("now_playing"),
            ["page", "on", "off", "art"],
            function () {
              return rmOpt(x, k).np || "page";
            },
            function (v) {
              set("np", v === "page" ? "" : v);
              draw();
            },
            "media",
            function (v) {
              return { page: _T("rm_np_page"), on: _T("on_2"), off: _T("off"), art: _T("artwork_card") }[v];
            }
          )
        );
        var links = rmOpt(x, k).links || [];
        box.appendChild(sep(_T("rm_linked"), "tune"));
        box.appendChild(hintRow(_T("rm_linked_hint")));
        links.forEach(function (id) {
          box.appendChild(
            pill("trash", _T("rm_remove") + " " + entName(id), {
              tap: function () {
                set(
                  "links",
                  links.filter(function (y) {
                    return y !== id;
                  })
                );
                draw();
              },
            })
          );
        });
        box.appendChild(
          pill("plus", _T("rm_add_linked"), {
            tap: function () {
              pickEntity(_T("rm_add_linked"), ["select", "switch", "button", "number", "sensor", "binary_sensor"], null, function (id) {
                set("links", links.concat(id).slice(0, 12));
              }, function (id) {
                return links.indexOf(id) >= 0;
              });
            },
          })
        );
      }
      /* the same switch as the device's own settings have, for this device in the master */
      if (!custom && advList(k).length) {
        var offHome = advAllOff(),
          offPage = rmAdvOffOnPage(k),
          offAll = !!x.noadv;
        box.appendChild(
          pill("tune", _T("advanced_settings_button"), {
            on: function () {
              return !offHome && !offAll && !offPage && !rmOpt(x, k).noadv;
            },
            sub: function () {
              if (offHome) return _T("adv_off_dashboard");
              if (offPage) return _T("rm_adv_off_page");
              if (offAll) return _T("rm_adv_off_master");
              return rmOpt(x, k).noadv ? _T("off") : _T("on_cap");
            },
            tap: function () {
              if (offHome) return toast(_T("adv_off_dashboard"));
              if (offPage || offAll) return toast(offPage ? _T("rm_adv_off_page") : _T("rm_adv_off_master"));
              set("noadv", rmOpt(x, k).noadv ? "" : 1);
              draw();
            },
          })
        );
      }
      var rm = pill("trash", _T("rm_remove_device"), {
        tap: function () {
          rmDrop(x, k);
          uiChanged();
          popBack();
        },
      });
      stgActions(box, [rm], [rm]);
    });
  }
  draw();
}

function rmSettings(box, d) {
  var x = d.wx;
  function choose(done) {
    RMPICK = { d: d, done: done };
    showPopup("rm-pick", true);
  }
  function row(k, what) {
    return pill(rmIcon(x, k), rmName(x, k), {
      sub: function () {
        return what() + (rmIsCustom(k) ? " · " + _T("rm_custom") : "");
      },
      tap: function () {
        RMEDIT = { d: d, k: k };
        showPopup("rm-member", true);
      },
    });
  }
  box.appendChild(hintRow(_T("rm_devices_hint")));
  if (x.def)
    box.appendChild(
      row(x.def, function () {
        return _T("rm_default");
      })
    );
  else
    box.appendChild(
      pill("tv", _T("rm_default"), {
        sub: function () {
          return _T("tap_to_choose");
        },
        tap: function () {
          choose(function (k) {
            x.def = k;
          });
        },
      })
    );
  if (!x.def) return;
  box.appendChild(sep(_T("rm_supplementary"), "media"));
  box.appendChild(hintRow(_T("rm_supplementary_hint")));
  x.subs.forEach(function (s) {
    box.appendChild(
      row(s.id, function () {
        return s.src ? _T("rm_input_of_default") + ": " + s.src : _T("rm_no_input");
      })
    );
  });
  if (x.subs.length < RM_MAX)
    box.appendChild(
      pill("plus", _T("rm_add_supplementary"), {
        tap: function () {
          choose(function (k) {
            x.subs.push({ id: k, src: "" });
          });
        },
      })
    );
  box.appendChild(sep(_T("rm_speakers"), "media"));
  x.spk.forEach(function (id) {
    box.appendChild(
      row(id, function () {
        return _T("rm_speaker");
      })
    );
  });
  if (x.spk.length < RM_MAX)
    box.appendChild(
      pill("plus", _T("rm_add_speaker"), {
        tap: function () {
          var taken = rmTaken(x);
          pickEntity(_T("rm_add_speaker"), ["media_player"], null, function (id) {
            x.spk.push(id);
            uiChanged();
          }, function (id) {
            return !!taken[id];
          });
        },
      })
    );
  if (
    rmMembers(x).some(function (k) {
      return !rmIsCustom(k) && advList(k).length;
    })
  )
    box.appendChild(
      flagPill("tune", _T("advanced_settings_button"), x, "noadv", function (on) {
        return advAllOff() ? _T("adv_off_dashboard") : on ? _T("on_cap") : _T("off");
      }, true)
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
    if (!x.def || !rmExists(x, x.def)) return ed ? pill("tv", d.name, { sub: function () { return _T("rm_choose_default"); } }) : null;
    if (!rmVisible(x, x.def)) return null;
    return remoteMasterRow(d, secKey() + ":" + CURSEC.id + ":" + d.wid);
  },
  settings: rmSettings,
});
