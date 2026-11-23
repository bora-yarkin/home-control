/* Light groups made on the dashboard. A group is Home Assistant's own "Group" helper of the type light (Settings, Devices and services, Helpers), made and changed here through
   its configuration flow (ha-adapter.js, HA.lightGroups); on the dashboard it is one light that stands for its lights. The add popup turns the lights that were checked into a
   *new group form*: nothing exists in Home Assistant until the form is saved with a name, because the name chooses the light's entity id. The settings of a group that exists
   (from the settings of any light that is a group) are the same form; its changes are made when it is saved. */

/* The lights of a group as Home Assistant reports them. */
function lgMembers(entity) {
  var m = A(entity).entity_id;
  return Array.isArray(m) ? m.slice() : [];
}

/* Every list of devices that can hold the dashboard's device for this entity. */
function lgDeviceLists() {
  var lists = [];
  allSectionLists().forEach(function (secs) {
    secs.forEach(function (s) {
      if (s.devs) lists.push(s.devs);
    });
  });
  Object.keys(UI.devs || {}).forEach(function (r) {
    if (UI.devs[r]) lists.push(UI.devs[r]);
  });
  return lists;
}

function lgDevices(entity) {
  var out = [];
  lgDeviceLists().forEach(function (list) {
    list.forEach(function (d) {
      if (d.id === entity) out.push(d);
    });
  });
  return out;
}

function lgDropDevices(entity) {
  lgDeviceLists().forEach(function (list) {
    for (var i = list.length - 1; i >= 0; i--) if (list[i].id === entity) list.splice(i, 1);
  });
}

/* What the new group form was opened for: where the group goes and which lights were checked. */
var LGNEW = null;

/* The group form. o.mode "new": nothing exists yet; o: { rid, lights }. o.mode "edit": the group `o.entity` exists. Everything is changed in a draft; the checkmark (or Save on closing)
   makes the changes: a new group is made in Home Assistant under the name given, so its entity id follows that name; an existing group's name, lights and options are changed through
   its helper. A name is needed to save a new group.
   The form's state `f` is shared by the functions below: { isNew, entity, o, st (tab, the helper's config entry, loaded, saving), draft, first (the draft as it was), box, drawShell(), redraw() }. */
function lgForm(b, o) {
  var isNew = o.mode === "new",
    entity = o.entity,
    dev = isNew ? null : lgDevices(entity)[0],
    preview = mk("div", "dprev"),
    f = {
      isNew: isNew,
      entity: entity,
      o: o,
      st: { tab: "look", entry: isNew ? null : undefined, loaded: isNew, saving: false },
      draft: {
        name: isNew ? "" : (dev && dev.name) || A(entity).friendly_name || entity,
        icon: (dev && dev.icon) || "lights",
        lights: isNew ? o.lights.slice() : lgMembers(entity),
        hide: true,
        all: false,
      },
      box: mk("div"),
    };
  f.first = JSON.stringify(f.draft);
  /* The group as it will look, and the tabs. */
  f.drawShell = function () {
    preview.innerHTML = "";
    preview.setAttribute("aria-hidden", "true");
    var row = pill(f.draft.icon || "lights", f.draft.name || _T("lg_new_group"), {
      sub: function () {
        return cntS(f.draft.lights.length, _T("light"), _T("lights"));
      },
    });
    preview.appendChild(row);
    if (row.refresh) row.refresh();
  };
  f.redraw = function () {
    redrawBox(f.box, content);
  };
  /* One page: the name and icon, the lights of the group, then how it behaves. */
  function content() {
    lgLookTab(f);
    if (f.st.entry === undefined) {
      f.box.appendChild(pill("info", _T("lg_reading"), {}));
      return;
    }
    f.box.appendChild(sep(_T("lg_lights"), "lights"));
    lgLightsTab(f);
    f.box.appendChild(sep(_T("lg_behaviour"), "tune"));
    lgBehaviourTab(f);
  }
  b.appendChild(preview);
  b.appendChild(f.box);
  guardUnsaved({
    dirty: function () {
      return f.st.loaded && JSON.stringify(f.draft) !== f.first;
    },
    save: function (leave) {
      return lgSave(f, leave);
    },
  });
  f.drawShell();
  f.redraw();
  if (!isNew) lgLoad(f);
}

/* Whether the group's lights can be changed here: a new group, or one that is a helper (a group of Hue's own cannot be). */
function lgChangeable(f) {
  return f.isNew || !!f.st.entry;
}

function lgFailed(f, err) {
  f.st.saving = false;
  toast((err && err.message) || _T("lg_could_not_change"));
}

/* Who it is: the name and the icon, side by side. */
function lgLookTab(f) {
  var d = f.draft;
  stgIdentity(
    f.box,
    textRow("edit", f.isNew ? _T("lg_name_of_the_group") : _T("device_name"), d.name, function (v) {
      d.name = v.slice(0, 40);
      f.drawShell();
    }, 40),
    iconPick(DEVICONS, d.icon, function (n) {
      d.icon = n;
      f.drawShell();
    }, ["lights", "light", "lamp", "floor", "ceiling", "strip", "bed"].filter(iconOk))
  );
  if (f.isNew) f.box.appendChild(hintRow(_T("lg_name_hint")));
}

/* Lights: the lights of the group (a tap takes one out, never the last), and one more can be added. */
function lgLightsTab(f) {
  var d = f.draft,
    can = lgChangeable(f);
  d.lights.forEach(function (id) {
    f.box.appendChild(
      pill("light", A(id).friendly_name || id, {
        sub: function () {
          return id;
        },
        tap: can
          ? function () {
              if (d.lights.length < 2) {
                toast(_T("lg_needs_a_light"));
                return;
              }
              d.lights = d.lights.filter(function (x) {
                return x !== id;
              });
              f.drawShell();
              f.redraw();
            }
          : null,
      })
    );
  });
  if (!can) {
    f.box.appendChild(hintRow(_T("lg_not_a_helper")));
    return;
  }
  f.box.appendChild(hintRow(_T("lg_tap_to_take_out")));
  f.box.appendChild(
    pill("plus", _T("lg_add_a_light"), {
      tap: function () {
        pickEntity(
          _T("lg_add_a_light"),
          ["light"],
          null,
          function (id) {
            d.lights = d.lights.concat([id]);
            f.drawShell();
            f.redraw();
          },
          function (id) {
            return id === f.entity || d.lights.indexOf(id) >= 0;
          }
        );
      },
    })
  );
}

/* Behaviour: hide the lights in Home Assistant, on when any or all are on, and delete the group. */
function lgBehaviourTab(f) {
  var d = f.draft;
  if (!lgChangeable(f)) f.box.appendChild(hintRow(_T("lg_not_a_helper")));
  else {
    f.box.appendChild(
      pill("eyeoff", _T("lg_hide_lights"), {
        on: function () {
          return !!d.hide;
        },
        sub: function () {
          return _T("lg_hide_lights_sub");
        },
        tap: function () {
          d.hide = !d.hide;
          f.redraw();
        },
      })
    );
    f.box.appendChild(
      seg([["any", _T("lg_on_when_any")], ["all", _T("lg_on_when_all")]], d.all ? "all" : "any", function (v) {
        d.all = v === "all";
        f.redraw();
      })
    );
  }
  if (!f.isNew && f.st.entry) {
    var del = pill("trash", _T("lg_delete"), {
        sub: function () {
          return _T("lg_delete_sub");
        },
        tap: function () {
          confirmDlg(
            _T("lg_delete_q") + d.name + "?",
            function () {
              HA.lightGroups.remove(f.st.entry).then(function () {
                lgDropDevices(f.entity);
                uiChanged();
                toast(_T("lg_deleted"));
                POPGUARD = null;
                STACK = [];
                CURRENT = null;
                closeSheet();
              }, function (err) {
                lgFailed(f, err);
              });
            },
            _T("delete")
          );
        },
      });
    stgActions(f.box, [del], [del]);
  }
}

/* Makes the changes. A new group: the helper is made now, with this name, and the group goes where the add popup was opened. An existing one: its helper is changed (name, lights,
   options), and the dashboard's device follows. Gives false at once when nothing can be done yet, else a promise of whether it worked. */
function lgSave(f, leave) {
  var d = f.draft,
    name = d.name.trim();
  if (!name) {
    toast(_T("lg_give_a_name"));
    return false;
  }
  if (f.st.saving || (!f.isNew && !f.st.loaded)) return false;
  f.st.saving = true;
  var work = Promise.resolve();
  if (f.isNew) {
    toast(_T("lg_making"));
    work = HA.lightGroups.create(name, d.lights, { hide_members: !!d.hide, all: !!d.all }).then(function (made) {
      /* Made from the light groups page, it is not put in a section: it is a light of Home Assistant, and a lights master can have it. */
      if (f.o.rid) placeDevice(f.o.rid, { id: made.entity_id, name: name, icon: d.icon, kind: "light" });
      uiChanged();
    });
  } else {
    var before = JSON.parse(f.first);
    if (f.st.entry) {
      if (name !== before.name)
        work = work.then(function () {
          return HA.lightGroups.rename(f.entity, f.st.entry, name);
        });
      if (JSON.stringify(d.lights) !== JSON.stringify(before.lights) || d.hide !== before.hide || d.all !== before.all)
        work = work.then(function () {
          return HA.lightGroups.update(f.st.entry, { entities: d.lights, hide_members: !!d.hide, all: !!d.all });
        });
    }
    work = work.then(function () {
      lgDevices(f.entity).forEach(function (dev) {
        dev.name = name;
        dev.icon = d.icon;
      });
      uiChanged();
    });
  }
  return work.then(
    function () {
      f.st.saving = false;
      POPGUARD = null;
      leave();
      return true;
    },
    function (err) {
      lgFailed(f, err);
      return false;
    }
  );
}

/* Reads the helper of an existing group: its lights and options replace the draft's, and that is what "unchanged" means from then on. */
function lgLoad(f) {
  HA.lightGroups
    .entryOf(f.entity)
    .then(function (entry) {
      f.st.entry = entry;
      if (!entry) {
        f.st.loaded = true;
        f.first = JSON.stringify(f.draft);
        f.drawShell();
        f.redraw();
        return null;
      }
      return HA.lightGroups.options(entry).then(function (opts) {
        f.draft.lights = opts.entities.slice();
        f.draft.hide = !!opts.hide_members;
        f.draft.all = !!opts.all;
        f.st.loaded = true;
        f.first = JSON.stringify(f.draft);
        f.drawShell();
        f.redraw();
      });
    })
    .catch(function (err) {
      f.st.entry = null;
      f.st.loaded = true;
      lgFailed(f, err);
      f.redraw();
    });
}

/* Settings, Light groups: every light that stands for other lights, its lights, and a button to make a new group (a Home Assistant helper). A group opens in the same form as from a light's settings. */
function lgroupsPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(hintRow(_T("lgs_hint")));
    box.appendChild(
      pill("plus", _T("lg_new_group"), {
        sub: function () {
          return _T("lgs_new_sub");
        },
        tap: function () {
          LGNEW = { rid: "", lights: [] };
          showPopup("lgnew", true);
        },
      })
    );
    var groups = Object.keys(H().states)
      .filter(function (id) {
        return dom(id) === "light" && lgMembers(id).length > 0;
      })
      .sort(function (x, y) {
        return String(A(x).friendly_name || x).localeCompare(A(y).friendly_name || y);
      });
    if (!groups.length) box.appendChild(pill("info", _T("lgs_none"), {}));
    groups.forEach(function (id) {
      box.appendChild(
        pill((LNAME[id] || [])[1] || "lights", A(id).friendly_name || id, {
          sub: function () {
            return cntS(lgMembers(id).length, _T("light"), _T("lights")) + " · " + id;
          },
          tap: function () {
            showPopup("lgroup:" + id, true);
          },
        })
      );
    });
  }
  draw();
}

function lgPage(b, entity) {
  lgForm(b, { mode: "edit", entity: entity });
}

function lgNewPage(b) {
  if (!LGNEW) return;
  lgForm(b, { mode: "new", rid: LGNEW.rid, lights: LGNEW.lights });
}
