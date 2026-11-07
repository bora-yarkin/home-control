/* Start-up: the refresh loop and starting the app. */

/* True once the page has been drawn (see start). Updates that arrive before it have nothing to update. */
var BOOTED = false;

function refresh() {
  if (!H() || !BOOTED) return;
  a11yScan();
  dockState();
  hdrLive();
  connCheck();
  relayout();
  lpTrackTick();
  /* A drag that never ended must not freeze the page for good. */
  if (dragging > 0) {
    if (EDRAG || Date.now() - DRAGAT < 20000) return;
    dragging = 0;
  }
  ruleTick();
  runUpdates(LIVE, "live update");
  runUpdates(SLIVE, "live update");
  if (LIVEPATCH_WAITING) livePatch();
}

/* The page is drawn once, from what is saved: the layout and this person's choices (the theme, the page to start on). Drawn earlier it showed what Home Assistant's own data suggests (every area a room, every unavailable light an alert, the Home page) and then changed. Until both are in, the skeleton stays. */
function start() {
  if (APP_FAILED.length) return;
  if (!H()) {
    document.getElementById("body").innerHTML =
      "<div class='sec-h'>" + _T("open_from_dashboard") + "</div>";
    return;
  }
  initLG();
  var waiting = setTimeout(function () {
    var body = document.getElementById("body");
    if (body && !BOOTED) {
      body.textContent = "";
      body.appendChild(mk("div", "sec-h", _T("still_waiting_for_the_saved_dashboard")));
    }
  }, 15000);
  Promise.all([initTheme(), initStore()]).then(function () {
    clearTimeout(waiting);
    boot();
  });
}

function boot() {
  applyUI();
  startViewApply();
  BOOTED = true;
  render();
  buildDock();
  initSearchBtn();
  roomOffInit();
  fxLoad();
  pluginsLoad();
  offlineInit();
  setInterval(function () {
    if (
      !document.hidden &&
      allSectionLists().some(function (l) {
        return l.some(function (s) {
          return s.and && s.and.length;
        });
      })
    )
      refresh();
  }, 30000);
  dockState();
  initSwipe();
  edInit();
  document.addEventListener("contextmenu", function (e) {
    if (!(e.target.closest && e.target.closest("textarea,input"))) e.preventDefault();
  });
  document.addEventListener("selectstart", function (e) {
    if (!(e.target.closest && e.target.closest("textarea,input"))) e.preventDefault();
  });
  setInterval(clock, 1000);
  setInterval(refresh, 1500);
  refresh();
  wallBoot();
  newDevBoot();
  window.addEventListener("resize", relayout);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopStreams();
    else if (CAMPAGE && CAMPAGE.box.isConnected)
      [].forEach.call(document.querySelectorAll(".vidbox"), function (box) {
        if (box._start && box.isConnected) box._start();
      });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
