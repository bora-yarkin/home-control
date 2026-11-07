/* Making a scene: the + button of a scenes section, the question what kind (a classic scene of fixed settings, or a live scene), the areas a live scene plays in, and the guard that asks before an editor throws changes away. */

/* An editor with something to save asks before it is left, by any way: back, the scrim, the close button, and has a checkmark next to the close button that saves it (popupCheck). The same for every
   place that saves: the scene editors, the area editor, the light editor, a device in the Hue Plus menu.
   o.dirty() says whether there is anything to lose; o.save(leave) saves and goes on to `leave`, and gives back false when it did not save (no name yet) or a promise of true or false when the save takes a while
   (the bridge); o.discard() undoes what was previewed. o.done is what the checkmark goes on to after saving (the page before, unless the editor closes the popup). o.inner marks a page that is only one step of a larger edit (the choices of a device): going back from it to the rest of the edit does not ask, closing does. */
function guardUnsaved(o) {
  function guard(leave) {
    if (!o.dirty()) return false;
    if (o.inner && leave === popBack) return false;
    askSheet(_T("unsaved_changes"), [
      {
        label: _T("save"),
        fn: function () {
          guard.save(leave);
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
  /* The Save of the question and the checkmark. A save that did not happen keeps the editor open, and the guard with it. */
  guard.save = function (leave) {
    POPGUARD = null;
    var done = o.save(leave);
    if (done === false) POPGUARD = guard;
    else if (done && done.then)
      done.then(function (ok) {
        if (ok === false) POPGUARD = guard;
      });
  };
  guard.done = o.done || popBack;
  POPGUARD = guard;
  if (!o.inner) popupCheck(guard);
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
    pill("light", _T("save_the_lights_as_they_are"), {
      sub: function () {
        return _T("save_the_lights_as_they_are_sub");
      },
      tap: function () {
        sceneFromLights(scope, target);
      },
    })
  );
  b.appendChild(
    pill(SCENE_ICON_LIVE, _T("live_scene"), {
      sub: function () {
        return _T("live_scene_sub");
      },
      tap: function () {
        if (!engineSensor()) {
          toast(_T("live_scenes_are_not_available"));
          return;
        }
        LMK_AREAS = [];
        showPopup("scene-areas:" + scope + ":" + e.id, true);
      },
    })
  );
}

/* A classic scene made from the lights as they are: each light that is on keeps its brightness and its colour, white temperature or running effect; the lights of the page that are off are switched off by it. The editor opens on it, not saved yet. */
function sceneFromLights(scope, target) {
  var on = roomDevs(scope).filter(function (d) {
    return d.type === "light" && V_(d.id) === "on";
  });
  if (!on.length) {
    toast(_T("no_light_is_on"));
    return;
  }
  var acts = lightUnits(
    on.map(function (d) {
      return d.id;
    })
  ).map(lightAct);
  if (acts.length > 20) {
    toast(_T("only_the_first_20_lights_were_kept"));
    acts = acts.slice(0, 20);
  }
  staticOpen(scope, null, target, { others: "lights", acts: acts });
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
