/* A robot vacuum appliance's set-up as text, so that it can be written by hand or by an AI, copied between homes and kept. The names here are the readable ones of
   docs/vacuum-appliance.md; the dashboard keeps its own short ones. What is applied goes through the same checks as a saved dashboard. */

var VACSETUP_FORMAT = "home-control.vacuum";

/* [name in the text, name in the dashboard] */
var VACSETUP_NAMES = {
  readings: [["entity", "e"], ["label", "l"], ["group", "g"], ["tile", "o"]],
  rooms: [["value", "k"], ["name", "l"]],
  settings: [["field", "k"], ["label", "l"], ["choices", "o"], ["select", "e"], ["per_room_only", "r"], ["codes", "c"], ["default", "d"]],
  start: [["action", "action"], ["data", "data"], ["each_room", "each"], ["expect", "expect"]],
};
var VACSETUP_FLAGS = { tile: 1, per_room_only: 1, each_room: 1 };
/* [name in the text, name in the dashboard, allowed values as text -> dashboard] */
var VACSETUP_MAP = [
  ["minimal", "m", { true: 1, false: null }],
  ["label_size", "ls", { 11: 11, 13.5: null, 16: 16, 19: 19 }],
  ["fill", "fa", { 0: 0, 30: 30, 70: null, 130: 130 }],
  ["lines", "lc", { ink: null, accent: "acc", room: "room" }],
  ["fill_color", "fc", { room: null, accent: "acc" }],
  ["trail", "tr", { true: 1, false: null }],
  ["zones", "nz", { true: 1, false: null }],
  ["trail_color", "tc", { accent: null, ink: "ink" }],
  ["trail_width", "tw", { 2: 2, 3: null, 5: 5 }],
];

function vacapToText(d) {
  var ap = d.ap,
    conf = vacapConf(ap),
    map = d.map || {};
  function named(kind, list) {
    return (list || []).map(function (x) {
      var o = {};
      VACSETUP_NAMES[kind].forEach(function (n) {
        if (x[n[1]] === undefined || x[n[1]] === "") return;
        o[n[0]] = VACSETUP_FLAGS[n[0]] ? true : x[n[1]];
      });
      return o;
    });
  }
  var out = {
    format: VACSETUP_FORMAT,
    version: 1,
    entities: ap.slots || {},
    readings: named("readings", ap.extra),
    rooms: named("rooms", conf.rooms),
    settings: named("settings", conf.sets),
    start: named("start", conf.run),
    zones: conf.zones || null,
    room_settings: !conf.nopr,
    status_tile: !conf.nost,
    map: {},
  };
  VACSETUP_MAP.forEach(function (m) {
    var own = map[m[1]] === undefined ? null : map[m[1]],
      word = Object.keys(m[2]).filter(function (w) {
        return m[2][w] === own;
      })[0];
    out.map[m[0]] = word === "true" ? true : word === "false" ? false : /^[\d.]+$/.test(word) ? Number(word) : word;
  });
  return JSON.stringify(out, null, 2);
}

/* The places of `asked` that `kept` does not hold, as "rooms.2.value": what the checks refused or cut. */
function vacapLost(asked, kept, at, out) {
  if (asked && typeof asked === "object") {
    Object.keys(asked).forEach(function (k) {
      var here = at ? at + "." + k : k;
      if (asked[k] === false || asked[k] === null || asked[k] === "") return;
      if (Array.isArray(asked[k]) && !asked[k].length) return;
      if (!kept || typeof kept !== "object" || kept[k] === undefined) out.push(here);
      else vacapLost(asked[k], kept[k], here, out);
    });
  } else if (asked !== kept) out.push(at);
  return out;
}

/* What a text would make of the appliance: {ap, map, lost, actions}, or null when it is not a vacuum set-up. The dashboard is not changed. */
function vacapFromText(d, text) {
  var t;
  try {
    t = JSON.parse(String(text).replace(/^\s*```[a-z]*\s*|\s*```\s*$/g, ""));
  } catch (e) {
    return null;
  }
  if (!t || typeof t !== "object" || t.format !== VACSETUP_FORMAT || t.version !== 1) return null;
  var now = JSON.parse(vacapToText(d)),
    full = {};
  Object.keys(now).forEach(function (k) {
    full[k] = Object.prototype.hasOwnProperty.call(t, k) ? t[k] : now[k];
  });
  if (t.map && typeof t.map === "object") full.map = Object.assign({}, now.map, t.map);
  function stored(kind, list) {
    return (Array.isArray(list) ? list : []).map(function (x) {
      var o = {};
      VACSETUP_NAMES[kind].forEach(function (n) {
        if (x && x[n[0]] !== undefined) o[n[1]] = VACSETUP_FLAGS[n[0]] ? (x[n[0]] ? 1 : 0) : x[n[0]];
      });
      return o;
    });
  }
  var ap = cleanAppliance({
      type: "vacuum",
      names: d.ap.names,
      slots: full.entities,
      extra: stored("readings", full.readings),
      vac: {
        rooms: stored("rooms", full.rooms),
        sets: stored("settings", full.settings),
        run: stored("start", full.start),
        zones: full.zones,
        nopr: full.room_settings === false,
        nost: full.status_tile === false,
      },
    }),
    map = {};
  VACSETUP_MAP.forEach(function (m) {
    var v = m[2][String((full.map || {})[m[0]])];
    if (v !== undefined && v !== null) map[m[1]] = v;
  });
  var kept = JSON.parse(vacapToText({ ap: ap, map: map })),
    asked = Object.assign({}, t);
  delete asked.map;
  var lost = vacapLost(asked, kept, "", []);
  /* a default of the map is written the same way it is read, so only a value that is not one of the choices is lost */
  VACSETUP_MAP.forEach(function (m) {
    var v = t.map && t.map[m[0]];
    if (v !== undefined && m[2][String(v)] === undefined) lost.push("map." + m[0]);
  });
  var actions = ap.vac.run.map(function (r) {
    return r.action;
  });
  if (ap.vac.zones) actions.push(ap.vac.zones.action);
  return { ap: ap, map: map, lost: lost, actions: actions };
}

function vacapTextPage(b, aid) {
  var d = apFind(aid);
  if (!d) return;
  b.appendChild(hintRow(_T("vacap_text_hint")));
  var row = areaRow(_T("vacap_text"), vacapToText(d), function () {}, 20000),
    area = row.querySelector("textarea");
  area.rows = 16;
  area.spellcheck = false;
  b.appendChild(row);
  b.appendChild(
    pill("edit", _T("vacap_copy"), {
      tap: function () {
        function select() {
          area.focus();
          area.select();
          toast(_T("vacap_select_to_copy"));
        }
        /* a page that is not served over https has no clipboard */
        if (!navigator.clipboard) return select();
        navigator.clipboard.writeText(area.value).then(function () {
          toast(_T("vacap_copied"));
        }, select);
      },
    })
  );
  b.appendChild(
    pill("play", _T("vacap_apply"), {
      tap: function () {
        var next = vacapFromText(d, area.value);
        if (!next) return toast(_T("vacap_not_text"));
        confirmDlg(
          _T("vacap_apply_ask") + (next.actions.length ? " " + _T("vacap_apply_runs") + ": " + next.actions.join(", ") : ""),
          function () {
            d.ap = next.ap;
            if (Object.keys(next.map).length) d.map = next.map;
            else delete d.map;
            uiChanged();
            area.value = vacapToText(d);
            toast(next.lost.length ? _T("vacap_applied_partly") + ": " + next.lost.slice(0, 4).join(", ") : _T("vacap_applied"));
          },
          _T("vacap_apply")
        );
      },
    })
  );
}
