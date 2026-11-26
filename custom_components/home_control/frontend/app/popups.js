/* Which popup opens for which key (the POPUP_DEFS table), the popup sheet (drag to close, show, close), and the device popup entry. */

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
      if (advButton(ent) && !advDevOff(ent)) {
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

/* What each popup is made of, by the part of the key before its first colon ("light:light.desk" is "light"): a function of the rest of the key that gives { title, icon, build(body) }.
   A popup is added here and opened with showPopup(key). The keys of plugins are in PLUGIN_PAGES and are looked at first. */
var POPUP_DEFS = {
  "adv": function (id) {
    return {
      title: (UIDEV[id] && UIDEV[id].name ? UIDEV[id].name + " · " : "") + _T("advanced"),
      icon: "tune",
      build: function (b) {
        advPopup(b, id);
      },
    };
  },
  "call": function (id) {
    return {
      title: (UIDEV[id] && UIDEV[id].name) || _T("dc_door_call"),
      icon: "bell",
      build: function (b) {
        callPopup(b, id);
      },
    };
  },
  "kwiz": function (id) {
    return {
      title: (devAt(id) && devAt(id).name ? devAt(id).name + " · " : "") + _T("device_setup"),
      icon: "tune",
      build: function (b) {
        kwizPage(b, id);
      },
    };
  },
  "kpick": function (id) {
    return {
      title: _T("choose_an_entity"),
      icon: "search",
      build: function (b) {
        kpickPage(b, id);
      },
    };
  },
  "pick-pin": function (id) {
    return {
      title: _T("add_to_pinned"),
      icon: "pin",
      build: function (b) {
        pinPick(b, id);
      },
    };
  },
  "light-edit": function (id) {
    return lightEditDef();
  },
  "lights-edit": function (id) {
    return lightsEditDef();
  },
  "settings": function (id) {
    return { title: _T("settings"), icon: "cog", build: settingsRoot };
  },
  "stg-wall": function (id) {
    return { title: _T("wall_mode"), icon: "tv", build: wallSettings };
  },
  "ed-order": function (id) {
    return {
      title: _T("reorder_sections"),
      icon: "drag",
      build: function (b) {
        secOrderPage(b, id);
      },
    };
  },
  "edit-page": function (id) {
    return {
      title: _T("page_settings"),
      icon: "tune",
      build: function (b) {
        editPageSettings(b, id);
      },
    };
  },
  "appearance": function (id) {
    return { title: _T("appearance"), icon: "palette", build: appearancePage };
  },
  "alarm": function (id) {
    return {
      title: entName(id),
      icon: "lock",
      build: function (b) {
        alarmPopup(b, id);
      },
    };
  },
  "cam-add": function (id) {
    return { title: _T("add_a_camera"), icon: "cam", build: camAddPage };
  },
  "manage-glance": function (id) {
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
  },
  "g-custom": function (id) {
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
  },


  "lscene": function (id) {
    var ls = sceneById(id);
    return {
      title: ls ? ls.name : _T("scenes"),
      icon: ls ? liveIcon(ls) : SCENE_ICON_LIVE,
      build: function (b) {
        liveScenePopup(b, id);
      },
    };
  },
  "live-edit": function (id) {
    return liveMakerDef();
  },
  "scene-auto": function (id) {
    return { title: AUTOED && !AUTOED.isNew ? _T("auto_edit_title") : _T("auto_new_title"), icon: "scene", build: autoSceneEditor };
  },
  "scene-tags": function (id) {
    return { title: _T("auto_tags_row"), icon: "tune", build: sceneTagsPage };
  },
  "scene-new": function (id) {
    return {
      title: _T("what_kind_of_scene"),
      icon: "scene",
      build: function (b) {
        sceneNewPage(b, id);
      },
    };
  },
  "scene-areas": function (id) {
    return {
      title: _T("choose_an_area"),
      icon: "target",
      build: function (b) {
        sceneAreasPage(b, id);
      },
    };
  },
  "live-import": function (id) {
    var src = liveImportSource(id);
    return {
      title: src ? _T(src.title) : _T("scenes"),
      icon: "palette",
      build: function (b) {
        liveImportPage(b, id);
      },
    };
  },
  "areas": function (id) {
    return {
      title: (TITLES[id] ? TITLES[id] + " · " : "") + _T("areas"),
      icon: "target",
      build: function (b) {
        eaManager(b, id);
      },
    };
  },
  "area-lights": function (id) {
    return {
      title: _T("add_a_light"),
      icon: "light",
      build: eaMorePage,
    };
  },
  "area-edit": function (id) {
    return {
      title: EAD && !EAD.isNew ? _T("edit_area") : _T("new_area"),
      icon: "target",
      build: eaEditor,
    };
  },
  "lfxs": function (id) {
    return {
      title: _T("effect_settings"),
      icon: "sparkle",
      build: function (b) {
        lpFxSettingsPopup(b, id);
      },
    };
  },
  "lfxc": function (id) {
    return {
      title: _T("colour_lights"),
      icon: "palette",
      build: function (b) {
        lpFxColourPopup(b, id);
      },
    };
  },
  "lmkmode": function (id) {
    return {
      title: _T("mode"),
      icon: "palette",
      build: function (b) {
        liveMakerModePopup(b);
      },
    };
  },
  "lstyle": function (id) {
    var style = pluginStyle(id);
    return {
      title: _T("style"),
      icon: "palette",
      build: function (b) {
        if (style) style.popup(b, id);
      },
    };
  },
  "roomoff": function (id) {
    return {
      title: _T("everything_off"),
      icon: "power",
      build: function (b) {
        roomOffPage(b, id);
      },
    };
  },
  "wcontent": function (id) {
    var d = widgetOfSection(id.split(":")[0], id.split(":")[1], id.split(":")[2]);
    return {
      title: (d && d.name) || _T("widget"),
      icon: (d && widgetDef(d.w) && widgetDef(d.w).icon) || "info",
      build: function (b) {
        widgetContentPage(b, id);
      },
    };
  },
  "wfolder": function (id) {
    var d = widgetOfSection(id.split(":")[0], id.split(":")[1], id.split(":")[2]);
    return {
      title: (d && d.name) || _T("folder"),
      icon: "plus",
      build: function (b) {
        folderPage(b, id);
      },
    };
  },
  "lmaster-edit": function (id) {
    var sec = masterById(id.split(":")[0], id.split(":")[1]);
    return {
      title: (sec && sec.mn) || _T("lights_master"),
      icon: "lights",
      build: function (b) {
        lightsMasterSettings(b, id);
      },
    };
  },
  "lmaster-part": function (id) {
    var part = id.split(":")[0],
      key = id.slice(part.length + 1),
      sec = masterById(key.split(":")[0], key.split(":")[1]);
    return {
      title: ((sec && sec.mn) || _T("lights_master")) + " · " + _T("lm_part_" + part),
      icon: "lights",
      build: function (b) {
        lightsMasterSettings(b, key, part);
      },
    };
  },
  "room-new": function (id) {
    return { title: _T("add_room"), icon: "plus", build: roomNewPage };
  },
  "lmaster-add": function (id) {
    return { title: _T("lights_master"), icon: "lights", build: function (b) { masterAddPage(b, id); } };
  },
  "lmaster-new": function (id) {
    return { title: _T("lm_new_master"), icon: "lights", build: function (b) { masterNewPage(b, id); } };
  },
  "lmaster-move": function (id) {
    return { title: _T("lm_move_or_copy"), icon: "swap", build: function (b) { masterMovePage(b, id); } };
  },
  "lmaster-lights": function (id) {
    return { title: _T("master_choose_lights"), icon: "lights", build: function (b) { masterLightsPage(b, id); } };
  },
  "lmaster-pscene": function (id) {
    return { title: _T("master_power_scene_pick"), icon: "scene", build: function (b) { masterSceneRunPage(b, id); } };
  },
  "lmaster": function (id) {
    return {
      title: LMASTER_NAME[id] || _T("lights_master"),
      icon: "lights",
      /* The settings of the master, for administrators, next to its power button. */
      settings: function () {
        showPopup("lmaster-edit:" + id.replace("~", ":"), true);
      },
      /* The lights master is closed by its close button or by tapping outside it; sliding the panel down closes it only from its title, so that dragging on the wheel, the tiles and the scenes never does. */
      titleSlide: true,
      /* A power button next to the close button: every light of the master on or off. */
      power: {
        on: function () {
          return countOn(lightUnits(LMASTER[id] || [])) > 0;
        },
        toggle: function () {
          masterPower(id);
        },
      },
      build: function (b) {
        lightsMasterPopup(b, id);
      },
    };
  },
  "light": function (id) {
    var n = LNAME[id] || [A(id).friendly_name || _T("light"), "light"];
    return {
      title: n[0],
      icon: n[1],
      build: function (b) {
        lightPopup(b, id);
      },
    };
  },
  "ac": function (id) {
    return {
      title: (UIDEV[id] || {}).name || A(id).friendly_name || _T("climate"),
      icon: "ac",
      build: function (b) {
        b.appendChild(climateTarget(id, _T("target_temperature"), !!(UIDEV[id] || {}).dial));
        acSelects(b, id);
      },
    };
  },
  "cover": function (id) {
    var cv = UIDEV[id] || {};
    return {
      title: cv.name || A(id).friendly_name || _T("cover"),
      icon: cv.icon || "swap",
      kind: "cover",
      build: function (b) {
        coverPopup(b, id);
      },
    };
  },
  "fan": function (id) {
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
  },
  "media": function (id) {
    var gm = UIDEV[id] || {};
    return {
      title: gm.name || A(id).friendly_name || _T("media"),
      icon: gm.icon || "media",
      build: function (b) {
        mediaPopup(b, id);
      },
    };
  },
  "dtime": function (id) {
    return {
      title: A(id).friendly_name || id,
      icon: "clock",
      build: function (b) {
        datetimePage(b, id);
      },
    };
  },
  "sw": function (id) {
    var sd = UIDEV[id] || {};
    return {
      title: sd.name || A(id).friendly_name || _T("power"),
      icon: sd.icon || "plug",
      build: function (b) {
        swPopup(b, id);
      },
    };
  },
  "dev": function (id) {
    var dd = UIDEV[id] || {};
    return {
      title: dd.name || A(id).friendly_name || id,
      icon: dd.icon || sensorIcon(id),
      build: function (b) {
        devPopup(b, id);
      },
    };
  },
  "vac": function (id) {
    var gv = UIDEV[id] || {};
    return {
      title: gv.name || _T("vacuum"),
      icon: gv.icon || "vac",
      kind: "clean",
      build: function (b) {
        vacPopup(b, id);
      },
    };
  },
  "presets-all": function (id) {
    return {
      title: _T("all_saved"),
      icon: "palette",
      build: function (b) {
        savedAllPage(b, id);
      },
    };
  },
  "scene-edit": function (id) {
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
  },
  "scene-pick": function (id) {
    return { title: _T("add_device"), icon: "plus", build: scenePick };
  },
  "stg-share": function (id) {
    return { title: _T("siri_and_homekit"), icon: "mic", build: sharePage };
  },
  "share-how": function (id) {
    return {
      title: _T("run_it_from_shortcuts"),
      icon: "scene",
      build: function (b) {
        shareHowPage(b, id);
      },
    };
  },
  "stg-areas": function (id) {
    return { title: _T("areas"), icon: "target", build: stgAreas };
  },
  "stg-effects": function (id) {
    return { title: _T("effects"), icon: "sparkle", build: fxSettings };
  },
  "fx-problems": function (id) {
    return { title: _T("problems_in_the_file"), icon: "info", build: fxProblemsPage };
  },
  "stg-dev": function (id) {
    return { title: _T("devices_2"), icon: "plug", build: stgDevices };
  },
  "manage-new": function (id) {
    return { title: _T("new_devices"), icon: "plus", build: newDevPage };
  },
  "manage-new1": function (id) {
    return {
      title: NEWPICK ? A(NEWPICK).friendly_name || NEWPICK : _T("device"),
      icon: "plug",
      build: newDevOne,
    };
  },
  "stg-access": function (id) {
    return { title: _T("users_and_access"), icon: "lock", build: accessRoot };
  },
  "stg-data": function (id) {
    return { title: _T("backup_and_about"), icon: "sd", build: stgData };
  },
  "stg-hist": function (id) {
    return { title: _T("history"), icon: "clock", build: historyPage };
  },
  "stg-notify": function (id) {
    return { title: _T("notifications"), icon: "bell", build: notifyPage };
  },
  "manage-nrule": function (id) {
    return {
      title: NRULES[id] ? NRULES[id].title : _T("notification"),
      icon: "bell",
      build: function (b) {
        nruleEdit(b, id);
      },
    };
  },
  "manage-nwatch": function (id) {
    return { title: _T("nw_alerts_for_any_entity"), icon: "bell", build: function (b) { watchEdit(b, id); } };
  },
  "manage-log": function (id) {
    return { title: _T("change_log"), icon: "restart", build: logPage };
  },
  "manage-details": function (id) {
    var md2 = roomById(id);
    return {
      title: md2 ? md2.name : _T("room"),
      icon: md2 ? md2.icon : "home",
      kind: "other",
      build: function (b) {
        roomDetails(b, id);
      },
    };
  },
  "pick-ent": function (id) {
    return { title: PICK ? PICK.title : _T("choose"), icon: "search", build: pickBuild };
  },
  "manage-stat-tile": function (id) {
    return {
      title: _T("status_tile"),
      icon: "thermo",
      build: function (b) {
        statTile(b, id);
      },
    };
  },
  "manage-chip": function (id) {
    return {
      title: _T("climate_tile"),
      icon: "thermo",
      build: function (b) {
        chipEdit(b, +id);
      },
    };
  },
  "manage-bats": function (id) {
    return { title: _T("batteries"), icon: "battery", build: batsPage };
  },
  "manage-backup": function (id) {
    return { title: _T("backup_and_restore"), icon: "sd", build: backupPage };
  },

  "manage-about": function (id) {
    return { title: _T("about_and_diagnostics"), icon: "info", build: aboutPage };
  },
  "manage-sec": function (id) {
    return {
      title: _T("section"),
      icon: "tune",
      build: function (b) {
        secEditor(b, id);
      },
    };
  },
  "manage-room-access": function (id) {
    var rr = roomById(id);
    return {
      title: _T("access") + (rr ? rr.name : _T("room")),
      icon: "lock",
      build: function (b) {
        roomAccessList(b, id);
      },
    };
  },
  "access-user": function (id) {
    return {
      title: accName(id),
      icon: "person",
      build: function (b) {
        accessUser(b, id);
      },
    };
  },
  "access-room": function (id) {
    var ar = id.split(":");
    return {
      title: (roomById(ar[1]) || { name: _T("room") }).name + " · " + accName(ar[0]),
      icon: "lock",
      build: function (b) {
        accessRoom(b, id);
      },
    };
  },
  "manage-names": function (id) {
    return { title: _T("names_and_header"), icon: "edit", build: namesPage };
  },
  "sec-cond": function (id) {
    return {
      title: _T("condition"),
      icon: "check",
      build: function (b) {
        secCondPage(b, id);
      },
    };
  },
  "rb-room": function (id) {
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
  },
  "sec-link": function (id) {
    return {
      title: _T("link_a_section"),
      icon: "swap",
      build: function (b) {
        secLinkPage(b, id);
      },
    };
  },
  "sec-types": function (id) {
    return {
      title: _T("add_section"),
      icon: "plus",
      build: function (b) {
        secTypesPage(b, id);
      },
    };
  },
  "manage-header": function (id) {
    var hr = roomById(id);
    return {
      title: hr ? hr.name : _T("room"),
      icon: hr ? hr.icon || "home" : "home",
      kind: "other",
      build: function (b) {
        roomHeaderPage(b, id);
      },
    };
  },
  "manage-hitem": function (id) {
    return {
      title: _T("header_item"),
      icon: "tune",
      build: function (b) {
        hitemPage(b, +id);
      },
    };
  },
  "lgroups": function (id) {
    return { title: _T("lgs_title"), icon: "lights", build: lgroupsPage };
  },
  "lgnew": function (id) {
    return {
      title: _T("lg_new_group"),
      icon: "lights",
      build: function (b) {
        lgNewPage(b);
      },
    };
  },
  "lgroup": function (id) {
    return {
      title: (lgDevices(id)[0] || {}).name || A(id).friendly_name || _T("lg_light_group"),
      icon: (lgDevices(id)[0] || {}).icon || "lights",
      build: function (b) {
        lgPage(b, id);
      },
    };
  },
  "manage-dev": function (id) {
    var md = devAt(id);
    return {
      title: md ? md.name : _T("device"),
      icon: md ? md.icon : "plug",
      build: function (b) {
        devManage(b, id);
      },
    };
  },
  "remote": function (id) {
    var rmd = remoteFind(id);
    return {
      title: rmd ? rmd.name : _T("remote"),
      icon: rmd ? rmd.icon : "media",
      build: function (b) {
        remotePage(b, id);
      },
    };
  },
  "appliance": function (id) {
    var apd = apFind(id);
    return {
      title: apd ? apd.name : _T("ap_appliance"),
      icon: apd ? apd.icon : "plug",
      build: function (b) {
        apPage(b, id);
      },
    };
  },
  "ap-edit": function (id) {
    return {
      title: _T("ap_set_up"),
      icon: "tune",
      build: function (b) {
        apEditPage(b, id);
      },
    };
  },
  "ap-slot": function (id) {
    return {
      title: _T(AP_SLOTS[id.split(":")[1]] ? AP_SLOTS[id.split(":")[1]].l : "ap_appliance"),
      icon: "plug",
      build: function (b) {
        apSlotPage(b, id);
      },
    };
  },
  "ap-extra": function (id) {
    return {
      title: _T("ap_add_a_row"),
      icon: "tune",
      build: function (b) {
        apExtraPage(b, id);
      },
    };
  },
  "dslot": function (id) {
    return {
      title: _T(DSLOT_LABEL[id.slice(id.lastIndexOf(":") + 1)] || "px_map"),
      icon: "tune",
      build: function (b) {
        dslotPage(b, id);
      },
    };
  },
  "dlist": function (id) {
    return {
      title: _T(DSLOT_LABEL[id.slice(id.lastIndexOf(":") + 1)] || "px_map"),
      icon: "tune",
      build: function (b) {
        dlistPage(b, id);
      },
    };
  },
  "remote-btn": function (id) {
    return {
      title: _T("rm_button"),
      icon: "plus",
      build: function (b) {
        remoteBtnPage(b, id);
      },
    };
  },
  "remote-build": function (id) {
    var rmd = remoteFind(id);
    return {
      title: (rmd ? rmd.name : _T("remote")) + " · " + _T("rm_buttons"),
      icon: "tune",
      build: function (b) {
        remoteBuild(b, id);
      },
    };
  },
  "remote-keys": function (id) {
    return {
      title: _T("rm_add_keys"),
      icon: "tune",
      build: function (b) {
        remoteKeysPage(b, id);
      },
    };
  },
  "remote-key": function (id) {
    return {
      title: _T("rm_choose_a_key"),
      icon: "play",
      build: function (b) {
        remoteKeyPage(b, id);
      },
    };
  },
  "remote-media": function (id) {
    return {
      title: _T("rm_choose_a_control"),
      icon: "play",
      build: function (b) {
        remoteMediaPage(b, id);
      },
    };
  },
  "manage-move": function (id) {
    return {
      title: _T("move_to_room"),
      icon: "swap",
      build: function (b) {
        devMove(b, id);
      },
    };
  },
  "manage-add": function (id) {
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
  },
  "search": function (id) {
    return { title: _T("search"), icon: "search", build: searchPopup };
  },
  "g-lights": function (id) {
    return {
      title: _T("lights"),
      icon: "lights",
      build: function (b) {
        glLightsPage(b);
      },
    };
  },
  "g-acs": function (id) {
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
  },
  "g-fans": function (id) {
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
  },
  "rm-pick": function () {
    return { title: _T("rm_pick"), icon: "plus", build: rmPickPage };
  },
  "rm-member": function () {
    var e = RMEDIT;
    return { title: e ? rmName(e.d.wx, e.k) : _T("rm_title"), icon: e ? rmIcon(e.d.wx, e.k) : "tv", build: rmMemberPage };
  },
  rmaster: function (id) {
    return remoteMasterPopup(id);
  },
  "vacap-room": function (id) {
    return { title: _T("room_preferences"), icon: "tune", build: function (b) { vacapRoomPage(b, id); } };
  },
  "vacap-r": function (id) {
    return { title: _T("vacap_room"), icon: "vac", build: function (b) { vacapItemPage(b, id, "rooms"); } };
  },
  "vacap-s": function (id) {
    return { title: _T("vacap_settings"), icon: "tune", build: function (b) { vacapItemPage(b, id, "sets"); } };
  },
  "vacap-a": function (id) {
    return { title: _T("vacap_start_actions"), icon: "play", build: function (b) { vacapItemPage(b, id, "run"); } };
  },
  "vacap-zones": function (id) {
    return { title: _T("vacap_zones"), icon: "target", build: function (b) { vacapZonePage(b, id); } };
  },
  "vacap-text": function (id) {
    return { title: _T("vacap_text"), icon: "edit", build: function (b) { vacapTextPage(b, id); } };
  },
  "setup": function () {
    return { title: _T("setup_title"), icon: "tune", build: setupPage };
  },
  "vacap-pick": function () {
    return {
      title: _T("vacap_pick_room"),
      icon: "vac",
      build: function (b) {
        var p = VACAPPICK;
        if (!p) return;
        if (!p.rooms.length) b.appendChild(hintRow(_T("vacap_no_rooms")));
        p.rooms.forEach(function (r) {
          b.appendChild(
            pill("vac", r.l || r.k, {
              tap: function () {
                popBack();
                p.done({ t: "room", r: r.k });
              },
            })
          );
        });
      },
    };
  },
  "g-alerts": function (id) {
    return {
      title: _T("attention"),
      icon: "alert",
      build: function (b) {
        b.appendChild(alertsDevice(true));
      },
    };
  },
  "g-batteries": function (id) {
    return { title: _T("batteries"), icon: "battery", build: batsPopup };
  },
  "pick-bat": function (id) {
    return { title: _T("add_battery_device"), icon: "battery", build: batPickPage };
  },
  "g-tvs": function (id) {
    return { title: _T("media"), icon: "tv", build: mediaHub };
  },
  "g-robot": function (id) {
    var gv0 = vacuumList()[0];
    return {
      title: _T("robot_vacuum"),
      icon: "vac",
      build: function (b) {
        if (!gv0) return;
        if (gv0.d.kind === "appliance") vacapPage(b, gv0.d);
        else vacPopup(b, gv0.id);
      },
    };
  },
};
POPUP_DEFS["gmedia"] = POPUP_DEFS["media"];

/* Customising items, types, the look and the person's own attention rules (app/customize.js, which loads after this file: its pages are asked for when opened). */
[
  ["cust", "customize", "palette", function () { return custPage; }],
  ["cust-cond", "condition", "check", function () { return custCondPage; }],
  ["look", "look_title", "palette", function () { return lookPage; }],
  ["types", "types_title", "tune", function () { return typesPage; }],
  ["type", "types_title", "tune", function () { return typePage; }],
  ["my-alerts", "my_alerts", "alert", function () { return myAlertsPage; }],
  ["my-alert", "my_alerts", "alert", function () { return myAlertPage; }],
].forEach(function (p) {
  POPUP_DEFS[p[0]] = function (id) {
    return {
      title: _T(p[1]),
      icon: p[2],
      build: function (b) {
        p[3]()(b, id);
      },
    };
  };
});

/* A Popup widget's popup, and the button settings of a ready-made remote. */
POPUP_DEFS["wpop"] = function (id) {
  var p = id.split(":"),
    s = popupSection(p[0], p[1]),
    w = secOrder(scopeKey(p[0])).reduce(function (found, x) {
      return found || (x.devs || []).filter(function (d) { return d.wid === p[1] && d.w === "popup"; })[0];
    }, null);
  return {
    title: w ? w.name : s ? secName(s) : _T("popup_widget"),
    icon: (w && w.icon) || "apps",
    build: function (b) {
      popupBody(b, p[0], p[1], w && w.name);
    },
  };
};
POPUP_DEFS["rbx"] = function (id) {
  return {
    title: _T("rbx_title"),
    icon: "tune",
    build: function (b) {
      rbxPage(b, id);
    },
  };
};
POPUP_DEFS["rbx-role"] = function (id) {
  return {
    title: _T("rbx_" + id.split(":")[1]),
    icon: RBX_ICON[id.split(":")[1]] || "tune",
    build: function (b) {
      rbxRolePage(b, id);
    },
  };
};
POPUP_DEFS["gvac"] = POPUP_DEFS["vac"];

function popupDefBase(key) {
  var p = key.split(":"),
    k = p[0],
    id = p.slice(1).join(":");
  if (PLUGIN_PAGES[k])
    return {
      title: typeof PLUGIN_PAGES[k][0] === "function" ? PLUGIN_PAGES[k][0](id) : _T(PLUGIN_PAGES[k][0]),
      icon: PLUGIN_PAGES[k][1],
      build: function (b) {
        PLUGIN_PAGES[k][2](b, id);
      },
    };
  var make = Object.prototype.hasOwnProperty.call(POPUP_DEFS, k) ? POPUP_DEFS[k] : null;
  return make ? make(id) : { title: "", icon: "info", build: function () {} };
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
    mode = skip(t) || sh.scrollTop > 0 || (sh.dataset.titleSlide && !(t && t.closest && t.closest(".sh-h"))) ? 3 : 1;
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

/* The header of the popup that is being built or shown: guardUnsaved gives it its checkmark (popupCheck). */
var POPHEAD = null;

/* The checkmark of a popup that has something to save, next to its close button: every such popup has it, and it does what Save does when closing asks "Unsaved changes" (guardUnsaved, scenenew.js).
   There is one for each popup; a page that is drawn again only hands it its new guard. */
function popupCheck(guard) {
  var h = POPHEAD;
  if (!h) return;
  var c = h.querySelector(".rnd.save");
  if (!c) {
    c = mk("div", "rnd pane save", svg("check"));
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", _T("save"));
    c.tabIndex = 0;
    var act = function () {
      c.guard.save(c.guard.done);
    };
    c.addEventListener("click", act);
    c.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        act();
      }
    });
    h.insertBefore(c, h.lastChild);
  }
  c.guard = guard;
}

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
    LAYERS.push({ sh: SHEET.sh, scrim: dim, stack: STACK, current: CURRENT, live: SLIVE, head: POPHEAD, after: typeof layer === "function" ? layer : null });
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
    "sheet" + (key === "settings" || STACK.indexOf("settings") >= 0 ? " stg" : "") + (LAYERS.length ? " layer" : "") + (/^(manage-dev|manage-add|lgroup:|lgnew)/.test(key) ? " tall" : "")
  );
  document.body.appendChild(sh);
  if (def.titleSlide) sh.dataset.titleSlide = "1";
  sheetDrag(sh);
  SLIVE = [];
  CUR = SLIVE;
  var h = mk("div", "sh-h");
  if (STACK.length) {
    var back = mk("div", "rnd pane", svg("back"));
    back.addEventListener("click", popBack);
    h.appendChild(back);
  }
  var t = mk("div", "sh-t pane", ic(def.power ? "power" : def.icon) + "<span></span>");
  if (def.kind) t.querySelector(".ic").dataset.k = def.kind;
  t.querySelector("span:last-child").textContent = def.title;
  h.appendChild(t);
  /* A popup that can show one of several things (a remote master) names them in a dropdown of its title. */
  if (def.titleMenu && def.titleMenu.options.length > 1) {
    t.classList.add("menu-t");
    t.setAttribute("role", "button");
    t.setAttribute("tabindex", "0");
    t.setAttribute("aria-haspopup", "true");
    t.appendChild(mk("span", "chev", svg("chev")));
    var openTitle = function () {
      openMenu(t, def.titleMenu.options, def.titleMenu.current, def.titleMenu.pick, def.titleMenu.fmt);
    };
    t.addEventListener("click", openTitle);
    t.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openTitle();
      }
    });
  }
  /* A popup with a power button has it in the place of the icon at the left of its title: every light of the master on or off. */
  if (def.power) {
    var pw = t.querySelector(".ic");
    pw.classList.add("pwr");
    pw.setAttribute("role", "button");
    pw.setAttribute("tabindex", "0");
    pw.setAttribute("aria-label", _T("power"));
    pw.addEventListener("click", def.power.toggle);
    pw.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        def.power.toggle();
      }
    });
    SLIVE.push(function () {
      if (pw.isConnected) pw.classList.toggle("act", !!def.power.on());
    });
    pw.classList.toggle("act", !!def.power.on());
  }
  if (def.settings && ISADMIN) {
    var st2 = mk("div", "rnd pane", svg("cog"));
    st2.setAttribute("role", "button");
    st2.setAttribute("aria-label", _T("settings"));
    st2.addEventListener("click", def.settings);
    h.appendChild(st2);
  }
  var x = mk("div", "rnd pane", svg("close"));
  x.addEventListener("click", LAYERS.length ? closeLayer : closeSheet);
  h.appendChild(x);
  sh.appendChild(h);
  var body = mk("div");
  sh.appendChild(body);
  POPHEAD = h;
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
  POPHEAD = l.head;
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
  if (d.kind === "appliance") return "appliance:" + d.aid;
  if (d.pop && popupDef(d.pop).title) return d.pop;
  if (!d.id) return "";
  /* Lights and switches have their own popup; the other devices use the popup of their type, or the generic one. */
  if (d.kind === "light") return "light:" + d.id;
  if (d.kind === "switch") {
    var dk = pluginDeviceKind(d.id);
    return (dk ? dk.pop : "sw") + ":" + d.id;
  }
  var p = { media: "media:", climate: "ac:", fan: "fan:", vacuum: "vac:", cover: "cover:" }[d.kind];
  return p ? p + d.id : "dev:" + d.id;
}
