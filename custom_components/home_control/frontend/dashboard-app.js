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

/* A file that did not load leaves the application half there, so it is not started (app/main.js checks APP_FAILED). A page that only lost a request
 on a weak connection loads again by itself, three times, each a little later (the count is kept for this tab and cleared when the page is drawn);
 after that the page says what is missing and offers to try again. */
var LOAD_RETRY_MS = [1000, 3000, 8000],
  LOAD_RETRY_KEY = "dashboard_load_retries",
  loadRetryScheduled = false;

function clearLoadRetries() {
  try {
    sessionStorage.removeItem(LOAD_RETRY_KEY);
  } catch (e) {}
}

/* True when a reload is now on its way. Without session storage there is no count to keep, so there is no automatic try. */
function scheduleLoadRetry() {
  if (loadRetryScheduled) return true;
  var tried;
  try {
    tried = Number(sessionStorage.getItem(LOAD_RETRY_KEY) || 0);
    if (!(tried < LOAD_RETRY_MS.length)) return false;
    sessionStorage.setItem(LOAD_RETRY_KEY, String(tried + 1));
  } catch (e) {
    return false;
  }
  loadRetryScheduled = true;
  setTimeout(function () {
    location.reload();
  }, LOAD_RETRY_MS[tried]);
  return true;
}

function showLoadFailure() {
  var body = document.getElementById("body");
  if (!body) return;
  body.textContent = "";
  var box = document.createElement("div");
  box.className = "sec-h";
  if (scheduleLoadRetry()) {
    box.textContent = _T("load_retrying");
    body.appendChild(box);
    return;
  }
  box.textContent = _T("load_failed", { files: APP_FAILED.join(", ") });
  var again = document.createElement("button");
  again.type = "button";
  again.textContent = _T("try_again");
  again.onclick = function () {
    clearLoadRetries();
    location.reload();
  };
  body.appendChild(box);
  body.appendChild(again);
}

if (!Array.isArray(window.APP_FILES)) {
  console.error("[dashboard] the panel gave no list of files");
  APP_FAILED.push(_T("the_list_of_files"));
  showLoadFailure();
} else
  window.APP_FILES.forEach(function (name) {
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
