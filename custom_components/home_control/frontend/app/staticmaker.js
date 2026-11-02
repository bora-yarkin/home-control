/* Classic scenes: fixed settings of devices, and live scenes to start, run from the browser. The editor lists what the scene does. A light opens the light popup of the dashboard (the colour wheel, groups separated into single lights, effects) and a tick keeps what it shows; the other devices open in place. */

var SCD = null;

/* `start` (optional) is what a new scene begins with, as when it is made from the lights as they are now; it counts as not saved. */
function staticOpen(room, sc, target, start) {
  var empty = { id: "", name: "", room: room, others: "keep", acts: [] },
    draft = sc ? JSON.parse(JSON.stringify(sc)) : Object.assign(empty, start || {});
  SCD = { room: room, isNew: !sc, target: target || null, draft: draft, open: {}, saved: staticSnapshot(sc ? draft : { others: "keep", acts: [] }) };
  showPopup("scene-edit", true);
}

/* What the editor compares to know whether there is anything to lose. */
function staticSnapshot(d) {
  return JSON.stringify({ name: String(d.name || "").trim(), icon: d.icon || "", others: d.others, acts: d.acts });
}

function staticDirty() {
  return !!SCD && staticSnapshot(SCD.draft) !== SCD.saved;
}

/* A name and an icon for a device of a scene: the room's own, or else what the light is called. */
function staticInfo(id) {
  var own = roomDevs(SCD.room).filter(function (x) {
    return x.id === id;
  })[0];
  if (own) return own;
  var n = LNAME[id] || [entName(id), "light"];
  return { id: id, name: n[0], icon: n[1], type: dom(id) };
}

function staticSummary(a) {
  if (a.live) {
    var sc = sceneById(a.live);
    return sc ? _T("live_scene") : _T("scene_missing");
  }
  var dm = dom(a.id);
  if (dm === "climate")
    return a.mode === "cool" || a.mode === "heat" ? cap(a.mode) + " " + (a.temp || defTemp(a.id)) + TEMPU() : _T("off");
  if (a.on === false) return _T("off");
  if (dm !== "light") return _T("on_2");
  var p = [_T("on_2")];
  if (a.bri) p.push(a.bri + "%");
  if (a.fx) p.push(cap(String(a.fx).replace(/_/g, " ")));
  else if (a.col) p.push(a.col.k ? a.col.k + " K" : _T("colour"));
  return p.join(" · ");
}

function staticRemoveButton(a, redraw) {
  var x = mk("div", "rnd pane sm", svg("close"));
  x.setAttribute("aria-label", _T("remove_device"));
  x.addEventListener("click", function (e) {
    e.stopPropagation();
    var i = SCD.draft.acts.indexOf(a);
    if (i >= 0) SCD.draft.acts.splice(i, 1);
    redraw();
  });
  return x;
}

/* The lights an act stands for: the light, and every light a group of it is made of. */
function staticLightFamily(id) {
  var out = [id];
  lightMembers(id).forEach(function (m) {
    out = out.concat(staticLightFamily(m));
  });
  return out;
}

/* What the light popup returned replaces the acts of that light and of the lights it is made of. */
function staticSetLightActs(rootId, acts) {
  var drop = {},
    kept = [],
    at = -1;
  staticLightFamily(rootId).forEach(function (id) {
    drop[id] = 1;
  });
  SCD.draft.acts.forEach(function (a) {
    if (a.id && drop[a.id]) {
      if (at < 0) at = kept.length;
    } else kept.push(a);
  });
  if (at < 0) at = kept.length;
  SCD.draft.acts = kept.slice(0, at).concat(acts, kept.slice(at));
}

function staticOpenLight(id, redraw) {
  /* the editor is drawn again when the popup closes, whichever way it closes */
  var info = staticInfo(id);
  openLightEditor({
    id: id,
    name: info.name,
    icon: info.icon,
    onTick: function (acts) {
      staticSetLightActs(id, acts);
    },
    after: redraw,
  });
}

/* A row whose settings slide open and shut in place. */
function staticSlideRow(a, info, redraw) {
  var w = mk("div", "dev"),
    slide = mk("div", "dslide"),
    inner = mk("div", "dinner"),
    body = mk("div", "dbody"),
    key = a.id;
  inner.appendChild(body);
  slide.appendChild(inner);
  var head = pill(info.icon, info.name, {
    sub: function () {
      return staticSummary(a);
    },
    tap: function () {
      SCD.open[key] = !SCD.open[key];
      w.classList.toggle("openc", !!SCD.open[key]);
    },
  });
  head.appendChild(staticRemoveButton(a, redraw));
  head.appendChild(mk("span", "chv", svg("chev")));
  w.appendChild(head);
  w.appendChild(slide);
  w.classList.toggle("openc", !!SCD.open[key]);
  function fill() {
    body.innerHTML = "";
    if (dom(a.id) === "climate") {
      body.appendChild(
        seg(
          [
            ["off", _T("off")],
            ["cool", _T("cool")],
            ["heat", _T("heat")],
          ],
          a.mode || "off",
          function (v) {
            a.mode = v;
            if (v !== "off" && !a.temp) a.temp = defTemp(a.id);
            fill();
          }
        )
      );
      if (a.mode === "cool" || a.mode === "heat") {
        var a0 = A(a.id);
        body.appendChild(
          sliderRow({
            icon: "thermo",
            name: _T("temperature"),
            min: a0.min_temp || 16,
            max: a0.max_temp || 30,
            step: 1,
            get: function () {
              return a.temp || defTemp(a.id);
            },
            fmt: function (v) {
              return v + TEMPU();
            },
            commit: function (v) {
              a.temp = v;
            },
          })
        );
      }
      return;
    }
    body.appendChild(
      seg(
        [
          ["on", _T("on_2")],
          ["off", _T("off")],
        ],
        a.on === false ? "off" : "on",
        function (v) {
          a.on = v === "on";
          fill();
        }
      )
    );
  }
  fill();
  return w;
}

function staticDeviceRow(a, redraw) {
  if (a.live) {
    var sc = sceneById(a.live),
      r = pill(sc ? liveIcon(sc) : SCENE_ICON_LIVE, sc ? sc.name : _T("scene_missing"), {
        sub: function () {
          return staticSummary(a);
        },
        tap: function () {},
      });
    r.appendChild(staticRemoveButton(a, redraw));
    return r;
  }
  var info = staticInfo(a.id);
  if (dom(a.id) === "light") {
    var row = pill(info.icon, info.name, {
      sub: function () {
        return staticSummary(a);
      },
      tap: function () {
        staticOpenLight(a.id, redraw);
      },
    });
    row.appendChild(staticRemoveButton(a, redraw));
    return row;
  }
  return staticSlideRow(a, info, redraw);
}

function sceneEditor(b) {
  var d = SCD.draft,
    w = mk("div", "sqw pane", svg("scene")),
    inp = mk("input", "sq");
  inp.type = "text";
  inp.maxLength = 40;
  inp.placeholder = SCD.room === "home" ? _T("quick_action_name") : _T("scene_name");
  inp.value = d.name;
  inp.addEventListener("input", function () {
    d.name = inp.value;
  });
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(
    iconPick(QAICONS, d.icon || "scene", function (n) {
      d.icon = n;
    })
  );
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    guardUnsaved({ dirty: staticDirty, save: staticSave });
    var prev = CUR;
    SLIVE.length = 0;
    CUR = SLIVE;
    box.innerHTML = "";
    box.appendChild(sep(_T("devices_2"), "plug"));
    d.acts.forEach(function (a) {
      box.appendChild(staticDeviceRow(a, draw));
    });
    box.appendChild(
      pill("plus", _T("add_device"), {
        tap: function () {
          showPopup("scene-pick", true);
        },
      })
    );
    box.appendChild(sep(SCD.room === "home" ? _T("everything_else_in_the_home") : _T("everything_else_in_this_room"), "power"));
    box.appendChild(
      seg(
        [
          ["keep", _T("leave_as_is")],
          ["lights", _T("lights_off")],
          ["all", _T("all_off")],
        ],
        d.others,
        function (v) {
          d.others = v;
          draw();
        }
      )
    );
    box.appendChild(
      mkHint(
        d.others === "all"
          ? _T("turns_off_the_other_lights_tvs_fans_") + (SCD.room === "home" ? _T("in_the_home") : _T("in_this_room"))
          : d.others === "lights"
            ? _T("turns_off_every_other_light") + (SCD.room === "home" ? _T("in_the_home") : _T("in_this_room"))
            : _T("devices_not_listed_above_are_not_tou")
      )
    );
    box.appendChild(pill("check", _T("save_scene"), { tap: function () { staticSave(closeSheet); } }));
    if (!SCD.isNew)
      box.appendChild(
        pill("trash", _T("delete_scene"), {
          tap: function () {
            confirmDlg(_T("delete") + d.name + "”?", staticDelete);
          },
        })
      );
    CUR = prev;
    refresh();
  }
  SCD.redraw = draw;
  draw();
}

/* Saves the scene and goes on to `leave`. A scene that cannot be saved says why and stays open. */
function staticSave(leave) {
  var d = SCD.draft,
    name = String(d.name || "").trim();
  if (!name) {
    toast(_T("give_the_scene_a_name"));
    return false;
  }
  if (!d.acts.length && d.others === "keep") {
    toast(_T("add_a_device_or_choose_what_else_to_"));
    return false;
  }
  var sc = cleanScene({
    id: d.id || "s" + Date.now().toString(36),
    name: name,
    room: SCD.room,
    icon: d.icon,
    others: d.others,
    acts: d.acts,
  });
  if (!sc) {
    toast(_T("couldn_t_save_this_scene"));
    return false;
  }
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== sc.id;
  });
  STORE.scenes.push(sc);
  if (SCD.isNew && SCD.target) {
    var te = secById(SCD.target.scope, SCD.target.sid);
    if (te) scnToggle(te, sc.id);
  }
  SCD.saved = staticSnapshot(d);
  uiChanged();
  toast(_T("scene_saved"));
  POPGUARD = null;
  leave();
  return true;
}

function staticDelete() {
  var id = SCD.draft.id;
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== id;
  });
  pruneSceneRefs();
  uiChanged();
  toast(_T("scene_deleted"));
  POPGUARD = null;
  closeSheet();
}

/* Adding a device or a live scene to the scene. */
function scenePick(b) {
  var have = {},
    liveHave = {};
  SCD.draft.acts.forEach(function (a) {
    if (a.live) liveHave[a.live] = 1;
    else have[a.id] = 1;
  });
  var list = roomDevs(SCD.room).filter(function (x) {
    return !have[x.id];
  });
  if (!list.length) b.appendChild(pill("info", _T("every_device_in_this_room_is_already"), {}));
  list.forEach(function (x) {
    b.appendChild(
      pill(x.icon, x.name, {
        tap: function () {
          var isLight = x.type === "light",
            a = isLight ? lightAct(x.id) : x.type === "climate" ? { id: x.id, mode: "off" } : { id: x.id, on: true };
          SCD.draft.acts.push(a);
          if (!isLight) SCD.open[x.id] = true;
          popBack();
          if (isLight) staticOpenLight(x.id, SCD.redraw);
        },
      })
    );
  });
  var lives = STORE.scenes.filter(function (sc) {
    return sc.live && sceneAllowed(sc) && !liveHave[sc.id] && sc.id !== SCD.draft.id;
  });
  if (lives.length) b.appendChild(sep(_T("live_scenes"), SCENE_ICON_LIVE));
  lives.forEach(function (sc) {
    b.appendChild(
      pill(liveIcon(sc), sc.name, {
        sub: function () {
          return TITLES[sc.room] || "";
        },
        tap: function () {
          SCD.draft.acts.push({ live: sc.id });
          popBack();
        },
      })
    );
  });
}
