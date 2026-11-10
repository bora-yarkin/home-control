/* Door calls: when a camera's intercom rings, a popup with its picture, Answer, End call, Unlock and Talk opens by itself, on every open dashboard, and again when the dashboard is opened while the call is still going (the notification of a call opens it). It uses only what the camera's intercom profile binds (profiles.js) and the two audio paths the ring indicator publishes (docs/intercom-contract.md); nothing in it knows a brand. */

var IXPATH = /^\/api\/[A-Za-z0-9_.\/-]{1,200}$/;

/* The cameras with an intercom that has a call indicator, and may be seen by this person. */
function ixDevices() {
  return Object.keys(UIDEV).filter(function (id) {
    var ix = UIDEV[id] && UIDEV[id].ix;
    return ix && ix.ring && modeOf(id).mode !== "hide";
  });
}

/* Whether an entity is the call indicator of an intercom. */
function ixIsRing(entity) {
  return Object.keys(UIDEV).some(function (id) {
    return UIDEV[id] && UIDEV[id].ix && UIDEV[id].ix.ring === entity;
  });
}

/* "idle", "ringing" (someone is calling, not answered) or "call" (answered). A sensor says it in words: a state with "ring" in it rings, any other state that is not idle is a call. An indicator that only says on or off (a binary sensor, a boolean) and an event can say no more than that it rings, so it rings until it stops. */
function ixState(ix) {
  if (!ix || !ix.ring) return "idle";
  var s = H().states[ix.ring];
  if (!s) return "idle";
  if (dom(ix.ring) === "event")
    return s.state && isFinite(Date.parse(s.state)) && Date.now() - Date.parse(s.state) < 30000 ? "ringing" : "idle";
  if (dom(ix.ring) === "sensor") {
    if (["", "idle", "off", "unknown", "unavailable", "0", "none"].indexOf(s.state) >= 0) return "idle";
    return /ring/i.test(s.state) ? "ringing" : "call";
  }
  return s.state === "on" ? "ringing" : "idle";
}

/* Where to listen to and talk into the call: from the profile (listen) or from the ring indicator's attributes `listen_path` and `talk_path`, which is how an integration offers its audio to a dashboard without it knowing the integration. */
function ixPaths(ix) {
  var a = (ix.ring && H().states[ix.ring] && H().states[ix.ring].attributes) || {};
  function ok(p) {
    return typeof p === "string" && IXPATH.test(p) && p.indexOf("..") < 0 ? p : null;
  }
  return { listen: ok(ix.listen) || ok(a.listen_path), talk: ok(a.talk_path) };
}

/* The audio of the call that is open: what plays the door, and what carries the microphone. */
var IXA = { audio: null, talker: null, muted: false };

function ixListening() {
  return !!IXA.audio;
}

function ixTalking() {
  return !!IXA.talker;
}

function ixListenStop() {
  var a = IXA.audio;
  IXA.audio = null;
  if (!a) return;
  try {
    a.pause();
    a.removeAttribute("src");
    a.load();
  } catch (x) {}
}

function ixListenStart(path) {
  if (IXA.audio) return;
  var a = new Audio();
  IXA.audio = a;
  window.HA.signPath(path).then(
    function (url) {
      if (IXA.audio !== a) return;
      a.src = url;
      ["ended", "error"].forEach(function (ev) {
        a.addEventListener(ev, function () {
          if (IXA.audio !== a) return;
          ixListenStop();
          if (ev === "error") toast(_T("px_listen_failed"));
        });
      });
      return a.play();
    }
  ).catch(function () {
    if (IXA.audio === a) ixListenStop();
    toast(_T("px_listen_failed"));
  });
}

function ixTalkStop() {
  var t = IXA.talker;
  IXA.talker = null;
  IXA.muted = false;
  if (t) t.stop();
}

/* The signed address of a WebSocket: the path, signed, on this page's own host. */
function ixSocketUrl(path) {
  return window.HA.signPath(path).then(function (signed) {
    return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + signed;
  });
}

/* A line to a talk path that is held while a button is held: {ready, stop} like a camera's own talk session. */
function ixTalkOpen(path) {
  var line = null,
    stopped = false;
  var ready = ixSocketUrl(path).then(function (url) {
    if (stopped) throw Object.assign(new Error("cancelled"), { userMessage: "" });
    line = window.IntercomTalk.start(url);
    return line.ready;
  });
  return {
    ready: ready,
    stop: function () {
      stopped = true;
      if (line) line.stop();
    },
  };
}

/* Starts the microphone. Where the page may not use one (plain http) Home Assistant's own Assist is opened instead when the phone app offers it, and the person is told when nothing can be done. */
function ixTalkStart(path, changed) {
  if (IXA.talker) return;
  if (!window.IntercomTalk || !window.IntercomTalk.available()) {
    if (!window.HA.assist()) toast(_T("dc_talk_needs_https"));
    return;
  }
  var t = { stop: function () {}, mute: function () {} };
  IXA.talker = t;
  ixSocketUrl(path).then(function (url) {
    if (IXA.talker !== t) return;
    var line = window.IntercomTalk.start(url, function (code) {
      if (IXA.talker !== t) return;
      IXA.talker = null;
      IXA.muted = false;
      if (code) toast(window.IntercomTalk.errors[code] || _T("dc_talk_stopped"));
      changed();
    });
    t.stop = line.stop;
    t.mute = line.mute;
    return line.ready;
  }).then(changed, function (e) {
    if (IXA.talker === t) IXA.talker = null;
    toast((e && e.userMessage) || _T("px_talking_did_not_start"));
    changed();
  });
}

function ixAudioStop() {
  ixListenStop();
  ixTalkStop();
}

function ixSeconds(since) {
  var s = Math.max(0, Math.round((Date.now() - since) / 1000));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}

/* The popup of one door call: "call:<camera>". */
function callPopup(b, id) {
  var ix = (UIDEV[id] && UIDEV[id].ix) || {},
    box = mk("div", "vidbox"),
    since = 0,
    answered = false,
    ended = false;
  box.dataset.cam = id;
  stream(box, id, "sheet", false, true);
  camControls(box, id);
  b.appendChild(box);
  var status = pill("bell", (UIDEV[id] && UIDEV[id].name) || entName(id), {
    sub: function () {
      var st = callShown();
      return st === "ringing" ? _T("dc_ringing") : st === "call" ? _T("dc_on_call") + " · " + ixSeconds(since) : _T("dc_call_ended");
    },
  });
  b.appendChild(status);
  /* What the screen shows: the call as the indicator says it, and an answer given here counts at once for an indicator that cannot say it. */
  function callShown() {
    var st = ixState(ix);
    if (ended || st === "idle") return "idle";
    return answered ? "call" : st;
  }
  var row = mk("div", "rrow dcrow"),
    btn = {};
  function add(key, icon, label, fn) {
    var t = rbtn(icon, fn, _T(label));
    t.classList.add("dc-" + key);
    btn[key] = t;
    row.appendChild(t);
  }
  add("answer", "check", "px_answer", function () {
    answered = true;
    since = Date.now();
    if (ix.answer) remotePress({ e: ix.answer });
    var p = ixPaths(ix);
    if (p.listen) ixListenStart(p.listen);
    if (p.talk) ixTalkStart(p.talk, paint);
    paint();
  });
  add("end", "close", "dc_end", function () {
    if (ix.reject) remotePress({ e: ix.reject });
    ixAudioStop();
    ended = true;
    paint();
    setTimeout(function () {
      if (CURRENT === "call:" + id) closeSheet();
    }, 400);
  });
  if (ix.unlock)
    add("unlock", "padlock", "px_unlock", function () {
      ixUnlock(ix.unlock);
    });
  b.appendChild(row);
  var audio = mk("div", "rrow dcrow"),
    paths = ixPaths(ix);
  if (paths.talk) {
    var talk = rbtn("mic", function () {
      if (IXA.talker) {
        IXA.muted = !IXA.muted;
        IXA.talker.mute(IXA.muted);
        paint();
      } else ixTalkStart(paths.talk, paint);
    }, _T("dc_talk"));
    talk.classList.add("dc-talk");
    audio.appendChild(talk);
    btn.talk = talk;
  }
  if (paths.listen) {
    var lis = rbtn("volup", function () {
      if (IXA.audio) ixListenStop();
      else ixListenStart(paths.listen);
      paint();
    }, _T("px_listen"));
    lis.classList.add("dc-listen");
    audio.appendChild(lis);
    btn.listen = lis;
  }
  if (audio.children.length) b.appendChild(audio);
  function paint() {
    var st = callShown();
    if (st === "call" && !since) since = Date.now();
    if (st === "idle" && !ended) {
      ended = true;
      ixAudioStop();
      setTimeout(function () {
        if (CURRENT === "call:" + id) closeSheet();
      }, 2500);
    }
    btn.answer.style.display = st === "ringing" && ix.answer ? "" : "none";
    btn.end.style.display = st === "idle" ? "none" : "";
    if (btn.unlock) ixPadlock(btn.unlock, ix.unlock);
    if (btn.talk) {
      btn.talk.classList.toggle("act", ixTalking() && !IXA.muted);
      btn.talk.querySelector("span") && (btn.talk.querySelector("span").textContent = ixTalking() ? (IXA.muted ? _T("dc_unmute") : _T("dc_mute")) : _T("dc_talk"));
      btn.talk.style.display = st === "idle" ? "none" : "";
    }
    if (btn.listen) {
      btn.listen.classList.toggle("act", ixListening());
      btn.listen.style.display = st === "idle" ? "none" : "";
    }
  }
  paint();
  reg(paint);
}

/* ---- opening it ---- */

var IXSEEN = {},
  IXWASOPEN = {},
  IXDISMISSED = {};

/* Run with every refresh. A call that starts (or is already going when the dashboard opens) opens its popup, over whatever is open; closing the popup during a call is the answer "not now" and it stays closed until that call is over. */
function ixWatch() {
  if (!H() || !BOOTED) return;
  /* The audio belongs to the open popup: closing it hangs up the microphone and the speaker (the call itself goes on until it is ended). */
  if ((IXA.audio || IXA.talker) && !/^call:/.test(CURRENT || "")) ixAudioStop();
  ixDevices().forEach(function (id) {
    var key = "call:" + id,
      st = ixState(UIDEV[id].ix),
      open = CURRENT === key;
    if (st === "idle") {
      delete IXDISMISSED[id];
      IXWASOPEN[id] = open;
      IXSEEN[id] = st;
      return;
    }
    if (IXWASOPEN[id] && !open) IXDISMISSED[id] = true;
    IXWASOPEN[id] = open;
    IXSEEN[id] = st;
    if (open || IXDISMISSED[id] || document.hidden) return;
    if (typeof wallHide === "function" && WALL && WALL.el) wallHide();
    showPopup(key, !!SHEET);
    IXWASOPEN[id] = true;
  });
}
