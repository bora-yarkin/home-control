/* Which popup opens for which key, the popup sheet (drag to close, show, close), and the device popup entry. */

/* The main entity behind a device popup, for its Advanced settings entry. Vacuum and purifier have their own curated settings. */
function popupEntity(key) {
  var p = key.split(":"),
    k = p[0],
    id = p.slice(1).join(":");
  return ["ac", "fan", "media", "gmedia", "sw", "dev", "vac", "gvac"].indexOf(k) >= 0 && id
    ? id
    : null;
}

function popupDef(key) {
  var d = popupDefBase(key),
    ent = d && popupEntity(key);
  if (ent) {
    var inner = d.build;
    d.build = function (b) {
      inner(b);
      if (ISADMIN && PREFS.adv && !(UIDEV[ent] && UIDEV[ent].noadv) && advList(ent).length) {
        var n = advList(ent).length;
        b.appendChild(
          pill("tune", _T("advanced_settings"), {
            sub: function () {
              return cntS(n, _T("setting"), _T("settings_2"));
            },
            tap: function () {
              showPopup("adv:" + ent, true);
            },
          })
        );
      }
    };
  }
  return d;
}

function popupDefBase(key) {
  var p = key.split(":"),
    k = p[0],
    id = p.slice(1).join(":");
  if (HP_PAGES[k])
    return {
      title: _T(HP_PAGES[k][0]),
      icon: HP_PAGES[k][1],
      build: function (b) {
        HP_PAGES[k][2](b, id);
      },
    };
  if (k === "adv")
    return {
      title: (UIDEV[id] && UIDEV[id].name ? UIDEV[id].name + " · " : "") + _T("advanced"),
      icon: "tune",
      build: function (b) {
        advPopup(b, id);
      },
    };
  if (k === "kwiz")
    return {
      title: (devAt(id) && devAt(id).name ? devAt(id).name + " · " : "") + _T("device_setup"),
      icon: "tune",
      build: function (b) {
        kwizPage(b, id);
      },
    };
  if (k === "kpick")
    return {
      title: _T("choose_an_entity"),
      icon: "search",
      build: function (b) {
        kpickPage(b, id);
      },
    };
  if (k === "pick-pin")
    return {
      title: _T("add_to_pinned"),
      icon: "pin",
      build: function (b) {
        pinPick(b, id);
      },
    };
  if (k === "pick-scene")
    return {
      title: _T("scenes_in_this_section"),
      icon: "scene",
      build: function (b) {
        scnPick(b, id);
      },
    };
  if (k === "light-edit") return lightEditDef();
  if (k === "settings") return { title: _T("settings"), icon: "cog", build: settingsRoot };
  if (k === "stg-wall") return { title: _T("wall_mode"), icon: "tv", build: wallSettings };
  if (k === "ed-order")
    return {
      title: _T("reorder_sections"),
      icon: "drag",
      build: function (b) {
        secOrderPage(b, id);
      },
    };
  if (k === "edit-page")
    return {
      title: _T("page_settings"),
      icon: "tune",
      build: function (b) {
        editPageSettings(b, id);
      },
    };
  if (k === "appearance")
    return { title: _T("appearance"), icon: "palette", build: appearancePage };
  if (k === "alarm")
    return {
      title: entName(id),
      icon: "lock",
      build: function (b) {
        alarmPopup(b, id);
      },
    };
  if (k === "cam-add") return { title: _T("add_a_camera"), icon: "cam", build: camAddPage };
  if (k === "manage-glance") {
    var gt = glanceCfg().c.filter(function (x) {
      return x.id === id;
    })[0];
    return {
      title: gt ? gt.t : GL_NAME[id] || _T("at_a_glance"),
      icon: gt && gt.i && iconOk(gt.i) ? gt.i : "home",
      build: function (b) {
        glancePage(b, id);
      },
    };
  }
  if (k === "g-custom") {
    var gc = glanceCfg().c.filter(function (x) {
      return x.id === id;
    })[0];
    return {
      title: gc ? gc.t : "",
      icon: gc && gc.i && iconOk(gc.i) ? gc.i : "home",
      build: function (b) {
        glCustomPage(b, id);
      },
    };
  }
  if (k === "manage-autobackup")
    return { title: _T("automatic_backups"), icon: "sd", build: bkAutoPage };
  if (k === "manage-wallphotos")
    return { title: _T("screensaver_photos"), icon: "media", build: wallPhotosPage };
  if (k === "hscene") {
    var hs = id.split("~"),
      hsId = hs[0],
      hsRoom = hs[1] ? roomById(hs[1]) : null;
    return {
      title: A(hsId).name || A(hsId).friendly_name || _T("scenes"),
      icon: SCENE_ICON_HUE,
      build: function (b) {
        hueScenePopup(b, hsId, hsRoom);
      },
    };
  }
  if (k === "lscene") {
    var ls = sceneById(id);
    return {
      title: ls ? ls.name : _T("scenes"),
      icon: ls ? liveIcon(ls) : SCENE_ICON_LIVE,
      build: function (b) {
        liveScenePopup(b, id);
      },
    };
  }
  if (k === "live-edit") return liveMakerDef();
  if (k === "scene-new")
    return {
      title: _T("what_kind_of_scene"),
      icon: "scene",
      build: function (b) {
        sceneNewPage(b, id);
      },
    };
  if (k === "scene-areas")
    return {
      title: _T("choose_an_area"),
      icon: "target",
      build: function (b) {
        sceneAreasPage(b, id);
      },
    };
  if (k === "live-import")
    return {
      title: _T("import_a_live_scene_from_hue"),
      icon: "palette",
      build: function (b) {
        liveImportPage(b, id);
      },
    };
  if (k === "areas")
    return {
      title: (TITLES[id] ? TITLES[id] + " · " : "") + _T("areas"),
      icon: "target",
      build: function (b) {
        eaManager(b, id);
      },
    };
  if (k === "area-edit")
    return {
      title: EAD && !EAD.isNew ? _T("edit_area") : _T("new_area"),
      icon: "target",
      build: eaEditor,
    };
  if (k === "lfxs")
    return {
      title: _T("effect_settings"),
      icon: "sparkle",
      build: function (b) {
        lpFxSettingsPopup(b, id);
      },
    };
  if (k === "lfxc")
    return {
      title: _T("colour_lights"),
      icon: "palette",
      build: function (b) {
        lpFxColourPopup(b, id);
      },
    };
  if (k === "lstyle")
    return {
      title: _T("style"),
      icon: "palette",
      build: function (b) {
        lpStylePopup(b, id);
      },
    };
  if (k === "hsync")
    return {
      title: _T("spotify_sync"),
      icon: "syncring",
      build: function (b) {
        hsyncPopup(b, id);
      },
    };
  if (k === "hsbox")
    return {
      title: _T("hue_play_hdmi_sync_box"),
      icon: "syncring",
      build: function (b) {
        hsboxPopup(b, id);
      },
    };
  if (k.indexOf("hsync-") === 0 && HS_PICK[k])
    return {
      title: _T(HS_PICK[k][0]),
      icon: HS_PICK[k][1],
      build: function (b) {
        HS_PICK[k][2](b, id);
      },
    };
  if (k === "roomoff")
    return {
      title: _T("everything_off"),
      icon: "power",
      build: function (b) {
        roomOffPage(b, id);
      },
    };
  if (k === "lmaster")
    return {
      title: LMASTER_NAME[id] || _T("lights_master"),
      icon: "lights",
      build: function (b) {
        lightsMasterPopup(b, id);
      },
    };
  if (k === "light") {
    var n = LNAME[id] || [A(id).friendly_name || _T("light"), "light"];
    return {
      title: n[0],
      icon: n[1],
      build: function (b) {
        lightPopup(b, id);
      },
    };
  }
  if (k === "ac") {
    return {
      title: (UIDEV[id] || {}).name || _T("air_conditioner"),
      icon: "ac",
      build: function (b) {
        b.appendChild((UIDEV[id] || {}).dial ? acDial(id) : acSlider(id, _T("air_conditioner")));
        acSelects(b, id);
      },
    };
  }
  if (k === "fan") {
    var dv = UIDEV[id] || {};
    return {
      title: dv.name || A(id).friendly_name || _T("standing_fan"),
      icon: dv.icon || "fan",
      build: function (b) {
        if (isPurifier(id)) {
          readingsBlock(b, id, { plain: true });
          fanBlock(b, id, _T("speed"));
        } else {
          fanBlock(b, id, _T("speed"));
          readingsBlock(b, id);
        }
      },
    };
  }
  if (k === "media" || k === "gmedia") {
    var gm = UIDEV[id] || {};
    return {
      title: gm.name || A(id).friendly_name || _T("media"),
      icon: gm.icon || "media",
      build: function (b) {
        mediaPopup(b, id);
      },
    };
  }
  if (k === "sw") {
    var sd = UIDEV[id] || {};
    return {
      title: sd.name || A(id).friendly_name || _T("power"),
      icon: sd.icon || "plug",
      build: function (b) {
        swPopup(b, id);
      },
    };
  }
  if (k === "dev") {
    var dd = UIDEV[id] || {};
    return {
      title: dd.name || A(id).friendly_name || id,
      icon: dd.icon || sensorIcon(id),
      build: function (b) {
        devPopup(b, id);
      },
    };
  }
  if (k === "vac" || k === "gvac") {
    var gv = UIDEV[id] || {};
    return {
      title: gv.name || _T("vacuum"),
      icon: gv.icon || "vac",
      build: function (b) {
        vacPopup(b, id);
      },
    };
  }

  if (k === "presets-all")
    return {
      title: _T("all_saved"),
      icon: "palette",
      build: function (b) {
        savedAllPage(b, id);
      },
    };
  if (k === "scene-edit")
    return {
      title:
        SCD && SCD.room === "home"
          ? SCD.isNew
            ? _T("new_quick_action")
            : _T("edit_quick_action")
          : SCD && !SCD.isNew
            ? _T("edit_scene")
            : _T("new_scene"),
      icon: "scene",
      build: sceneEditor,
    };
  if (k === "scene-pick") return { title: _T("add_device"), icon: "plus", build: scenePick };
  if (k === "stg-areas") return { title: _T("areas"), icon: "target", build: stgAreas };
  if (k === "stg-dev") return { title: _T("devices_2"), icon: "plug", build: stgDevices };
  if (k === "manage-new") return { title: _T("new_devices"), icon: "plus", build: newDevPage };
  if (k === "manage-new1")
    return {
      title: NEWPICK ? A(NEWPICK).friendly_name || NEWPICK : _T("device"),
      icon: "plug",
      build: newDevOne,
    };
  if (k === "stg-access") return { title: _T("users_and_access"), icon: "lock", build: accessRoot };
  if (k === "stg-data") return { title: _T("backup_and_about"), icon: "sd", build: stgData };
  if (k === "stg-hist") return { title: _T("history"), icon: "clock", build: historyPage };
  if (k === "stg-notify") return { title: _T("notifications"), icon: "bell", build: notifyPage };
  if (k === "manage-nrule")
    return {
      title: NRULES[id] ? NRULES[id].title : _T("notification"),
      icon: "bell",
      build: function (b) {
        nruleEdit(b, id);
      },
    };
  if (k === "manage-log") return { title: _T("change_log"), icon: "restart", build: logPage };
  if (k === "manage-details") {
    var md2 = roomById(id);
    return {
      title: md2 ? md2.name : _T("room"),
      icon: md2 ? md2.icon : "home",
      build: function (b) {
        roomDetails(b, id);
      },
    };
  }
  if (k === "pick-ent")
    return { title: PICK ? PICK.title : _T("choose"), icon: "search", build: pickBuild };
  if (k === "manage-stat-tile")
    return {
      title: _T("status_tile"),
      icon: "thermo",
      build: function (b) {
        statTile(b, id);
      },
    };
  if (k === "manage-chip")
    return {
      title: _T("climate_tile"),
      icon: "thermo",
      build: function (b) {
        chipEdit(b, +id);
      },
    };
  if (k === "manage-bats") return { title: _T("batteries"), icon: "battery", build: batsPage };
  if (k === "manage-backup")
    return { title: _T("backup_and_restore"), icon: "sd", build: backupPage };
  if (k === "manage-check") return { title: _T("layout_check"), icon: "tune", build: checkPage };
  if (k === "manage-about")
    return { title: _T("about_and_diagnostics"), icon: "info", build: aboutPage };
  if (k === "manage-sec") {
    return {
      title: _T("section"),
      icon: "tune",
      build: function (b) {
        secEditor(b, id);
      },
    };
  }
  if (k === "manage-room-access") {
    var rr = roomById(id);
    return {
      title: _T("access") + (rr ? rr.name : _T("room")),
      icon: "lock",
      build: function (b) {
        roomAccessList(b, id);
      },
    };
  }
  if (k === "manage-access")
    return { title: _T("users_and_access"), icon: "lock", build: accessRoot };
  if (k === "access-user")
    return {
      title: accName(id),
      icon: "person",
      build: function (b) {
        accessUser(b, id);
      },
    };
  if (k === "access-room") {
    var ar = id.split(":");
    return {
      title: (roomById(ar[1]) || { name: _T("room") }).name + " · " + accName(ar[0]),
      icon: "lock",
      build: function (b) {
        accessRoom(b, id);
      },
    };
  }
  if (k === "manage-names") {
    return { title: _T("names_and_header"), icon: "edit", build: namesPage };
  }
  if (k === "sec-cond")
    return {
      title: _T("condition"),
      icon: "check",
      build: function (b) {
        secCondPage(b, id);
      },
    };
  if (k === "rb-room") {
    var rr = rbRooms().filter(function (x) {
      return x.id === id;
    })[0];
    return {
      title: rr ? rr.name : _T("room"),
      icon: "home",
      build: function (b) {
        rbRoomPage(b, id);
      },
    };
  }
  if (k === "sec-link")
    return {
      title: _T("link_a_section"),
      icon: "swap",
      build: function (b) {
        secLinkPage(b, id);
      },
    };
  if (k === "sec-types")
    return {
      title: _T("add_section"),
      icon: "plus",
      build: function (b) {
        secTypesPage(b, id);
      },
    };
  if (k === "sec-type")
    return {
      title: _T("section_type"),
      icon: "tune",
      build: function (b) {
        secTypePage(b, id);
      },
    };
  if (k === "manage-header") {
    var hr = roomById(id);
    return {
      title: hr ? hr.name : _T("room"),
      icon: hr ? hr.icon || "home" : "home",
      build: function (b) {
        roomHeaderPage(b, id);
      },
    };
  }
  if (k === "manage-hitem")
    return {
      title: _T("header_item"),
      icon: "tune",
      build: function (b) {
        hitemPage(b, +id);
      },
    };
  if (k === "manage-dev") {
    var md = devAt(id);
    return {
      title: md ? md.name : _T("device"),
      icon: md ? md.icon : "plug",
      build: function (b) {
        devManage(b, id);
      },
    };
  }
  if (k === "remote") {
    var rmd = remoteFind(id);
    return {
      title: rmd ? rmd.name : _T("remote"),
      icon: rmd ? rmd.icon : "gamepad",
      build: function (b) {
        remotePage(b, id);
      },
    };
  }
  if (k === "remote-btn")
    return {
      title: _T("rm_button"),
      icon: "plus",
      build: function (b) {
        remoteBtnPage(b, id);
      },
    };
  if (k === "manage-move")
    return {
      title: _T("move_to_room"),
      icon: "swap",
      build: function (b) {
        devMove(b, id);
      },
    };
  if (k === "manage-add") {
    var ma = roomById(id),
      mp = id.charAt(0) === "~" ? id.split("~") : null,
      me =
        mp &&
        secOrder(mp[1] === "home" ? "home" : "room:" + mp[1]).filter(function (x) {
          return x.id === mp[2];
        })[0];
    return {
      title: me
        ? widgetAddLabel(me.k) + " · " + secName(me)
        : _T("add_device") + (ma ? " · " + ma.name : ""),
      icon: "plus",
      build: function (b) {
        devAdd(b, id);
      },
    };
  }
  if (k === "search") return { title: _T("search"), icon: "search", build: searchPopup };
  if (k === "g-lights")
    return {
      title: _T("lights"),
      icon: "lights",
      build: function (b) {
        UI.rooms.forEach(function (r) {
          var ls = r.hide
            ? []
            : (ROOMLIGHTS[r.id] || []).filter(function (i) {
                return !gxOff("lights", i);
              });
          if (!ls.length) return;
          b.appendChild(sep(r.name, "lights"));
          ls.forEach(function (id) {
            b.appendChild(
              lightRow(id, false, function () {
                return glanceCfg().f;
              })
            );
          });
        });
      },
    };
  if (k === "g-acs")
    return {
      title: _T("air_conditioners"),
      icon: "ac",
      build: function (b) {
        gxDevs("acs", devsOf("climate")).forEach(function (d) {
          if ((UIDEV[d.id] || {}).dial) {
            b.appendChild(sep(TITLES[d.room], "home"));
            b.appendChild(acDial(d.id));
          } else b.appendChild(acSlider(d.id, TITLES[d.room]));
          acSelects(b, d.id);
        });
      },
    };
  if (k === "g-fans")
    return {
      title: _T("standing_fans"),
      icon: "fan",
      build: function (b) {
        gxDevs(
          "fans",
          devsOf("fan").filter(function (d) {
            return !d.pop;
          })
        ).forEach(function (d) {
          b.appendChild(sep(TITLES[d.room], "home"));
          fanBlock(b, d.id, d.name);
        });
      },
    };
  if (k === "g-batteries")
    return {
      title: _T("batteries"),
      icon: "battery",
      build: function (b) {
        BATLIST.forEach(function (x) {
          if (dom(x[1]) === "binary_sensor") {
            /* A battery flag has no percentage: it says low or fine. */
            b.appendChild(
              pill("battery", x[0], {
                val: function () {
                  var r = batReading(x[1]);
                  return r ? r.text : "";
                },
              })
            );
            return;
          }
          b.appendChild(
            sliderRow({
              icon: "battery",
              name: x[0],
              min: 0,
              max: 100,
              step: 1,
              readonly: true,
              get: function () {
                return V_(x[1]);
              },
              fmt: function (v) {
                return v + "%";
              },
            })
          );
        });
      },
    };
  if (k === "g-tvs") return { title: _T("media"), icon: "tv", build: mediaHub };
  if (k === "g-robot") {
    var gv0 = devsOf("vacuum")[0];
    return {
      title: _T("robot_vacuum"),
      icon: "vac",
      build: function (b) {
        if (gv0) vacPopup(b, gv0.id);
      },
    };
  }
  return { title: "", icon: "info", build: function () {} };
}

function sheetDrag(sh) {
  var sx = 0,
    sy = 0,
    dy = 0,
    mode = 0,
    vel = 0,
    ly = 0,
    lt = 0;
  function skip(t) {
    return (
      t && t.closest && t.closest(".slide,input,textarea,.touch,.rbtn.hold,.menu,.rb-map,.ptzov,.lw-c,.ae-c,.ae-tray,.lp-tray,.lp-bri,.lp-fx")
    );
  }
  function begin(x, y, t) {
    mode = skip(t) || sh.scrollTop > 0 ? 3 : 1;
    sx = x;
    sy = y;
    dy = 0;
    ly = y;
    lt = performance.now();
    vel = 0;
  }
  function move(x, y, e) {
    if (mode === 0 || mode === 3) return;
    var dx = x - sx;
    dy = y - sy;
    if (mode === 1) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) && sh.scrollTop <= 0) {
        mode = 2;
        sh.style.transition = "none";
        if (SHEET) SHEET.bg.style.transition = "none";
        capturePointer(sh, e);
      } else {
        mode = 3;
        return;
      }
    }
    if (e && e.cancelable) e.preventDefault();
    var d = Math.max(0, dy);
    sh.style.transform = "translate(-50%," + d + "px)";
    var now = performance.now();
    vel = (y - ly) / Math.max(1, now - lt);
    ly = y;
    lt = now;
    if (SHEET) SHEET.bg.style.opacity = String(Math.max(0, 1 - d / 520));
  }
  function end() {
    if (mode === 2) {
      var close = dy > 110 || vel > 0.6;
      sh.style.transition = "";
      sh.style.transform = "";
      if (SHEET) {
        SHEET.bg.style.transition = "";
        SHEET.bg.style.opacity = "";
      }
      if (close) LAYERS.length ? closeLayer() : closeSheet();
    }
    mode = 0;
  }
  sh.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch") return;
    begin(e.clientX, e.clientY, e.target);
  });
  sh.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    if (e.buttons) move(e.clientX, e.clientY, e);
  });
  sh.addEventListener("pointerup", function (e) {
    if (e.pointerType === "touch") return;
    end();
  });
  sh.addEventListener("pointercancel", function (e) {
    if (e.pointerType === "touch") return;
    end();
  });
  sh.addEventListener(
    "touchstart",
    function (e) {
      var t = e.touches[0];
      begin(t.clientX, t.clientY, e.target);
    },
    { passive: true }
  );
  sh.addEventListener(
    "touchmove",
    function (e) {
      var t = e.touches[0];
      move(t.clientX, t.clientY, e);
    },
    { passive: false }
  );
  sh.addEventListener("touchend", end);
  sh.addEventListener("touchcancel", end);
}

/* A popup that has to ask before it is left (Save, Apply once, Cancel) sets this to a function that takes over the leaving and returns true, or returns false when there is nothing to ask. Showing another popup clears it. */
var POPGUARD = null;

/* Popups opened over the one that is showing (the settings of an effect over the lights popup) instead of in its place. The popup underneath is left exactly as it is, and shown again when the one on top closes. Each entry keeps what the popup below needs back: its sheet, its back stack, its live updates, and what to do once it is showing again. */
var LAYERS = [];

/* `layer` is a function to call when the popup opened over the current one has closed, or true for none. */
function showPopup(key, push, layer) {
  if (!ISADMIN && ADMINPOP.test(key)) return;
  POPGUARD = null;
  closeMenu();
  var dim = null;
  if (layer && SHEET && SHEET.sh) {
    dim = mk("div", "scrim layer");
    dim.addEventListener("click", closeLayer);
    document.body.appendChild(dim);
    requestAnimationFrame(function () {
      dim.classList.add("in");
    });
    LAYERS.push({ sh: SHEET.sh, scrim: dim, stack: STACK, current: CURRENT, live: SLIVE, after: typeof layer === "function" ? layer : null });
    STACK = [];
    CURRENT = null;
    push = false;
  } else layer = false;
  if (push && CURRENT) STACK.push(CURRENT);
  CURRENT = key;
  var def = popupDef(key);
  stopStreams("sheet");
  var old = SHEET && !layer ? SHEET.sh : null;
  if (!SHEET) {
    var bg = mk("div", "scrim");
    document.body.appendChild(bg);
    bg.addEventListener("click", closeSheet);
    requestAnimationFrame(function () {
      bg.classList.add("in");
    });
    SHEET = { bg: bg, sh: null };
  }
  var sh = mk(
    "div",
    "sheet" + (key === "settings" || STACK.indexOf("settings") >= 0 ? " stg" : "") + (LAYERS.length ? " layer" : "")
  );
  document.body.appendChild(sh);
  sheetDrag(sh);
  SLIVE = [];
  CUR = SLIVE;
  var h = mk("div", "sh-h");
  if (STACK.length || def.tick) {
    var back = mk("div", "rnd pane", svg("back"));
    back.addEventListener("click", function () {
      if (def.tick && LAYERS.length) closeLayer();
      else popBack();
    });
    h.appendChild(back);
  }
  var t = mk("div", "sh-t pane", ic(def.icon) + "<span></span>");
  t.querySelector("span:last-child").textContent = def.title;
  h.appendChild(t);
  var x = mk("div", "rnd pane" + (def.tick ? " tick" : ""), svg(def.tick ? "check" : "close"));
  if (def.tick) x.setAttribute("aria-label", _T("save"));
  x.addEventListener("click", def.tick || (LAYERS.length ? closeLayer : closeSheet));
  h.appendChild(x);
  sh.appendChild(h);
  var body = mk("div");
  sh.appendChild(body);
  def.build(body);
  CUR = LIVE;
  SHEET.sh = sh;
  refresh();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      sh.classList.add("in");
    });
  });
  if (old) {
    old.classList.remove("in");
    old.style.pointerEvents = "none";
    setTimeout(function () {
      old.remove();
    }, 380);
  }
}

function closeSheet() {
  if (POPGUARD && POPGUARD(closeSheet)) return;
  POPGUARD = null;
  LPBACK = null;
  closeMenu();
  stopStreams("sheet");
  if (!SHEET) return;
  if (CAMPAGE && CAMPAGE.box.isConnected && !STOPS.page) CAMPAGE.start();
  var c = SHEET,
    under = LAYERS;
  LAYERS = [];
  under.forEach(function (l) {
    l.scrim.remove();
    l.sh.remove();
  });
  SHEET = null;
  STACK = [];
  CURRENT = null;
  SLIVE = [];
  CUR = LIVE;
  c.bg.classList.remove("in");
  if (c.sh) {
    c.sh.classList.remove("in");
    c.sh.style.pointerEvents = "none";
  }
  setTimeout(function () {
    c.bg.remove();
    if (c.sh) c.sh.remove();
  }, 380);
}

/* Closes the popup that was opened over another one (and what it opened in turn), and shows the one below again as it was. */
function closeLayer() {
  if (POPGUARD && POPGUARD(closeLayer)) return;
  POPGUARD = null;
  var l = LAYERS.pop();
  if (!l) return closeSheet();
  closeMenu();
  var top = SHEET.sh;
  top.classList.remove("in");
  top.style.pointerEvents = "none";
  l.scrim.classList.remove("in");
  setTimeout(function () {
    top.remove();
    l.scrim.remove();
  }, 380);
  SHEET.sh = l.sh;
  STACK = l.stack;
  CURRENT = l.current;
  SLIVE = l.live;
  CUR = SLIVE;
  refresh();
  if (l.after) l.after();
}

/* A saved popup choice is used only if it still leads somewhere; otherwise the device type decides. */
function devPop(d) {
  if (d.kind === "remote") return "remote:" + d.rid;
  if (d.pop && popupDef(d.pop).title) return d.pop;
  if (!d.id) return "";
  /* Lights and switches have their own popup; the other devices use the popup of their type, or the generic one. */
  if (d.kind === "light") return "light:" + d.id;
  if (d.kind === "switch")
    return (
      (Integrations.huesync.isSync(H(), d.id)
        ? "hsync:"
        : Integrations.huesyncbox.isBox(H(), d.id)
          ? "hsbox:"
          : "sw:") + d.id
    );
  var p = { media: "media:", climate: "ac:", fan: "fan:", vacuum: "vac:" }[d.kind];
  return p ? p + d.id : "dev:" + d.id;
}
