/* Light groups made on the dashboard. A group is Home Assistant's own "Group" helper of the type light (Settings, Devices and services, Helpers), made and changed here through
   its configuration flow (ha-adapter.js, HA.lightGroups); on the dashboard it is one light that stands for its lights. The add popup makes one from the lights that were checked,
   and the group's settings (name, icon, the lights in it, hiding them, when it counts as on, deleting it) open right after, or from the settings of any light that is a group. */

/* The lights of a group as Home Assistant reports them. */
function lgMembers(entity) {
  var m = A(entity).entity_id;
  return Array.isArray(m) ? m.slice() : [];
}

/* A light name no light in Home Assistant has yet: "Light group", "Light group 2", ... */
function lgFreeName(base) {
  var used = {};
  Object.keys(H().states).forEach(function (id) {
    if (dom(id) === "light") used[String(A(id).friendly_name || "").toLowerCase()] = 1;
  });
  var n = 1,
    name = base;
  while (used[name.toLowerCase()]) name = base + " " + ++n;
  return name;
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

/* Makes the group from the lights that were checked and puts it where the add popup was opened. Resolves to the group's light, or rejects with what went wrong; nothing is added to the
   dashboard unless the helper exists. */
function lgCreate(rid, lights) {
  var name = lgFreeName(_T("lg_light_group"));
  return HA.lightGroups.create(name, lights, { hide_members: true, all: false }).then(function (made) {
    devList(rid).push({ id: made.entity_id, name: name, icon: "lights", kind: "light" });
    uiChanged();
    return made.entity_id;
  });
}

/* The group's settings. Name and icon belong to the dashboard's device and to the helper; the lights, hiding them and when the group counts as on belong to the helper. Every change
   is made at once; the lights are changed through the helper's options, which reloads the group. */
function lgPage(b, entity) {
  var st = { entry: undefined, opts: null, busy: false },
    box = mk("div");
  b.appendChild(box);
  function failed(err) {
    st.busy = false;
    toast((err && err.message) || _T("lg_could_not_change"));
    draw();
  }
  function nameNow() {
    var d = lgDevices(entity)[0];
    return (d && d.name) || A(entity).friendly_name || entity;
  }
  function change(changes) {
    if (st.busy || !st.entry) return;
    st.busy = true;
    HA.lightGroups.update(st.entry, changes).then(function () {
      Object.keys(changes).forEach(function (k) {
        st.opts[k] = changes[k];
      });
      st.busy = false;
      draw();
    }, failed);
  }
  function draw() {
    redrawBox(box, function () {
      box.appendChild(
        textRow(
          "edit",
          _T("device_name"),
          nameNow(),
          function (v) {
            if (!v) return;
            lgDevices(entity).forEach(function (d) {
              d.name = v;
            });
            uiChanged();
            if (st.entry) HA.lightGroups.rename(entity, st.entry, v).catch(failed);
          },
          40
        )
      );
      var dev = lgDevices(entity)[0];
      if (dev)
        box.appendChild(
          iconPick(DEVICONS, dev.icon, function (n) {
            lgDevices(entity).forEach(function (d) {
              d.icon = n;
            });
            uiChanged();
          })
        );
      var lights = st.opts ? st.opts.entities : lgMembers(entity);
      box.appendChild(sep(_T("lg_lights") + " · " + lights.length, "lights"));
      if (st.entry === undefined) {
        box.appendChild(pill("info", _T("lg_reading"), {}));
        return;
      }
      lights.forEach(function (id) {
        box.appendChild(
          pill("light", A(id).friendly_name || id, {
            sub: function () {
              return id;
            },
            tap: st.entry
              ? function () {
                  if (lights.length < 2) {
                    toast(_T("lg_needs_a_light"));
                    return;
                  }
                  confirmDlg(_T("lg_take_out") + (A(id).friendly_name || id) + "?", function () {
                    change({
                      entities: lights.filter(function (x) {
                        return x !== id;
                      }),
                    });
                  });
                }
              : null,
          })
        );
      });
      if (!st.entry) {
        var note = mk("div", "hint");
        note.textContent = _T("lg_not_a_helper");
        box.appendChild(note);
        return;
      }
      box.appendChild(
        pill("plus", _T("lg_add_a_light"), {
          tap: function () {
            pickEntity(
              _T("lg_add_a_light"),
              ["light"],
              null,
              function (id) {
                change({ entities: lights.concat([id]) });
              },
              function (id) {
                return id === entity || lights.indexOf(id) >= 0;
              }
            );
          },
        })
      );
      box.appendChild(sep(_T("lg_behaviour"), "tune"));
      box.appendChild(
        pill("eyeoff", _T("lg_hide_lights"), {
          on: function () {
            return !!st.opts.hide_members;
          },
          sub: function () {
            return _T("lg_hide_lights_sub");
          },
          tap: function () {
            change({ hide_members: !st.opts.hide_members });
          },
        })
      );
      box.appendChild(
        seg(
          [
            ["any", _T("lg_on_when_any")],
            ["all", _T("lg_on_when_all")],
          ],
          st.opts.all ? "all" : "any",
          function (v) {
            change({ all: v === "all" });
          }
        )
      );
      box.appendChild(
        pill("trash", _T("lg_delete"), {
          sub: function () {
            return _T("lg_delete_sub");
          },
          tap: function () {
            confirmDlg(_T("lg_delete_q") + nameNow() + "?", function () {
              HA.lightGroups.remove(st.entry).then(function () {
                lgDropDevices(entity);
                uiChanged();
                toast(_T("lg_deleted"));
                STACK = [];
                CURRENT = null;
                closeSheet();
              }, failed);
            });
          },
        })
      );
    });
  }
  draw();
  HA.lightGroups.entryOf(entity).then(function (entry) {
    st.entry = entry;
    if (!entry) {
      st.opts = null;
      draw();
      return;
    }
    return HA.lightGroups.options(entry).then(function (o) {
      st.opts = o;
      draw();
    });
  }).catch(function (err) {
    st.entry = null;
    failed(err);
  });
}
