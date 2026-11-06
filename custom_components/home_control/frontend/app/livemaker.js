/* The live scene maker. A live scene is a palette that moves across the lights of one or more areas. The maker is the light popup of the dashboard with one more light in it, Colors, whose colours are the palette: separate it into up to 10 colours, give each its colour and brightness, join a colour with a light to give that light the colour, turn the lights of the areas on and off, set each light's brightness and effect on its own tabs. Under the lights come the settings of the whole scene. The lights follow every change at once, as a preview; saving keeps what they show in the scene and puts the lights back as they were. */

var LMK = null;

/* An area of the editor: the one an import is about to create is only here until the scene is saved. */
function liveAreaOf(id) {
  return LMK && LMK.pending && LMK.pending.id === id ? LMK.pending : eaById(id);
}

function liveSceneAreas(sc) {
  return (sc.live.areas && sc.live.areas.length ? sc.live.areas : [sc.live.area]).map(liveAreaOf).filter(Boolean);
}

/* The area a scene plays in: one stored area, or for a scene made in the maker the lights of its areas without the ones it leaves off, under an id of the scene's own (this is also what Hue Plus is given). */
function liveSceneArea(sc) {
  var areas = liveSceneAreas(sc);
  if (!areas.length) return null;
  if (!sc.live.areas) return areas[0];
  var off = {},
    seen = {},
    lights = [];
  (sc.live.off || []).forEach(function (id) {
    off[id] = 1;
  });
  areas.forEach(function (a) {
    a.lights.forEach(function (l) {
      if (seen[l.id] || off[l.id]) return;
      seen[l.id] = 1;
      lights.push(l);
    });
  });
  return { id: sc.live.area, name: areas.map(function (a) { return a.name; }).join(" + "), room: areas[0].room, lights: lights.slice(0, 32), dummies: [] };
}

/* The live scenes that play in an area (their lights come from it). */
function liveScenesIn(areaId) {
  return STORE.scenes.filter(function (sc) {
    return sc.live && sc.live.areas && sc.live.areas.indexOf(areaId) >= 0;
  });
}

function liveMakerEdit(sc) {
  liveMakerOpen(sc.room, sc, null, sc.live.areas && sc.live.areas.length ? sc.live.areas : [sc.live.area].filter(Boolean));
}

/* New areas for the scene being edited: the lights follow, and the lights that leave go back as they were. */
function liveMakerSetAreas(list) {
  var before = LMK.lights;
  LMK.areas = list.slice();
  LMK.lights = liveMakerLights(LMK.areas);
  var gone = before.filter(function (id) {
    return LMK.lights.indexOf(id) < 0;
  });
  lightRestore(
    LMK.snap.filter(function (s) {
      return gone.indexOf(s.id) >= 0;
    })
  );
  LMK.snap = LMK.snap.filter(function (s) {
    return gone.indexOf(s.id) < 0;
  }).concat(
    lightSnapshot(
      LMK.lights.filter(function (id) {
        return before.indexOf(id) < 0;
      })
    )
  );
}

/* Every light of the areas, once. */
function liveMakerLights(areas) {
  var seen = {},
    out = [];
  areas.forEach(function (id) {
    var a = liveAreaOf(id);
    if (a)
      a.lights.forEach(function (l) {
        if (!seen[l.id] && H().states[l.id]) {
          seen[l.id] = 1;
          out.push(l.id);
        }
      });
  });
  return out;
}

/* draft (optional) is a scene made elsewhere (an import) to start from; pending an area that goes with it. */
function liveMakerOpen(room, sc, target, areas, draft, pending) {
  var src = sc || draft || null,
    live = src ? src.live : null;
  LMK = {
    room: room,
    isNew: !sc,
    target: target || null,
    pending: pending || null,
    id: sc ? sc.id : "",
    name: src ? src.name : "",
    icon: liveIcon(src),
    areas: areas.slice(),
    live: JSON.parse(
      JSON.stringify(
        live || { speed: 6, range: 100, bri: 100, spread: "x", src: "palette", fx: [], looks: {}, also: [] }
      )
    ),
    joins: [],
    S: null,
    saved: null,
    preview: false,
    snap: [],
  };
  vcolLoad(live ? live.palette : [{ hs: [0, 100] }, { hs: [240, 100] }]);
  LMK.lights = liveMakerLights(LMK.areas);
  LMK.snap = lightSnapshot(LMK.lights);
  if (sc) liveMakerShowScene(sc);
  showPopup("live-edit", true);
}

/* An edited scene opens with its lights as it has them: the ones it uses on, the ones it leaves off, and a colour joined to the lights that have it. */
function liveMakerShowScene(sc) {
  var off = {};
  (sc.live.off || []).forEach(function (id) {
    off[id] = 1;
  });
  var looks = sc.live.looks || {};
  LMK.lights.forEach(function (id) {
    if (off[id]) {
      callRaw("light", "turn_off", { entity_id: id });
      return;
    }
    /* A light shows its own brightness and effect, which is how the maker knows to keep them when the scene is saved. */
    var d = { entity_id: id },
      look = looks[id];
    if (look && typeof look.bri === "number") d.brightness_pct = look.bri;
    if (look && look.native) d.effect = look.native;
    callRaw("light", "turn_on", d);
  });
  var pal = vcolPalette(),
    ids = vcolIds();
  Object.keys(looks).forEach(function (light) {
    var look = sc.live.looks[light];
    if (!look.palette || !look.palette.length) return;
    var i = pal.findIndex(function (c) {
      return JSON.stringify(c) === JSON.stringify(look.palette[0]);
    });
    if (i >= 0) LMK.joins.push([ids[i], light]);
  });
}

/* The colour a light has by being joined to one, read from the panel. */
function liveMakerJoins() {
  if (!LMK.S) return LMK.joins;
  var out = [];
  LMK.S.joined.forEach(function (v) {
    var colours = [],
      lights = [];
    v.kids.forEach(function (k) {
      lpLeaves(k).forEach(function (n) {
        n.cmd.forEach(function (id) {
          (vlightIs(id) ? colours : lights).push(id);
        });
      });
    });
    if (colours.length === 1)
      lights.forEach(function (l) {
        out.push([colours[0], l]);
      });
  });
  return out;
}

/* What the editor holds, for telling whether there is anything to lose. */
function liveMakerSig() {
  return JSON.stringify({
    name: String(LMK.name || "").trim(),
    icon: LMK.icon,
    areas: LMK.areas,
    palette: vcolPalette(),
    live: LMK.live,
    lights: LMK.lights.map(function (id) {
      var a = A(id);
      return [id, V_(id), a.brightness || 0, a.effect || "", a.hs_color || a.color_temp_kelvin || 0];
    }),
    joins: liveMakerJoins(),
  });
}

function liveMakerDirty() {
  return !!LMK && LMK.saved !== null && liveMakerSig() !== LMK.saved;
}

/* The scene as it is saved. */
function liveMakerScene() {
  var live = LMK.live,
    pal = vcolPalette(),
    ids = vcolIds(),
    joins = liveMakerJoins(),
    off = [],
    looks = {};
  LMK.lights.forEach(function (id) {
    if (V_(id) !== "on") {
      off.push(id);
      return;
    }
    var a = A(id),
      k = {};
    if (typeof a.brightness === "number") k.bri = Math.max(1, Math.min(100, Math.round(a.brightness / 2.55)));
    if (a.effect && LIVE_NATIVE.indexOf(a.effect) >= 0) k.native = a.effect;
    joins.forEach(function (j) {
      if (j[1] === id && ids.indexOf(j[0]) >= 0) k.palette = [pal[ids.indexOf(j[0])]];
    });
    if (Object.keys(k).length) looks[id] = k;
  });
  var id = LMK.id || "s" + Date.now().toString(36);
  return {
    id: id,
    name: String(LMK.name || "").trim(),
    room: LMK.room,
    icon: LMK.icon,
    others: "keep",
    acts: [],
    live: {
      area: ("lx-" + id).slice(0, 24),
      areas: LMK.areas,
      off: off,
      palette: pal,
      speed: live.speed,
      range: live.range,
      bri: live.bri,
      spread: live.spread,
      src: live.src,
      fx: live.fx,
      looks: looks,
      also: live.also || [],
    },
  };
}

function liveMakerStopPreview() {
  if (LMK && LMK.preview) liveCall(LMK.owner, "stop", { scene_id: "lm-preview" });
  if (LMK) LMK.preview = false;
}

/* Ends the editing: the preview stops and the lights go back to what they were. */
function liveMakerEnd() {
  liveMakerStopPreview();
  lightRestore(LMK.snap);
}

function liveMakerSave(leave) {
  if (!String(LMK.name || "").trim()) {
    toast(_T("give_the_scene_a_name"));
    return false;
  }
  if (!liveMakerLightsOn()) {
    toast(_T("turn_on_at_least_one_light"));
    return false;
  }
  var sc = cleanScene(liveMakerScene());
  if (!sc || !sc.live) {
    toast(_T("couldn_t_save_this_scene"));
    return false;
  }
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== sc.id;
  });
  STORE.scenes.push(sc);
  /* An area made for an import is stored together with the scene that uses it. */
  if (LMK.pending && sc.live.areas.indexOf(LMK.pending.id) >= 0) {
    var pa = cleanArea(LMK.pending);
    if (pa) {
      STORE.eareas = STORE.eareas.filter(function (x) {
        return x.id !== pa.id;
      });
      STORE.eareas.push(pa);
    }
  }
  if (LMK.isNew && LMK.target) {
    var te = secById(LMK.target.scope, LMK.target.sid);
    if (te) scnToggle(te, sc.id);
  }
  liveMakerEnd();
  /* A scene that is playing takes the new colours and settings at once. */
  if (liveRun(sc)) liveStart(sc);
  uiChanged();
  hpPush([sc], [liveSceneArea(sc)].filter(Boolean));
  toast(_T("scene_saved"));
  LMK.saved = liveMakerSig();
  POPGUARD = null;
  leave();
  return true;
}

function liveMakerLightsOn() {
  return LMK.lights.some(function (id) {
    return V_(id) === "on";
  });
}

function liveMakerDelete() {
  var id = LMK.id,
    sc = sceneById(id);
  if (liveRun({ id: id })) liveCall(sc ? liveOwner(sc) : null, "stop", { scene_id: id });
  STORE.scenes = STORE.scenes.filter(function (x) {
    return x.id !== id;
  });
  pruneSceneRefs();
  uiChanged();
  hpForget(id, sc && sc.live && sc.live.areas ? sc.live.area : null);
  liveMakerEnd();
  toast(_T("scene_deleted"));
  POPGUARD = null;
  closeSheet();
}

/* ---- the popup ---- */

function liveMakerDef() {
  return {
    title: LMK && !LMK.isNew ? _T("edit_scene") : _T("new_live_scene"),
    icon: SCENE_ICON_LIVE,
    build: liveMakerBuild,
  };
}

function liveMakerBuild(b) {
  /* Coming back from a page of the light popup, the colours joined to lights are what the old panel held. */
  if (LMK.S) {
    LMK.joins = liveMakerJoins();
    LMK.S = null;
  }
  var w = mk("div", "sqw pane", svg(SCENE_ICON_LIVE)),
    inp = mk("input", "sq");
  inp.type = "text";
  inp.maxLength = 40;
  inp.placeholder = _T("scene_name");
  inp.value = LMK.name;
  inp.addEventListener("input", function () {
    LMK.name = inp.value;
  });
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(
    iconPick(QAICONS, LMK.icon, function (n) {
      LMK.icon = n;
    })
  );
  b.appendChild(
    pill("target", _T("areas"), {
      sub: function () {
        return LMK.areas
          .map(function (id) {
            var a = liveAreaOf(id);
            return a ? a.name : "";
          })
          .filter(Boolean)
          .join(", ");
      },
      tap: function () {
        LMK_AREAS = LMK.areas.slice();
        showPopup("scene-areas:" + LMK.room + ":edit", true);
      },
    })
  );
  b.appendChild(sep(_T("lights"), "light"));
  var ids = [VCOL_GROUP].concat(LMK.lights),
    root = lpMasterNode("lm", ids),
    colorNode = lpFind(root, VCOL_GROUP),
    stepper = mk("div");
  lightPanel(b, root, {
    sliders: false,
    ready: function (S) {
      LMK.S = S;
      S.ex[root.key] = true;
      S.ex[colorNode.key] = true;
      liveMakerRestoreJoins(S, root);
    },
  });
  b.appendChild(stepper);
  liveMakerColours(stepper, root, colorNode);
  liveMakerSettings(b);
  guardUnsaved({
    dirty: liveMakerDirty,
    save: liveMakerSave,
    discard: liveMakerEnd,
    done: closeSheet,
  });
  var tools = mk("div");
  b.appendChild(tools);
  liveMakerTools(tools);
  if (LMK.saved === null) LMK.saved = liveMakerSig();
}

/* A colour joined to a light is one marker that moves them together, as the panel does for any two lights. */
function liveMakerRestoreJoins(S, root) {
  var byColour = {};
  LMK.joins.forEach(function (j) {
    (byColour[j[0]] = byColour[j[0]] || []).push(j[1]);
  });
  Object.keys(byColour).forEach(function (c) {
    var kids = [lpFind(root, c)].concat(
      byColour[c].map(function (l) {
        return lpFind(root, l);
      })
    ).filter(Boolean);
    if (kids.length > 1) S.joined.push(S.makeVirtual(kids, kids[0].icon));
  });
}

/* How many colours the scene has, and a way to add and take away. */
function liveMakerColours(box, root, colorNode) {
  function draw() {
    box.innerHTML = "";
    var n = vcolIds().length,
      row = mk("div", "pill pane lmk-n"),
      txt = mk("span", "tx", "<span class='nm'></span><span class='sb'></span>"),
      less = mk("div", "rnd pane sm", svg("minus")),
      more = mk("div", "rnd pane sm", svg("plus"));
    row.appendChild(mk("span", "ic", svg("palette")));
    txt.querySelector(".nm").textContent = _T("colours");
    txt.querySelector(".sb").textContent = n + " / " + VCOL_MAX;
    row.appendChild(txt);
    less.setAttribute("aria-label", _T("remove_a_colour"));
    more.setAttribute("aria-label", _T("add_a_colour"));
    less.classList.toggle("dis", n <= 1);
    more.classList.toggle("dis", n >= VCOL_MAX);
    less.addEventListener("click", function () {
      var sel = LMK.S && LMK.S.sel,
        gone = vlightIs(sel) && sel !== VCOL_GROUP ? sel : vcolIds()[n - 1];
      if (vcolRemove(gone)) rebuild();
    });
    more.addEventListener("click", function () {
      if (vcolAdd()) rebuild();
    });
    row.appendChild(less);
    row.appendChild(more);
    box.appendChild(row);
  }
  /* The tree of the panel is rebuilt for the colours there are, and the panel draws it again. */
  function rebuild() {
    var S = LMK.S,
      keep = S && S.sel;
    colorNode.cmd = [VCOL_GROUP];
    colorNode.kids = vcolIds().map(function (id, i) {
      var k = lpNodeOf(id, colorNode.icon);
      k.name = (A(VCOL_GROUP).zone_label || _T("colour")) + " " + (i + 1);
      k.parent = colorNode;
      return k;
    });
    if (S) {
      S.joined = S.joined.filter(function (v) {
        return v.kids.every(function (k) {
          return !vlightIs(k.key) || vcolIds().indexOf(k.key) >= 0;
        });
      });
      S.sel = keep && lpFindIn(S, keep) ? keep : colorNode.key;
      S.rebuild();
      S.select(S.sel);
    }
    draw();
  }
  draw();
}

/* How the scene as a whole plays. */
function liveMakerSettings(b) {
  b.appendChild(sep(_T("settings"), "tune"));
  var live = LMK.live;
  b.appendChild(
    seg(
      [
        ["palette", _T("colours")],
        ["rainbow", _T("rainbow")],
      ],
      live.src || "palette",
      function (v) {
        live.src = v;
        refreshMaker();
      }
    )
  );
  b.appendChild(
    seg(
      LIVE_SPREADS.map(function (s) {
        return [s[0], _T(s[1])];
      }),
      live.spread || "x",
      function (v) {
        live.spread = v;
        refreshMaker();
      }
    )
  );
  [
    ["speed", "clock", 1, 12, function (v) { return String(v); }],
    ["range", "target", 0, 100, function (v) { return v + "%"; }],
    ["bri", "bright", 1, 100, function (v) { return v + "%"; }],
  ].forEach(function (r) {
    b.appendChild(
      sliderRow({
        icon: r[1],
        name: _T(r[0] === "bri" ? "brightness" : r[0]),
        min: r[2],
        max: r[3],
        step: 1,
        get: function () {
          return live[r[0]];
        },
        fmt: r[4],
        commit: function (v) {
          live[r[0]] = v;
        },
      })
    );
  });
}

/* The pieces of the editor that show a choice redraw the popup. */
function refreshMaker() {
  showPopup("live-edit", false);
}

function liveMakerTools(box) {
  box.appendChild(
    pill("play", _T("preview"), {
      on: function () {
        return LMK.preview;
      },
      sub: function () {
        return LMK.preview ? _T("playing") : _T("play_it_on_the_lights");
      },
      tap: function () {
        if (LMK.preview) {
          liveMakerStopPreview();
          return;
        }
        var sc = liveMakerScene();
        sc.id = "lm-preview";
        var cs = cleanScene(sc);
        if (!cs || !cs.live) return;
        var p = livePayload(cs);
        if (!p || !p.ids.length) {
          toast(_T("turn_on_at_least_one_light"));
          return;
        }
        p.data.scene_id = "lm-preview";
        LMK.owner = liveOwner(cs);
        liveCall(LMK.owner, "start", p.data);
        LMK.preview = true;
      },
    })
  );
  if (!LMK.isNew)
    box.appendChild(
      pill("trash", _T("delete_scene"), {
        tap: function () {
          confirmDlg(_T("delete") + LMK.name + "”?", liveMakerDelete);
        },
      })
    );
}
