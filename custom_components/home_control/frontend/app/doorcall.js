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

/* Whether the call that is going has anything to unlock: the profile binds an unlock, and the call indicator does not say (attribute `can_unlock: false`, docs/intercom-contract.md) that this caller has no door, as a guard desk has not. */
function ixCanUnlock(ix) {
  if (!ix || !ix.unlock) return false;
  var s = ix.ring && H().states[ix.ring];
  return !(s && s.attributes && s.attributes.can_unlock === false);
}

/* Whether the door can be slid open now: the same rule as the dashboard's own lock row (a lock that is locked), and for an unlock that is a button, while it has not just been pressed (a button says nothing afterwards, so it counts as open for a few seconds). */
function ixCanSlide(ix) {
  if (!ixCanUnlock(ix)) return false;
  if (dom(ix.unlock) === "lock") return V_(ix.unlock) === "locked";
  return remoteUsable(ix.unlock) && !ixUnlocked(ix.unlock);
}

/* The audio of the call that is open: what plays the door, and what carries the microphone. */
var IXA = { audio: null, talker: null, silent: false };

function ixListening() {
  return !!IXA.audio;
}

function ixTalking() {
  return !!IXA.talker;
}

function ixListenStop() {
  var a = IXA.audio;
  IXA.audio = null;
  clearTimeout(IXA.retry);
  if (!a) return;
  try {
    a.pause();
    a.removeAttribute("src");
    a.load();
  } catch (x) {}
}

/* Starts the door's sound. Right after an answer the station may not report the call yet and the stream is refused: it is tried again a few times before the person is told (`tries` is how many more). */
function ixListenStart(path, tries) {
  if (IXA.audio) return;
  var a = new Audio(),
    left = tries === undefined ? 4 : tries;
  a.muted = IXA.silent;
  IXA.audio = a;
  function failed() {
    if (IXA.audio !== a) return;
    ixListenStop();
    if (left <= 0) return toast(_T("px_listen_failed"));
    IXA.retry = setTimeout(function () {
      ixListenStart(path, left - 1);
    }, 1000);
  }
  window.HA.signPath(path).then(
    function (url) {
      if (IXA.audio !== a) return;
      a.src = url;
      a.addEventListener("ended", function () {
        if (IXA.audio === a) ixListenStop();
      });
      a.addEventListener("error", failed);
      return a.play();
    }
  ).catch(failed);
}

function ixTalkStop() {
  var t = IXA.talker;
  IXA.talker = null;
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
  var t = { stop: function () {} };
  IXA.talker = t;
  ixSocketUrl(path).then(function (url) {
    if (IXA.talker !== t) return;
    var line = window.IntercomTalk.start(url, function (code) {
      if (IXA.talker !== t) return;
      IXA.talker = null;
      if (code) toast(window.IntercomTalk.errors[code] || _T("dc_talk_stopped"));
      changed();
    });
    t.stop = line.stop;
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
  IXA.silent = false; // the next call starts with sound again
}

function ixSeconds(since) {
  var s = Math.max(0, Math.round((Date.now() - since) / 1000));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}

/* One of the two big buttons of a call: a handset icon and a label (several labels sit on top of each other and cross-fade). */
function dcButton(cls, labels, fn) {
  var t = mk("div", "dcb " + cls);
  t.setAttribute("role", "button");
  t.tabIndex = 0;
  t.innerHTML =
    "<span class='dci'>" + svg("phone") + "</span><span class='dcl'>" +
    labels.map(function (l, i) { return "<span class='l" + i + "'></span>"; }).join("") + "</span>";
  labels.forEach(function (l, i) {
    t.querySelector(".l" + i).textContent = l;
  });
  t.setAttribute("aria-label", labels[0]);
  t.addEventListener("click", fn);
  t.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  });
  return t;
}

/* The popup of one door call: "call:<camera>". Answer takes the call with sound both ways (the door is played, the microphone goes to the door) and turns Decline into End call; the mute button of the picture silences the door (and starts it when the call was answered elsewhere). Where the caller has nothing to unlock (a guard desk) the slide to unlock is not shown. */
function callPopup(b, id) {
  var ix = (UIDEV[id] && UIDEV[id].ix) || {},
    box = mk("div", "vidbox"),
    since = 0,
    answered = false,
    ended = false;
  box.dataset.cam = id;
  stream(box, id, "sheet", false, true, {
    noFullscreen: true,
    onMute: function () {
      var listen = ixPaths(ix).listen;
      if (!IXA.audio && listen && callShown() === "call") {
        /* A call that was answered elsewhere has no sound here yet: the button starts it (the press is what the browser needs). */
        IXA.silent = false;
        ixListenStart(listen);
      } else {
        IXA.silent = !IXA.silent;
        if (IXA.audio) IXA.audio.muted = IXA.silent;
      }
      paint();
    },
  });
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
  function answer() {
    if (answered || ended || callShown() !== "ringing") return;
    answered = true;
    since = Date.now();
    if (ix.answer) remotePress({ e: ix.answer });
    var p = ixPaths(ix);
    if (p.listen) ixListenStart(p.listen);
    if (p.talk) ixTalkStart(p.talk, paint);
    paint();
  }
  function end() {
    if (ended) return;
    if (ix.reject) remotePress({ e: ix.reject });
    ixAudioStop();
    ended = true;
    paint();
    setTimeout(function () {
      if (CURRENT === "call:" + id) closeSheet();
    }, 400);
  }
  var act = mk("div", "dcact"),
    ans = dcButton("dc-answer", [_T("px_answer")], answer),
    stop = dcButton("dc-end", [_T("dc_decline"), _T("dc_end")], end);
  act.appendChild(ans);
  act.appendChild(stop);
  b.appendChild(act);
  var unl = null,
    opening = 0;
  /* From the slide until the door says it is open (a few seconds at most, as a lock answers after the cloud has), the row says it is unlocking and the handle is back at the start, so the slide does not seem stuck at the end. */
  function unlocking() {
    if (ixUnlocked(ix.unlock)) opening = 0;
    return Date.now() - opening < 4000;
  }
  if (ix.unlock) {
    unl = pill("padlock", _T("px_unlock"), {
      /* As the dashboard's lock row: it slides while the door is locked, and once it is open the row shows Unlocked, the handle goes back and the padlock stands open. */
      on: function () {
        return ixUnlocked(ix.unlock);
      },
      val: function () {
        return ixUnlocked(ix.unlock) ? _T("unlocked_2") : unlocking() ? _T("dc_unlocking") : "";
      },
      slide: function () {
        opening = Date.now();
        ixOpen(ix.unlock);
        unl.refresh();
        paint();
      },
      canSlide: function () {
        return ixCanSlide(ix) && callShown() !== "idle" && !unlocking();
      },
    });
    unl.classList.add("dc-unlock");
    b.appendChild(unl);
  }
  /* Room under the last control, where a row of buttons used to be, so that sliding to unlock does not meet the phone's own gesture at the bottom edge. */
  b.appendChild(mk("div", "dcpad"));
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
    var ringing = st === "ringing" && !!ix.answer;
    act.classList.toggle("answered", !ringing);
    act.classList.toggle("over", st === "idle");
    ans.tabIndex = ringing ? 0 : -1;
    ans.setAttribute("aria-hidden", ringing ? "false" : "true");
    if (unl) {
      unl.style.display = ixCanUnlock(ix) ? "" : "none";
      unl.classList.toggle("dcgone", st === "idle"); // fades while "Call ended" is shown, so the popup does not jump
      ixPadlock(unl, ix.unlock);
    }
    if (box._mu) box._mu.innerHTML = svg(ixListening() && !IXA.silent ? "volup" : "mute");
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
