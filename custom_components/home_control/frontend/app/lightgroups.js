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
   its helper. A name is needed to save a new group. */
function lgForm(b, o) {
  var isNew = o.mode === "new",
    entity = o.entity,
    dev = isNew ? null : lgDevices(entity)[0],
    st = { tab: "look", entry: isNew ? null : undefined, loaded: isNew, saving: false },
    draft = {
      name: isNew ? "" : (dev && dev.name) || A(entity).friendly_name || entity,
      icon: (dev && dev.icon) || "lights",
      lights: isNew ? o.lights.slice() : lgMembers(entity),
      hide: true,
      all: false,
    },
    first = JSON.stringify(draft),
    preview = mk("div", "dprev"),
    tabsBox = mk("div"),
    box = mk("div");
  b.appendChild(preview);
  b.appendChild(tabsBox);
  b.appendChild(box);
  function snap() {
    return JSON.stringify(draft);
  }
  function failed(err) {
    st.saving = false;
    toast((err && err.message) || _T("lg_could_not_change"));
  }
  function drawShell() {
    preview.innerHTML = "";
    preview.setAttribute("aria-hidden", "true");
    var row = pill(draft.icon || "lights", draft.name || _T("lg_new_group"), {
      sub: function () {
        return cntS(draft.lights.length, _T("light"), _T("lights"));
      },
    });
    preview.appendChild(row);
    if (row.refresh) row.refresh();
    tabsBox.innerHTML = "";
    tabsBox.appendChild(
      seg(
        [
          ["look", _T("dp_look")],
          ["lights", _T("lg_lights")],
          ["behaviour", _T("lg_behaviour")],
        ],
        st.tab,
        function (v) {
          st.tab = v;
          drawShell();
          swapContent(box, content);
        }
      )
    );
  }
  function content() {
    if (st.tab === "look") {
      box.appendChild(
        textRow(
          "edit",
          isNew ? _T("lg_name_of_the_group") : _T("device_name"),
          draft.name,
          function (v) {
            draft.name = v.slice(0, 40);
            drawShell();
          },
          40
        )
      );
      if (isNew) {
        var nh = mk("div", "hint");
        nh.textContent = _T("lg_name_hint");
        box.appendChild(nh);
      }
      var irow = mk("div", "pre ico");
      ["lights", "light", "lamp", "floor", "ceiling", "strip", "bed"].filter(iconOk).forEach(function (n) {
        var c = mk("div", "rnd pane" + (draft.icon === n ? " act" : ""), svg(n));
        c.setAttribute("role", "button");
        c.setAttribute("aria-label", iconLabel(n));
        c.title = iconLabel(n);
        c.addEventListener("click", function () {
          draft.icon = n;
          drawShell();
          redrawBox(box, content);
        });
        irow.appendChild(c);
      });
      box.appendChild(irow);
      box.appendChild(
        iconPick(DEVICONS, draft.icon, function (n) {
          draft.icon = n;
          drawShell();
        })
      );
      return;
    }
    if (st.entry === undefined) {
      box.appendChild(pill("info", _T("lg_reading"), {}));
      return;
    }
    var changeable = isNew || !!st.entry;
    if (st.tab === "lights") {
      draft.lights.forEach(function (id) {
        box.appendChild(
          pill("light", A(id).friendly_name || id, {
            sub: function () {
              return id;
            },
            tap: changeable
              ? function () {
                  if (draft.lights.length < 2) {
                    toast(_T("lg_needs_a_light"));
                    return;
                  }
                  draft.lights = draft.lights.filter(function (x) {
                    return x !== id;
                  });
                  drawShell();
                  redrawBox(box, content);
                }
              : null,
          })
        );
      });
      if (!changeable) {
        var note = mk("div", "hint");
        note.textContent = _T("lg_not_a_helper");
        box.appendChild(note);
        return;
      }
      var tip = mk("div", "hint");
      tip.textContent = _T("lg_tap_to_take_out");
      box.appendChild(tip);
      box.appendChild(
        pill("plus", _T("lg_add_a_light"), {
          tap: function () {
            pickEntity(
              _T("lg_add_a_light"),
              ["light"],
              null,
              function (id) {
                draft.lights = draft.lights.concat([id]);
                drawShell();
                redrawBox(box, content);
              },
              function (id) {
                return id === entity || draft.lights.indexOf(id) >= 0;
              }
            );
          },
        })
      );
      return;
    }
    if (!changeable) {
      var note2 = mk("div", "hint");
      note2.textContent = _T("lg_not_a_helper");
      box.appendChild(note2);
    } else {
      box.appendChild(
        pill("eyeoff", _T("lg_hide_lights"), {
          on: function () {
            return !!draft.hide;
          },
          sub: function () {
            return _T("lg_hide_lights_sub");
          },
          tap: function () {
            draft.hide = !draft.hide;
            redrawBox(box, content);
          },
        })
      );
      box.appendChild(
        seg(
          [
            ["any", _T("lg_on_when_any")],
            ["all", _T("lg_on_when_all")],
          ],
          draft.all ? "all" : "any",
          function (v) {
            draft.all = v === "all";
            redrawBox(box, content);
          }
        )
      );
    }
    if (!isNew && st.entry)
      box.appendChild(
        pill("trash", _T("lg_delete"), {
          sub: function () {
            return _T("lg_delete_sub");
          },
          tap: function () {
            confirmDlg(_T("lg_delete_q") + draft.name + "?", function () {
              HA.lightGroups.remove(st.entry).then(function () {
                lgDropDevices(entity);
                uiChanged();
                toast(_T("lg_deleted"));
                POPGUARD = null;
                STACK = [];
                CURRENT = null;
                closeSheet();
              }, failed);
            }, _T("delete"));
          },
        })
      );
  }
  /* Makes the changes. A new group: the helper is made now, with this name, and the group goes where the add popup was opened. An existing one: its helper is changed (name, lights,
     options), and the dashboard's device follows. Gives false at once when nothing can be done yet, else a promise of whether it worked. */
  function save(leave) {
    var name = draft.name.trim();
    if (!name) {
      toast(_T("lg_give_a_name"));
      return false;
    }
    if (st.saving || (!isNew && !st.loaded)) return false;
    st.saving = true;
    var work = Promise.resolve();
    if (isNew) {
      toast(_T("lg_making"));
      work = HA.lightGroups.create(name, draft.lights, { hide_members: !!draft.hide, all: !!draft.all }).then(function (made) {
        placeDevice(o.rid, { id: made.entity_id, name: name, icon: draft.icon, kind: "light" });
        uiChanged();
      });
    } else {
      var before = JSON.parse(first);
      if (st.entry) {
        if (name !== before.name)
          work = work.then(function () {
            return HA.lightGroups.rename(entity, st.entry, name);
          });
        if (JSON.stringify(draft.lights) !== JSON.stringify(before.lights) || draft.hide !== before.hide || draft.all !== before.all)
          work = work.then(function () {
            return HA.lightGroups.update(st.entry, { entities: draft.lights, hide_members: !!draft.hide, all: !!draft.all });
          });
      }
      work = work.then(function () {
        lgDevices(entity).forEach(function (d) {
          d.name = name;
          d.icon = draft.icon;
        });
        uiChanged();
      });
    }
    return work.then(
      function () {
        st.saving = false;
        POPGUARD = null;
        leave();
        return true;
      },
      function (err) {
        failed(err);
        return false;
      }
    );
  }
  guardUnsaved({
    dirty: function () {
      return st.loaded && snap() !== first;
    },
    save: save,
  });
  drawShell();
  redrawBox(box, content);
  if (!isNew)
    HA.lightGroups
      .entryOf(entity)
      .then(function (entry) {
        st.entry = entry;
        if (!entry) {
          st.loaded = true;
          first = snap();
          drawShell();
          redrawBox(box, content);
          return null;
        }
        return HA.lightGroups.options(entry).then(function (opts) {
          draft.lights = opts.entities.slice();
          draft.hide = !!opts.hide_members;
          draft.all = !!opts.all;
          st.loaded = true;
          first = snap();
          drawShell();
          redrawBox(box, content);
        });
      })
      .catch(function (err) {
        st.entry = null;
        st.loaded = true;
        failed(err);
        redrawBox(box, content);
      });
}

function lgPage(b, entity) {
  lgForm(b, { mode: "edit", entity: entity });
}

function lgNewPage(b) {
  if (!LGNEW) return;
  lgForm(b, { mode: "new", rid: LGNEW.rid, lights: LGNEW.lights });
}
