/* Devices: siblings of an entity, what a device popup shows besides its controls, readings, wear parts, entity rows. */

function entRow(label, fn) {
  var r = mk("div", "erow pane", "<span></span><span></span>");
  r.children[0].textContent = label;
  var v = r.children[1];
  r.refresh = function () {
    v.textContent = fn();
  };
  reg(r.refresh);
  return r;
}

/* ---- Devices: one UI for every room ----
 A device's popup is chosen from its type and its Home Assistant integration, never from a specific entity id, and
 the extra information it shows comes from the other entities of the same Home Assistant device. So any room, and
 any device added later, gets the same controls as the ones that exist today. */
function sibsOf(id) {
  var dv = advDevice(id),
    h = H();
  if (!dv) return [];
  return Object.values(h.entities).filter(function (e) {
    return (
      e.device_id === dv &&
      e.entity_id !== id &&
      !e.hidden &&
      !e.disabled_by &&
      h.states[e.entity_id]
    );
  });
}

function sibBy(id, test) {
  var s = sibsOf(id).filter(test);
  return s.length ? s[0].entity_id : null;
}

function sibEnds(id, dm, suf) {
  return sibBy(id, function (e) {
    return dom(e.entity_id) === dm && e.entity_id.slice(-suf.length) === suf;
  });
}

/* What a device popup shows besides its controls, built from the other entities of the same Home Assistant device:
 problems (only while something is actually wrong), readings (real measurements), and consumables (filters, brushes, ink),
 with a part's life and time left on one line. Technical values (voltage, signal, counters, timestamps) and anything the
 popup's header already shows are left out; the full list stays in Advanced settings. */
var READ_DC = [
  "temperature",
  "humidity",
  "pm1",
  "pm25",
  "pm10",
  "co2",
  "carbon_dioxide",
  "carbon_monoxide",
  "volatile_organic_compounds",
  "volatile_organic_compounds_parts",
  "nitrogen_dioxide",
  "ozone",
  "aqi",
  "illuminance",
  "pressure",
  "power",
  "energy",
  "gas",
  "water",
  "moisture",
  "sound_pressure",
  "duration",
  "area",
  "distance",
  "speed",
  "weight",
  "volume",
];

var ALERT_BIN = [
    "problem",
    "safety",
    "smoke",
    "gas",
    "moisture",
    "carbon_monoxide",
    "tamper",
    "heat",
    "cold",
  ],
  STATE_BIN = [
    "door",
    "window",
    "opening",
    "garage_door",
    "lock",
    "motion",
    "occupancy",
    "presence",
    "plug",
    "running",
  ];

var FAULT_OK = ["0", "none", "no_error", "no error", "ok", "normal", "no_fault", "idle", ""];

var INK = { bk: "Black", k: "Black", c: "Cyan", m: "Magenta", y: "Yellow" };

function infoKey(eid) {
  return eid.split(".")[1];
}

function careBase(k) {
  return k.replace(
    /_?(life_level|life|left_time|remaining_time|time_left|level|left|remaining)(?=_\d+$|$)/,
    ""
  );
}

function devInfo(id, o) {
  o = o || {};
  var out = { problems: [], read: [], care: [] },
    cares = {};
  sibsOf(id).forEach(function (en) {
    var eid = en.entity_id,
      dm = dom(eid),
      a = A(eid),
      dc = a.device_class || "",
      u = a.unit_of_measurement || "",
      k = infoKey(eid),
      num = isFinite(Number(V_(eid))) && V_(eid) !== "";
    if (en.entity_category === "config") return;
    if (dm === "binary_sensor") {
      if (ALERT_BIN.indexOf(dc) >= 0) out.problems.push({ id: eid, bin: true });
      else if (STATE_BIN.indexOf(dc) >= 0 && !en.entity_category) out.read.push(eid);
      return;
    }
    if (dm !== "sensor") return;
    if (/(^|_)(fault|error)s?(_|$)/.test(k)) {
      out.problems.push({ id: eid });
      return;
    }
    if (dc === "battery") {
      if (!o.battery) out.read.push(eid);
      return;
    }
    if (
      /(used|total|count|times|reboot|signal|rssi|ssid|link|firmware|version|ip_address|last_)/.test(
        k
      )
    )
      return;
    var isCare =
        u === "%" &&
        !dc &&
        (en.entity_category === "diagnostic" ||
          /(filter|brush|mop|pad|blade|bag|ink|toner|sponge)/.test(k) ||
          INK[k.split("_").pop()]),
      isLeft = !dc && /(left_time|remaining_time|time_left|_left$)/.test(k) && num;
    if (isCare || isLeft) {
      var b = careBase(k);
      (cares[b] = cares[b] || {})[isCare ? "life" : "left"] = eid;
      return;
    }
    if (en.entity_category) return;
    if (READ_DC.indexOf(dc) >= 0 || (!dc && num && u && u !== "%")) out.read.push(eid);
  });
  Object.keys(cares).forEach(function (b) {
    var c = cares[b];
    var lab = INK[b.split("_").pop()];
    if (!lab)
      lab =
        advName(c.life || c.left)
          .replace(
            /\s*(life level|life|left time|remaining time|time left|level|left|remaining)\b/i,
            ""
          )
          .trim() || advName(c.life || c.left);
    out.care.push({ name: lab, life: c.life, left: c.left });
  });
  /* Parts Home Assistant names alike (three "Brush" sensors) are numbered in entity order: Brush, Brush 2, Brush 3. */
  var cnt = {};
  out.care.forEach(function (c) {
    cnt[c.name] = (cnt[c.name] || 0) + 1;
  });
  var nth = {};
  out.care.forEach(function (c) {
    if (cnt[c.name] > 1) {
      nth[c.name] = (nth[c.name] || 0) + 1;
      if (nth[c.name] > 1) c.name += " " + nth[c.name];
    }
  });
  out.care.sort(function (x, y) {
    return x.name.localeCompare(y.name);
  });
  return out;
}

function faultActive(p) {
  var s = String(V_(p.id)).toLowerCase();
  if (!svOk(p.id)) return false;
  return p.bin ? s === "on" : FAULT_OK.indexOf(s) < 0;
}

function careText(c) {
  var p = [];
  if (c.life && svOk(c.life)) p.push(entVal(c.life));
  if (c.left && svOk(c.left)) p.push(entVal(c.left) + " " + _T("left"));
  return p.join(" · ") || "-";
}

function careLow(c) {
  var v = c.life && Number(V_(c.life));
  return isFinite(v) && v <= partsLow();
}

function readingsBlock(b, id, o) {
  o = o || {};
  var inf = devInfo(id, o);
  if (inf.problems.length) {
    var pb = mk("div");
    b.appendChild(pb);
    reg(function () {
      var on = inf.problems.filter(faultActive),
        sig = on
          .map(function (p) {
            return p.id + V_(p.id);
          })
          .join();
      if (pb._sig === sig) return;
      pb._sig = sig;
      pb.innerHTML = "";
      on.forEach(function (p) {
        var r = pill("alert", advName(p.id), {
          sub: function () {
            return p.bin ? _T("problem") : entVal(p.id);
          },
        });
        r.classList.add("warn");
        pb.appendChild(r);
      });
    });
  }
  var nums = inf.read.filter(function (e) {
      return dom(e) === "sensor";
    }),
    bins = inf.read.filter(function (e) {
      return dom(e) === "binary_sensor";
    });
  var items = o.noNums
    ? []
    : nums.slice(0, 6).map(function (e) {
        return [
          advName(e),
          function () {
            return entVal(e);
          },
        ];
      });
  /* plain: the readings and the wear parts are tiles of one two-column grid, without headers. */
  var parts = o.plain && !o.noCare ? inf.care : [];
  parts.forEach(function (c) {
    items.push([
      c.name,
      function () {
        return c.life && svOk(c.life) ? entVal(c.life) : careText(c);
      },
      function () {
        return c.name + (c.left && svOk(c.left) ? " · " + entVal(c.left) + " " + _T("left") : "");
      },
    ]);
  });
  if (items.length) {
    if (!o.plain) b.appendChild(sep(_T("readings"), "thermo"));
    var n = Math.min(6, items.length),
      gl = glance(items, o.plain ? 2 : n <= 3 ? n : n === 4 ? 2 : 3);
    b.appendChild(gl);
    reg(function () {
      parts.forEach(function (c, i) {
        gl.children[items.length - parts.length + i].classList.toggle("warn", careLow(c));
      });
    });
  }
  bins.forEach(function (e) {
    b.appendChild(
      entRow(advName(e), function () {
        return entVal(e);
      })
    );
  });
  if (!o.noCare && !o.plain) careBlock(b, inf);
}

/* Wear parts (filters, brushes) with how much life is left. */
function careBlock(b, inf) {
  if (!inf.care.length) return;
  b.appendChild(sep(_T("consumables"), "wrench"));
  inf.care.forEach(function (c) {
    var r = entRow(c.name, function () {
      if (r) r.classList.toggle("warn", careLow(c));
      return careText(c);
    });
    r.refresh();
    b.appendChild(r);
  });
}

function powerSib(id) {
  return sibBy(id, function (e) {
    return dom(e.entity_id) === "sensor" && A(e.entity_id).device_class === "power";
  });
}

/* Switch: plain switches toggle from their row; switches that report readings (a smart plug) open this popup. */
function swPopup(b, id) {
  var d = UIDEV[id] || {};
  b.appendChild(switchPill(d.icon || "plug", _T("power"), id));
  readingsBlock(b, id);
}

/* Any device given as one entity: its main value, then everything its device reports. */
function devPopup(b, id) {
  var d = UIDEV[id] || {};
  var nm = advName(id),
    dn = (d.name || "").toLowerCase();
  b.appendChild(
    pill(
      d.icon || sensorIcon(id),
      nm.toLowerCase() === dn ||
        nm.toLowerCase() === String(A(id).friendly_name || "").toLowerCase()
        ? _T("status")
        : nm,
      withToggle(
        { id: id, name: d.name, kind: d.kind || DOMKIND[dom(id)] },
        {
          val: function () {
            return entVal(id);
          },
        }
      )
    )
  );
  readingsBlock(b, id);
}

function sensorIcon(id) {
  return (
    {
      temperature: "thermo",
      humidity: "drop",
      battery: "battery",
      power: "plug",
      energy: "plug",
      motion: "motion",
      occupancy: "motion",
      door: "lock",
      window: "lock",
      pm25: "filter",
      pm10: "filter",
    }[A(id).device_class] || "info"
  );
}

function entVal(id) {
  var s = V_(id);
  if (!svOk(id)) return "Offline";
  var u = A(id).unit_of_measurement,
    n = Number(s);
  if (s !== "" && isFinite(n))
    return Math.round(n * 100) / 100 + (u ? (/^(%|°C|°F|°)$/.test(u) ? "" : " ") + u : "");
  if (dom(id) === "binary_sensor") return s === "on" ? "On" : "Off";
  return cap(s);
}

/* What the icon of a device row does: switches it on or off, opens or closes it, locks or unlocks it, starts or sends home the robot.
   Tapping the rest of the row opens the device popup. Readings, numbers, lists and buttons have no icon action. */
var TOGGLE_KINDS = ["light", "switch", "fan", "climate", "media", "cover", "lock", "vacuum"];

/* A locked lock unlocks by sliding its icon across the row (also the status row of its popup), unless that lock's settings turn
   that off; then a tap asks to confirm. Locking always asks to confirm. */
function slidesToUnlock(id) {
  return !(UIDEV[id] && UIDEV[id].noslide);
}

function lockSlide(id, o) {
  if (!slidesToUnlock(id)) return o;
  o.canSlide = function () {
    return V_(id) === "locked";
  };
  o.slide = function () {
    callConfirmed("lock", "unlock", { entity_id: id });
  };
  return o;
}

function toggleDevice(d) {
  var id = d.id,
    kind = d.kind || DOMKIND[dom(id)];
  if (kind === "lock") {
    var locked = V_(id) === "locked";
    if (locked && slidesToUnlock(id)) return;
    confirmDlg((locked ? _T("unlock_2") : _T("lock")) + (d.name || entName(id)) + "”?", function () {
      callConfirmed("lock", locked ? "unlock" : "lock", { entity_id: id });
    });
  } else if (kind === "cover") call("cover", "toggle", { entity_id: id });
  else if (kind === "vacuum")
    call("vacuum", ["cleaning", "returning"].indexOf(V_(id)) >= 0 ? "return_to_base" : "start", {
      entity_id: id,
    });
  else if (TOGGLE_KINDS.indexOf(kind) >= 0) toggleEnt(id);
}

/* Covers and locks have no popup of their own: their status line in the generic popup is the switch. */
function withToggle(d, o) {
  if (d.kind === "cover" || d.kind === "lock") {
    o.on = function () {
      return d.kind === "lock" ? V_(d.id) === "unlocked" : ["open", "opening"].indexOf(V_(d.id)) >= 0;
    };
    o.tap = function () {
      toggleDevice(d);
    };
    if (d.kind === "lock") lockSlide(d.id, o);
  }
  return o;
}

function sensorRow(d) {
  return pill(d.icon || sensorIcon(d.id), d.name, {
    on: function () {
      return dom(d.id) === "binary_sensor" && V_(d.id) === "on";
    },
    val: function () {
      return entVal(d.id);
    },
    tap: function () {
      var k = devPop(d);
      if (k) showPopup(k, true);
    },
  });
}

function numberRow(d) {
  var id = d.id,
    a = A(id),
    dm = dom(id);
  return sliderRow({
    icon: d.icon || "tune",
    name: d.name,
    min: a.min !== undefined ? a.min : 0,
    max: a.max !== undefined ? a.max : 100,
    step: a.step || 1,
    get: function () {
      var v = Number(V_(id));
      return isFinite(v) && svOk(id) ? v : null;
    },
    fmt: function (v) {
      var u = A(id).unit_of_measurement;
      return v + (u ? " " + u : "");
    },
    commit: function (v) {
      call(dm, "set_value", { entity_id: id, value: v });
    },
    off: "–",
  });
}

function selectRow(d) {
  return selectEnt(d.id, d.name, d.icon || "tune");
}

/* A select entity is picked from a dropdown under its row, not on a page of its own. */
function selectEnt(id, name, icon) {
  var r = selectTile(
    name,
    function () {
      return V_(id) === "unavailable" ? [] : A(id).options || [];
    },
    function () {
      return V_(id);
    },
    function (v) {
      call(dom(id), "select_option", { entity_id: id, option: v });
    },
    icon
  );
  r.classList.add("selrow");
  return r;
}

function buttonRow(d) {
  var id = d.id,
    dm = dom(id),
    svc = {
      button: ["button", "press"],
      input_button: ["input_button", "press"],
      script: ["script", "turn_on"],
      scene: ["scene", "turn_on"],
    }[dm] || ["button", "press"];
  if (dm === "scene") return sceneEntRow(id, d.name, d.icon || "play", function () {
    return _T("run");
  });
  return pill(d.icon || "play", d.name, {
    sub: function () {
      return dm === "script" || dm === "scene" ? _T("run") : _T("press");
    },
    tap: function () {
      call(svc[0], svc[1], { entity_id: id });
      toast(d.name);
    },
  });
}

function coverRow(d) {
  var id = d.id;
  return pill(d.icon || "swap", d.name, {
    on: function () {
      return ["open", "opening"].indexOf(V_(id)) >= 0;
    },
    val: function () {
      return cap(V_(id));
    },
    tap: function () {
      showPopup(devPop(d), true);
    },
    iconTap: function () {
      toggleDevice(d);
    },
  });
}

function lockRow(d) {
  var id = d.id;
  return pill(
    d.icon || "lock",
    d.name,
    lockSlide(id, {
      on: function () {
        return V_(id) === "unlocked";
      },
      val: function () {
        return cap(V_(id));
      },
      tap: function () {
        showPopup(devPop(d), true);
      },
      iconTap: function () {
        toggleDevice(d);
      },
    })
  );
}
