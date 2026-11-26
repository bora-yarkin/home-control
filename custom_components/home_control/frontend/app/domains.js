/* What every kind of entity can do (decision D-42). One table: for each domain, its controls, built from what the entity reports (supported_features and attributes), so a type of
   device needs no code of its own anywhere else. A control is {t: "switch"|"slider"|"select"|"buttons"|"text"|"moment"|"info", ...}; domControls draws them. */

function domBits(id, bit) {
  return !!((A(id).supported_features || 0) & bit);
}

function domCall(id, service, data) {
  call(dom(id), service, Object.assign({ entity_id: id }, data || {}));
}

function domNum(v, def) {
  return typeof v === "number" && isFinite(v) ? v : def;
}

/* The state in the words of Home Assistant's own language, else the state itself made readable. */
/* Whether Home Assistant words things in the language the dashboard shows. */
function haSameLanguage(h) {
  var own = String(globalThis.HC_LANG || ""),
    ha = String((h && h.locale && h.locale.language) || "");
  return !own || own === ha;
}

function domState(id) {
  var h = H(),
    s = h && h.states[id];
  if (!svOk(id)) return _T("offline");
  if (s && haSameLanguage(h) && typeof h.formatEntityState === "function") return h.formatEntityState(s);
  return entVal(id);
}

function domAttrText(id, name) {
  var h = H(),
    s = h && h.states[id],
    v = A(id)[name];
  if (v === undefined || v === null || v === "") return "–";
  if (s && haSameLanguage(h) && typeof h.formatEntityAttributeValue === "function") return h.formatEntityAttributeValue(s, name);
  return typeof v === "string" ? cap(v) : String(v);
}

function domWord(v) {
  return cap(String(v).replace(/_/g, " "));
}

function ctlSwitch(label, icon, on, set) {
  return { t: "switch", label: label, icon: icon, on: on, set: set };
}

function ctlOnOff(id, label) {
  return ctlSwitch(
    label || _T("power"),
    "power",
    function () {
      return V_(id) !== "off" && svOk(id);
    },
    function (v) {
      domCall(id, v ? "turn_on" : "turn_off");
    }
  );
}

function ctlSelect(label, opts, cur, set, fmt) {
  return { t: "select", label: label, opts: opts, cur: cur, set: set, fmt: fmt || domWord };
}

function ctlAttrSelect(id, label, listAttr, curAttr, service, key) {
  return ctlSelect(
    label,
    function () {
      return A(id)[listAttr] || [];
    },
    function () {
      return curAttr ? A(id)[curAttr] : V_(id);
    },
    function (v) {
      var data = {};
      data[key] = v;
      domCall(id, service, data);
    }
  );
}

function ctlButton(label, icon, run, ask) {
  return { label: label, icon: icon, run: run, ask: ask || "" };
}

function ctlInfo(label, val) {
  return { t: "info", label: label, val: val };
}

/* An alarm panel asks for its code when it has one: always to disarm, to arm only when the panel requires it. */
function alarmRun(id, service, arming) {
  var a = A(id),
    needs = !!a.code_format && (!arming || a.code_arm_required !== false);
  if (!needs) return domCall(id, service);
  textDlg(_T("alarm_code"), "", _T("ok"), function (code) {
    domCall(id, service, { code: code });
  }, 1);
}

var DOMAINS = {
  humidifier: {
    icon: "drop",
    toggle: true,
    controls: function (id) {
      var a = A(id),
        out = [ctlOnOff(id)];
      out.push({
        t: "slider",
        label: _T("target_humidity"),
        icon: "drop",
        min: domNum(a.min_humidity, 0),
        max: domNum(a.max_humidity, 100),
        step: domNum(a.target_humidity_step, 1),
        get: function () {
          return A(id).humidity;
        },
        unit: "%",
        set: function (v) {
          domCall(id, "set_humidity", { humidity: v });
        },
      });
      if (a.available_modes) out.push(ctlAttrSelect(id, _T("mode"), "available_modes", "mode", "set_mode", "mode"));
      if (a.current_humidity !== undefined)
        out.push(ctlInfo(_T("current_humidity"), function () {
          return domAttrText(id, "current_humidity");
        }));
      return out;
    },
  },
  water_heater: {
    icon: "thermo",
    controls: function (id) {
      var a = A(id),
        out = [];
      if (domBits(id, 8)) out.push(ctlOnOff(id));
      if (domBits(id, 1))
        out.push({
          t: "slider",
          label: _T("target_temperature"),
          icon: "thermo",
          min: domNum(a.min_temp, 30),
          max: domNum(a.max_temp, 70),
          step: domNum(a.target_temp_step, 1),
          get: function () {
            return A(id).temperature;
          },
          unit: TEMPU(),
          set: function (v) {
            domCall(id, "set_temperature", { temperature: v });
          },
        });
      if (domBits(id, 2)) out.push(ctlAttrSelect(id, _T("mode"), "operation_list", "", "set_operation_mode", "operation_mode"));
      if (domBits(id, 4))
        out.push(ctlSwitch(_T("away_mode"), "home", function () {
          return A(id).away_mode === "on";
        }, function (v) {
          domCall(id, "set_away_mode", { away_mode: v });
        }));
      if (a.current_temperature !== undefined)
        out.push(ctlInfo(_T("current_temperature"), function () {
          return domAttrText(id, "current_temperature");
        }));
      return out;
    },
  },
  alarm_control_panel: {
    icon: "lock",
    on: function (id) {
      return V_(id) !== "disarmed" && svOk(id);
    },
    controls: function (id) {
      var list = [
        ctlButton(_T("disarm"), "lock", function () {
          alarmRun(id, "alarm_disarm", false);
        }),
      ];
      [
        [1, "arm_home", "alarm_arm_home", "home"],
        [2, "arm_away", "alarm_arm_away", "lock"],
        [4, "arm_night", "alarm_arm_night", "moon"],
        [32, "arm_vacation", "alarm_arm_vacation", "lock"],
        [16, "arm_custom", "alarm_arm_custom_bypass", "tune"],
      ].forEach(function (m) {
        if (domBits(id, m[0]))
          list.push(ctlButton(_T(m[1]), m[3], function () {
            alarmRun(id, m[2], true);
          }));
      });
      return [{ t: "buttons", list: list }];
    },
  },
  valve: {
    icon: "drop",
    on: function (id) {
      return ["open", "opening"].indexOf(V_(id)) >= 0;
    },
    controls: function (id) {
      var out = [],
        list = [];
      if (domBits(id, 4))
        out.push({
          t: "slider",
          label: _T("position"),
          icon: "drop",
          min: 0,
          max: 100,
          step: 1,
          unit: "%",
          get: function () {
            return A(id).current_position;
          },
          set: function (v) {
            domCall(id, "set_valve_position", { position: v });
          },
        });
      if (domBits(id, 1)) list.push(ctlButton(_T("open"), "play", function () { domCall(id, "open_valve"); }));
      if (domBits(id, 8)) list.push(ctlButton(_T("stop"), "stop", function () { domCall(id, "stop_valve"); }));
      if (domBits(id, 2)) list.push(ctlButton(_T("close"), "close", function () { domCall(id, "close_valve"); }));
      out.push({ t: "buttons", list: list });
      return out;
    },
  },
  lawn_mower: {
    icon: "play",
    on: function (id) {
      return V_(id) === "mowing";
    },
    controls: function (id) {
      var list = [];
      if (domBits(id, 1)) list.push(ctlButton(_T("start"), "play", function () { domCall(id, "start_mowing"); }));
      if (domBits(id, 2)) list.push(ctlButton(_T("pause"), "pause", function () { domCall(id, "pause"); }));
      if (domBits(id, 4)) list.push(ctlButton(_T("dock"), "home", function () { domCall(id, "dock"); }));
      return [{ t: "buttons", list: list }];
    },
  },
  siren: {
    icon: "alert",
    toggle: true,
    controls: function (id) {
      var out = [ctlOnOff(id)];
      if (domBits(id, 4)) {
        var tones = A(id).available_tones || [];
        out.push(
          ctlSelect(
            _T("tone"),
            function () {
              return Array.isArray(tones) ? tones : Object.keys(tones);
            },
            function () {
              return "";
            },
            function (v) {
              domCall(id, "turn_on", { tone: Array.isArray(tones) ? v : tones[v] });
            }
          )
        );
      }
      if (domBits(id, 8))
        out.push({
          t: "slider",
          label: _T("volume"),
          icon: "volup",
          min: 0,
          max: 100,
          step: 5,
          unit: "%",
          get: function () {
            return Math.round(domNum(A(id).volume_level, 1) * 100);
          },
          set: function (v) {
            domCall(id, "turn_on", { volume_level: v / 100 });
          },
        });
      return out;
    },
  },
  update: {
    icon: "restart",
    on: function (id) {
      return V_(id) === "on";
    },
    controls: function (id) {
      var out = [
        ctlInfo(_T("installed_version"), function () { return domAttrText(id, "installed_version"); }),
        ctlInfo(_T("latest_version"), function () { return domAttrText(id, "latest_version"); }),
      ];
      var list = [];
      if (domBits(id, 1))
        list.push(ctlButton(_T("install"), "restart", function () { domCall(id, "install"); }, _T("install_update_ask")));
      list.push(ctlButton(_T("skip"), "close", function () { domCall(id, "skip"); }));
      out.push({ t: "buttons", list: list });
      return out;
    },
  },
  automation: {
    icon: "tune",
    toggle: true,
    controls: function (id) {
      return [
        ctlOnOff(id, _T("enabled")),
        { t: "buttons", list: [ctlButton(_T("run_now"), "play", function () { domCall(id, "trigger"); })] },
        ctlInfo(_T("last_triggered"), function () { return domAttrText(id, "last_triggered"); }),
      ];
    },
  },
  text: { icon: "edit", controls: domTextControls },
  input_text: { icon: "edit", controls: domTextControls },
  date: { icon: "clock", controls: function (id) { return [domMoment(id, "date")]; } },
  time: { icon: "clock", controls: function (id) { return [domMoment(id, "time")]; } },
  datetime: { icon: "clock", controls: function (id) { return [domMoment(id, "datetime")]; } },
  notify: {
    icon: "info",
    controls: function (id) {
      return [{ t: "text", label: _T("send_a_message"), value: function () { return ""; }, set: function (v) { domCall(id, "send_message", { message: v }); } }];
    },
  },
  weather: {
    icon: "thermo",
    controls: function (id) {
      return ["temperature", "humidity", "pressure", "wind_speed"]
        .filter(function (a) {
          return A(id)[a] !== undefined;
        })
        .map(function (a) {
          return ctlInfo(_T("wx_" + a), function () { return domAttrText(id, a); });
        });
    },
  },
  event: {
    icon: "info",
    controls: function (id) {
      return [ctlInfo(_T("last_event"), function () { return domAttrText(id, "event_type"); })];
    },
  },
  person: { icon: "person", controls: function () { return []; } },
  device_tracker: { icon: "home", controls: function () { return []; } },
  group: {
    icon: "tune",
    toggle: true,
    controls: function (id) {
      return [ctlSwitch(_T("power"), "power", function () { return V_(id) === "on"; }, function (v) {
        call("homeassistant", v ? "turn_on" : "turn_off", { entity_id: id });
      })];
    },
  },
  remote: { icon: "media", toggle: true, controls: function (id) { return [ctlOnOff(id)]; } },
};

function domTextControls(id) {
  return [{ t: "text", label: _T("value"), value: function () { return V_(id); }, set: function (v) { domCall(id, "set_value", { value: v }); } }];
}

/* A date, a time or both, set with the browser's own picker. */
function domMoment(id, kind) {
  return { t: "moment", kind: kind, id: id };
}

function domKnown(id) {
  return Object.prototype.hasOwnProperty.call(DOMAINS, dom(id));
}

function domIsOn(id) {
  var d = DOMAINS[dom(id)];
  if (d.on) return d.on(id);
  return !!d.toggle && V_(id) !== "off" && svOk(id);
}

function domMomentRow(c) {
  var w = mk("div", "sqw pane"),
    i = document.createElement("input");
  i.className = "sq";
  i.type = c.kind === "datetime" ? "datetime-local" : c.kind;
  i.setAttribute("aria-label", _T("value"));
  var cur = V_(c.id) || "";
  i.value = c.kind === "datetime" && !isNaN(Date.parse(cur)) ? new Date(Date.parse(cur) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : c.kind === "time" ? cur.slice(0, 5) : cur.slice(0, 10);
  i.addEventListener("change", function () {
    if (!i.value) return;
    var data = {};
    data[c.kind] = c.kind === "datetime" ? new Date(i.value).toISOString() : i.value;
    domCall(c.id, "set_value", data);
  });
  w.appendChild(i);
  return w;
}

/* Draws a list of controls into a popup or a row's place. */
function domControls(b, controls, id) {
  var grid = null;
  controls.forEach(function (c) {
    if (c.t === "select") {
      if (!grid) b.appendChild((grid = mk("div", "grid2")));
      grid.appendChild(selectTile(c.label, c.opts, c.cur, c.set, "tune", c.fmt));
      return;
    }
    grid = null;
    if (c.t === "switch")
      b.appendChild(
        pill(c.icon, c.label, {
          on: c.on,
          val: function () {
            return c.on() ? _T("on_cap") : _T("off");
          },
          tap: function () {
            c.set(!c.on());
          },
        })
      );
    else if (c.t === "slider")
      b.appendChild(
        sliderRow({
          icon: c.icon,
          name: c.label,
          min: c.min,
          max: c.max,
          step: c.step,
          get: c.get,
          fmt: function (v) {
            return v === undefined || v === null ? "–" : v + (c.unit || "");
          },
          commit: c.set,
        })
      );
    else if (c.t === "buttons") {
      var row = mk("div", "rrow");
      c.list.forEach(function (x) {
        row.appendChild(
          rbtn(
            x.icon,
            function () {
              if (x.ask) confirmDlg(x.ask, x.run);
              else x.run();
            },
            x.label
          )
        );
      });
      if (c.list.length) b.appendChild(row);
    } else if (c.t === "text")
      b.appendChild(
        pill("edit", c.label, {
          sub: function () {
            return c.value();
          },
          tap: function () {
            textDlg(c.label, c.value(), _T("save"), c.set, 2);
          },
        })
      );
    else if (c.t === "moment") b.appendChild(domMomentRow(c));
    else b.appendChild(pill("info", c.label, { val: c.val }));
  });
}

/* The row of an entity of one of these types. */
function domRow(d) {
  var id = d.id,
    def = DOMAINS[dom(id)];
  return pill(d.icon || def.icon, d.name, {
    on: function () {
      return domIsOn(id);
    },
    val: function () {
      return domState(id);
    },
    tap: function () {
      showPopup("dev:" + id, true);
    },
    iconTap: def.toggle
      ? function () {
          call("homeassistant", "toggle", { entity_id: id });
        }
      : undefined,
  });
}

/* Home Assistant's own dialog for any entity, offered where nothing restricts the viewer. It is an advanced button (decision D-38): the dashboard's switch and the device's own
   hide it. */
function haMorePill(id) {
  var mode = ISADMIN ? "" : modeOf(id).mode;
  if (!id || mode === "view" || mode === "confirm" || mode === "hide" || advAllOff() || advDevOff(id)) return null;
  return pill("info", _T("more_in_home_assistant"), {
    tap: function () {
      if (!window.HA.moreInfo(id)) toast(_T("cannot_open_ha_dialog"));
    },
  });
}
