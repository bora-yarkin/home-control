/* Wall mode: the idle clock or photo screensaver, and wall photos. */

function wallPhotosPage(b) {
  var box = mk("div");
  b.appendChild(box);
  function photos() {
    return ((STORE.cfg && STORE.cfg.wallPhotos) || []).slice();
  }
  function setPhotos(a) {
    STORE.cfg = cleanCfg(Object.assign({}, STORE.cfg, { wallPhotos: a }));
    storeChanged();
    redrawBox(box, draw);
  }
  function draw() {
    var hint = mk("div", "hint");
    hint.textContent = _T("photos_shown_by_wall_mode_when_it_is");
    box.appendChild(hint);
    var fi = document.createElement("input");
    fi.type = "file";
    fi.accept = "image/*";
    fi.style.display = "none";
    box.appendChild(fi);
    fi.addEventListener("change", function () {
      var f = fi.files && fi.files[0];
      if (!f) return;
      if (photos().length >= 16) {
        toast(_T("up_to_16_photos"));
        return;
      }
      toast(_T("processing"));
      resizeImage(
        f,
        function (u) {
          if (!u) {
            toast(_T("that_picture_couldn_t_be_used"));
            return;
          }
          var a = photos();
          a.push(u);
          setPhotos(a);
        },
        1280,
        150000
      );
    });
    box.appendChild(
      pill("plus", _T("add_a_photo_from_this_device"), {
        sub: function () {
          return photos().length + " / 16";
        },
        tap: function () {
          fi.click();
        },
      })
    );
    photos().forEach(function (u, i) {
      box.appendChild(
        pill("media", _T("photo_n") + (i + 1), {
          sub: function () {
            return /^data:/.test(u) ? _T("uploaded_tap_to_remove") : u;
          },
          tap: function () {
            confirmDlg(_T("remove_this_photo"), function () {
              var a = photos();
              a.splice(i, 1);
              setPhotos(a);
            });
          },
        })
      );
    });
    box.appendChild(sep(_T("or_add_addresses"), "edit"));
    var ta = mk("textarea", "ta");
    ta.setAttribute("spellcheck", "false");
    ta.placeholder = "https://… or /local/photo.jpg";
    box.appendChild(ta);
    box.appendChild(
      pill("check", _T("add_these_addresses"), {
        tap: function () {
          var lines = ta.value
            .split("\n")
            .map(function (s) {
              return s.trim();
            })
            .filter(Boolean);
          if (!lines.length) return;
          var c = cleanCfg({ wallPhotos: lines });
          if (c.wallPhotos.length !== lines.length)
            toast(_T("some_lines_were_skipped_only_https_a"));
          setPhotos(photos().concat(c.wallPhotos));
        },
      })
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
              var n = ((STORE.cfg && STORE.cfg.wallPhotos) || []).length;
              return n ? cntS(n, _T("photo"), _T("photos")) : _T("none_yet");
            },
            tap: function () {
              showPopup("manage-wallphotos", true);
            },
          })
        );
      if (
        PREFS.wallMode === "photo" &&
        !(STORE.cfg && STORE.cfg.wallPhotos && STORE.cfg.wallPhotos.length)
      ) {
        var hn = mk("div", "hint");
        hn.textContent = _T("no_photos_are_set_up_yet_so_the_cloc");
        box.appendChild(hn);
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
  var photos = (PREFS.wallMode === "photo" && STORE.cfg && STORE.cfg.wallPhotos) || [],
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
    if (e.key === "Tab" && !KBD) {
      KBD = true;
      a11yScan();
    }
    if (e.key === "Escape") {
      if (SHEET) closeSheet();
      return;
    }
    if (!PREFS.a11y && !KBD) return;
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
