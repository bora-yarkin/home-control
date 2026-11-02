/* Saved colours and white temperatures. They belong to a room, not to a light: a colour saved from one light is there on the other lights of the room and on its lights master. Each is one colour ({h, s}) or one white temperature ({k}); colours kept together are a scene. */

var SAVED_MAX = 40;

/* What was saved for single lights before they belonged to rooms moves to the room of its light, once. */
function savedMigrate() {
  var old = STORE.presets || {};
  if (!Object.keys(old).length) return;
  STORE.saved = STORE.saved || {};
  Object.keys(old).forEach(function (id) {
    var room = ownerRoom(id) || "home",
      list = (STORE.saved[room] = STORE.saved[room] || []);
    (old[id] || []).forEach(function (p) {
      if (p.z || list.length >= SAVED_MAX) return;
      if (
        !list.some(function (x) {
          return same(x, p);
        })
      )
        list.push(p);
    });
  });
  STORE.presets = {};
  if (ISADMIN) storeChanged();
}

function savedOf(room) {
  savedMigrate();
  return (STORE.saved && STORE.saved[room]) || [];
}

/* The room whose saved colours a popup shows: the room of its first light. */
function savedRoomOf(ids) {
  for (var i = 0; i < ids.length; i++) {
    var r = ownerRoom(ids[i]);
    if (r) return r;
  }
  return VIEW !== "home" && UIROOM[VIEW] ? VIEW : "home";
}

function savedAdd(room, p) {
  var list = savedOf(room);
  if (
    list.some(function (x) {
      return same(x, p);
    })
  ) {
    toast(_T("already_saved"));
    return false;
  }
  if (list.length >= SAVED_MAX) {
    toast(_T("saved_limit_reached"));
    return false;
  }
  STORE.saved = STORE.saved || {};
  STORE.saved[room] = list.concat([p]);
  storeChanged();
  return true;
}

function savedRemove(room, p) {
  STORE.saved[room] = savedOf(room).filter(function (x) {
    return pkeyP(x) !== pkeyP(p);
  });
  storeChanged();
}

/* The one colour or white temperature that saving takes from what is selected: the first of its lights that is on (a group whose lights are set alike is that colour). Null, with a word to the person, when none is on. */
function savedCapture(n) {
  var on = lightIndividuals(n.cmd).filter(isOn)[0];
  if (!on) {
    toast(_T("turn_the_light_on_to_save_its_colour"));
    return null;
  }
  var c = curPreset(on);
  /* A light made of zones is saved as the colour of its first zone. */
  if (c && c.z) c = { h: c.z[0].h, s: c.z[0].s };
  if (!c) {
    toast(_T("turn_the_light_on_to_save_its_colour"));
    return null;
  }
  return c;
}

/* The saved colours and temperatures of every room, to copy one into this room. */
function savedAllPage(b, room) {
  var rooms = Object.keys(STORE.saved || {}).filter(function (r) {
      return r !== room && savedOf(r).length;
    }),
    box = mk("div");
  b.appendChild(box);
  if (!rooms.length) {
    box.appendChild(pill("info", _T("nothing_saved_in_other_rooms"), {}));
    return;
  }
  box.appendChild(mkHint(_T("tap_a_saved_colour_to_add_it_to_this_room")));
  rooms.forEach(function (r) {
    box.appendChild(sep(TITLES[r] || r, "home"));
    var row = mk("div", "pre");
    savedOf(r).forEach(function (p) {
      row.appendChild(
        swatch(p, {
          act: savedOf(room).some(function (x) {
            return same(x, p);
          }),
          tap: function () {
            if (savedAdd(room, p)) toast(_T("added_to_this_room"));
            refresh();
          },
        })
      );
    });
    box.appendChild(row);
  });
}
