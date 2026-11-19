/* Backups: automatic snapshots, export, import and restore. */

/* ---- automatic backups: snapshots of the dashboard setup kept in HA system data ---- */
var BK_KEY = "dashboard_backups";

function bkOn() {
  return !!(STORE.cfg && STORE.cfg.autobackup);
}

function bkCfg() {
  var c = STORE.cfg || {};
  return { keep: c.backupKeep || 5, every: c.backupEvery || 6 };
}

function bkList() {
  return storeGet(BK_KEY).then(function (l) {
    return Array.isArray(l) ? l : [];
  });
}

function bkWrite(list) {
  return HA.data.set("system", BK_KEY, list);
}

function bkAdd(json, force) {
  if (!ISADMIN || !bkOn() || !json) return Promise.resolve(false);
  return bkList()
    .then(function (list) {
      var cfg = bkCfg(),
        last = list.length ? list[list.length - 1].t : 0;
      if (!force && Date.now() - last < cfg.every * 3600000) return false;
      list.push({ t: Date.now(), by: (H().user && H().user.name) || "", j: json });
      while (list.length > cfg.keep) list.shift();
      return bkWrite(list).then(function () {
        return true;
      });
    })
    .catch(function () {
      return false;
    });
}

function bkAutoPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(
      pill("sd", _T("automatic_backups"), {
        on: function () {
          return bkOn();
        },
        sub: function () {
          return bkOn() ? _T("on_cap") : _T("off");
        },
        tap: function () {
          STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { autobackup: !bkOn() }));
          storeChanged();
          redrawBox(box, draw);
        },
      })
    );
    var hint = mk("div", "hint");
    hint.textContent = _T("a_snapshot_of_your_setup_is_saved_ju");
    box.appendChild(hint);
    if (!bkOn()) return;
    box.appendChild(sep(_T("keep"), "sd"));
    box.appendChild(
      seg(
        [
          ["3", "3"],
          ["5", "5"],
          ["10", "10"],
          ["20", "20"],
        ],
        String(bkCfg().keep),
        function (v) {
          STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { backupKeep: +v }));
          storeChanged();
          redrawBox(box, draw);
        }
      )
    );
    box.appendChild(sep(_T("at_most_one_every"), "clock"));
    box.appendChild(
      seg(
        [
          ["1", _T("hour")],
          ["6", _T("6_hours")],
          ["24", _T("day")],
        ],
        String(bkCfg().every),
        function (v) {
          STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { backupEvery: +v }));
          storeChanged();
          redrawBox(box, draw);
        }
      )
    );
    box.appendChild(
      pill("sd", _T("back_up_now"), {
        sub: function () {
          return _T("saves_the_current_setup_as_a_snapsho");
        },
        tap: function () {
          STORE.ui = UI;
          bkAdd(JSON.stringify(STORE), true).then(function (ok) {
            toast(ok ? _T("snapshot_saved") : _T("couldn_t_save_the_snapshot"));
            redrawBox(box, draw);
          });
        },
      })
    );
    box.appendChild(sep(_T("snapshots"), "restart"));
    var holder = mk("div");
    box.appendChild(holder);
    bkList()
      .then(function (list) {
        if (!list.length) {
          var e = mk("div", "hint");
          e.textContent = _T("no_snapshots_yet");
          holder.appendChild(e);
          return;
        }
        list
          .slice()
          .reverse()
          .forEach(function (s, i) {
            var when = new Date(s.t);
            holder.appendChild(
              pill(
                "sd",
                when.toLocaleDateString(LOC(), { day: "numeric", month: "short" }) +
                  " · " +
                  tfmt(when, { hour: "2-digit", minute: "2-digit" }),
                {
                  sub: function () {
                    return (
                      (s.by ? _T("by") + s.by + " · " : "") +
                      Math.round(s.j.length / 102.4) / 10 +
                      _T("kb_tap_to_restore")
                    );
                  },
                  tap: function () {
                    restoreFrom(s.j);
                  },
                }
              )
            );
          });
      })
      .catch(function () {
        var e = mk("div", "hint");
        e.textContent = _T("couldn_t_read_the_snapshots");
        holder.appendChild(e);
      });
  }
  redrawBox(box, draw);
}

/* backup and restore */
/* One page on its own: its sections and the scenes they list, as text that can be pasted into another page or dashboard. */
function pageExportJSON(sc) {
  var secs = JSON.parse(JSON.stringify(secOrder(sc))),
    ids = {};
  secs.forEach(function (s) {
    (s.scn || []).forEach(function (i) {
      ids[i] = 1;
    });
    (s.pins || []).forEach(function (p) {
      if (p.kind === "cscene") ids[p.sid] = 1;
    });
  });
  var scenes = STORE.scenes.filter(function (x) {
      return ids[x.id];
    }),
    areaIds = {};
  scenes.forEach(function (x) {
    if (x.live)
      (x.live.areas && x.live.areas.length ? x.live.areas : [x.live.area]).forEach(function (a) {
        areaIds[a] = 1;
      });
  });
  return JSON.stringify(
    {
      app: "dashboard-page",
      version: 1,
      name: sc === "home" ? UI.meta.homeTab || TITLES.home : (UIROOM[sc.slice(5)] || {}).name || "",
      exported: new Date().toISOString(),
      sections: secs,
      scenes: scenes,
      areas: STORE.eareas.filter(function (a) {
        return areaIds[a.id];
      }),
    },
    null,
    1
  );
}

/* Saves the page as a file: its sections, the scenes they list and the areas those scenes play on. */
function pageExportFile(sc) {
  var rm = sc === "home" ? null : UIROOM[sc.slice(5)];
  downloadText("dashboard-page-" + fileSlug(rm ? rm.name : "home", "page") + "-" + fileStamp() + ".json", pageExportJSON(sc));
  toast(_T("page_exported"));
}

/* A page file read and checked, not yet applied: { name, secs, fresh, newAreas } or { problem }. */
function pageParse(sc, text) {
  var j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    return { problem: _T("that_isn_t_valid_page_text") };
  }
  if (!j || j.app !== "dashboard-page" || !Array.isArray(j.sections)) return { problem: _T("that_isn_t_a_dashboard_page") };
  var pk = sc === "home" ? "home" : sc.slice(5),
    map = {},
    fresh = [];
  (Array.isArray(j.scenes) ? j.scenes : []).slice(0, 60).forEach(function (x) {
    var c = cleanScene(x);
    if (!c) return;
    c.room = pk;
    var old = sceneById(c.id);
    if (old && JSON.stringify(Object.assign({}, old, { room: pk })) === JSON.stringify(c)) {
      map[c.id] = c.id;
      return;
    }
    if (old) {
      var n = "s" + Date.now().toString(36) + Object.keys(map).length;
      map[c.id] = n;
      c.id = n;
    } else map[c.id] = c.id;
    fresh.push(c);
  });
  /* The areas live scenes play on come along when they are missing here; a different area with the same id is kept as it is. */
  var newAreas = [];
  (Array.isArray(j.areas) ? j.areas : []).slice(0, 24).forEach(function (x) {
    var c = cleanArea(x);
    if (c && !eaById(c.id)) {
      c.room = pk;
      newAreas.push(c);
    }
  });
  var secs = cleanLayout(j.sections);
  if (!secs.length) return { problem: _T("that_page_has_no_sections") };
  secs.forEach(function (s) {
    if (s.scn)
      s.scn = s.scn
        .map(function (i) {
          return map[i];
        })
        .filter(Boolean);
    if (s.pins)
      s.pins = s.pins.filter(function (p) {
        if (p.kind !== "cscene") return true;
        if (!map[p.sid]) return false;
        p.sid = map[p.sid];
        return true;
      });
  });
  return { name: typeof j.name === "string" ? j.name.slice(0, 40) : "", secs: secs, fresh: fresh, newAreas: newAreas };
}

/* Asks for a page file, checks it, says what is in it and replaces the page only on a yes; a backup of the whole dashboard is kept first. */
function pageImportFile(sc) {
  pickTextFile({}, function (text) {
    var plan = pageParse(sc, text);
    if (plan.problem) {
      toast(plan.problem);
      return;
    }
    var what =
      cntS(plan.secs.length, _T("section_lc"), _T("sections_lc")) +
      ", " +
      cntS(plan.fresh.length, _T("new_scene_one"), _T("new_scene_many")) +
      (plan.newAreas.length ? ", " + cntS(plan.newAreas.length, _T("new_area_one"), _T("new_area_many")) : "");
    confirmDlg(
      _T("page_import_q") + (plan.name ? " “" + plan.name + "”" : "") + "?\n" + what + ". " + _T("a_backup_is_kept_first"),
      function () {
        STORE.ui = UI;
        bkAdd(JSON.stringify(STORE), true);
        plan.fresh.forEach(function (c) {
          if (STORE.scenes.length < 60) STORE.scenes.push(c);
        });
        plan.newAreas.forEach(function (a) {
          if (STORE.eareas.length < 24) STORE.eareas.push(a);
        });
        setSecOrder(sc, plan.secs);
        devIndex(UI);
        uiChanged();
        toast(_T("page_imported"));
        closeSheet();
      },
      _T("replace_this_page")
    );
  });
}

function exportJSON() {
  STORE.ui = UI;
  return JSON.stringify(
    { app: "dashboard", version: 1, exported: new Date().toISOString(), data: STORE },
    null,
    1
  );
}

function downloadBackup() {
  downloadText("dashboard-backup-" + fileStamp() + ".json", exportJSON());
}

function restoreFrom(text) {
  var j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    toast(_T("that_isn_t_valid_backup_text"));
    return;
  }
  var data = j && j.data ? j.data : j;
  if (!data || data.v !== 1) {
    toast(_T("that_isn_t_a_dashboard_backup"));
    return;
  }
  var n = cleanStore(data);
  if (!n.ui) n.ui = cleanUI(seedUI());
  confirmDlg(_T("replace_the_current_rooms_scenes_pre"), function () {
    STORE.ui = UI;
    bkAdd(JSON.stringify(STORE), true);
    STORE = n;
    UI = n.ui;
    STORE_VER++;
    storeSave();
    applyUI();
    buildDock();
    closeSheet();
    render();
    toast(_T("backup_restored"));
  });
}

function backupPage(b) {
  var hint = mk("div", "hint");
  hint.textContent = _T("a_backup_holds_your_rooms_devices_la");
  b.appendChild(hint);
  b.appendChild(
    pill("sd", _T("download_backup_file"), {
      sub: function () {
        return _T("saves_a_json_file_on_this_device");
      },
      tap: function () {
        downloadBackup();
        toast(_T("backup_downloaded"));
      },
    })
  );
  b.appendChild(sep(_T("restore"), "restart"));
  b.appendChild(
    pill("check", _T("restore_from_a_file"), {
      sub: function () {
        return _T("choose_a_backup_file_you_saved_earli");
      },
      tap: function () {
        pickTextFile({}, function (text) {
          restoreFrom(text);
        });
      },
    })
  );
}
