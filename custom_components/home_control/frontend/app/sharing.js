/* Settings, Siri and HomeKit: a row for every scene that can be shared, with two switches (decision D-23). Administrators only.

   HomeKit puts the scene on the list of the HomeKit Bridge, so the Home app, Siri and Control Center can run it. Shortcuts is whether the Home Assistant app can offer it to the Shortcuts app: a scene that already is a
   Home Assistant entity (classic, Hue, any other) always is, and the switch only shows how to find it; a live scene is kept by Home Control and has no entity until it is published, which that switch does.
   Which scenes there are: the dashboard's live scenes, the `scene.*` entities (a plus integration's own kind, Hue's, apart from the others) and the switches a plus integration calls a sync. */

var SHARE = { bridge: null, bridges: 0, published: {}, tv: {}, ready: false, failed: false };

/* A live scene's entity is the one Home Control made for it; every other scene is its own entity. */
function shareEntity(it) {
  return it.live ? SHARE.published[it.live] || "" : it.entity;
}

function shareItems() {
  var h = H(),
    items = [];
  (STORE.scenes || []).forEach(function (sc) {
    if (sc.live)
      items.push({ group: "live", key: "live:" + sc.id, name: sc.name || sc.id, icon: liveIcon(sc), live: liveId(sc.id), sc: sc });
  });
  Object.keys(h.states).forEach(function (id) {
    var kind = dom(id) === "scene" ? pluginSceneKind(id) : null;
    if (dom(id) === "scene" && !A(id).live)
      items.push({
        group: kind ? "hue" : "classic",
        key: id,
        name: A(id).friendly_name || id,
        icon: kind && typeof kind.icon === "string" ? kind.icon : "scene",
        entity: id,
      });
    else if (dom(id) === "switch" && (pluginDeviceKind(id) || {}).sync)
      items.push({ group: "sync", key: id, name: A(id).friendly_name || id, icon: pluginDeviceKind(id).icon || "sparkle", entity: id });
  });
  return items.sort(function (a, b) {
    return String(a.name).localeCompare(b.name);
  });
}

function shareLoad(done) {
  SHARE.failed = false;
  HA.sharing
    .published()
    .then(function (r) {
      SHARE.published = {};
      Object.keys((r && r.scenes) || {}).forEach(function (k) {
        if (r.scenes[k]) SHARE.published[k] = r.scenes[k];
      });
      var ids = shareItems()
        .map(shareEntity)
        .concat(
          hkDevices().map(function (it) {
            return it.entity;
          })
        )
        .filter(function (x) {
          return x;
        });
      return HA.sharing.homekit(ids);
    })
    .then(function (r) {
      var all = (r && r.bridges) || [],
        mine = all.filter(function (b) {
          return b.editable;
        })[0];
      SHARE.bridges = all.length;
      SHARE.bridge = mine || null;
      return HA.sharing.tvHome().then(
        function (t) {
          SHARE.tv = (t && t.calls) || {};
        },
        function () {
          SHARE.tv = {};
        }
      );
    })
    .then(function () {
      SHARE.ready = true;
      done();
    })
    .catch(function () {
      SHARE.failed = true;
      SHARE.ready = true;
      done();
    });
}

function shareFail(e) {
  toast((e && e.message) || _T("that_scene_could_not_be_shared"));
}

/* Makes sure the integration has the live scene (and its area) and has published it; the entity id. */
function shareLiveEntity(it) {
  if (SHARE.published[it.live]) return Promise.resolve(SHARE.published[it.live]);
  var ar = liveSceneArea(it.sc),
    pa = ar && liveAreaPayload(ar),
    ps = liveScenePayload(it.sc);
  if (!pa || !ps) return Promise.reject(new Error(_T("this_scene_has_no_area")));
  return Promise.resolve(callRaw("home_control", LIVESVC.area, pa))
    .then(function () {
      return callRaw("home_control", LIVESVC.scene, ps);
    })
    .then(function () {
      return HA.sharing.publish(it.live, true);
    })
    .then(function (r) {
      SHARE.published[it.live] = r.entity_id;
      return r.entity_id;
    });
}

function shareSetHomekit(it, on, done) {
  if (!SHARE.bridge) {
    toast(_T("share_no_bridge_short"));
    return;
  }
  (it.live && !on && !SHARE.published[it.live] ? Promise.resolve("") : it.live ? shareLiveEntity(it) : Promise.resolve(it.entity))
    .then(function (entity) {
      if (!entity) return null;
      return HA.sharing.expose(SHARE.bridge.entry_id, entity, on).then(function () {
        SHARE.bridge.exposed[entity] = on;
      });
    })
    .then(done)
    .catch(shareFail);
}

function shareSetPublished(it, on, done) {
  (on
    ? shareLiveEntity(it)
    : HA.sharing.publish(it.live, false).then(function () {
        if (SHARE.published[it.live] && SHARE.bridge) delete SHARE.bridge.exposed[SHARE.published[it.live]];
        delete SHARE.published[it.live];
      })
  )
    .then(done)
    .catch(shareFail);
}

function shareStatus(it) {
  var e = shareEntity(it),
    hk = !!(e && SHARE.bridge && SHARE.bridge.exposed[e]),
    sc = !!e;
  if (hk) return _T("homekit") + " · " + _T("shortcuts");
  if (sc) return _T("shortcuts");
  return _T("not_shared_yet");
}

/* A switch with its name, in the line under a scene's name. */
function shareSwitch(label, isOn, canTap, tap) {
  var c = mk("div", "shr-c", "<span></span><span class='swt'></span>"),
    sw = c.querySelector(".swt");
  c.firstChild.textContent = label;
  c.setAttribute("role", "switch");
  c.tabIndex = 0;
  function paint() {
    var on = !!isOn();
    sw.classList.toggle("on", on);
    c.setAttribute("aria-checked", on ? "true" : "false");
    c.classList.toggle("dim", !canTap());
  }
  c.addEventListener("click", function (e) {
    e.stopPropagation();
    tap(paint);
  });
  c.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      c.click();
    }
  });
  paint();
  c.paint = paint;
  return c;
}

function shareRow(it, redraw) {
  var row = pill(it.icon, it.name, {
      sub: function () {
        return shareStatus(it);
      },
    }),
    controls = mk("div", "shr"),
    entity = function () {
      return shareEntity(it);
    },
    hk = shareSwitch(
      _T("homekit"),
      function () {
        return entity() && SHARE.bridge && SHARE.bridge.exposed[entity()];
      },
      function () {
        return !!SHARE.bridge;
      },
      function () {
        shareSetHomekit(it, !(entity() && SHARE.bridge && SHARE.bridge.exposed[entity()]), redraw);
      }
    ),
    sc = shareSwitch(
      _T("shortcuts"),
      function () {
        return !!entity();
      },
      function () {
        return !!it.live;
      },
      function () {
        if (it.live) shareSetPublished(it, !entity(), redraw);
        else showPopup("share-how:" + it.entity, true);
      }
    );
  controls.appendChild(hk);
  controls.appendChild(sc);
  row.querySelector(".tx").appendChild(controls);
  return row;
}

var SHARE_GROUPS = [
  ["live", "share_group_live", "sparkle"],
  ["hue", "share_group_hue", "palette"],
  ["classic", "share_group_classic", "scene"],
  ["sync", "share_group_sync", "sparkle"],
];

function sharePage(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(hintRow(_T("share_hint")));
    if (!SHARE.ready) {
      box.appendChild(hintRow(_T("loading")));
      return;
    }
    if (SHARE.failed) {
      box.appendChild(hintRow(_T("share_unavailable")));
      return;
    }
    var items = shareItems();
    hkBridgeBlock(box, again);
    hkDeviceGroups(box, again);
    SHARE_GROUPS.forEach(function (g) {
      var list = items.filter(function (it) {
        return it.group === g[0];
      });
      if (!list.length) return;
      box.appendChild(sep(_T(g[1]) + " · " + list.length, g[2]));
      list.forEach(function (it) {
        box.appendChild(shareRow(it, again));
      });
    });
    if (!items.length) box.appendChild(hintRow(_T("share_nothing")));
  }
  function again() {
    redrawBox(box, draw);
  }
  redrawBox(box, draw);
  shareLoad(again);
}

/* How to find a scene in the Shortcuts app, and its exact name. */
function shareHowPage(b, id) {
  var name = A(id).friendly_name || id;
  b.appendChild(
    pill("scene", name, {
      sub: function () {
        return id;
      },
      tap: function () {
        if (navigator.clipboard && navigator.clipboard.writeText)
          navigator.clipboard.writeText(name).then(
            function () {
              toast(_T("copied"));
            },
            function () {}
          );
      },
    })
  );
  b.appendChild(hintRow(_T("share_how")));
  [_T("share_how_1"), _T("share_how_2"), _T("share_how_3")].forEach(function (t) {
    b.appendChild(hintRow(t));
  });
}
