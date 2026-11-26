/* Settings, Siri and HomeKit, the devices (decision D-24): the one HomeKit Bridge, making it, pairing it, and choosing the dashboard's devices that are on it. Administrators only.
   The scenes and the page itself are in sharing.js, which keeps the state of both (SHARE). What a device is shown as in the Home app: a light a light, an air conditioner a heater cooler, a fan a fan, an air
   purifier an air purifier, a TV a TV (and its Info key on the Home app's remote is its Home key), and so on; the bridge's own accessory type is what makes the first of those choices. */

/* The sensors HomeKit has an accessory for. */
var HK_SENSORS = ["temperature", "humidity", "illuminance", "pm25", "pm10", "aqi", "carbon_dioxide", "carbon_monoxide"];

var HK_GROUPS = [
  ["tvs", "hk_group_tvs", "tv"],
  ["lights", "hk_group_lights", "lights"],
  ["climate", "hk_group_climate", "ac"],
  ["fans", "hk_group_fans", "fan"],
  ["purifiers", "hk_group_purifiers", "purifier"],
  ["covers", "hk_group_covers", "swap"],
  ["locks", "hk_group_locks", "lock"],
  ["switches", "hk_group_switches", "plug"],
  ["sensors", "hk_group_sensors", "thermo"],
  ["other", "hk_group_other", "info"],
];

/* The domains the picker for "another entity" offers: those HomeKit has an accessory for (the integration refuses the rest). */
var HK_PICK = ["light", "switch", "fan", "climate", "media_player", "cover", "lock", "humidifier", "vacuum", "valve", "water_heater", "sensor", "binary_sensor", "input_boolean", "script", "scene", "alarm_control_panel"];

/* A device of the dashboard as the Home app will have it, or null when HomeKit has nothing for it. group: where the page lists it; type: the bridge's accessory type, for those that can be more than one;
   what: the words for what it will be. */
function hkClassify(d) {
  /* a robot vacuum appliance is shared as its vacuum */
  var id = d.id || (d.kind === "appliance" && d.ap && d.ap.type === "vacuum" && d.ap.slots.vacuum) || "",
    dm = id && dom(id),
    base = { key: id, entity: id, name: d.name || (A(id).friendly_name || id), icon: d.icon || "plug" };
  function item(group, what, type, tv) {
    return Object.assign(base, { group: group, what: _T(what), type: type || "", tv: !!tv });
  }
  if (!id || !S(id)) return null;
  if (d.kind === "light" && dm === "light") return item("lights", "hk_what_light");
  if (d.kind === "media" && dm === "media_player")
    return item("tvs", d.dt === "speaker" ? "hk_what_speaker" : d.dt === "receiver" ? "hk_what_receiver" : "hk_what_tv", "", d.dt !== "speaker" && d.dt !== "receiver");
  if (d.kind === "climate" && dm === "climate") return item("climate", "hk_what_heater_cooler", "heater_cooler");
  if (d.kind === "fan" && dm === "fan") return d.dt === "purifier" ? item("purifiers", "hk_what_purifier", "air_purifier") : item("fans", "hk_what_fan", "fan");
  if (d.kind === "cover" && dm === "cover") return item("covers", "hk_what_cover");
  if (d.kind === "lock" && dm === "lock") return item("locks", "hk_what_lock");
  if (d.kind === "switch" && (dm === "switch" || dm === "input_boolean")) return item("switches", "hk_what_switch");
  if (d.kind === "vacuum" && dm === "vacuum") return item("switches", "hk_what_switch");
  if (d.kind === "appliance" && d.ap && d.ap.type === "vacuum" && dm === "vacuum") return item("switches", "hk_what_switch");
  if (d.kind === "sensor" && dm === "sensor" && HK_SENSORS.indexOf(A(id).device_class) >= 0) return item("sensors", "hk_what_sensor");
  return null;
}

/* The devices the page offers: the dashboard's, once each, and whatever else is on the bridge's list that is not a scene or a device of the dashboard. */
function hkDevices() {
  var seen = {},
    out = [];
  devsOf().forEach(function (d) {
    var it = hkClassify(d);
    if (it && !seen[it.entity]) {
      seen[it.entity] = 1;
      out.push(it);
    }
  });
  var scenes = {};
  shareItems().forEach(function (it) {
    if (it.entity) scenes[it.entity] = 1;
  });
  Object.keys(SHARE.published).forEach(function (k) {
    scenes[SHARE.published[k]] = 1;
  });
  ((SHARE.bridge && SHARE.bridge.listed) || []).forEach(function (id) {
    if (!seen[id] && !scenes[id] && S(id) && dom(id) !== "scene")
      out.push({ key: id, entity: id, name: A(id).friendly_name || id, icon: "plug", group: "other", what: _T("hk_what_other"), type: "", tv: false });
  });
  return out.sort(function (a, b) {
    return String(a.name).localeCompare(b.name);
  });
}

/* The Home key call of a TV, from its integration and its remote, as an object to keep; null when there is none. */
function hkHomeCall(id) {
  var h = H(),
    e = (h.entities || {})[id] || {},
    dv = e.device_id && (h.devices || {})[e.device_id],
    rem = sibBy(id, function (x) {
      return dom(x.entity_id) === "remote";
    }),
    c = Integrations.media.homeCall(e.platform, dv && dv.model, id, rem);
  return c ? { domain: c[0], service: c[1], data: c[2] } : null;
}

function hkExposed(it) {
  return !!(SHARE.bridge && SHARE.bridge.exposed[it.entity]);
}

/* Puts a device on the bridge or takes it off. A TV is given its Home key when it is added (when its integration has one) and loses it when it goes. */
function hkSetDevice(it, on, done) {
  if (!SHARE.bridge) {
    toast(_T("share_no_bridge_short"));
    return;
  }
  HA.sharing
    .expose(SHARE.bridge.entry_id, it.entity, on, it.type || undefined)
    .then(function () {
      SHARE.bridge.exposed[it.entity] = on;
      if (!it.tv) return null;
      var call = on ? hkHomeCall(it.entity) : null;
      if (on && !call) return null;
      if (!on && !SHARE.tv[it.entity]) return null;
      return HA.sharing.setTvHome(it.entity, call).then(function (r) {
        SHARE.tv = (r && r.calls) || {};
      });
    })
    .then(done)
    .catch(shareFail);
}

function hkSetTvHome(it, on, done) {
  var call = on ? hkHomeCall(it.entity) : null;
  if (on && !call) {
    toast(_T("hk_no_home_key"));
    return;
  }
  HA.sharing
    .setTvHome(it.entity, call)
    .then(function (r) {
      SHARE.tv = (r && r.calls) || {};
    })
    .then(done)
    .catch(shareFail);
}

function hkRow(it, redraw) {
  var row = pill(it.icon, it.name, {
      sub: function () {
        return it.what + (hkExposed(it) ? " · " + _T("homekit") : "");
      },
    }),
    controls = mk("div", "shr");
  controls.appendChild(
    shareSwitch(
      _T("homekit"),
      function () {
        return hkExposed(it);
      },
      function () {
        return !!SHARE.bridge;
      },
      function () {
        hkSetDevice(it, !hkExposed(it), redraw);
      }
    )
  );
  if (it.tv)
    controls.appendChild(
      shareSwitch(
        _T("hk_info_is_home"),
        function () {
          return !!SHARE.tv[it.entity];
        },
        function () {
          return hkExposed(it);
        },
        function () {
          if (!hkExposed(it)) {
            toast(_T("hk_add_the_tv_first"));
            return;
          }
          hkSetTvHome(it, !SHARE.tv[it.entity], redraw);
        }
      )
    );
  row.querySelector(".tx").appendChild(controls);
  return row;
}

/* A picture that is the pairing picture of the bridge and nothing else: a path of Home Assistant's own, with no way to leave it. */
function hkQrOk(u) {
  return typeof u === "string" && /^\/api\/homekit\/pairingqr\?[A-Za-z0-9]+-[a-f0-9]+$/.test(u);
}

/* The bridge: making it when there is none, then whether it is paired and, until it is, what to enter or scan in the Home app. */
function hkBridgeBlock(box, redraw) {
  if (!SHARE.bridge) {
    if (SHARE.bridges) {
      box.appendChild(pill("home", _T("hk_bridge"), { kind: "other", sub: function () { return _T("share_bridge_yaml"); } }));
      return;
    }
    box.appendChild(
      pill("plus", _T("hk_make_bridge"), {
        kind: "other",
        sub: function () {
          return _T("hk_make_bridge_sub");
        },
        tap: function () {
          toast(_T("hk_making"));
          HA.sharing
            .createBridge()
            .then(function () {
              [3000, 8000, 15000].forEach(function (ms) {
                setTimeout(function () {
                  shareLoad(redraw);
                }, ms);
              });
              shareLoad(redraw);
            })
            .catch(shareFail);
        },
      })
    );
    return;
  }
  var p = SHARE.bridge.pairing || {};
  box.appendChild(
    pill("home", SHARE.bridge.title, {
      kind: "other",
      sub: function () {
        return p.paired ? _T("hk_paired") : p.running ? _T("hk_not_paired") : _T("hk_starting");
      },
    })
  );
  if (!p.paired && p.pin) {
    box.appendChild(hintRow(_T("hk_pair_hint")));
    box.appendChild(pill("lock", p.pin, { kind: "other", sub: function () { return _T("hk_code"); } }));
    if (hkQrOk(p.qr)) {
      var q = mk("div", "hkqr"),
        im = new Image();
      im.alt = _T("hk_qr");
      im.src = p.qr;
      q.appendChild(im);
      box.appendChild(q);
    }
  }
}

function hkDeviceGroups(box, redraw) {
  var items = hkDevices();
  HK_GROUPS.forEach(function (g) {
    var list = items.filter(function (it) {
      return it.group === g[0];
    });
    if (!list.length) return;
    box.appendChild(sep(_T(g[1]) + " · " + list.length, g[2]));
    list.forEach(function (it) {
      box.appendChild(hkRow(it, redraw));
    });
  });
  if (SHARE.bridge)
    box.appendChild(
      pill("plus", _T("hk_add_another"), {
        kind: "other",
        sub: function () {
          return _T("hk_add_another_sub");
        },
        tap: function () {
          pickEntity(_T("hk_add_another"), HK_PICK, null, function (id) {
            HA.sharing
              .expose(SHARE.bridge.entry_id, id, true)
              .then(function () {
                SHARE.bridge.exposed[id] = true;
                if (SHARE.bridge.listed.indexOf(id) < 0) SHARE.bridge.listed.push(id);
                redraw();
              })
              .catch(shareFail);
          });
        },
      })
    );
}
