/* The Dashboard application. This file only loads the files that make it up.

 All of them share one global scope and run in the order of `files` in version.json, which the panel hands over as APP_FILES. While
 it loads, a file may use what the files before it define; what the files after it define is only for code that runs later (clicks, timers, refresh).
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

/* The panel has requested every file already and hands over their list. The panel itself reaches a browser only when Home Assistant has been restarted (or its cached copy has expired), so an older panel may still be here: it gives no list, and it is read from version.json instead. Remove this once Home Assistant has been restarted on the version with the new panel. */
function appFileList() {
  if (window.APP_FILES) return Promise.resolve(window.APP_FILES);
  return fetch(new URL("version.json?t=" + Date.now(), APPSRC), { cache: "no-store" })
    .then(function (res) {
      return res.json();
    })
    .then(function (release) {
      return release.files;
    });
}

appFileList().then(
  function (files) {
    files.forEach(function (name) {
      var el = document.createElement("script");
      el.src = appFile(name);
      /* async = false: the files run one after the other in this order. */
      el.async = false;
      el.onerror = function () {
        console.error("[dashboard] could not load " + name);
        APP_FAILED.push(name);
        showLoadFailure();
      };
      document.body.appendChild(el);
    });
  },
  function (e) {
    console.error("[dashboard] could not read the list of files", e);
    APP_FAILED.push("version.json");
    showLoadFailure();
  }
);
