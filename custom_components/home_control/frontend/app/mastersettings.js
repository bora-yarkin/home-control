/* What a Lights section's lights master can be set to beyond its name: which lights it controls (the section's own, or lights chosen for it, with their names and icons), what its power button does (switch the lights, or run a scene), and whether its light popup has the sync tab. The master is named "page~section" everywhere (the same section id is on every page).
   What the section keeps (app/model.js): mm (manual lights), ml (the chosen lights: { id, n (name), i (icon) }), mpw ("scene": the power button runs a scene), mps (the key of that scene, see scenetab.js), msync (the sync tab is on) and msyncid (which sync, when there are several). */

/* The section of a lights master, by its name. */
function masterSec(sid) {
  var at = String(sid).split("~");
  return at.length === 2 ? secById(at[0], at[1]) : null;
}

/* The lights it controls. Automatic: every light of its section, also the ones hidden in the section (hiding is for the page; the master still has them), except what this person may not see. Manual: the lights chosen for it. */
function masterLightIds(sec) {
  if (sec.mm)
    return (sec.ml || [])
      .map(function (m) {
        return m.id;
      })
      .filter(function (id) {
        return H().states[id];
      });
  return (sec.devs || [])
    .filter(function (d) {
      return d.id && d.kind === "light" && modeOf(d.id).mode !== "hide";
    })
    .map(function (d) {
      return d.id;
    });
}

/* The names and icons chosen for the lights of a manual master: { entity: { n, i } }. */
function masterMeta(sec) {
  var out = {};
  if (sec.mm)
    (sec.ml || []).forEach(function (m) {
      if (m.n || m.i) out[m.id] = { n: m.n || "", i: m.i || "" };
    });
  return out;
}

/* The syncs the light popup of a master can have as a tab: the devices a plugin says are one (Hue Plus's Spotify sync). */
function masterSyncDevices() {
  return Object.keys(H().states).filter(function (id) {
    var k = pluginDeviceKind(id);
    return k && k.sync;
  });
}

/* The sync of a master, or null when it has none or the tab is off. */
function masterSyncOf(sec) {
  if (!sec || !sec.msync) return null;
  var all = masterSyncDevices();
  return all.indexOf(sec.msyncid) >= 0 ? sec.msyncid : all[0] || null;
}

/* What the power button does: with "scene" it runs the chosen scene when the lights are off and switches them off when they are on; otherwise it switches the lights. */
function masterPower(sid) {
  var sec = masterSec(sid),
    ids = LMASTER[sid] || [];
  if (sec && sec.mpw === "scene" && sec.mps && !countOn(lightUnits(ids))) {
    var S0 = { root: { key: "m:" + sid, cmd: lightUnits(ids) } },
      it = mscItems(S0).filter(function (x) {
        return x.key === sec.mps;
      })[0];
    if (it) return mscPlay(S0, it);
  }
  lightsMasterToggle(ids);
}

/* The settings of the master that are about what it is, drawn into `box` by lightsMasterSettings. `redraw` draws the page again. */
function masterModeRows(box, sec, scope, redraw) {
  var key = scope + ":" + sec.id,
    sid = scope + "~" + sec.id;
  box.appendChild(sep(_T("master_lights"), "lights"));
  box.appendChild(
    seg(
      [
        ["auto", _T("master_auto")],
        ["manual", _T("master_manual")],
      ],
      sec.mm ? "manual" : "auto",
      function (v) {
        if (v === "manual") {
          sec.mm = 1;
          /* It starts from the lights it has now. */
          if (!sec.ml)
            sec.ml = masterLightIds(Object.assign({}, sec, { mm: 0 })).map(function (id) {
              return { id: id };
            });
        } else delete sec.mm;
        uiChanged();
        redraw();
      }
    )
  );
  box.appendChild(hintRow(sec.mm ? _T("master_manual_hint") : _T("master_auto_hint")));
  if (!sec.mm) return;
  box.appendChild(
    pill("plus", _T("master_choose_lights"), {
      sub: function () {
        return (sec.ml || []).length + " " + _T("lights").toLowerCase();
      },
      tap: function () {
        showPopup("lmaster-lights:" + key, true);
      },
    })
  );
  (sec.ml || []).forEach(function (m) {
    var nm = m.n || A(m.id).friendly_name || m.id;
    box.appendChild(
      pill(m.i && iconOk(m.i) ? m.i : "light", nm, {
        sub: function () {
          return m.id;
        },
        tap: function () {
          showPopup("lmaster-light:" + key + ":" + m.id, true);
        },
      })
    );
  });
}

/* The settings that are about the popup: what the power button does, and the sync tab. */
function masterPopupRows(box, sec, scope, redraw) {
  var key = scope + ":" + sec.id,
    sid = scope + "~" + sec.id;
  box.appendChild(sep(_T("master_power_button"), "power"));
  box.appendChild(
    seg(
      [
        ["lights", _T("master_power_lights")],
        ["scene", _T("master_power_scene")],
      ],
      sec.mpw === "scene" ? "scene" : "lights",
      function (v) {
        if (v === "scene") sec.mpw = "scene";
        else delete sec.mpw;
        uiChanged();
        redraw();
      }
    )
  );
  box.appendChild(hintRow(sec.mpw === "scene" ? _T("master_power_scene_hint") : _T("master_power_lights_hint")));
  if (sec.mpw === "scene") {
    var S0 = { root: { key: "m:" + sid, cmd: lightUnits(masterLightIds(sec)) } },
      cur = mscItems(S0).filter(function (x) {
        return x.key === sec.mps;
      })[0];
    box.appendChild(
      pill("scene", _T("master_power_scene_pick"), {
        val: function () {
          return cur ? cur.name : _T("none");
        },
        tap: function () {
          showPopup("lmaster-pscene:" + key, true);
        },
      })
    );
  }
  var syncs = masterSyncDevices();
  if (syncs.length) {
    box.appendChild(
      flagPill("syncring", _T("master_sync_tab"), sec, "msync", function (on) {
        return on ? _T("master_sync_tab_on") : _T("master_sync_tab_off");
      })
    );
    if (sec.msync && syncs.length > 1)
      box.appendChild(
        dropRow(
          _T("master_sync_which"),
          syncs,
          function () {
            return syncs.indexOf(sec.msyncid) >= 0 ? sec.msyncid : syncs[0];
          },
          function (v) {
            sec.msyncid = v;
            uiChanged();
          },
          "syncring",
          function (v) {
            return A(v).friendly_name || v;
          }
        )
      );
  }
}

/* Choosing the lights of a manual master: every light of Home Assistant, searched by name and filtered by area; a tap adds or takes out. */
function masterLightsPage(b, key) {
  var p = key.split(":"),
    sec = secById(p[0], p[1]);
  if (!sec) return;
  var st = { q: "", area: "" },
    box = mk("div"),
    inp = mk("input", "sq"),
    w = mk("div", "sqw pane", svg("search"));
  inp.type = "text";
  inp.placeholder = _T("search_devices");
  inp.setAttribute("autocomplete", "off");
  inp.addEventListener("input", function () {
    st.q = inp.value;
    draw();
  });
  w.appendChild(inp);
  b.appendChild(w);
  var areaTile = selectTile(
    _T("add_area"),
    function () {
      var ids = Object.keys(H().areas || {}).sort(function (x, y) {
        return String(H().areas[x].name).localeCompare(H().areas[y].name);
      });
      return ["all"].concat(ids);
    },
    function () {
      return st.area || "all";
    },
    function (v) {
      st.area = v === "all" ? "" : v;
      areaTile.refresh();
      draw();
    },
    "home",
    function (v) {
      return v === "all" ? _T("all_areas") : (H().areas[v] || {}).name || v;
    }
  );
  areaTile.classList.add("selrow");
  areaTile.refresh();
  b.appendChild(areaTile);
  b.appendChild(box);
  function has(id) {
    return (sec.ml || []).some(function (m) {
      return m.id === id;
    });
  }
  function draw() {
    box.innerHTML = "";
    var h = H(),
      zones = zoneLightIds(h.states, h.entities),
      tk = norm(st.q || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean),
      list = Object.keys(h.states)
        .filter(function (id) {
          if (id.indexOf("light.") !== 0 || zones[id]) return false;
          var e = h.entities && h.entities[id];
          if (e && (e.entity_category || e.hidden)) return false;
          if (st.area && areaIdOf(id) !== st.area) return false;
          var hay = norm((A(id).friendly_name || id) + " " + id + " " + areaName(id));
          return tk.every(function (x) {
            return hay.indexOf(x) >= 0;
          });
        })
        .sort(function (x, y) {
          return has(y) - has(x) || String(A(x).friendly_name || x).localeCompare(A(y).friendly_name || y);
        });
    list.slice(0, 60).forEach(function (id) {
      box.appendChild(
        pill("light", A(id).friendly_name || id, {
          sub: function () {
            return areaName(id);
          },
          check: function () {
            return has(id);
          },
          tap: function () {
            if (has(id)) sec.ml = sec.ml.filter(function (m) {
              return m.id !== id;
            });
            else (sec.ml = sec.ml || []).push({ id: id });
            uiChanged();
          },
        })
      );
    });
  }
  draw();
}

/* The name and the icon a manual master shows for one of its lights. */
function masterLightPage(b, key) {
  var p = key.split(":"),
    sec = secById(p[0], p[1]),
    m = sec && (sec.ml || []).filter(function (x) {
      return x.id === p.slice(2).join(":");
    })[0];
  if (!m) return;
  b.appendChild(
    textRow("edit", A(m.id).friendly_name || m.id, m.n || "", function (v) {
      if (v) m.n = v.slice(0, 40);
      else delete m.n;
      uiChanged();
    })
  );
  b.appendChild(
    iconPick(DEVICONS, m.i || "light", function (n) {
      m.i = n;
      uiChanged();
    })
  );
  b.appendChild(
    pill("restart", _T("master_light_default"), {
      tap: function () {
        delete m.n;
        delete m.i;
        uiChanged();
        popBack();
      },
    })
  );
}

/* The scene the power button runs: one of the scenes of the master's own list, or none. */
function masterSceneRunPage(b, key) {
  var p = key.split(":"),
    sec = secById(p[0], p[1]);
  if (!sec) return;
  var S0 = { root: { key: "m:" + p[0] + "~" + p[1], cmd: lightUnits(masterLightIds(sec)) } },
    rows = [];
  function choose(k) {
    if (k) sec.mps = k;
    else delete sec.mps;
    uiChanged();
    rows.forEach(function (r) {
      r.refresh();
    });
  }
  rows.push(
    b.appendChild(
      pill("close", _T("none"), {
        check: function () {
          return !sec.mps;
        },
        tap: function () {
          choose("");
        },
      })
    )
  );
  mscItems(S0).forEach(function (it) {
    rows.push(
      b.appendChild(
        pill(it.kind === "hue" ? "palette" : it.kind === "live" ? "sparkle" : "scene", it.name, {
          sub: function () {
            return mscKindLabel(it);
          },
          check: function () {
            return sec.mps === it.key;
          },
          tap: function () {
            choose(it.key);
          },
        })
      )
    );
  });
}
