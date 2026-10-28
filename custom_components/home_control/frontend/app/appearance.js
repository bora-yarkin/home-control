/* Per-user appearance: theme, accent colour, display size, start page; and keyboard and screen-reader support. */

/* display size, per device */
var LG = false;

function applyLG() {
  document.body.classList.toggle("lg", LG);
  setTimeout(movePill, 60);
  setTimeout(movePill, 400);
}

function initLG() {
  var s = null;
  try {
    s = localStorage.getItem("db_large");
  } catch (e) {}
  LG = s === "1";
  applyLG();
}

/* ---- per-user appearance ---- */
var PREFS = {
  theme: "dark",
  a11y: false,
  wall: false,
  wallIdle: 120,
  wallMode: "clock",
  wallDim: true,
  adv: true,
  pinHdr: true,
  hdrSize: "",
  startView: "",
  accH: 174,
  tf: "auto",
};

function mergePrefs(v) {
  if (!v || typeof v !== "object") return;
  if (v.theme === "dark" || v.theme === "light" || v.theme === "auto") PREFS.theme = v.theme;
  ["a11y", "wall", "wallDim", "adv", "pinHdr"].forEach(function (k) {
    if (typeof v[k] === "boolean") PREFS[k] = v[k];
  });
  if (typeof v.wallIdle === "number" && v.wallIdle >= 30 && v.wallIdle <= 3600)
    PREFS.wallIdle = Math.round(v.wallIdle);
  if (v.wallMode === "clock" || v.wallMode === "photo") PREFS.wallMode = v.wallMode;
  if (typeof v.startView === "string" && /^[a-z0-9_-]{0,24}$/.test(v.startView))
    PREFS.startView = v.startView;
  if (v.tf === "auto" || v.tf === "12" || v.tf === "24") PREFS.tf = v.tf;
  if (v.hdrSize === "regular" || v.hdrSize === "slim" || v.hdrSize === "") PREFS.hdrSize = v.hdrSize;
  if (typeof v.accH === "number" && v.accH >= 0 && v.accH < 360) PREFS.accH = Math.round(v.accH);
}

function savePrefsLocal() {
  try {
    localStorage.setItem("db_prefs", JSON.stringify(PREFS));
  } catch (e) {}
}

function themeLight() {
  return (
    PREFS.theme === "light" ||
    (PREFS.theme === "auto" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches)
  );
}

/* One steady accent colour that the user picks. */
function flatAccent() {
  var c = hsl2rgb(PREFS.accH, 0.82, themeLight() ? 0.46 : 0.62);
  return "rgb(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + ")";
}

function applyTheme() {
  var c = document.body.classList;
  c.toggle("light", themeLight());
  c.toggle("pinhdr", PREFS.pinHdr !== false);
  document.documentElement.style.setProperty("--acc", flatAccent());
  wallApply();
}

function initTheme() {
  try {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () {
      if (PREFS.theme === "auto") applyTheme();
    });
  } catch (e) {}
  try {
    mergePrefs(JSON.parse(localStorage.getItem("db_prefs") || "null"));
  } catch (e) {}
  applyTheme();
  var h = H();
  if (h)
    HA.data
      .get("user", "dashboard_prefs")
      .then(function (v) {
        if (v) {
          mergePrefs(v);
          savePrefsLocal();
          applyTheme();
          if (startViewApply()) {
            render();
            buildDock();
          }
        }
      })
      .catch(function () {});
}

var START_DONE = false;

/* Opens the "Start on" page once. The list of pages and the saved choice both arrive after the first paint, so this runs again when either one does. */
function startViewApply() {
  if (START_DONE || VIEW !== "home" || !PREFS.startView || ORDER.indexOf(PREFS.startView) < 0)
    return false;
  START_DONE = true;
  if (window.HA.route.get()) return false;
  VIEW = PREFS.startView;
  return true;
}

function setPref(k, v) {
  PREFS[k] = v;
  savePrefsLocal();
  applyTheme();
  var h = H();
  if (h)
    HA.data.set("user", "dashboard_prefs", PREFS).catch(function () {
      toast(_T("couldn_t_save_your_appearance_choice"));
    });
}

function prefPill(icon, name, key, sub) {
  return pill(icon, name, {
    on: function () {
      return !!PREFS[key];
    },
    sub: function () {
      return sub;
    },
    tap: function () {
      setPref(key, !PREFS[key]);
      refresh();
    },
  });
}

/* A dropdown row for the Appearance page; the options are a list or a function that returns one. */
function dropRow(label, opts, cur, pick, icon, fmt) {
  var r = selectTile(
    label,
    typeof opts === "function"
      ? opts
      : function () {
          return opts;
        },
    cur,
    pick,
    icon,
    fmt
  );
  r.classList.add("selrow");
  return r;
}

function appearancePage(b) {
  var box = mk("div");
  b.appendChild(box);
  function draw() {
    box.appendChild(
      dropRow(
        _T("look"),
        ["dark", "light", "auto"],
        function () {
          return PREFS.theme;
        },
        function (v) {
          setPref("theme", v);
          redrawBox(box, draw);
        },
        "palette",
        function (v) {
          return { dark: _T("dark"), light: _T("light"), auto: _T("auto") }[v];
        }
      )
    );
    box.appendChild(sep(_T("accent_colour"), "palette"));
    var ar = mk("div", "pre pgrid accgrid");
    ar.style.gridTemplateColumns = "repeat(8,1fr)";
    [215, 180, 145, 100, 35, 350, 320, 270].forEach(function (hh) {
      ar.appendChild(
        swatch(
          { h: hh, s: 70 },
          {
            act: PREFS.accH === hh,
            tap: function () {
              setPref("accH", hh);
              redrawBox(box, draw);
            },
          }
        )
      );
    });
    box.appendChild(ar);
    box.appendChild(
      pill("expand", _T("larger_display"), {
        on: function () {
          return LG;
        },
        sub: function () {
          return _T("bigger_text_and_controls_on_this_dev");
        },
        tap: function () {
          LG = !LG;
          try {
            localStorage.setItem("db_large", LG ? "1" : "0");
          } catch (e) {}
          applyLG();
          refresh();
        },
      })
    );
    box.appendChild(
      dropRow(
        _T("start_on"),
        function () {
          return ORDER.slice();
        },
        function () {
          return PREFS.startView || "home";
        },
        function (v) {
          setPref("startView", v === "home" ? "" : v);
          redrawBox(box, draw);
        },
        "home",
        function (v) {
          return TITLES[v] || v;
        }
      )
    );
    box.appendChild(
      dropRow(
        _T("clock"),
        ["auto", "12", "24"],
        function () {
          return PREFS.tf;
        },
        function (v) {
          setPref("tf", v);
          clock();
          redrawBox(box, draw);
        },
        "clock",
        function (v) {
          return { auto: _T("like_home_assistant"), 12: _T("12_hours"), 24: _T("24_hours") }[v];
        }
      )
    );
    box.appendChild(
      dropRow(
        _T("header_size"),
        ["page", "regular", "slim"],
        function () {
          return PREFS.hdrSize || "page";
        },
        function (v) {
          setPref("hdrSize", v === "page" ? "" : v);
          hdrBuild();
          redrawBox(box, draw);
        },
        "tune",
        function (v) {
          return { page: _T("same_as_the_page"), regular: _T("regular"), slim: _T("slim_2") }[v];
        }
      )
    );
    box.appendChild(
      prefPill("pin", _T("pinned_header"), "pinHdr", _T("keeps_the_header_in_view_while_you_scr"))
    );
    box.appendChild(sep(_T("accessibility"), "info"));
    box.appendChild(
      prefPill(
        "keyboard",
        _T("keyboard_and_screen_reader"),
        "a11y",
        _T("tab_to_every_control_enter_or_space_")
      )
    );
  }
  redrawBox(box, draw);
}

/* ---- keyboard and screen-reader support ---- */
/* Keyboard support switches on by itself the first time Tab is pressed (or always, from Appearance). Tab then stays inside an open sheet. */
var KBD = false;

function sheetTrap(e) {
  var sh = SHEET && SHEET.sh;
  if (!sh) return;
  var f = [].slice
    .call(sh.querySelectorAll('[tabindex="0"],input,textarea,select,button'))
    .filter(function (x) {
      return x.offsetParent && !x.disabled;
    });
  if (!f.length) return;
  var i = f.indexOf(document.activeElement);
  if (e.shiftKey ? i <= 0 : i === f.length - 1 || i < 0) {
    e.preventDefault();
    f[e.shiftKey ? f.length - 1 : 0].focus();
  }
}

function a11yScan() {
  if (!PREFS.a11y && !KBD) return;
  var n = document.querySelectorAll(".pill:not(.static),.tile,.rnd,.rbtn,.qa,.di,.sel,.room,.opt");
  for (var i = 0; i < n.length; i++) {
    var e = n[i];
    if (!e.hasAttribute("tabindex")) {
      e.setAttribute("tabindex", "0");
      e.setAttribute("role", "button");
    }
    var nm = e.querySelector(".nm"),
      sb = e.querySelector(".sb"),
      lb = nm
        ? nm.textContent.trim() + (sb && sb.textContent.trim() ? ". " + sb.textContent.trim() : "")
        : e.getAttribute("aria-label") || e.textContent.trim();
    if (lb && e.getAttribute("aria-label") !== lb.slice(0, 120))
      e.setAttribute("aria-label", lb.slice(0, 120));
  }
}
