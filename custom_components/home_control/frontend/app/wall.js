/* Wall mode: the idle clock or photo screensaver, and wall photos. */

/* The photos the wall screen shows: the gallery's photos that are switched on. */
function wallActive() {
  var c = STORE.cfg || {},
    off = c.wallOff || [];
  return (c.wallPhotos || []).filter(function (u, i) {
    return off.indexOf(i) < 0;
  });
}

/* The gallery of the wall screen's photos: each photo is a tile with a check that says whether it is used; a photo can be kept in the gallery without being used. New photos are
   uploaded from this device (or added by address) and are used at once. */
function wallPhotosPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function photos() {
    return ((STORE.cfg && STORE.cfg.wallPhotos) || []).slice();
  }
  function off() {
    return ((STORE.cfg && STORE.cfg.wallOff) || []).slice();
  }
  function setAll(list, offList) {
    STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { wallPhotos: list, wallOff: offList }));
    storeChanged();
    redrawBox(box, draw);
  }
  function toggle(i) {
    var o = off(),
      at = o.indexOf(i);
    if (at >= 0) o.splice(at, 1);
    else o.push(i);
    setAll(photos(), o);
  }
  function remove(i) {
    var list = photos(),
      o = off()
        .filter(function (x) {
          return x !== i;
        })
        .map(function (x) {
          return x > i ? x - 1 : x;
        });
    list.splice(i, 1);
    setAll(list, o);
  }
  function add(u) {
    if (photos().length >= 16) {
      toast(_T("up_to_16_photos"));
      return;
    }
    setAll(photos().concat([u]), off());
  }
  function tile(u, i) {
    var used = off().indexOf(i) < 0,
      t = mk("div", "wg-t pane" + (used ? " on" : " off")),
      img = mk("img"),
      ck = mk("span", "wg-ck", svg("check")),
      x = mk("div", "rnd pane sm wg-x", svg("trash"));
    img.alt = "";
    img.draggable = false;
    img.src = u;
    t.setAttribute("role", "checkbox");
    t.setAttribute("aria-checked", used ? "true" : "false");
    t.setAttribute("aria-label", _T("photo_n") + (i + 1));
    t.tabIndex = 0;
    t.appendChild(img);
    t.appendChild(ck);
    x.setAttribute("role", "button");
    x.setAttribute("aria-label", _T("remove_this_photo"));
    x.tabIndex = 0;
    x.addEventListener("click", function (e) {
      e.stopPropagation();
      confirmDlg(_T("remove_this_photo"), function () {
        remove(i);
      }, _T("wg_remove"));
    });
    t.appendChild(x);
    t.addEventListener("click", function () {
      toggle(i);
    });
    t.addEventListener("keydown", function (e) {
      if (e.target === t && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        toggle(i);
      }
    });
    return t;
  }
  function draw() {
    var hint = mk("div", "hint");
    hint.textContent = _T("photos_shown_by_wall_mode_when_it_is");
    box.appendChild(hint);
    box.appendChild(
      pill("plus", _T("upload_a_photo"), {
        sub: function () {
          return photos().length + " / 16";
        },
        tap: function () {
          pickTextFile({ accept: "image/*", maxBytes: 30 * 1024 * 1024, asFile: true }, function (f) {
            toast(_T("processing"));
            resizeImage(
              f,
              function (u) {
                if (!u) {
                  toast(_T("that_picture_couldn_t_be_used"));
                  return;
                }
                add(u);
              },
              1280,
              150000
            );
          });
        },
      })
    );
    var n = photos().length;
    if (n) {
      box.appendChild(sep(_T("gallery") + " · " + cntS(wallActive().length, _T("in_use_one"), _T("in_use_many")), "media"));
      var grid = mk("div", "wg");
      photos().forEach(function (u, i) {
        grid.appendChild(tile(u, i));
      });
      box.appendChild(grid);
      box.appendChild(hintRow(_T("tap_a_photo_to_use_it_or_not")));
    } else {
      box.appendChild(hintRow(_T("no_photos_yet")));
    }
    box.appendChild(sep(_T("or_add_an_address"), "edit"));
    /* One address at a time, checked when it is entered: only an https address or a /local/ file is a picture the wall may show. */
    box.appendChild(
      textRow(
        "edit",
        "https://… or /local/photo.jpg",
        "",
        function (v) {
          if (!v) return;
          var c = cleanCfg({ wallPhotos: [v] });
          if (!c.wallPhotos.length) {
            toast(_T("use_an_https_or_local_address"));
            return;
          }
          add(c.wallPhotos[0]);
        },
        300
      )
    );
  }
  redrawBox(box, draw);
}

/* Wall mode, with its idle time, clock or photos, night dimming and preview. */
function wallSettings(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(
      pill("tv", _T("wall_mode"), {
        on: function () {
          return PREFS.wall;
        },
        sub: function () {
          return _T("shows_a_clock_after_a_period_without");
        },
        tap: function () {
          setPref("wall", !PREFS.wall);
          redrawBox(box, draw);
        },
      })
    );
    if (PREFS.wall) {
      box.appendChild(
        seg(
          [
            ["60", _T("1_min")],
            ["120", _T("2_min")],
            ["300", _T("5_min")],
            ["600", _T("10_min")],
          ],
          String(PREFS.wallIdle),
          function (v) {
            setPref("wallIdle", +v);
            redrawBox(box, draw);
          }
        )
      );
      box.appendChild(
        seg(
          [
            ["clock", _T("clock")],
            ["photo", _T("photos_2")],
          ],
          PREFS.wallMode,
          function (v) {
            setPref("wallMode", v);
            redrawBox(box, draw);
          }
        )
      );
      box.appendChild(
        prefPill("moon", _T("dim_at_night"), "wallDim", _T("darker_screen_and_clock_while_the_su"))
      );
      if (ISADMIN)
        box.appendChild(
          pill("media", _T("screensaver_photos"), {
            sub: function () {
              var n = ((STORE.cfg && STORE.cfg.wallPhotos) || []).length,
                u = wallActive().length;
              return n ? cntS(n, _T("photo"), _T("photos")) + (u < n ? " · " + u + " " + _T("in_use_word") : "") : _T("none_yet");
            },
            tap: function () {
              showPopup("manage-wallphotos", true);
            },
          })
        );
      if (
        PREFS.wallMode === "photo" &&
        !wallActive().length
      ) {
        box.appendChild(hintRow(_T("no_photos_are_set_up_yet_so_the_cloc")));
      }
      box.appendChild(
        pill("play", _T("preview_wall_mode"), {
          tap: function () {
            closeSheet();
            setTimeout(wallShow, 200);
          },
        })
      );
    }
  }
  redrawBox(box, draw);
}

/* ---- wall mode: idle clock or photo screensaver ---- */
var WALL = { t: 0, el: null, tick: 0, photo: 0, booted: false };

function isNight() {
  var s = S("sun.sun");
  if (s) return s.state === "below_horizon";
  var hr = new Date().getHours();
  return hr >= 22 || hr < 6;
}

function wallApply() {
  document.body.classList.toggle("wallnight", !!(PREFS.wall && PREFS.wallDim && isNight()));
  if (!PREFS.wall) wallHide();
  else wallReset();
}

function wallReset() {
  clearTimeout(WALL.t);
  if (WALL.el || !PREFS.wall) return;
  WALL.t = setTimeout(wallShow, PREFS.wallIdle * 1000);
}

function wallShow() {
  if (WALL.el) return;
  var el = mk("div", "wall"),
    c = mk(
      "div",
      "wall-c",
      "<div class='wall-t'></div><div class='wall-d'></div><div class='wall-w'></div>"
    );
  var photos = (PREFS.wallMode === "photo" && wallActive()) || [],
    img = null;
  if (photos.length) {
    img = document.createElement("img");
    img.alt = "";
    el.appendChild(img);
    var showPhoto = function () {
      var i2 = Math.floor(Date.now() / 30000) % photos.length;
      if (img.dataset.i === String(i2)) return;
      img.dataset.i = String(i2);
      img.classList.remove("in");
      setTimeout(
        function () {
          if (!WALL.el) return;
          img.onload = function () {
            img.classList.add("in");
          };
          img.src = photos[i2];
        },
        img.getAttribute("src") ? 900 : 0
      );
    };
    showPhoto();
    WALL.photo = setInterval(showPhoto, 3000);
  }
  el.appendChild(c);
  document.body.appendChild(el);
  WALL.el = el;
  el.addEventListener(
    "click",
    function (e) {
      e.stopPropagation();
      e.preventDefault();
      wallHide();
    },
    true
  );
  WALL.tick = setInterval(wallTick, 1000);
  wallTick();
}

function wallTick() {
  var el = WALL.el;
  if (!el) return;
  var d = new Date(),
    w = null;
  Object.keys(H().states).some(function (k) {
    if (k.indexOf("weather.") === 0) {
      w = H().states[k];
      return true;
    }
    return false;
  });
  el.querySelector(".wall-t").textContent = tfmt(d, { hour: "numeric", minute: "2-digit" });
  el.querySelector(".wall-d").textContent = d.toLocaleDateString(LOC(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  el.querySelector(".wall-w").textContent =
    w && w.attributes && w.attributes.temperature !== undefined
      ? Math.round(w.attributes.temperature) + "° · " + cap(String(w.state).replace(/-/g, " "))
      : "";
  el.classList.toggle("dim", !!(PREFS.wallDim && isNight()));
  var m = d.getMinutes();
  el.querySelector(".wall-c").style.transform =
    "translate(" + ((m % 7) - 3) * 5 + "px," + ((m % 5) - 2) * 5 + "px)";
}

function wallHide() {
  if (!WALL.el) return;
  clearInterval(WALL.tick);
  clearInterval(WALL.photo);
  WALL.el.remove();
  WALL.el = null;
  wallReset();
}

function wallBoot() {
  if (WALL.booted) return;
  WALL.booted = true;
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    document.addEventListener(
      ev,
      function () {
        if (!WALL.el) wallReset();
      },
      { passive: true, capture: true }
    );
  });
  setInterval(function () {
    document.body.classList.toggle("wallnight", !!(PREFS.wall && PREFS.wallDim && isNight()));
  }, 60000);
  wallApply();
  var ob = mk("div", "offbar");
  ob.setAttribute("role", "status");
  ob.textContent = _T("home_assistant_disconnected_reconnec");
  document.body.appendChild(ob);
  document.addEventListener("keydown", function (e) {
    if (WALL.el) {
      e.preventDefault();
      wallHide();
      return;
    }
    if (e.key === "Escape") {
      if (SHEET) closeSheet();
      return;
    }
    var el = e.target;
    if (
      (e.key === "Enter" || e.key === " ") &&
      el &&
      el.getAttribute &&
      el.getAttribute("role") === "button"
    ) {
      e.preventDefault();
      el.click();
    }
    if (e.key === "Tab") sheetTrap(e);
  });
}
