/* Cameras: live view, full screen, pan and tilt controls, camera list and the add-camera page. */

var STOPS = {};

function stopStreams(o) {
  Object.keys(STOPS)
    .filter(function (k) {
      return !o || k === o || (o === "page" && k.indexOf("page") === 0);
    })
    .forEach(function (k) {
      if (STOPS[k]) {
        try {
          STOPS[k]();
        } catch (e) {}
        STOPS[k] = null;
      }
    });
}

function camFsExit(box) {
  var st = box._fs;
  if (!st) return;
  box._fs = null;
  box.classList.remove("fs");
  if (st.ph.parentNode) st.ph.parentNode.insertBefore(box, st.ph);
  else box.remove();
  st.ph.remove();
  var v = box.querySelector("video");
  if (v && v.srcObject) v.play().catch(function () {});
  var b = box.querySelector(".cbtns .rnd:last-child");
  if (b) b.innerHTML = svg("expand");
}

function camFull(box, vid, btn) {
  if (box._fs) {
    camFsExit(box);
    return;
  }
  function pseudo() {
    var ph = document.createComment("cam");
    box.parentNode.insertBefore(ph, box);
    box._fs = { ph: ph };
    document.body.appendChild(box);
    box.classList.add("fs");
    btn.innerHTML = svg("close");
    if (vid.srcObject) vid.play().catch(function () {});
  }
  function viaVideo() {
    if (vid.webkitEnterFullscreen && vid.readyState > 0) {
      try {
        vid.webkitEnterFullscreen();
        return;
      } catch (e) {}
    }
    pseudo();
  }
  var req = box.requestFullscreen || box.webkitRequestFullscreen;
  if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    try {
      var p = req.call(box);
      if (p && p.catch) p.catch(viaVideo);
    } catch (e) {
      viaVideo();
    }
    return;
  }
  viaVideo();
}

function stream(box, id, owner, tapOpen) {
  stopStreams(owner);
  /* The snapshot sits behind the video, which stays transparent until the live picture is really showing, so a stream that connects black never replaces it. */
  var tok = A(id).access_token;
  if (tok) {
    var snap = mk("img", "snap");
    snap.alt = "";
    snap.src = HA.camera.snapshotUrl(id, tok);
    box.appendChild(snap);
  }
  var vid = mk("video");
  vid.muted = true;
  vid.autoplay = true;
  vid.playsInline = true;
  vid.setAttribute("playsinline", "");
  box.appendChild(vid);
  var bt = mk("div", "cbtns");
  var mu = mk("div", "rnd pane", svg("mute")),
    fs = mk("div", "rnd pane", svg("expand"));
  mu.addEventListener("click", function (e) {
    e.stopPropagation();
    vid.muted = !vid.muted;
    mu.innerHTML = svg(vid.muted ? "mute" : "volup");
  });
  fs.addEventListener("click", function (e) {
    e.stopPropagation();
    camFull(box, vid, fs);
  });
  bt.appendChild(mu);
  bt.appendChild(fs);
  box.appendChild(bt);
  if (tapOpen)
    box.addEventListener("click", function () {
      if (!box._fs) showPopup(tapOpen === true ? "camera" : tapOpen, true);
    });
  var stop = window.CameraStream.start(vid, id);
  STOPS[owner] = function () {
    camFsExit(box);
    stop();
    vid.removeAttribute("src");
    vid.srcObject = null;
  };
}

var CAMPAGE = null,
  PATCH_BUILD = false;

/* Camera: live view, pan and tilt when the camera has move buttons, and its everyday switches; the rest is in Advanced settings. */
/* The camera controls sit on the camera view itself: privacy switch top left, Advanced settings bottom right, and swipe or hold on the picture to move the camera. The arrow pad is at the top of the camera's Advanced settings. */
function camMoves(id) {
  var mv = {};
  ["up", "down", "left", "right"].forEach(function (x) {
    mv[x] = sibEnds(id, "button", "_move_" + x);
  });
  return mv.up && mv.down && mv.left && mv.right ? mv : null;
}

function camControls(box, id) {
  var mv = camMoves(id),
    pv = sibEnds(id, "switch", "_privacy");
  if (pv) {
    var tl = mk("div", "cbtl"),
      pb = mk("div", "rnd pane", svg("camoff"));
    pb.setAttribute("role", "button");
    pb.setAttribute("aria-label", _T("privacy_mode"));
    pb.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleEnt(pv);
    });
    tl.appendChild(pb);
    box.appendChild(tl);
    reg(function () {
      pb.classList.toggle("act", isOn(pv));
    });
  }
  if (mv) {
    var ov = mk("div", "ptzov"),
      ar = mk("div", "ptzar");
    ov.appendChild(ar);
    box.appendChild(ov);
    swipePad(
      ov,
      function (d) {
        call("button", "press", { entity_id: mv[d] });
      },
      null,
      function (d) {
        ar.innerHTML = d ? svg(d) : "";
        ar.classList.toggle("on", !!d);
      }
    );
  }
  if (ISADMIN && PREFS.adv && !(UIDEV[id] && UIDEV[id].noadv) && advList(id).length) {
    var br = mk("div", "cbtr"),
      sb = mk("div", "rnd pane", svg("cog"));
    sb.setAttribute("role", "button");
    sb.setAttribute("aria-label", _T("advanced_settings"));
    sb.addEventListener("click", function (e) {
      e.stopPropagation();
      showPopup("adv:" + id, true);
    });
    br.appendChild(sb);
    box.appendChild(br);
  }
}

function camPad(id) {
  var mv = camMoves(id);
  if (!mv) return null;
  var p = mk("div", "ptz");
  [
    [null],
    ["up", "up"],
    [null],
    ["left", "left"],
    ["c", "cctv"],
    ["right", "right"],
    [null],
    ["down", "down"],
    [null],
  ].forEach(function (x) {
    if (!x[0]) {
      p.appendChild(mk("div"));
      return;
    }
    if (x[0] === "c") {
      p.appendChild(mk("div", "rbtn pane", svg("cctv")));
      return;
    }
    p.appendChild(
      rbtn(
        x[1],
        function () {
          call("button", "press", { entity_id: mv[x[0]] });
        },
        "",
        true
      )
    );
  });
  return p;
}

function cameraList() {
  var cams = devsOf().filter(function (d) {
      return d.kind === "camera" && d.id && (ISADMIN || modeOf(d.id, d.room).mode !== "hide");
    }),
    list = [];
  if (!cams.length) {
    list.push({
      el: section(
        _T("cameras"),
        "cam",
        [
          pill("info", _T("no_cameras_yet"), {
            sub: function () {
              return ISADMIN
                ? _T("add_one_to_a_room_to_see_it_here")
                : _T("an_admin_can_add_cameras");
            },
          }),
        ].concat(
          ISADMIN
            ? [
                pill("plus", _T("add_a_camera"), {
                  tap: function () {
                    showPopup("cam-add", true);
                  },
                }),
              ]
            : []
        )
      ),
      wide: true,
    });
    return list;
  }
  var grid = mk("div", "camgrid");
  cams.forEach(function (d) {
    var tl = mk("div", "camt pane"),
      im = document.createElement("img");
    im.alt = "";
    tl.appendChild(im);
    tl.appendChild(mk("div", "cn")).textContent =
      d.name + (TITLES[d.room] ? " · " + TITLES[d.room] : "");
    tl.setAttribute("role", "button");
    tl.addEventListener("click", function () {
      go(d.room);
    });
    tl.refresh = function () {
      var p = A(d.id).entity_picture;
      if (typeof p === "string" && /^\/(?!\/)/.test(p)) {
        var u = p + (p.indexOf("?") >= 0 ? "&" : "?") + "_=" + Math.floor(Date.now() / 8000);
        if (im.getAttribute("src") !== u) im.src = u;
      }
    };
    reg(tl.refresh);
    grid.appendChild(tl);
  });
  list.push({ el: section(_T("cameras"), "cam", [grid]), wide: true });
  return list;
}

function camAddPage(b) {
  var hn = mk("div", "hint");
  hn.textContent = _T("choose_the_room_the_camera_belongs_t");
  b.appendChild(hn);
  UI.rooms.forEach(function (r) {
    b.appendChild(
      pill(r.icon || "home", r.name, {
        tap: function () {
          pickEntity(_T("choose_a_camera"), ["camera"], null, function (id) {
            if (
              devsOf().some(function (d) {
                return d.id === id;
              })
            ) {
              toast(_T("already_on_the_dashboard"));
              return;
            }
            var nm = A(id).friendly_name || id;
            addDevToPage(r.id, {
              id: id,
              name: nm,
              icon: defIcon("camera", nm, id),
              kind: "camera",
            });
            uiChanged();
            toast(_T("camera_added_to") + " " + r.name);
          });
        },
      })
    );
  });
}
