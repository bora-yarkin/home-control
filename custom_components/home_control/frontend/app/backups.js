/* Backups: the file a backup is saved as, and restoring from it. docs/manual/backup.md says what is in one. */

/* A backup is {app, version, exported, data, extras}. `data` is the shared dashboard. `extras` is what the dashboard keeps elsewhere: the administrator's own appearance, this
   device's settings, the pictures of image remotes, the published scenes, the TV Home keys and the imported effect files. A part that is not there is left as it is on restore. */
var BACKUP_APP = "dashboard",
  BACKUP_VERSION = 1,
  BACKUP_MAX = 60 * 1024 * 1024,
  BACKUP_DEVKEYS = /^(db_large|lp\.mem|lp\.fxs|lp\.fxc|lp\.fxr|db_ls_[A-Za-z0-9_-]{1,48}|hc-rm-[A-Za-z0-9_-]{1,48})$/,
  BACKUP_PICTURE = /^\/home_control_remotes\/[a-f0-9]{12}\.(png|jpg|webp)$/,
  BACKUP_PICTURES = /\/home_control_remotes\/[a-f0-9]{12}\.(png|jpg|webp)/g;

function exportJSON(extras) {
  STORE.ui = UI;
  var doc = { app: BACKUP_APP, version: BACKUP_VERSION, exported: new Date().toISOString(), data: STORE };
  if (extras) doc.extras = extras;
  return JSON.stringify(doc, null, 1);
}

function backupDeviceKeys() {
  var out = {};
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (BACKUP_DEVKEYS.test(k)) out[k] = deviceGet(k, null);
    }
  } catch (e) {}
  return out;
}

function backupDataUrl(url) {
  return fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.blob();
    })
    .then(blobDataUrl);
}

/* Gathers what is kept outside the shared dashboard. A part that cannot be read is named in `missing`; the backup is made without it. */
function backupExtras() {
  var extras = { prefs: PREFS, device: backupDeviceKeys(), pictures: {} },
    missing = [];
  STORE.ui = UI;
  var jobs = (JSON.stringify(STORE).match(BACKUP_PICTURES) || [])
    .filter(function (u, i, a) {
      return a.indexOf(u) === i;
    })
    .map(function (u) {
      return backupDataUrl(u).then(
        function (data) {
          extras.pictures[u] = data;
        },
        function () {
          missing.push(_T("backup_part_picture"));
        }
      );
    });
  function part(name, label, ask) {
    jobs.push(
      Promise.resolve()
        .then(ask)
        .then(
          function (v) {
            extras[name] = v;
          },
          function () {
            missing.push(_T(label));
          }
        )
    );
  }
  part("published", "backup_part_published", function () {
    return HA.sharing.published().then(function (r) {
      return Object.keys((r && r.scenes) || {});
    });
  });
  part("tv_home", "backup_part_tv_home", function () {
    return HA.sharing.tvHome().then(function (r) {
      return (r && r.calls) || {};
    });
  });
  part("effects", "backup_part_effects", function () {
    return HA.effects.exportFiles();
  });
  return Promise.all(jobs).then(function () {
    return { extras: extras, missing: missing };
  });
}

function downloadBackup(name) {
  return backupExtras().then(function (r) {
    downloadText((name || "dashboard-backup") + "-" + fileStamp() + ".json", exportJSON(r.extras));
    toast(r.missing.length ? _T("backup_downloaded_without") + " " + r.missing.join(", ") : _T("backup_downloaded"));
  });
}

/* How many rooms, devices and scenes a dashboard holds. */
function backupCounts(store) {
  var ui = (store && store.ui) || {},
    layout = ui.layout || {},
    lists = [layout.home].concat(
      Object.keys(layout.rooms || {}).map(function (k) {
        return layout.rooms[k];
      })
    ),
    devs = 0;
  lists.forEach(function (secs) {
    (Array.isArray(secs) ? secs : []).forEach(function (s) {
      devs += s && Array.isArray(s.devs) ? s.devs.length : 0;
    });
  });
  return {
    rooms: Array.isArray(ui.rooms) ? ui.rooms.length : 0,
    devices: devs,
    scenes: Array.isArray(store && store.scenes) ? store.scenes.length : 0,
    areas: Array.isArray(store && store.eareas) ? store.eareas.length : 0,
  };
}

/* Reads a backup's text: {data, extras, exported, counts, lost}, or {error: the key of what is wrong}. `lost` counts what this version of the dashboard would not keep. */
function backupRead(text) {
  var j;
  try {
    j = JSON.parse(String(text).replace(/^﻿/, ""));
  } catch (e) {
    return { error: "that_isn_t_valid_backup_text" };
  }
  var wrapped = !!(j && j.data),
    data = wrapped ? j.data : j;
  if (wrapped && j.app !== BACKUP_APP) return { error: "that_isn_t_a_dashboard_backup" };
  if (wrapped && j.version > BACKUP_VERSION) return { error: "backup_is_newer" };
  if (!data || data.v !== 1 || !data.ui || typeof data.ui !== "object" || !Array.isArray(data.ui.rooms)) return { error: "that_isn_t_a_dashboard_backup" };
  var raw = JSON.parse(JSON.stringify(data)),
    clean = cleanStore(JSON.parse(JSON.stringify(data)));
  if (!clean.ui) return { error: "that_isn_t_a_dashboard_backup" };
  var before = backupCounts(raw),
    after = backupCounts(clean),
    lost = {};
  Object.keys(before).forEach(function (k) {
    if (before[k] > after[k]) lost[k] = before[k] - after[k];
  });
  return {
    data: raw,
    extras: wrapped && j.extras && typeof j.extras === "object" ? j.extras : {},
    exported: wrapped && typeof j.exported === "string" ? j.exported.slice(0, 10) : "",
    counts: after,
    lost: lost,
  };
}

function backupBlob(dataUrl) {
  var m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || m[3].length > 7 * 1024 * 1024) return null;
  var bin = atob(m[3]),
    bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/* The pictures of the backup that this Home Assistant does not have are uploaded; the dashboard is pointed at the new addresses. */
function backupPictures(data, pictures, problems) {
  var text = JSON.stringify(data),
    used = (text.match(BACKUP_PICTURES) || []).filter(function (u, i, a) {
      return a.indexOf(u) === i;
    });
  return used
    .reduce(function (chain, url) {
      return chain.then(function () {
        return backupDataUrl(url).catch(function () {
          var blob = pictures && typeof pictures[url] === "string" ? backupBlob(pictures[url]) : null;
          if (!blob) {
            problems.push(_T("backup_part_picture"));
            return null;
          }
          return HA.remotePictures.upload(blob).then(
            function (now) {
              if (BACKUP_PICTURE.test(now)) text = text.split(url).join(now);
            },
            function () {
              problems.push(_T("backup_part_picture"));
            }
          );
        });
      });
    }, Promise.resolve())
    .then(function () {
      return JSON.parse(text);
    });
}

/* Runs each step even when one before it failed; a failed one is named. */
function backupSteps(steps, problems) {
  return steps.reduce(function (chain, step) {
    return chain.then(step.run).catch(function () {
      if (problems.indexOf(_T(step.label)) < 0) problems.push(_T(step.label));
    });
  }, Promise.resolve());
}

/* The automations of the notifications follow the restored rules: those that are off or gone are removed, the others written. */
function backupNotifications(before, problems) {
  var steps = [];
  ((before && before.watch) || []).forEach(function (w) {
    if (!watchRules().some(function (x) { return x.id === w.id; }))
      steps.push({
        label: "backup_part_notifications",
        run: function () {
          return window.HA.automations.remove("dashboard_n_" + w.id).catch(function () {});
        },
      });
  });
  Object.keys(NRULES).forEach(function (k) {
    var was = before && before.rules && before.rules[k] && before.rules[k].on;
    if (was || nrule(k).on)
      steps.push({
        label: "backup_part_notifications",
        run: function () {
          return syncNotify(k);
        },
      });
  });
  watchRules().forEach(function (w) {
    steps.push({
      label: "backup_part_notifications",
      run: function () {
        return syncWatch(w);
      },
    });
  });
  return backupSteps(steps, problems);
}

/* The integration's live scenes and areas follow: those the restore took away are deleted, the restored ones written over. What a service made is not touched. */
function backupLive(before, problems) {
  if (!engineSensor()) {
    if (STORE.eareas.length) problems.push(_T("backup_part_live"));
    return Promise.resolve();
  }
  var steps = [];
  function call(verb, data) {
    steps.push({
      label: "backup_part_live",
      run: function () {
        return H().callService("home_control", LIVESVC[verb], data);
      },
    });
  }
  function gone(list, now) {
    return (list || []).filter(function (x) {
      return !now.some(function (y) { return y.id === x.id; });
    });
  }
  gone(before.scenes, STORE.scenes)
    .filter(function (sc) { return sc.live; })
    .forEach(function (sc) {
      call("delScene", { id: liveId(sc.id) });
    });
  gone(before.eareas, STORE.eareas).forEach(function (ar) {
    call("delArea", { id: liveId(ar.id) });
  });
  STORE.eareas.forEach(function (ar) {
    var p = liveAreaPayload(ar);
    if (p) call("area", p);
  });
  STORE.scenes.forEach(function (sc) {
    var p = liveScenePayload(sc);
    if (p) call("scene", p);
  });
  return backupSteps(steps, problems);
}

function backupOutside(extras, problems) {
  var steps = [];
  function step(label, run) {
    steps.push({ label: label, run: run });
  }
  if (Array.isArray(extras.published))
    step("backup_part_published", function () {
      return HA.sharing.published().then(function (r) {
        var now = Object.keys((r && r.scenes) || {});
        return Promise.all(
          now
            .filter(function (id) { return extras.published.indexOf(id) < 0; })
            .map(function (id) { return HA.sharing.publish(id, false); })
            .concat(
              extras.published
                .filter(function (id) { return typeof id === "string" && now.indexOf(id) < 0; })
                .map(function (id) { return HA.sharing.publish(id, true); })
            )
        );
      });
    });
  if (extras.tv_home && typeof extras.tv_home === "object")
    step("backup_part_tv_home", function () {
      return HA.sharing.tvHome().then(function (r) {
        var now = (r && r.calls) || {};
        return Promise.all(
          Object.keys(now)
            .filter(function (id) { return !extras.tv_home[id]; })
            .map(function (id) { return HA.sharing.setTvHome(id, null); })
            .concat(
              Object.keys(extras.tv_home).map(function (id) {
                return HA.sharing.setTvHome(id, extras.tv_home[id]);
              })
            )
        );
      });
    });
  (Array.isArray(extras.effects) ? extras.effects.slice(0, 12) : []).forEach(function (file) {
    step("backup_part_effects", function () {
      return HA.effects.importFile(file).then(function (r) {
        if (r && r.ok === false) throw new Error("refused");
      });
    });
  });
  if (extras.prefs && typeof extras.prefs === "object")
    step("backup_part_prefs", function () {
      mergePrefs(extras.prefs);
      savePrefsLocal();
      return HA.data.set("user", "dashboard_prefs", PREFS);
    });
  return backupSteps(steps, problems).then(function () {
    var device = extras.device && typeof extras.device === "object" ? extras.device : null;
    if (!device) return;
    /* this device's settings become those of the backup: one it does not have goes back to its default */
    Object.keys(backupDeviceKeys()).forEach(function (k) {
      if (!(k in device)) deviceSet(k, null);
    });
    Object.keys(device).forEach(function (k) {
      if (BACKUP_DEVKEYS.test(k) && JSON.stringify(device[k]).length < 200000) deviceSet(k, device[k]);
    });
  });
}

function backupReload() {
  window.location.reload();
}

/* Replaces the dashboard with a backup that backupRead accepted. Nothing is changed unless the dashboard itself can be saved. Answers the parts that could not be restored. */
function backupApply(read) {
  var problems = [],
    before = JSON.parse(JSON.stringify(STORE));
  return backupPictures(read.data, read.extras.pictures, problems).then(function (data) {
    var n = cleanStore(data);
    STORE_SAVED = Date.now();
    return HA.data.set(STORE_SCOPE, STORE_KEY, n).then(function () {
      STORE = n;
      UI = n.ui;
      STORE_JSON = JSON.stringify(n);
      STORE_VER++;
      STORE_PENDING = null;
      STORE_SAVED = Date.now();
      layoutCacheWrite();
      /* not put in the change log: its Undo holds only some parts, and the backup saved first is the way back */
      return backupNotifications(before.notify, problems)
        .then(function () {
          return backupLive(before, problems);
        })
        .then(function () {
          return backupOutside(read.extras, problems);
        })
        .then(function () {
          return problems.filter(function (p, i) {
            return problems.indexOf(p) === i;
          });
        });
    });
  });
}

function backupSummary(read) {
  var c = read.counts,
    lost = Object.keys(read.lost).map(function (k) {
      return _T("backup_n_" + k) + ": " + read.lost[k];
    });
  return (
    _T("backup_replace_ask") +
    (read.exported ? " (" + read.exported + ")" : "") +
    " " +
    _T("backup_n_rooms") + ": " + c.rooms + ", " + _T("backup_n_devices") + ": " + c.devices + ", " + _T("backup_n_scenes") + ": " + c.scenes + "." +
    (lost.length ? " " + _T("backup_not_accepted") + ": " + lost.join(", ") + "." : "") +
    " " + _T("backup_first_saved")
  );
}

var BACKUP_BUSY = false;

function restoreFrom(text) {
  if (BACKUP_BUSY) return;
  if (!ISADMIN) return toast(_T("couldn_t_save_only_admins_can_change"));
  if (!STORE_NET || OFFLINE) return toast(_T("backup_needs_connection"));
  var read = backupRead(text);
  if (read.error) return toast(_T(read.error));
  confirmDlg(
    backupSummary(read),
    function () {
      if (BACKUP_BUSY) return;
      BACKUP_BUSY = true;
      toast(_T("backup_restoring"));
      downloadBackup("dashboard-before-restore")
        .then(function () {
          return backupApply(read);
        })
        .then(
          function (problems) {
            toast(problems.length ? _T("backup_restored_without") + " " + problems.join(", ") : _T("backup_restored"));
            /* the page starts again from what was saved, so nothing of the old dashboard stays in it */
            setTimeout(backupReload, problems.length ? 6000 : 1500);
          },
          function () {
            BACKUP_BUSY = false;
            toast(_T("backup_not_restored"));
          }
        );
    },
    _T("restore")
  );
}

function backupPage(b) {
  b.appendChild(hintRow(_T("a_backup_holds_your_rooms_devices_la")));
  b.appendChild(
    pill("sd", _T("download_backup_file"), {
      sub: function () {
        return _T("saves_a_json_file_on_this_device");
      },
      tap: function () {
        downloadBackup();
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
        pickTextFile({ maxBytes: BACKUP_MAX }, function (text) {
          restoreFrom(text);
        });
      },
    })
  );
  b.appendChild(hintRow(_T("backup_not_included")));
}
