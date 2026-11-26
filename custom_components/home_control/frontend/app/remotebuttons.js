/* The buttons of the ready-made TV remotes (decision D-41). A button shows when the integration of the TV provides what it does; an administrator can hide it, or give it a source from any
   other integration. Kept per media player in UI.rbx: { role: { off: 1 } | { a: action of the remote builder } | { e: entity } }. */

/* Roles that run an action, and the ones that are filled by an entity, with the kinds that can fill them. */
var RBX_KEYS = ["power", "settings", "mute", "back", "home", "playpause", "volup", "voldown", "chup", "chdown"],
  RBX_ENT = {
    keyboard: ["remote", "media_player", "text", "input_text", "script"],
    brightness: ["number", "input_number"],
    apps: ["media_player", "select", "input_select"],
  },
  RBX_ICON = { power: "power", settings: "cog", mute: "mute", back: "back", home: "home", playpause: "playpause", volup: "volup", voldown: "voldown", chup: "chup", chdown: "chdown", keyboard: "keyboard", brightness: "bright", apps: "apps" };

function rbxGet(id, role) {
  return (UI.rbx && UI.rbx[id] && UI.rbx[id][role]) || null;
}

function rbxSet(id, role, value) {
  UI.rbx = UI.rbx || {};
  var o = (UI.rbx[id] = UI.rbx[id] || {});
  if (value) o[role] = value;
  else delete o[role];
  if (!Object.keys(o).length) delete UI.rbx[id];
  uiChanged();
}

/* Whether a media player says it can do something. A player that is off reports little, so it is only believed while it is on. */
function tvLacks(media, bits) {
  var s = V_(media);
  if (s === "off" || s === "standby" || s === "unavailable" || s === "unknown") return false;
  return !((A(media).supported_features || 0) & bits);
}

/* One button of a ready-made remote. `run` is what the integration offers (null: nothing). Left empty, so the others keep their places, when there is nothing to do. */
function rkey(media, role, run, hooks, label, hold) {
  var cfg = rbxGet(media, role);
  if ((cfg && cfg.off) || (!(cfg && cfg.a) && !run)) return mk("div");
  var own =
    cfg && cfg.a
      ? function () {
          if (!rmo(hooks, role)) remotePress({ a: cfg.a });
        }
      : run;
  return rbtn(RBX_ICON[role], own, label || "", hold);
}

/* Typing through a chosen entity: a text field is set, a script gets `text`, a remote or media player is asked the way its integration types. */
function rbxType(entity, text) {
  var d = dom(entity),
    e = (H().entities || {})[entity] || {},
    dv = e.device_id && H().devices[e.device_id],
    entry = dv && dv.config_entries && dv.config_entries[0];
  if (d === "text" || d === "input_text") return call(d, "set_value", { entity_id: entity, value: text });
  if (d === "script") return call("script", "turn_on", { entity_id: entity, variables: { text: text } });
  if (d === "remote") {
    var key = Integrations.media.textKey(e.platform, text);
    if (key !== null) return send(entity, key);
  }
  var c = Integrations.media.textCall(e.platform, entity, entry, text);
  if (c) return call.apply(null, c);
  toast(_T("rbx_cannot_type"));
}

/* The keyboard button. `type` is how the integration types, or null. */
function rkeyboard(media, type, hooks) {
  var cfg = rbxGet(media, "keyboard");
  if ((cfg && cfg.off) || (!(cfg && cfg.e) && !type)) return mk("div");
  return rbtn("keyboard", function () {
    kbDlg(function (v) {
      if (rmo(hooks, "text", v)) return;
      if (cfg && cfg.e) rbxType(cfg.e, v);
      else type(v);
    });
  });
}

/* The brightness cell: the chosen number, else the TV's own Backlight number, else empty. */
function rbright(media) {
  var cfg = rbxGet(media, "brightness");
  if (cfg && cfg.off) return mk("div", "tvbri");
  return cfg && cfg.e ? numberButton(cfg.e, "tv:" + media) : tvBrightness(media);
}

/* The apps and inputs tile: from the chosen entity, else the TV's own list. `own` says whether this remote offers the TV's list by itself. Null when there is none. */
function rapps(media, own) {
  var cfg = rbxGet(media, "apps");
  if (cfg && cfg.off) return null;
  if (cfg && cfg.e) {
    if (dom(cfg.e) === "media_player") return tvSources(cfg.e);
    var r = selectTile(
      _T("apps"),
      function () {
        return A(cfg.e).options || [];
      },
      function () {
        return V_(cfg.e);
      },
      function (v) {
        call(dom(cfg.e), "select_option", { entity_id: cfg.e, option: v });
      },
      "apps",
      String
    );
    r.classList.add("tvsrc");
    return r;
  }
  if (!own || (!tvSourceList(media).length && !tvLacks(media, 2048))) return null;
  return tvSources(media);
}

/* Whether the TV's list is reached by tapping Now playing (see tvAppsInNowPlaying): not when the apps were hidden or come from elsewhere. */
function rappsInRow(media) {
  return !rbxGet(media, "apps") && tvAppsInNowPlaying(media);
}

/* The same settings for the keys a remote master takes from this player (rmKeys). */
function rbxKeys(id, out) {
  ["settings", "back", "home", "playpause"].forEach(function (role) {
    var c = rbxGet(id, role);
    if (!c) return;
    if (c.off) delete out[role];
    else
      out[role] = function () {
        remotePress({ a: c.a });
      };
  });
  var k = rbxGet(id, "keyboard");
  if (k && k.off) delete out.text;
  else if (k)
    out.text = function (v) {
      rbxType(k.e, v);
    };
}

/* What a button does now, for the list in its settings. */
function rbxText(id, role) {
  var c = rbxGet(id, role);
  if (!c) return _T("rbx_auto");
  if (c.off) return _T("hidden");
  return c.a ? rmActName(c.a) : A(c.e).friendly_name || c.e;
}

function rbxPage(b, id) {
  b.appendChild(hintRow(_T("rbx_hint")));
  RBX_KEYS.concat(Object.keys(RBX_ENT)).forEach(function (role) {
    b.appendChild(
      pill(RBX_ICON[role], _T("rbx_" + role), {
        sub: function () {
          return rbxText(id, role);
        },
        tap: function () {
          showPopup("rbx-role:" + id + ":" + role, true);
        },
      })
    );
  });
}

function rbxRolePage(b, key) {
  var p = key.split(":"),
    id = p[0],
    role = p[1],
    c = rbxGet(id, role);
  function choice(icon, name, sub, on, tap) {
    b.appendChild(
      pill(icon, name, {
        on: function () {
          return on;
        },
        sub: function () {
          return sub;
        },
        tap: tap,
      })
    );
  }
  choice("restart", _T("rbx_auto"), _T("rbx_auto_sub"), !c, function () {
    rbxSet(id, role, null);
    popBack();
  });
  choice("close", _T("rbx_hide"), "", !!(c && c.off), function () {
    rbxSet(id, role, { off: 1 });
    popBack();
  });
  choice("swap", _T("rbx_other"), c && !c.off ? rbxText(id, role) : _T("rbx_other_sub"), !!(c && !c.off), function () {
    if (RBX_ENT[role])
      return pickEntity(_T("rbx_" + role), RBX_ENT[role], null, function (entity) {
        rbxSet(id, role, { e: entity });
        popBack();
      });
    RM.vacuum = null;
    rmChooseAction(function (a) {
      rbxSet(id, role, { a: a });
      return null;
    });
  });
}

/* The row that opens a TV's button settings. */
function rbxPill(id) {
  return pill("tune", _T("rbx_title"), {
    sub: function () {
      var n = Object.keys((UI.rbx && UI.rbx[id]) || {}).length;
      return n ? cntS(n, _T("rbx_changed_one"), _T("rbx_changed")) : _T("rbx_auto");
    },
    tap: function () {
      showPopup("rbx:" + id, true);
    },
  });
}
