/* Backups: the file a backup is saved as, and restoring from it. */

/* backup and restore */
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
  b.appendChild(hintRow(_T("a_backup_holds_your_rooms_devices_la")));
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
