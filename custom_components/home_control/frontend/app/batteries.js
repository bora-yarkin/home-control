/* Batteries: the devices whose battery the dashboard follows, what each one's battery says, and the pages that show and change them.
   A battery is tracked per DEVICE, not per entity: a device usually has a percentage sensor and a low flag, and listing both made it appear twice.
   UI.bats holds device ids; UI.batsOff the devices taken off the list, so they are not added again. */

var DEVRE = /^[a-f0-9]{32}$/;

/* Every device that has a battery, with the entity that says how full it is and the one that says low or fine: {deviceId: {pct, flag}}. */
function batIndex() {
  var h = H(),
    out = {};
  Object.keys(h.states).forEach(function (id) {
    var e = h.entities && h.entities[id],
      d = dom(id);
    if (!e || !e.device_id || (d !== "sensor" && d !== "binary_sensor") || e.hidden || A(id).device_class !== "battery") return;
    var p = out[e.device_id] || (out[e.device_id] = { pct: null, flag: null });
    if (d === "binary_sensor") p.flag = p.flag || id;
    else p.pct = p.pct || id;
  });
  return out;
}

/* "Area · Device": the device's area (when it has one) and its own name, the one the owner gave it before the one it came with. */
function batName(devId) {
  var h = H(),
    dv = (h.devices || {})[devId];
  if (!dv) return devId;
  var area = dv.area_id && h.areas && h.areas[dv.area_id] ? h.areas[dv.area_id].name : "",
    name = dv.name_by_user || dv.name || devId;
  return area ? area + " · " + name : name;
}

/* What a device's battery says now: its percentage (null when it has none or it says nothing), and whether it is low (null when there is no reading).
   Low is a percentage under the limit in Settings, or the device's low flag being on. */
function batInfo(devId, index) {
  var p = (index || batIndex())[devId] || { pct: null, flag: null },
    s = p.pct ? V_(p.pct) : "",
    v = s === "" ? NaN : Number(s),
    pct = isFinite(v) && v >= 0 ? Math.round(v) : null,
    flag = p.flag ? (V_(p.flag) === "on" ? true : V_(p.flag) === "off" ? false : null) : null,
    low = pct !== null && pct < batLow() ? true : flag === true ? true : pct !== null || flag !== null ? false : null;
  return { id: devId, name: batName(devId), pct: pct, low: low, ents: p };
}

function batStatusText(low) {
  return low === true ? _T("battery_low") : low === false ? _T("battery_ok") : "–";
}

/* A tracked device is left out for others when all its battery entities are in a hidden room. */
function batVisible(devId, index) {
  if (ISADMIN) return true;
  var p = (index || batIndex())[devId];
  var ent = p && (p.pct || p.flag);
  return !ent || modeOf(ent).mode !== "hide";
}

/* One row: the device, its percentage and its status. The name may take two lines. */
function batRow(devId, index, tap) {
  var r = pill("battery", batName(devId), { tap: tap }),
    pc = mk("span", "bp"),
    st = mk("span", "bs");
  r.classList.add("bat");
  r.appendChild(pc);
  r.appendChild(st);
  reg(function () {
    var i = batInfo(devId, index);
    pc.textContent = i.pct === null ? "–" : i.pct + "%";
    st.textContent = batStatusText(i.low);
    st.className = "bs" + (i.low === true ? " low" : i.low === false ? " ok" : "");
    r.classList.toggle("warn", i.low === true);
  });
  return r;
}

/* The popup of the Batteries tile: the tracked devices, the ones that are low first. */
function batsPopup(b) {
  var index = batIndex(),
    list = BATLIST.filter(function (d) {
      return batVisible(d, index);
    })
      .map(function (d) {
        return batInfo(d, index);
      })
      .sort(function (x, y) {
        return (y.low === true) - (x.low === true) || x.name.localeCompare(y.name);
      });
  if (!list.length) b.appendChild(pill("info", _T("no_batteries_tracked"), {}));
  list.forEach(function (i) {
    b.appendChild(batRow(i.id, index));
  });
}

/* Settings, Batteries: the same list; a tap stops tracking a device, and a row adds one. */
function batsPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var index = batIndex(),
      hint = mk("div", "hint");
    hint.textContent = _T("battery_devices_checked_for_the_low_");
    box.appendChild(hint);
    UI.bats.forEach(function (devId, i) {
      box.appendChild(
        batRow(devId, index, function () {
          confirmDlg(_T("stop_tracking") + batName(devId) + "”?", function () {
            UI.bats.splice(i, 1);
            UI.batsOff = (UI.batsOff || []).filter(function (o) {
              return o !== devId;
            }).concat([devId]).slice(-200);
            uiChanged();
            redrawBox(box, draw);
          });
        })
      );
    });
    box.appendChild(
      pill("plus", _T("add_battery_device"), {
        tap: function () {
          showPopup("pick-bat", true);
        },
      })
    );
  }
  redrawBox(box, draw);
}

/* The devices that have a battery and are not tracked yet, to add one. */
function batPickPage(b) {
  var index = batIndex(),
    left = Object.keys(index)
      .filter(function (d) {
        return UI.bats.indexOf(d) < 0 && (H().devices || {})[d];
      })
      .map(function (d) {
        return batInfo(d, index);
      })
      .sort(function (x, y) {
        return x.name.localeCompare(y.name);
      });
  if (!left.length) b.appendChild(pill("info", _T("nothing_found"), {}));
  left.forEach(function (i) {
    b.appendChild(
      batRow(i.id, index, function () {
        if (UI.bats.length >= 30) {
          toast(_T("the_list_is_full"));
          return;
        }
        UI.bats.push(i.id);
        UI.batsOff = (UI.batsOff || []).filter(function (o) {
          return o !== i.id;
        });
        uiChanged();
        notifyReconcileSoon();
        popBack();
      })
    );
  });
}

/* A tracked device that Home Assistant no longer has (it was deleted and added again, which gives it a new id) is taken off the list. */
function batsPrune() {
  var h = H();
  if (!h || !h.devices || !Object.keys(h.devices).length) return false;
  var keep = UI.bats.filter(function (d) {
    return h.devices[d];
  });
  if (keep.length === UI.bats.length) return false;
  UI.bats.length = 0;
  keep.forEach(function (d) {
    UI.bats.push(d);
  });
  return true;
}

/* A device with a battery that Home Assistant gains after the dashboard was set up is tracked, unless it was taken off the list
   (UI.batsOff remembers those). Devices from before that point are left to the list as it is. A device deleted and added again
   is a new device, so it joins here and the old one leaves; the notification is brought to the new list. */
function batsAutoAdd() {
  var h = H();
  if (!h || !ISADMIN || !STORE_READY || !REG || !UI.newSince || !dataIsReal()) return;
  var have = {},
    off = UI.batsOff || [],
    changed = batsPrune();
  UI.bats.forEach(function (d) {
    have[d] = 1;
  });
  REG.forEach(function (e) {
    var id = e.entity_id,
      dev = e.device_id;
    if (
      !dev ||
      UI.bats.length >= 30 ||
      have[dev] ||
      off.indexOf(dev) >= 0 ||
      (dom(id) !== "sensor" && dom(id) !== "binary_sensor") ||
      !h.states[id] ||
      A(id).device_class !== "battery" ||
      e.disabled_by ||
      e.hidden_by ||
      (e.created_at || 0) <= UI.newSince
    )
      return;
    UI.bats.push(dev);
    have[dev] = 1;
    changed = true;
  });
  if (changed) {
    uiChanged();
    notifyReconcileSoon();
  }
}
