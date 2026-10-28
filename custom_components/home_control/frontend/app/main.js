/* Start-up: the refresh loop and starting the app. */

function refresh() {
  if (!H()) return;
  a11yScan();
  dockState();
  relayout();
  lpTrackTick();
  /* A drag that never ended must not freeze the page for good. */
  if (dragging > 0) {
    if (EDRAG || Date.now() - DRAGAT < 20000) return;
    dragging = 0;
  }
  ruleTick();
  LIVE.forEach(function (f) {
    try {
      f();
    } catch (e) {}
  });
  SLIVE.forEach(function (f) {
    try {
      f();
    } catch (e) {}
  });
}

function start() {
  if (APP_FAILED.length) return;
  if (!H()) {
    document.getElementById("body").innerHTML =
      "<div class='sec-h'>" + _T("open_from_dashboard") + "</div>";
    return;
  }
  initLG();
  initTheme();
  applyUI();
  startViewApply();
  initStore();
  render();
  buildDock();
  initSearchBtn();
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
  fitSab();
  setTimeout(fitSab, 600);
  setTimeout(fitSab, 1800);
  window.addEventListener("resize", fitSab);
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
  setInterval(hdrLive, 2000);
  refresh();
  setInterval(connCheck, 2000);
  connCheck();
  wallBoot();
  newDevBoot();
  window.addEventListener("resize", function () {
    movePill();
    relayout();
  });
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
