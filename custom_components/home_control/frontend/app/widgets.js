/* Shared building blocks: pills, sliders, menus, dialogs, round buttons, tiles and rows, entity pickers, picture helpers. */

/* The page was scrolled at this moment (any scroll container). A touch that only stops a scroll, or that happens while the page scrolls, is not a tap. */
var SCROLLAT = 0;
document.addEventListener(
  "scroll",
  function () {
    SCROLLAT = Date.now();
  },
  true
);

/* A slider row. The row only reacts to a slide that is clearly horizontal: a finger that moves up or down is scrolling the page, and a touch that stops a scroll is not a tap. */
function attachSlide(el, h) {
  var sx = 0,
    sy = 0,
    t0 = 0,
    down = false,
    moved = false,
    scrolling = false,
    rect = null,
    tgt = null,
    held = false,
    timer = 0;
  function frac(e) {
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }
  el.addEventListener("pointerdown", function (e) {
    down = true;
    moved = false;
    t0 = Date.now();
    /* The touch that stops a scrolling page is not meant for the row. */
    scrolling = t0 - SCROLLAT < 300;
    sx = e.clientX;
    sy = e.clientY;
    tgt = e.target;
    rect = el.getBoundingClientRect();
    dragging++;
    DRAGAT = Date.now();
    watchRelease(e.pointerId);
    capturePointer(el, e);
    held = false;
    clearTimeout(timer);
    if (h.onHold)
      timer = setTimeout(function () {
        if (down && !moved && !scrolling && SCROLLAT < t0 && !editing()) {
          held = true;
          h.onHold();
        }
      }, 450);
  });
  el.addEventListener("pointermove", function (e) {
    if (!down || held || scrolling) return;
    if (!moved) {
      var dx = Math.abs(e.clientX - sx),
        dy = Math.abs(e.clientY - sy);
      if (dy > 8 && dy >= dx) {
        scrolling = true;
        clearTimeout(timer);
        return;
      }
      if (dx > 10 && dx > 1.8 * dy) {
        moved = true;
        clearTimeout(timer);
      }
    }
    if (moved) h.onMove(frac(e));
  });
  /* The release is also heard on the window: when the finger lets go away from the row (or the row was replaced meanwhile) the row itself gets no pointerup, and a missing release would stop every refresh of the page. */
  function watchRelease(pid) {
    function fin(ev) {
      if (ev.pointerId !== pid) return;
      window.removeEventListener("pointerup", fin, true);
      window.removeEventListener("pointercancel", fin, true);
      if (ev.type === "pointerup") up(ev);
      else cancel();
    }
    window.addEventListener("pointerup", fin, true);
    window.addEventListener("pointercancel", fin, true);
  }
  function up(e) {
    if (!down) return;
    down = false;
    clearTimeout(timer);
    dragging = Math.max(0, dragging - 1);
    if (held) {
      held = false;
      if (h.onCancel) h.onCancel();
      return;
    }
    if (moved) h.onCommit(frac(e));
    else if (scrolling || SCROLLAT >= t0) {
      if (h.onCancel) h.onCancel();
    } else if (h.onTap) h.onTap(tgt);
  }
  function cancel() {
    if (down) {
      down = false;
      held = false;
      clearTimeout(timer);
      dragging = Math.max(0, dragging - 1);
      if (h.onCancel) h.onCancel();
    }
  }
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
}

/* A popup's main action (Save, Done) stays pinned to the bottom of the popup instead of sitting after a long list. */
/* The press effect, for everything that can be pressed: one rule for all of it. The element shrinks (class pressed) while the finger is on it, for at least 110 ms so a quick tap shows it too, and it lets go as soon as the finger starts to drag or scroll. */
var PRESSABLE =
  ".pill:not(.static),.tile,.sel,.rnd,.rbtn,.opt,.rb-chip,.room,.qa,.swc,.tact,.camt,.dock .di,.menu .mi,.gb[role=button],.lp-it,.lp-bri-btn,.lp-style,.lp-mode,.lp-tile";
document.addEventListener(
  "pointerdown",
  function (e) {
    if (e.button || !e.target.closest) return;
    var el = e.target.closest(PRESSABLE);
    if (!el) return;
    var t0 = Date.now(),
      x = e.clientX,
      y = e.clientY;
    el.classList.add("pressed");
    function end() {
      document.removeEventListener("pointerup", end, true);
      document.removeEventListener("pointercancel", end, true);
      document.removeEventListener("pointermove", move, true);
      setTimeout(function () {
        el.classList.remove("pressed");
      }, Math.max(0, 110 - (Date.now() - t0)));
    }
    function move(ev) {
      if (Math.abs(ev.clientX - x) > 10 || Math.abs(ev.clientY - y) > 10) end();
    }
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    document.addEventListener("pointermove", move, true);
  },
  true
);

/* Calls fn when the element is pressed and held for 450 ms without moving. Returns a function that says whether the press that just ended was a hold, so the click after it can be ignored. */
function onHold(el, fn) {
  var timer = 0,
    sx = 0,
    sy = 0,
    fired = false;
  function stop() {
    clearTimeout(timer);
    timer = 0;
  }
  el.addEventListener("pointerdown", function (e) {
    if (e.button) return;
    fired = false;
    sx = e.clientX;
    sy = e.clientY;
    stop();
    timer = setTimeout(function () {
      timer = 0;
      if (editing()) return;
      fired = true;
      fn();
    }, 450);
  });
  el.addEventListener("pointermove", function (e) {
    if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) stop();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
    el.addEventListener(ev, stop);
  });
  return function () {
    var was = fired;
    fired = false;
    return was;
  };
}

/* A locked lock unlocks by sliding its icon across its row, as on the old iPhone lock screen: drag the icon to the end; letting go
   before the end sends it back. A tap only nudges the icon to show which way to go. o.canSlide() says whether the slide applies now. */
function slideIcon(r, o, refresh) {
  var icn = r.querySelector(".ic"),
    fade = r.querySelectorAll(".tx,.vl"),
    from = 0,
    x = 0,
    drag = false,
    moved = false,
    reset = 0;
  function room() {
    return r.clientWidth - icn.offsetWidth - 16;
  }
  function place(v) {
    x = v;
    icn.style.transform = v ? "translateX(" + v + "px)" : "";
    var f = String(Math.max(0, 1 - v / (room() * 0.5)));
    for (var i = 0; i < fade.length; i++) fade[i].style.opacity = v ? f : "";
  }
  function back() {
    r.classList.add("easing");
    place(0);
  }
  r.slideReset = function () {
    clearTimeout(reset);
    if (x) back();
  };
  icn.addEventListener("pointerdown", function (e) {
    if (e.button || editing() || !o.canSlide()) return;
    clearTimeout(reset);
    r.classList.remove("easing");
    r.classList.add("sliding");
    from = e.clientX - x;
    drag = true;
    moved = false;
    capturePointer(icn, e);
  });
  icn.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var v = Math.max(0, Math.min(room(), e.clientX - from));
    if (v > 6) moved = true;
    place(v);
  });
  function release() {
    if (!drag) return;
    drag = false;
    r.classList.remove("sliding");
    if (moved && x >= room() * 0.9) {
      o.slide();
      reset = setTimeout(back, 5000);
    } else back();
  }
  icn.addEventListener("pointerup", release);
  icn.addEventListener("pointercancel", release);
  icn.addEventListener(
    "click",
    function (e) {
      if (!o.canSlide() || editing()) return;
      e.stopPropagation();
      if (moved) return;
      r.classList.add("easing");
      place(18);
      setTimeout(back, 180);
    },
    true
  );
}

function pill(icon, name, o) {
  var r = mk("div", "pill pane" + (o.tap ? "" : " static") + (o.on ? " tg" : ""));
  r.dataset.i = icon;
  r.innerHTML =
    ic(icon) +
    "<span class='tx'><span class='nm'></span><span class='sb'></span></span><span class='vl'></span>";
  r.querySelector(".nm").textContent = name;
  var sb = r.querySelector(".sb"),
    vl = r.querySelector(".vl");
  if (o.pin) r.dataset.pin = JSON.stringify(o.pin);
  if (o.check) {
    r.classList.add("chk");
    r.setAttribute("role", "checkbox");
    r.appendChild(mk("span", "ck", svg("check")));
  }
  /* A row with an icon action opens its popup on a press and hold as well; the icon switches the device only on a tap. */
  var held = o.iconTap && o.tap ? onHold(r, o.tap) : null;
  if (o.tap)
    r.addEventListener("click", function (e) {
      if (held && held()) return;
      if (o.iconTap && e.target.closest(".ic")) {
        o.iconTap();
        return;
      }
      o.tap();
    });
  if (o.slide) slideIcon(r, o);
  var was = null;
  r.refresh = function () {
    if (o.slide) {
      var can = !!o.canSlide();
      r.classList.toggle("slidable", can);
      if (!can && r.slideReset) r.slideReset();
    }
    if (o.check) {
      var ck = !!o.check();
      r.classList.toggle("checked", ck);
      r.setAttribute("aria-checked", ck ? "true" : "false");
    }
    var n = o.on ? !!o.on() : false;
    r.classList.toggle("on", n);
    if (was !== null && n !== was) pop(r);
    was = n;
    if (o.sub) {
      var t = o.sub();
      sb.textContent = t || "";
      sb.style.display = t ? "" : "none";
    } else sb.style.display = "none";
    vl.textContent = r.classList.contains("slidable") ? _T("slide_to_unlock") : o.val ? o.val() : "";
  };
  reg(r.refresh);
  return r;
}

/* A CSS colour string as [r,g,b], so text can be chosen against it. */
function cssToRgb(s) {
  var e = document.createElement("span");
  e.style.color = s;
  e.style.display = "none";
  document.body.appendChild(e);
  var m = (getComputedStyle(e).color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  e.remove();
  return m.length === 3 ? m : null;
}

function sliderRow(o) {
  var r = mk("div", "pill pane slide" + (o.track ? " track " + o.track : ""));
  r.innerHTML =
    "<div class='fill'></div>" +
    (o.track ? "<div class='mark'></div>" : "") +
    ic(o.icon) +
    "<span class='tx'><span class='nm'></span><span class='sb'></span></span><span class='vl'></span>";
  r.querySelector(".nm").textContent = o.name;
  var fill = r.querySelector(".fill"),
    mark = r.querySelector(".mark"),
    sb = r.querySelector(".sb"),
    vl = r.querySelector(".vl");
  var drag = false;
  /* While dragging, the thing the slider controls follows the finger: at most one update every 150 ms, and the last position always arrives. */
  var liveT = 0,
    liveAt = 0;
  function sendLive(v) {
    var wait = liveAt + 150 - Date.now();
    clearTimeout(liveT);
    if (wait <= 0) {
      liveAt = Date.now();
      o.live(v);
    } else
      liveT = setTimeout(function () {
        liveAt = Date.now();
        o.live(v);
      }, wait);
  }
  if (typeof o.trackBg === "string") r.style.background = o.trackBg;
  function snap(f) {
    var v = o.min + f * (o.max - o.min);
    var st = o.step || 1;
    v = Math.round((v - o.min) / st) * st + o.min;
    return Math.max(o.min, Math.min(o.max, Number(v.toFixed(2))));
  }
  function paint(v) {
    var f = (v - o.min) / (o.max - o.min);
    f = Math.max(0, Math.min(1, f));
    if (o.track) mark.style.left = f * 100 + "%";
    else fill.style.width = f * 100 + "%";
    vl.textContent = o.fmt ? o.fmt(v) : v;
    if (o.fillColor && !o.track) {
      var fc2 = o.fillColor();
      inkRow(r, fc2 ? cssToRgb(fc2) : null, f * 100);
    }
  }
  if (!o.readonly)
    attachSlide(r, {
      onMove: function (f) {
        drag = true;
        var v = snap(f);
        paint(v);
        if (o.live) sendLive(v);
      },
      onCommit: function (f) {
        var v = snap(f);
        clearTimeout(liveT);
        o.commit(v);
        setTimeout(function () {
          drag = false;
        }, 600);
      },
      onCancel: function () {
        drag = false;
      },
      onHold: o.onHold,
      onTap: function (t) {
        drag = false;
        if (o.onTap) o.onTap(t);
      },
    });
  else r.classList.add("static");
  r.refresh = function () {
    if (o.dim) r.classList.toggle("off-dim", !!o.dim());
    if (typeof o.trackBg === "function") r.style.background = o.trackBg();
    if (o.fillColor) {
      var fc = o.fillColor();
      if (fc) {
        fill.style.background =
          "linear-gradient(180deg," + fc + ",color-mix(in srgb," + fc + " 75%,#000))";
        fill.style.boxShadow = "inset 0 1.5px 1px rgba(255,255,255,.6),0 0 24px " + fc;
      } else {
        fill.style.background = "";
        fill.style.boxShadow = "";
      }
    }
    if (o.on) r.classList.toggle("on", !!o.on());
    if (o.sub) {
      var t = o.sub();
      sb.textContent = t || "";
      sb.style.display = t ? "" : "none";
    } else sb.style.display = "none";
    if (drag) return;
    var v = o.get();
    if (v === null || v === undefined || isNaN(Number(v))) {
      if (o.off !== undefined) {
        fill.style.width = "0";
        vl.textContent = o.off;
      }
      return;
    }
    paint(Number(v));
  };
  reg(r.refresh);
  return r;
}

function selectTile(label, opts, cur, pick, icon, fmt) {
  var r = mk("div", "sel pane");
  r.innerHTML =
    (icon ? ic(icon) : "") +
    "<span class='tx'><span class='nm'></span><span class='sb'></span></span><span class='chev'>" +
    svg("chev") +
    "</span>";
  r.querySelector(".nm").textContent = label;
  var sb = r.querySelector(".sb");
  r.addEventListener("click", function () {
    if (r._noopen) {
      r._noopen = false;
      return;
    }
    var o = opts();
    if (!o || !o.length) return;
    pop(r);
    openMenu(r, o, cur(), pick, fmt);
  });
  r.refresh = function () {
    var c = cur();
    sb.textContent = c === undefined || c === null || c === "" ? "-" : fmt ? fmt(c) : cap(c);
  };
  reg(r.refresh);
  return r;
}

var MENU_ANCHOR = null;

function openMenu(anchor, options, current, pick, fmt) {
  closeMenu(true);
  var m = mk("div", "menu pane");
  options.forEach(function (o) {
    var it = mk("div", "mi" + (String(o) === String(current) ? " on" : ""));
    it.textContent = fmt ? fmt(o) : cap(o); /* an option comes from a device and is text, never markup */
    it.addEventListener("click", function (e) {
      e.stopPropagation();
      closeMenu();
      pick(o);
    });
    m.appendChild(it);
  });
  document.body.appendChild(m);
  /* The menu is as wide as the button it opens from and starts at its edge, measured at full size even when the button is shrunk by a press. */
  var r = anchor.getBoundingClientRect(),
    aw = anchor.offsetWidth,
    ax = r.left + (r.width - aw) / 2;
  m.style.width = aw + "px";
  var mh = m.offsetHeight,
    left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, ax)),
    top = r.bottom + 6,
    up = false;
  if (top + mh > window.innerHeight - 8) {
    top = Math.max(8, r.top - mh - 6);
    up = true;
  }
  m.style.left = left + "px";
  m.style.top = top + "px";
  if (up) m.classList.add("up");
  m.style.setProperty(
    "--ox",
    Math.max(0, Math.min(100, ((ax + aw / 2 - left) / Math.max(1, m.offsetWidth)) * 100)) +
      "%"
  );
  anchor.classList.add("open");
  MENU_ANCHOR = anchor;
  MENU = m;
  setTimeout(function () {
    document.addEventListener("pointerdown", menuAway, true);
  }, 0);
}

function menuAway(e) {
  if (!MENU || MENU.contains(e.target)) return;
  var a = e.target.closest ? e.target.closest(".sel") : null;
  if (a && a === MENU_ANCHOR) {
    a._noopen = true;
    clearTimeout(a._noopenT);
    a._noopenT = setTimeout(function () {
      a._noopen = false;
    }, 2500);
  }
  closeMenu();
}

function closeMenu(instant) {
  document.removeEventListener("pointerdown", menuAway, true);
  if (MENU_ANCHOR) {
    MENU_ANCHOR.classList.remove("open");
    MENU_ANCHOR = null;
  }
  if (MENU) {
    var m = MENU;
    MENU = null;
    if (instant) m.remove();
    else {
      m.classList.add("out");
      setTimeout(function () {
        m.remove();
      }, 170);
    }
  }
}

function sep(name, icon) {
  return mk("div", "sep", svg(icon || "info") + "<span></span>").appendChild(
    document.createTextNode(name)
  ).parentNode;
}

function glance(items, cols) {
  var g = mk("div", "glance");
  g.style.gridTemplateColumns = "repeat(" + cols + ",1fr)";
  items.forEach(function (it) {
    var b = mk("div", "gb pane", "<b>-</b><span></span>");
    b.querySelector("span").textContent = it[0];
    var v = b.querySelector("b");
    b.refresh = function () {
      var x = it[1]();
      if (it[2]) b.querySelector("span").textContent = it[2]();
      v.textContent = x;
      b.classList.toggle("off", x.indexOf("Offline") >= 0);
    };
    reg(b.refresh);
    g.appendChild(b);
  });
  return g;
}

function switchPill(icon, name, id) {
  return pill(icon, name, {
    on: function () {
      return isOn(id);
    },
    sub: function () {
      return stAgo(id);
    },
    tap: function () {
      toggleEnt(id);
    },
    pin: { id: id, name: name, icon: icon },
  });
}

function actionPill(icon, name, fn, confirmText) {
  return pill(icon, name, {
    tap: function () {
      if (confirmText) confirmDlg(confirmText, fn);
      else fn();
    },
  });
}

function confirmDlg(text, fn) {
  var bg = mk("div", "scrim");
  bg.style.zIndex = 69;
  var d = mk("div", "dlg pane");
  d.innerHTML = "<p></p><div class='rrow'></div>";
  d.querySelector("p").textContent = text;
  function close() {
    bg.remove();
    d.remove();
  }
  var row = d.querySelector(".rrow");
  var no = mk("div", "rbtn pane", _T("cancel")),
    yes = mk("div", "rbtn pane", _T("confirm"));
  yes.style.background = "linear-gradient(180deg,rgba(255,196,130,.62),rgba(150,92,44,.66))";
  no.addEventListener("click", close);
  yes.addEventListener("click", function () {
    close();
    fn();
  });
  bg.addEventListener("click", close);
  row.appendChild(no);
  row.appendChild(yes);
  document.body.appendChild(bg);
  document.body.appendChild(d);
  requestAnimationFrame(function () {
    bg.classList.add("in");
  });
}

/* A question that slides up from the bottom and stays there, as in the Hue app: a line of text, the choices (each a function), and Cancel last. */
function askSheet(text, choices) {
  var bg = mk("div", "scrim blur"),
    box = mk("div", "asheet pane");
  bg.style.zIndex = 70;
  box.appendChild(mk("div", "as-t")).textContent = text;
  function close() {
    bg.classList.remove("in");
    box.classList.remove("in");
    setTimeout(function () {
      bg.remove();
      box.remove();
    }, 340);
  }
  choices
    .concat([{ label: _T("cancel"), cancel: true }])
    .forEach(function (c) {
      var r = mk("div", "as-b" + (c.cancel ? " cancel" : ""));
      r.setAttribute("role", "button");
      r.textContent = c.label;
      r.addEventListener("click", function () {
        close();
        if (c.fn) c.fn();
      });
      box.appendChild(r);
    });
  bg.addEventListener("click", close);
  document.body.appendChild(bg);
  document.body.appendChild(box);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      bg.classList.add("in");
      box.classList.add("in");
    });
  });
}

function rbtn(icon, fn, label, hold) {
  var b = mk(
    "div",
    "rbtn pane" + (hold ? " hold" : ""),
    svg(icon) + (label ? "<span>" + label + "</span>" : "")
  );
  if (!hold) {
    b.addEventListener("click", fn);
    return b;
  }
  var delay = null,
    rep = null;
  function stop() {
    clearTimeout(delay);
    clearInterval(rep);
    delay = null;
    rep = null;
  }
  b.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    stop();
    fn();
    delay = setTimeout(function () {
      rep = setInterval(fn, 130);
    }, 380);
    capturePointer(b, e);
  });
  b.addEventListener("pointerup", stop);
  b.addEventListener("pointercancel", stop);
  b.addEventListener("lostpointercapture", stop);
  return b;
}

function section(name, icon, items) {
  var s = mk("div", "sec");
  s.appendChild(mk("div", "sec-h", svg(icon) + "<span></span>"));
  s.firstChild.querySelector("span").textContent = name;
  items.forEach(function (i) {
    s.appendChild(i);
  });
  return s;
}

function mediaRow(icon, name, id, key, sub) {
  return pill(icon, name, {
    pin: pinPop(key, id, name, icon),
    on: function () {
      return mediaOn(id);
    },
    sub: sub
      ? function () {
          var s = V_(id);
          if (s === "off") return "Off";
          var a = A(id);
          var parts = [a.media_title, a.source].filter(function (x) {
            return x;
          });
          return parts.length ? parts.join(" · ") : cap(s);
        }
      : null,
    tap: function () {
      showPopup(key, true);
    },
    iconTap: function () {
      toggleEnt(id);
    },
  });
}

/* An air conditioner row shows its own name and what it is doing: the mode and target while running, Off otherwise, and the room temperature it reads. */
function acRow(id, key, name, icon) {
  var nm = name || _T("air_conditioner"),
    MODE = {
      cool: _T("cool"),
      heat: _T("heat"),
      auto: _T("auto"),
      dry: _T("dry"),
      fan_only: _T("fan"),
      heat_cool: _T("auto"),
    };
  return pill(icon || "ac", nm, {
    on: function () {
      var s = V_(id);
      return !!s && s !== "off" && svOk(id);
    },
    sub: function () {
      var a = A(id),
        c = a.current_temperature;
      return typeof c === "number" ? _T("room") + " " + Math.round(c * 10) / 10 + TEMPU() : "";
    },
    val: function () {
      if (!svOk(id)) return _T("unavailable");
      var s = V_(id),
        a = A(id);
      if (s === "off") return _T("off");
      var t = a.temperature;
      return (MODE[s] || cap(s)) + (typeof t === "number" ? " " + t + "°" : "");
    },
    tap: function () {
      showPopup(key, true);
    },
    iconTap: function () {
      toggleEnt(id);
    },
    pin: pinPop(key, id, nm, icon || "ac"),
  });
}

/* The speed slider of a fan, one definition for the page row and the popup. A fan that speaks in steps (percentage_step, for example 3 speeds at 33.3) gets one slider position per step, shown as "2 / 3"; other fans use 0 to 100 %. */
function fanSpeed(id) {
  var s = A(id).percentage_step,
    n = s && s > 1.5 ? Math.round(100 / s) : 100;
  function topct(v) {
    return n === 100 ? v : Math.round((v * 100) / n);
  }
  return {
    min: 0,
    max: n,
    step: 1,
    get: function () {
      return V_(id) === "on" ? Math.round(((A(id).percentage || 0) * n) / 100) : 0;
    },
    fmtOn: function (v) {
      return n === 100 ? v + "%" : v + " / " + n;
    },
    live: function (v) {
      if (v > 0) callLive(id, "fan", "set_percentage", { entity_id: id, percentage: topct(v) });
    },
    commit: function (v) {
      if (v <= 0) call("fan", "turn_off", { entity_id: id });
      else call("fan", "set_percentage", { entity_id: id, percentage: topct(v) });
    },
  };
}

/* A fan with speed control is a slider like a light: the icon switches it, a tap or a press and hold opens its popup, and the speed follows the finger. */
function fanRow(id, key, name, icon) {
  if (!((A(id).supported_features || 0) & 1) || isPurifier(id)) return fanPill(id, key, name, icon);
  var nm = name || _T("standing_fan"),
    sp = fanSpeed(id),
    r = sliderRow({
      icon: icon || "fan",
      name: nm,
      min: sp.min,
      max: sp.max,
      step: sp.step,
      fillColor: function () {
        return isOn(id) ? PAGEFILL : null;
      },
      get: sp.get,
      fmt: function (v) {
        return isOn(id) ? sp.fmtOn(v) : V_(id) === "unavailable" ? _T("unavailable") : _T("off");
      },
      sub: function () {
        return stAgo(id);
      },
      on: function () {
        return isOn(id);
      },
      live: sp.live,
      commit: sp.commit,
      onHold: function () {
        showPopup(key, true);
      },
      onTap: function (t) {
        if (t && t.closest(".ic")) toggleEnt(id);
        else showPopup(key, true);
      },
    });
  r.dataset.pin = JSON.stringify({ id: id, name: nm, icon: icon || "fan" });
  return r;
}

function fanPill(id, key, name, icon) {
  return pill(icon || "fan", name || _T("standing_fan"), {
    on: function () {
      return isOn(id);
    },
    sub: function () {
      return stAgo(id);
    },
    tap: function () {
      showPopup(key, true);
    },
    iconTap: function () {
      toggleEnt(id);
    },
    pin: { id: id, name: name || _T("standing_fan"), icon: icon || "fan" },
  });
}

function tile(icon, name, labelFn, onFn, tapFn, tintFn) {
  var t = mk(
    "div",
    "tile pane",
    ic(icon) + "<span><span class='nm'></span><div class='sb'></div></span>"
  );
  t.querySelector(".nm").textContent = name;
  var sb = t.querySelector(".sb");
  t.addEventListener("click", tapFn);
  var was = null;
  t.refresh = function () {
    sb.textContent = labelFn();
    var n = onFn ? !!onFn() : false;
    t.classList.toggle("on", n);
    if (tintFn) tintIcon(t, n ? tintFn() : null);
    if (was !== null && n !== was) pop(t);
    was = n;
  };
  reg(t.refresh);
  return t;
}

function countOn(ids, okFn) {
  return ids.filter(function (id) {
    return okFn ? okFn(id) : V_(id) === "on";
  }).length;
}

function lightsLabel(ids) {
  return function () {
    var on = countOn(ids),
      miss = ids.filter(function (i) {
        var s = V_(i);
        return !s || s === "unknown" || s === "unavailable";
      }).length;
    return (
      on +
      " " +
      (on === 1 ? "light" : "lights") +
      " on" +
      (miss ? " · " + miss + " unavailable" : "")
    );
  };
}

function sv(id, unit, dp) {
  if (!svOk(id)) return "Offline";
  var v = Number(V_(id));
  return V_(id) === "" || !isFinite(v) ? "–" : v.toFixed(dp === undefined ? 1 : dp) + unit;
}

function svOk(id) {
  var s = V_(id);
  return s && s !== "unavailable" && s !== "unknown";
}

function imgOk(u) {
  return (
    typeof u === "string" &&
    ((u.length <= 300 && /^(https:\/\/|\/local\/)[^\s"'<>()\\]+$/.test(u)) ||
      (u.length <= 400000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(u)))
  );
}

function resizeImage(file, cb, maxDim, maxLen) {
  maxDim = maxDim || 1280;
  maxLen = maxLen || 380000;
  if (!file || file.type.indexOf("image/") !== 0) {
    cb(null);
    return;
  }
  var fr = new FileReader();
  fr.onload = function () {
    var im = new Image();
    im.onload = function () {
      var s = Math.min(1, maxDim / Math.max(im.width, im.height)),
        c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(im.width * s));
      c.height = Math.max(1, Math.round(im.height * s));
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      var q = 0.78,
        u = c.toDataURL("image/jpeg", q);
      while (u.length > maxLen && q > 0.3) {
        q -= 0.1;
        u = c.toDataURL("image/jpeg", q);
      }
      cb(u.length <= maxLen + 20000 ? u : null);
    };
    im.onerror = function () {
      cb(null);
    };
    im.src = fr.result;
  };
  fr.onerror = function () {
    cb(null);
  };
  fr.readAsDataURL(file);
}

function rimgEl(u) {
  var d = mk("span", "rimg"),
    i = new Image();
  i.alt = "";
  i.src = u;
  d.appendChild(i);
  return d;
}

/* ---- more device types, tiles, settings pages ---- */
var BUILD = "3.82",
  PICK = null;

/* entity picker */
/* 'taken' (optional) says which entities are already used and are left out of the list. */
function pickEntity(title, doms, cls, cb, taken) {
  PICK = { title: title, doms: doms, cls: cls || null, cb: cb, taken: taken || null, q: "" };
  showPopup("pick-ent", true);
}

function pickBuild(b) {
  var P = PICK;
  if (!P) return;
  var h = H(),
    w = mk("div", "sqw pane", svg("search")),
    inp = mk("input", "sq"),
    box = mk("div");
  inp.type = "text";
  inp.placeholder = _T("search");
  inp.setAttribute("autocomplete", "off");
  inp.setAttribute("autocapitalize", "off");
  w.appendChild(inp);
  b.appendChild(w);
  b.appendChild(box);
  function list() {
    redrawBox(box, function () {
      var tk = norm(P.q).trim().split(/\s+/).filter(Boolean),
        out = [];
      Object.keys(h.states).forEach(function (id) {
        if (P.doms.indexOf(dom(id)) < 0 || (P.taken && P.taken(id))) return;
        var e = h.entities && h.entities[id];
        /* Diagnostic entities stay hidden unless a device class was asked for: battery sensors are diagnostic on Matter and Zigbee devices. */
        if (e && (e.hidden || e.entity_category === "config" || (e.entity_category && !P.cls))) return;
        if (P.cls && P.cls.indexOf(A(id).device_class) < 0) return;
        var nm = A(id).friendly_name || id,
          hay = norm(nm + " " + id + " " + areaName(id));
        if (
          !tk.every(function (x) {
            return hay.indexOf(x) >= 0;
          })
        )
          return;
        out.push({ id: id, name: nm });
      });
      out.sort(function (a, c) {
        return a.name.localeCompare(c.name);
      });
      if (!out.length) box.appendChild(pill("info", _T("nothing_found"), {}));
      out.slice(0, 40).forEach(function (c) {
        box.appendChild(
          pill(sensorIcon(c.id), c.name, {
            sub: function () {
              return c.id;
            },
            val: function () {
              return dom(c.id) === "event"
                ? isNaN(Date.parse(V_(c.id)))
                  ? ""
                  : _T("pressed") + " " + ago2(V_(c.id))
                : entVal(c.id);
            },
            tap: function () {
              P.cb(c.id);
              popBack();
            },
          })
        );
      });
    });
  }
  inp.addEventListener("input", function () {
    P.q = inp.value;
    list();
  });
  list();
}
