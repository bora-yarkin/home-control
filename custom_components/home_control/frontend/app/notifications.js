/* Notifications: rules that become Home Assistant automations. */

/* ---- notifications (admin): rules become Home Assistant automations ---- */
var NRULES = {
  batt: {
    title: _T("low_battery"),
    icon: "battery",
    desc: _T("when_a_tracked_battery_sensor_drops_"),
  },
  offline: {
    title: _T("device_offline"),
    icon: "alert",
    desc: _T("when_a_device_stays_unavailable_for_"),
  },
  vacuum: {
    title: _T("robot_vacuum_problem"),
    icon: "vac",
    desc: _T("when_the_robot_vacuum_reports_an_err"),
  },
};

function cleanNotify(n) {
  var o = { rules: {} };
  Object.keys(NRULES).forEach(function (k) {
    var r = (n && n.rules && n.rules[k]) || {},
      c = { on: !!r.on, targets: [] };
    (Array.isArray(r.targets) ? r.targets : []).slice(0, 10).forEach(function (x) {
      if (typeof x === "string" && /^[a-z0-9_]{1,60}$/.test(x)) c.targets.push(x);
    });
    if (k === "batt") c.thr = [10, 15, 20, 30].indexOf(r.thr) >= 0 ? r.thr : 20;
    if (k === "offline") c.mins = [5, 10, 15, 30, 60].indexOf(r.mins) >= 0 ? r.mins : 5;
    if (k === "offline" || k === "batt") {
      c.ents = [];
      (Array.isArray(r.ents) ? r.ents : []).slice(0, 150).forEach(function (x) {
        if (typeof x === "string" && ENTRE.test(x)) c.ents.push(x);
      });
      c.scope =
        ["default", "all", "custom"].indexOf(r.scope) >= 0
          ? r.scope
          : c.ents.length
            ? "custom"
            : "default";
    }
    o.rules[k] = c;
  });
  /* Alerts for any entity: when it reaches a state (a washer finished, a door left open, a call). */
  o.watch = [];
  (n && Array.isArray(n.watch) ? n.watch : []).slice(0, 20).forEach(function (w) {
    if (!w || typeof w.id !== "string" || !/^w[a-z0-9]{1,10}$/.test(w.id) || o.watch.some(function (x) { return x.id === w.id; })) return;
    var c = {
      id: w.id,
      name: typeof w.name === "string" ? w.name.slice(0, 40) : "",
      e: typeof w.e === "string" && ENTRE.test(w.e) ? w.e : "",
      to: typeof w.to === "string" ? w.to.slice(0, 40) : "",
      on: !!w.on,
      targets: [],
    };
    (Array.isArray(w.targets) ? w.targets : []).slice(0, 10).forEach(function (x) {
      if (typeof x === "string" && /^[a-z0-9_]{1,60}$/.test(x)) c.targets.push(x);
    });
    o.watch.push(c);
  });
  return o;
}

/* ---- alerts for any entity ---- */

var WATCH_DOMS = ["sensor", "binary_sensor", "select", "input_select", "switch", "input_boolean", "light", "climate", "vacuum", "media_player", "event", "lock", "cover", "fan", "button", "person", "device_tracker", "update", "timer", "counter", "camera"];

function watchRules() {
  if (!STORE.notify) STORE.notify = cleanNotify(null);
  return STORE.notify.watch || (STORE.notify.watch = []);
}

function watchPayload(w) {
  if (!w.e || !w.to || !w.targets.length) return null;
  var msg = w.name
    ? w.name + ": {{ trigger.to_state.attributes.friendly_name }}"
    : "{{ trigger.to_state.attributes.friendly_name }} is now {{ trigger.to_state.state }}";
  return {
    id: "dashboard_n_" + w.id,
    alias: _T("dashboard_notify") + (w.name || w.e),
    description: _T("managed_by_the_dashboard_app_setting_2"),
    mode: "queued",
    triggers: [{ trigger: "state", entity_id: w.e, to: w.to }],
    conditions: [],
    actions: w.targets.map(function (t) {
      var data = { title: _T("home"), message: msg };
      /* The notification of a door call opens this dashboard when it is tapped, and the dashboard opens the call (app/doorcall.js). `url` is what iOS reads, `clickAction` Android. */
      if (ixIsRing(w.e)) data.data = { url: window.HA.panelPath(), clickAction: window.HA.panelPath() };
      return { action: "notify." + t, data: data };
    }),
  };
}

function syncWatch(w) {
  var p = watchPayload(w);
  if (w.on && p) return window.HA.automations.save(p.id, p);
  return window.HA.automations.remove("dashboard_n_" + w.id).catch(function () {});
}

function watchEdit(b, id) {
  var w = watchRules().filter(function (x) {
      return x.id === id;
    })[0],
    box = mk("div");
  if (!w) return;
  b.appendChild(box);
  function save() {
    storeChanged();
    syncWatch(w).catch(function (e) {
      toast((e && e.body && e.body.message) || _T("couldn_t_update_the_automation_in_ho"));
    });
  }
  function draw() {
    box.appendChild(
      pill("check", _T("send_this_notification"), {
        on: function () {
          return w.on;
        },
        sub: function () {
          return w.on ? _T("on_2") : _T("off");
        },
        tap: function () {
          if (!w.on && !watchPayload(Object.assign({}, w, { on: true }))) {
            toast(_T("nw_choose_the_entity_the_state_and_a_recipient_first"));
            return;
          }
          w.on = !w.on;
          save();
          redrawBox(box, draw);
        },
      })
    );
    box.appendChild(
      textRow("edit", _T("nw_name"), w.name, function (v) {
        w.name = v.slice(0, 40);
        save();
      }, 40)
    );
    box.appendChild(
      pill("plug", w.e ? A(w.e).friendly_name || w.e : _T("ap_not_set"), {
        sub: function () {
          return w.e || _T("nw_the_entity_to_watch");
        },
        tap: function () {
          pickEntity(_T("nw_the_entity_to_watch"), WATCH_DOMS, null, function (e) {
            w.e = e;
            w.to = "";
            w.on = false;
            save();
            redrawBox(box, draw);
          });
        },
      })
    );
    if (w.e) {
      box.appendChild(sep(_T("nw_when_it_becomes"), "alert"));
      var a = A(w.e),
        opts = Array.isArray(a.options) && a.options.length ? a.options : dom(w.e) === "binary_sensor" || dom(w.e) === "input_boolean" || dom(w.e) === "switch" ? ["on", "off"] : null;
      if (opts && opts.length <= 6)
        box.appendChild(
          seg(
            opts.map(function (o) {
              return [o, cap(o)];
            }),
            w.to,
            function (v) {
              w.to = v;
              save();
              redrawBox(box, draw);
            }
          )
        );
      else if (opts)
        box.appendChild(selectTile(_T("nw_state"), function () { return opts; }, function () { return w.to; }, function (v) { w.to = v; save(); redrawBox(box, draw); }));
      else
        box.appendChild(
          textRow("edit", _T("nw_state_exactly_as_shown_by_the_entity"), w.to, function (v) {
            w.to = v.slice(0, 40);
            save();
          }, 40)
        );
    }
    box.appendChild(sep(_T("recipients_2"), "person"));
    var ts = notifyTargets();
    if (!ts.length) box.appendChild(pill("info", _T("no_notification_services"), {}));
    ts.forEach(function (t) {
      box.appendChild(
        pill("bell", notifyNice(t), {
          on: function () {
            return w.targets.indexOf(t) >= 0;
          },
          tap: function () {
            var i = w.targets.indexOf(t);
            if (i >= 0) w.targets.splice(i, 1);
            else w.targets.push(t);
            if (!w.targets.length) w.on = false;
            save();
            redrawBox(box, draw);
          },
        })
      );
    });
    box.appendChild(
      pill("trash", _T("nw_remove_this_alert"), {
        tap: function () {
          STORE.notify.watch = watchRules().filter(function (x) {
            return x !== w;
          });
          storeChanged();
          window.HA.automations.remove("dashboard_n_" + w.id).catch(function () {});
          popBack();
        },
      })
    );
  }
  draw();
}

function watchSection(box, redraw) {
  box.appendChild(sep(_T("nw_alerts_for_any_entity"), "alert"));
  watchRules().forEach(function (w) {
    box.appendChild(
      swRow("alert", w.name || (w.e ? A(w.e).friendly_name || w.e : _T("nw_new_alert")), {
        sub: function () {
          return w.e ? w.e + (w.to ? " → " + w.to : "") : _T("ap_not_set");
        },
        on: function () {
          return w.on;
        },
        toggle: function () {
          if (!w.on && !watchPayload(Object.assign({}, w, { on: true }))) {
            toast(_T("nw_choose_the_entity_the_state_and_a_recipient_first"));
            return;
          }
          w.on = !w.on;
          storeChanged();
          syncWatch(w).catch(function (e) {
            toast((e && e.body && e.body.message) || _T("couldn_t_update_the_automation_in_ho"));
          });
          redraw();
        },
        open: function () {
          showPopup("manage-nwatch:" + w.id, true);
        },
      })
    );
  });
  if (watchRules().length < 20)
    box.appendChild(
      pill("plus", _T("nw_add_an_alert"), {
        sub: function () {
          return _T("nw_add_an_alert_sub");
        },
        tap: function () {
          var w = { id: "w" + Date.now().toString(36).slice(-6), name: "", e: "", to: "", on: false, targets: [] };
          watchRules().push(w);
          storeChanged();
          showPopup("manage-nwatch:" + w.id, true);
        },
      })
    );
}

function nrule(k) {
  if (!STORE.notify) STORE.notify = cleanNotify(null);
  return STORE.notify.rules[k];
}

function notifyTargets() {
  var s = H().services && H().services.notify;
  return s
    ? Object.keys(s)
        .filter(function (k) {
          return /^mobile_app_/.test(k) || k === "persistent_notification";
        })
        .sort()
    : [];
}

var NOTIFYKINDS = [
  "light",
  "media",
  "climate",
  "fan",
  "switch",
  "vacuum",
  "camera",
  "cover",
  "lock",
];

function offlineAll() {
  return devsOf()
    .filter(function (d) {
      return d.id && NOTIFYKINDS.indexOf(d.kind) >= 0;
    })
    .map(function (d) {
      return d.id;
    })
    .filter(function (id, i, a) {
      return a.indexOf(id) === i;
    });
}

function offlineList(r) {
  return r.scope === "all" ? offlineAll() : r.scope === "custom" ? r.ents : offlineDefault();
}

function offlineDefault() {
  return devsOf()
    .filter(function (d) {
      return d.id && ["camera", "climate", "vacuum"].indexOf(d.kind) >= 0;
    })
    .map(function (d) {
      return d.id;
    });
}

function notifyPayload(k) {
  var r = nrule(k),
    trigs = [],
    msg = "",
    ents;
  if (k === "batt") {
    ents =
      r.scope === "custom"
        ? r.ents
        : UI.bats.map(function (x) {
            return x[1];
          });
    /* A percentage sensor triggers below the limit; a battery binary sensor triggers when it reports low (on). */
    var pct = ents.filter(function (id) {
        return dom(id) !== "binary_sensor";
      }),
      flags = ents.filter(function (id) {
        return dom(id) === "binary_sensor";
      });
    if (pct.length) trigs.push({ trigger: "numeric_state", entity_id: pct, below: r.thr });
    if (flags.length) trigs.push({ trigger: "state", entity_id: flags, to: "on" });
    msg =
      "{{ trigger.to_state.attributes.friendly_name }} battery is {{ 'low' if trigger.to_state.domain == 'binary_sensor' else 'at ' ~ trigger.to_state.state ~ '%' }}";
  } else if (k === "offline") {
    ents = offlineList(r);
    if (ents.length)
      trigs.push({
        trigger: "state",
        entity_id: ents,
        to: "unavailable",
        "for": { minutes: r.mins || 5 },
      });
    msg = "{{ trigger.to_state.attributes.friendly_name }} is offline";
  } else {
    ents = devsOf("vacuum").map(function (d) {
      return d.id;
    });
    if (ents.length) trigs.push({ trigger: "state", entity_id: ents, to: "error" });
    msg = "{{ trigger.to_state.attributes.friendly_name }} reports a problem";
  }
  if (!trigs.length || !r.targets.length) return null;
  return {
    id: "dashboard_n_" + k,
    alias: _T("dashboard_notify") + NRULES[k].title,
    description: _T("managed_by_the_dashboard_app_setting_2"),
    mode: "queued",
    triggers: trigs,
    conditions: [],
    actions: r.targets.map(function (t) {
      return { action: "notify." + t, data: { title: _T("home"), message: msg } };
    }),
  };
}

function syncNotify(k) {
  var p = notifyPayload(k),
    r = nrule(k);
  if (r.on && p) return window.HA.automations.save(p.id, p);
  return window.HA.automations.remove("dashboard_n_" + k).catch(function () {});
}

/* The automations are built here, so they only changed when someone saved a rule. What a rule watches also changes when a
   device is added to the dashboard or a battery sensor is tracked. This brings each switched-on automation back to what its
   rule builds now. It reads the automation in Home Assistant first and writes only when it differs, so opening the dashboard
   on several screens does not rewrite it each time. */
function stableForm(x, key) {
  if (Array.isArray(x)) {
    var a = x.map(function (v) {
      return stableForm(v);
    });
    return key === "entity_id" ? a.sort() : a;
  }
  if (x && typeof x === "object") {
    var o = {};
    Object.keys(x)
      .sort()
      .forEach(function (k) {
        o[k] = stableForm(x[k], k);
      });
    return o;
  }
  return x;
}

function notifyWatch(p) {
  return JSON.stringify(stableForm({ triggers: p.triggers, actions: p.actions }));
}

var NRECON = 0;

function notifyReconcile() {
  if (!ISADMIN || !STORE_READY || !H() || OFFLINE) return;
  Object.keys(NRULES).forEach(function (k) {
    var p = nrule(k).on ? notifyPayload(k) : null;
    if (!p) return;
    window.HA.automations
      .get(p.id)
      .then(
        function (cur) {
          return notifyWatch(cur) === notifyWatch(p) ? null : window.HA.automations.save(p.id, p);
        },
        function (e) {
          /* Only an automation that is not there is made again; a failed read says nothing about it. */
          return e && e.status_code === 404 ? window.HA.automations.save(p.id, p) : null;
        }
      )
      .catch(function () {});
  });
  watchReconcile();
}

/* The alerts for any entity are brought to what they build now, the same way. */
function watchReconcile() {
  watchRules().forEach(function (w) {
    var p = w.on ? watchPayload(w) : null;
    if (!p) return;
    window.HA.automations
      .get(p.id)
      .then(
        function (cur) {
          return notifyWatch(cur) === notifyWatch(p) ? null : window.HA.automations.save(p.id, p);
        },
        function (e) {
          return e && e.status_code === 404 ? window.HA.automations.save(p.id, p) : null;
        }
      )
      .catch(function () {});
  });
}

function notifyReconcileSoon() {
  clearTimeout(NRECON);
  NRECON = setTimeout(notifyReconcile, 3000);
}

function notifyPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    var hint = mk("div", "hint");
    hint.textContent = _T("notifications_are_sent_by_home_assis");
    box.appendChild(hint);
    box.appendChild(sep(_T("smart_alerts"), "alert"));
    Object.keys(NRULES).forEach(function (k) {
      var r = nrule(k),
        n = NRULES[k];
      box.appendChild(
        swRow(n.icon, n.title, {
          sub: function () {
            return (
              n.desc +
              (r.on
                ? " · " +
                  r.targets.length +
                  (r.targets.length === 1 ? _T("recipient") : _T("recipients"))
                : "")
            );
          },
          on: function () {
            return r.on;
          },
          toggle: function () {
            if (!r.on && !r.targets.length) {
              toast(_T("choose_at_least_one_recipient_first"));
              return;
            }
            r.on = !r.on;
            storeChanged();
            syncNotify(k).catch(function (e) {
              toast((e && e.body && e.body.message) || _T("couldn_t_update_the_automation_in_ho"));
            });
          },
          open: function () {
            showPopup("manage-nrule:" + k, true);
          },
        })
      );
    });
    watchSection(box, function () {
      redrawBox(box, draw);
    });
    box.appendChild(sep(_T("worn_parts"), "vac"));
    var hp = mk("div", "hint");
    hp.textContent = _T("filters_brushes_ink_and_similar_part");
    box.appendChild(hp);
    box.appendChild(
      seg(
        [
          ["5", "5%"],
          ["10", "10%"],
          ["15", "15%"],
          ["20", "20%"],
          ["25", "25%"],
        ],
        String(partsLow()),
        function (v) {
          STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { partsLow: +v }));
          storeChanged();
          redrawBox(box, draw);
        }
      )
    );
    box.appendChild(sep(_T("devices_that_can_receive"), "bell"));
    var ts = notifyTargets();
    if (!ts.length)
      box.appendChild(
        pill("info", _T("no_notification_services_found"), {
          sub: function () {
            return _T("install_the_home_assistant_companion");
          },
        })
      );
    ts.forEach(function (t) {
      var p = pill("bell", notifyNice(t), {
        sub: function () {
          return _T("tap_to_send_a_test_notification");
        },
        val: function () {
          return _T("send_test");
        },
        tap: function () {
          callRaw("notify", t, {
            title: _T("home"),
            message: _T("test_notification_from_the_dashboard"),
          });
          toast(_T("test_sent"));
        },
      });
      p.classList.add("hasact");
      box.appendChild(p);
    });
  }
  redrawBox(box, draw);
}

function nruleEdit(b, k) {
  var r = nrule(k),
    n = NRULES[k],
    box = mk("div");
  b.appendChild(box);
  function save() {
    storeChanged();
    syncNotify(k).catch(function (e) {
      toast((e && e.body && e.body.message) || _T("couldn_t_update_the_automation_in_ho"));
    });
  }
  function draw() {
    var hint = mk("div", "hint");
    hint.textContent = n.desc + ".";
    box.appendChild(hint);
    box.appendChild(
      pill("check", _T("send_this_notification"), {
        on: function () {
          return r.on;
        },
        sub: function () {
          return r.on ? _T("on_2") : _T("off");
        },
        tap: function () {
          if (!r.on && !r.targets.length) {
            toast(_T("choose_at_least_one_recipient_first"));
            return;
          }
          r.on = !r.on;
          save();
          redrawBox(box, draw);
        },
      })
    );
    if (k === "batt")
      box.appendChild(
        seg(
          [
            ["10", "10%"],
            ["15", "15%"],
            ["20", "20%"],
            ["30", "30%"],
          ],
          String(r.thr),
          function (v) {
            r.thr = +v;
            save();
            redrawBox(box, draw);
          }
        )
      );
    if (k === "batt") {
      box.appendChild(sep(_T("sensors_to_watch"), "battery"));
      box.appendChild(
        seg(
          [
            ["default", _T("all_tracked_batteries")],
            ["custom", _T("choose")],
          ],
          r.scope,
          function (v) {
            r.scope = v;
            if (v === "custom" && !r.ents.length)
              r.ents = UI.bats.map(function (x) {
                return x[1];
              });
            save();
            redrawBox(box, draw);
          }
        )
      );
      var hb = mk("div", "hint");
      hb.textContent =
        r.scope === "custom"
          ? _T("tick_the_battery_sensors_to_watch_yo")
          : _T("every_battery_sensor_on_the_batterie");
      box.appendChild(hb);
      if (r.scope === "custom") {
        var shown = {};
        UI.bats.forEach(function (x) {
          shown[x[1]] = 1;
          box.appendChild(
            pill("battery", x[0], {
              on: function () {
                return r.ents.indexOf(x[1]) >= 0;
              },
              sub: function () {
                return entVal(x[1]);
              },
              tap: function () {
                var i = r.ents.indexOf(x[1]);
                if (i >= 0) r.ents.splice(i, 1);
                else r.ents.push(x[1]);
                save();
              },
            })
          );
        });
        r.ents.forEach(function (id) {
          if (shown[id]) return;
          box.appendChild(
            pill("battery", A(id).friendly_name || id, {
              on: function () {
                return r.ents.indexOf(id) >= 0;
              },
              sub: function () {
                return id;
              },
              tap: function () {
                var i = r.ents.indexOf(id);
                if (i >= 0) r.ents.splice(i, 1);
                else r.ents.push(id);
                save();
                redrawBox(box, draw);
              },
            })
          );
        });
        box.appendChild(
          pill("plus", _T("add_another_battery_sensor"), {
            tap: function () {
              pickEntity(_T("choose_a_battery_sensor"), ["sensor", "binary_sensor"], ["battery"], function (id) {
                if (r.ents.indexOf(id) < 0) r.ents.push(id);
                save();
              });
            },
          })
        );
      }
    }
    if (k === "offline") {
      box.appendChild(sep(_T("offline_for"), "clock"));
      box.appendChild(
        seg(
          [
            ["5", "5 min"],
            ["10", "10 min"],
            ["15", "15 min"],
            ["30", "30 min"],
            ["60", "1 h"],
          ],
          String(r.mins || 5),
          function (v) {
            r.mins = +v;
            save();
            redrawBox(box, draw);
          }
        )
      );
    }
    box.appendChild(sep(_T("recipients_2"), "person"));
    var ts = notifyTargets();
    if (!ts.length) box.appendChild(pill("info", _T("no_notification_services"), {}));
    ts.forEach(function (t) {
      box.appendChild(
        pill("bell", notifyNice(t), {
          on: function () {
            return r.targets.indexOf(t) >= 0;
          },
          sub: function () {
            return _T("notify") + t;
          },
          tap: function () {
            var i = r.targets.indexOf(t);
            if (i >= 0) r.targets.splice(i, 1);
            else r.targets.push(t);
            if (!r.targets.length) r.on = false;
            save();
            redrawBox(box, draw);
          },
        })
      );
    });
    if (r.targets.length)
      box.appendChild(
        pill("bell", _T("send_a_test"), {
          sub: function () {
            return _T("sends_a_short_test_message_to_the_re");
          },
          tap: function () {
            r.targets.forEach(function (t) {
              callRaw("notify", t, {
                title: _T("home"),
                message: _T("test_notification_from_the_dashboard"),
              });
            });
            toast(_T("test_sent"));
          },
        })
      );
    if (k === "offline") {
      box.appendChild(sep(_T("devices_to_watch"), "plug"));
      box.appendChild(
        seg(
          [
            ["default", _T("cameras_acs_robot")],
            ["all", _T("all_devices")],
            ["custom", _T("choose")],
          ],
          r.scope,
          function (v) {
            r.scope = v;
            if (v === "custom" && !r.ents.length) r.ents = offlineDefault().slice();
            save();
            redrawBox(box, draw);
          }
        )
      );
      var h2 = mk("div", "hint");
      h2.textContent =
        r.scope === "all"
          ? _T("every_device_in_every_room_including")
          : r.scope === "custom"
            ? _T("tick_the_devices_to_watch")
            : _T("cameras_air_conditioners_and_the_rob");
      box.appendChild(h2);
      if (r.scope === "custom") {
        UI.rooms.forEach(function (rm) {
          var ds = (UI.devs[rm.id] || []).filter(function (d) {
            return d.id && NOTIFYKINDS.indexOf(d.kind) >= 0;
          });
          if (!ds.length) return;
          box.appendChild(sep(rm.name, rm.icon || "home"));
          ds.forEach(function (d) {
            box.appendChild(
              pill(d.icon || "plug", d.name, {
                on: function () {
                  return r.ents.indexOf(d.id) >= 0;
                },
                sub: function () {
                  return KINDLAB[d.kind];
                },
                tap: function () {
                  var i = r.ents.indexOf(d.id);
                  if (i >= 0) r.ents.splice(i, 1);
                  else r.ents.push(d.id);
                  save();
                },
              })
            );
          });
        });
      }
    }
    if (r.targets.length)
      box.appendChild(
        pill("play", _T("send_a_test_notification"), {
          sub: function () {
            return _T("sends_one_message_to_the_recipients_");
          },
          tap: function () {
            confirmDlg(
              _T("send_a_test_notification_to") +
                r.targets.length +
                (r.targets.length === 1 ? _T("recipient") : _T("recipients")) +
                "?",
              function () {
                r.targets.forEach(function (t) {
                  callRaw("notify", t, {
                    title: _T("home"),
                    message: _T("test_notification_from_your_dashboar"),
                  });
                });
                toast(_T("sent"));
              }
            );
          },
        })
      );
  }
  redrawBox(box, draw);
}
