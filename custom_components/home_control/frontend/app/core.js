/* Foundation: first-paint theme, safe areas, access to Home Assistant data, sending commands, offline state, and small helpers every other file uses. */

/* Runs before anything is drawn so the page never shows the wrong theme first: a saved light theme adds the class and the accent colour is set at once. */
(function () {
  var p = deviceGet("db_prefs", {}),
    light =
      p.theme === "light" ||
      (p.theme === "auto" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
  if (light) document.body.classList.add("light");
  document.documentElement.style.setProperty(
    "--acc",
    "hsl(" + (typeof p.accH === "number" ? p.accH : 174) + ",82%," + (light ? 46 : 62) + "%)"
  );
})();

(function () {
  var d = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  Object.defineProperty(Node.prototype, "textContent", {
    configurable: true,
    get: d.get,
    set: function (v) {
      var t = String(v);
      if (this.nodeType === 1) {
        var c = this.firstChild;
        if (c && c.nodeType === 3 && !c.nextSibling && c.data === t) return;
        if (!c && t === "") return;
      }
      d.set.call(this, v);
    },
  });
})();

var VIEW = window.HA.route.get() || "home";

/* This device's own storage. The browser can refuse it (private windows, a full quota) and the page works without it, so a failed read is "nothing stored" and a failed write is dropped. Values are kept as JSON. */
function deviceGet(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    var v = raw === null ? null : JSON.parse(raw);
    return v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function deviceSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

/* Keeps a drag with the element that started it. The browser refuses when the pointer has already gone (a quick lift), and then there is nothing to keep. */
function capturePointer(el, e) {
  if (!e || e.pointerId === undefined) return;
  try {
    el.setPointerCapture(e.pointerId);
  } catch (x) {}
}

/* Runs each live update on its own so that one that fails does not stop the others. A failure is written to the console once per message, not on every refresh. */
var UPDATE_FAILURES = {};
function runUpdates(list, what) {
  list.forEach(function (f) {
    try {
      f();
    } catch (e) {
      var key = what + ": " + (e && e.message);
      if (UPDATE_FAILURES[key]) return;
      UPDATE_FAILURES[key] = true;
      console.error("Home Control: " + what + " failed", e);
    }
  });
}

var LIVE = [],
  SLIVE = [],
  CUR = LIVE,
  dragging = 0,
  DRAGAT = 0,
  MENU = null,
  STACK = [],
  CURRENT = null,
  SHEET = null;

function reg(f) {
  CUR.push(f);
}

function H() {
  return window.HA.hass();
}

/* Lights that exist only in the dashboard (see vlights.js): read before Home Assistant's own. */
var VLIGHT = {};

function S(id) {
  if (VLIGHT[id]) return VLIGHT[id];
  var h = H();
  return h ? h.states[id] : undefined;
}

function A(id) {
  var s = S(id);
  return (s && s.attributes) || {};
}

function V_(id) {
  var s = S(id);
  return s ? s.state : "unavailable";
}

var CMDERR = 0,
  VERSEQ = {},
  VER_DOM = { light: 1, switch: 1, fan: 1, input_boolean: 1, humidifier: 1 };

function cmdFail(s, e) {
  var now = Date.now();
  if (now - CMDERR < 2500) return;
  CMDERR = now;
  var m = (e && (e.message || (e.body && e.body.message))) || "";
  toast(
    _T("couldn_t") +
      String(s).replace(/_/g, " ") +
      (m ? ": " + String(m).slice(0, 70) : _T("home_assistant_didn_t_accept_it"))
  );
}

function entName(id) {
  return A(id).friendly_name || id;
}

function verifyCmd(d, s, data) {
  var ids = entIds(data);
  if (ids.length !== 1 || !VER_DOM[d] || (s !== "turn_on" && s !== "turn_off" && s !== "toggle"))
    return;
  var id = ids[0],
    before = V_(id),
    seq = (VERSEQ[id] || 0) + 1;
  VERSEQ[id] = seq;
  if (before === "unavailable") {
    toast(entName(id) + _T("is_unavailable"));
    return;
  }
  setTimeout(function () {
    if (VERSEQ[id] !== seq) return;
    var now = V_(id),
      ok = s === "turn_on" ? now === "on" : s === "turn_off" ? now === "off" : now !== before;
    if (now === "unavailable") toast(entName(id) + _T("is_unavailable"));
    else if (!ok) toast(entName(id) + _T("didn_t_respond"));
  }, 6000);
}

/* While the connection to Home Assistant is down a command would be lost silently, so say so and keep the controls from pretending. */
var OFFLINE = false;

function offlineSet(v) {
  if (OFFLINE === v) return;
  OFFLINE = v;
  var b = document.getElementById("offline");
  if (v) {
    if (!b) {
      b = mk("div", "offline pane");
      b.id = "offline";
      b.setAttribute("role", "status");
      b.textContent = _T("connection_to_home_assistant_lost_co");
      document.body.appendChild(b);
    }
  } else {
    if (b) {
      b.remove();
      toast(_T("connected_again"));
    }
    refresh();
  }
}

function offlineInit() {
  var h = H();
  if (!h) return;
  HA.onConnection(
    function () {
      offlineSet(true);
    },
    function () {
      offlineSet(false);
    }
  );
  if (h.connected === false) offlineSet(true);
}

function callRaw(d, s, data) {
  if (d === "light") {
    data = vlightDispatch(s, data);
    if (!data) return Promise.resolve();
  }
  var h = H();
  if (!h) {
    toast(_T("can_t_reach_home_assistant"));
    return;
  }
  if (OFFLINE) {
    toast(_T("not_connected_to_home_assistant"));
    return;
  }
  var p;
  try {
    p = h.callService(d, s, data);
  } catch (e) {
    cmdFail(s, e);
    return;
  }
  if (p && p.catch)
    p.catch(function (e) {
      cmdFail(s, e);
    });
  verifyCmd(d, s, data);
  return p;
}

/* When the page has been told the connection is lost but Home Assistant has reported it connected for a few seconds, the "back" was missed (a new connection object, a dropped event); the page believes what Home Assistant reports. */
var CONNOK = 0;

function connCheck() {
  var h = H(),
    down = !h || h.connected === false;
  document.body.classList.toggle("off", down);
  if (OFFLINE && h && h.connected === true) {
    if (!CONNOK) CONNOK = Date.now();
    else if (Date.now() - CONNOK > 3000) {
      CONNOK = 0;
      offlineSet(false);
    }
  } else CONNOK = 0;
  if (!OFFLINE && h && h.connected === false) offlineSet(true);
}

function entIds(data) {
  var e = data && data.entity_id;
  return Array.isArray(e) ? e : typeof e === "string" && e ? [e] : [];
}

function call(d, s, data) {
  gate(entIds(data), function () {
    callRaw(d, s, data);
    if (d === "vacuum" && data && data.entity_id) vacKick(data.entity_id);
  });
}

/* Commands that follow a finger (sliders, the colour circle): one at a time for each light, and only the latest position waits, so a drag never builds up a queue of commands in the light's integration that the next tap would have to wait behind. */
var LIVEQ = {};

function callLive(key, d, s, data) {
  var q = LIVEQ[key] || (LIVEQ[key] = { busy: false, next: null });
  q.next = [d, s, data];
  if (q.busy) return;
  q.busy = true;
  (function run() {
    var n = q.next;
    q.next = null;
    if (!n) {
      q.busy = false;
      return;
    }
    var p = null;
    gate(entIds(n[2]), function () {
      p = callRaw(n[0], n[1], n[2]);
    });
    /* A command that takes more than two seconds no longer holds up the next one. */
    Promise.race([
      Promise.resolve(p).catch(function () {}),
      new Promise(function (res) {
        setTimeout(res, 2000);
      }),
    ]).then(run);
  })();
}

/* An action the user has just confirmed in a dialog of its own: the access rule that asks "are you sure?" counts that answer, so one tap on Confirm is enough. View-only and hidden devices stay blocked. */
function callConfirmed(d, s, data) {
  entIds(data).forEach(function (id) {
    var m = modeOf(id);
    if (m.mode === "confirm") APPROVED[m.key] = 1;
  });
  call(d, s, data);
}

function dom(id) {
  return id.split(".")[0];
}

function toggleEnt(id) {
  var d = dom(id);
  if (d === "light" && V_(id) === "off" && lightDefault(id)) {
    lightOn(id);
    return;
  }
  call(d, "toggle", { entity_id: id });
}

function mk(t, c, h) {
  var e = document.createElement(t);
  if (c) e.className = c;
  if (h !== undefined) e.innerHTML = h;
  return e;
}

function cap(s) {
  s = String(s);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isOn(id) {
  var s = V_(id);
  return s === "on";
}

function mediaOn(id) {
  var s = V_(id);
  return ["on", "playing", "paused", "buffering"].indexOf(s) >= 0;
}

function pop(el) {
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
  setTimeout(function () {
    el.classList.remove("pop");
  }, 420);
}

function ago(id) {
  var s = S(id);
  if (!s || !s.last_changed) return "";
  var m = Math.max(0, Math.round((Date.now() - Date.parse(s.last_changed)) / 60000));
  if (isNaN(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return m + _T("min_ago");
  var h = Math.floor(m / 60);
  if (h < 24) return h + _T("h_ago");
  var d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : d + _T("d_ago");
}

function stAgo(id) {
  var st = V_(id);
  if (st === "unavailable" || st === "unknown") return _T("unavailable");
  var a = ago(id);
  return (st === "on" ? _T("turned_on") : _T("turned_off")) + (a ? " " + a : "");
}

function roomOf(id) {
  var r = UIOWN[id];
  if (r && TITLES[r]) return TITLES[r];
  return VIEW !== "home" ? TITLES[VIEW] : "";
}

function toast(m) {
  var t = mk("div", "toast pane");
  t.setAttribute("role", "status");
  t.textContent = m;
  document.body.appendChild(t);
  requestAnimationFrame(function () {
    t.classList.add("in");
  });
  setTimeout(function () {
    t.classList.remove("in");
    setTimeout(function () {
      t.remove();
    }, 300);
  }, 1700);
}

function ago2(iso) {
  var m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (isNaN(m)) return "";
  if (m < 1) return "just now";
  if (m < 60) return m + _T("min_ago");
  var h = Math.floor(m / 60);
  if (h < 24) return h + _T("h_ago");
  var d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : d + _T("d_ago");
}
