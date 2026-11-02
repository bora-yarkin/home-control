/* Making a scene: the + button of a scenes section, the question what kind (a classic scene of fixed settings, or a live scene), the areas a live scene plays in, and the guard that asks before an editor throws changes away. */

/* An editor with changes that are not saved asks before it is left, by any way: back, the scrim, the close button. dirty() says whether there is anything to lose; save(leave) saves and goes on to `leave`; discard() undoes what was previewed. */
function guardUnsaved(o) {
  function guard(leave) {
    if (!o.dirty()) return false;
    askSheet(_T("unsaved_changes"), [
      {
        label: _T("save"),
        fn: function () {
          POPGUARD = null;
          /* A save that did not happen (no name yet) keeps the editor open, and the guard with it. */
          if (o.save(leave) === false) POPGUARD = guard;
        },
      },
      {
        label: _T("discard_changes"),
        fn: function () {
          POPGUARD = null;
          if (o.discard) o.discard();
          leave();
        },
      },
    ]);
    return true;
  }
  POPGUARD = guard;
}

/* The + on a scenes section, for administrators: it makes a scene and puts it in this section. */
function sceneAddButton(scope, e) {
  var b = mk("div", "rnd pane sm secact", svg("plus"));
  b.setAttribute("role", "button");
  b.setAttribute("aria-label", _T("new_scene"));
  b.title = _T("new_scene");
  b.addEventListener("click", function () {
    showPopup("scene-new:" + scope + ":" + e.id, true);
  });
  return b;
}

/* Step one: classic or live. */
function sceneNewPage(b, key) {
  var q = key.split(":"),
    scope = q[0],
    e = secById(scope, q[1]);
  if (!e) return;
  var target = { scope: scope, sid: e.id };
  b.appendChild(
    pill("scene", _T("classic_scene"), {
      sub: function () {
        return _T("classic_scene_sub");
      },
      tap: function () {
        staticOpen(scope, null, target);
      },
    })
  );
  b.appendChild(
    pill("palette", _T("live_scene"), {
      sub: function () {
        return engineSensor() ? _T("live_scene_sub") : _T("live_scene_needs_hue_plus");
      },
      tap: function () {
        if (!engineSensor()) {
          toast(_T("scene_engine_is_not_installed"));
          return;
        }
        LMK_AREAS = [];
        showPopup("scene-areas:" + scope + ":" + e.id, true);
      },
    })
  );
}

/* The areas picked for a new live scene. */
var LMK_AREAS = [];

/* Step two (live only): which areas. Their lights are the lights the scene can use. */
function sceneAreasPage(b, key) {
  var q = key.split(":"),
    scope = q[0],
    editing = q[1] === "edit",
    e = editing ? null : secById(scope, q[1]);
  if (!editing && !e) return;
  var areas = STORE.eareas.slice().sort(function (x, y) {
      return (x.room === scope ? 0 : 1) - (y.room === scope ? 0 : 1) || x.name.localeCompare(y.name);
    });
  if (!areas.length) {
    b.appendChild(
      pill("target", _T("no_areas_yet"), {
        sub: function () {
          return _T("no_areas_yet_sub");
        },
        tap: function () {
          showPopup("areas", true);
        },
      })
    );
    return;
  }
  b.appendChild(mkHint(_T("pick_the_areas_for_this_live_scene")));
  areas.forEach(function (ar) {
    b.appendChild(
      pill("target", ar.name, {
        on: function () {
          return LMK_AREAS.indexOf(ar.id) >= 0;
        },
        sub: function () {
          return (TITLES[ar.room] || "") + " · " + cntS(ar.lights.length, _T("light"), _T("lights"));
        },
        tap: function () {
          var i = LMK_AREAS.indexOf(ar.id);
          if (i >= 0) LMK_AREAS.splice(i, 1);
          else if (LMK_AREAS.length < 6) LMK_AREAS.push(ar.id);
          refresh();
        },
      })
    );
  });
  b.appendChild(
    pill("check", _T("continue"), {
      tap: function () {
        if (!LMK_AREAS.length) {
          toast(_T("choose_an_area"));
          return;
        }
        if (editing) {
          liveMakerSetAreas(LMK_AREAS);
          popBack();
        } else liveMakerOpen(scope, null, { scope: scope, sid: e.id }, LMK_AREAS.slice());
      },
    })
  );
}
