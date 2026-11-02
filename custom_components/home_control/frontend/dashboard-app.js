/* The Dashboard application. This file only loads the files that make it up.

 All of them share one global scope and run in the order listed in APP_FILES below. While it loads, a file may use what the
 files before it define; what the files after it define is only for code that runs later (clicks, timers, refresh).
 app/main.js is last and starts the application.

 integrations.js   everything specific to one integration (xiaomi_miot, samsungtv_smart, ...)
 app/*.js          the application; the first line of each file says what it holds */

/* Files next to this one are requested with the same ?v= as this file, so a new version number refreshes all of them. */
var APPSRC = document.currentScript ? document.currentScript.src : location.href;
function appFile(name) {
  var u = new URL(name, APPSRC);
  u.search = new URL(APPSRC).search;
  return u.href;
}

/* The loader calls refresh() as soon as this file has run; the real one arrives with app/main.js. */
window.refresh = function () {};

var APP_FILES = [
  "integrations.js",
  "app/strings.js",
  "app/core.js",
  "app/icons.js",
  "app/widgets.js",
  "app/lights.js",
  "app/lightpanel.js",
  "app/hsync.js",
  "app/hsbox.js",
  "app/media.js",
  "app/climate.js",
  "app/vacuum.js",
  "app/camera.js",
  "app/advanced.js",
  "app/kinds.js",
  "app/popups.js",
  "app/model.js",
  "app/devices.js",
  "app/status.js",
  "app/sections.js",
  "app/rules.js",
  "app/editor.js",
  "app/pages.js",
  "app/header.js",
  "app/glance.js",
  "app/pins.js",
  "app/appearance.js",
  "app/search.js",
  "app/store.js",
  "app/scenes.js",
  "app/livescenes.js",
  "app/areas.js",
  "app/wall.js",
  "app/backups.js",
  "app/security.js",
  "app/conditions.js",
  "app/access.js",
  "app/settings.js",
  "app/hueplus.js",
  "app/lighteditor.js",
  "app/scenenew.js",
  "app/staticmaker.js",
  "app/vlights.js",
  "app/livemaker.js",
  "app/history.js",
  "app/notifications.js",
  "app/manage.js",
  "app/main.js",
];

/* async = false: the files download together but run one after the other in this order. */
var APP_FAILED = [];

/* A file that did not load leaves the application half there, so it is not started (app/main.js checks APP_FAILED); the page says what is missing and offers to try again. */
function showLoadFailure() {
  var body = document.getElementById("body");
  if (!body) return;
  body.textContent = "";
  var box = document.createElement("div");
  box.className = "sec-h";
  box.textContent = "The dashboard could not load: " + APP_FAILED.join(", ") + ".";
  var again = document.createElement("button");
  again.type = "button";
  again.textContent = "Try again";
  again.onclick = function () {
    location.reload();
  };
  body.appendChild(box);
  body.appendChild(again);
}

APP_FILES.forEach(function (name) {
  var el = document.createElement("script");
  el.src = appFile(name);
  el.async = false;
  el.onerror = function () {
    console.error("[dashboard] could not load " + name);
    APP_FAILED.push(name);
    showLoadFailure();
  };
  document.body.appendChild(el);
});
