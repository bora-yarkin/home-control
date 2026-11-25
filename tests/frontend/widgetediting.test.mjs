// SPDX-License-Identifier: GPL-3.0-or-later
// Editing in the widgets, done in a real browser on the Showcase page: adding, checking off and removing items of the to-do list, adding an event to the agenda, writing a note where it is.
// It needs Chrome (see helpers/browser.mjs). Run: node --test tests/frontend
import assert from "node:assert/strict";
import test from "node:test";
import { findChrome, launch, open, serve, sleep } from "./helpers/browser.mjs";

const chrome = findChrome();
const skip = !chrome && !process.env.CI ? "no Chrome found (set CHROME_PATH)" : false;

/* Finds a widget of the Showcase page by the name it was given there and returns code for what is in it. */
const IN = (widget) => `(() => { const sec = [...document.querySelectorAll(".wl, .notec")].find((e) => (e.querySelector(".sep") || e).textContent.trim().toLowerCase().replace("-", "").startsWith(${JSON.stringify(widget)})); return sec; })()`;

async function session(run) {
  const server = await serve();
  const browser = await launch(chrome);
  try {
    await open(browser, `http://127.0.0.1:${server.address().port}`, 420, 1000);
    const ev = (code) => browser.evaluate(code);
    await ev(`go("showcase")`);
    for (let i = 0; i < 100 && !(await ev(`!!document.querySelector(".wl .pill")`)); i++) await sleep(200);
    /* the text of the rows of a list widget */
    const rows = (widget) => ev(`[...(${IN(widget)}).querySelectorAll(".pill")].map((p) => ({ name: p.querySelector(".nm").textContent, checked: p.classList.contains("checked") }))`);
    const click = (widget, name) => ev(`[...(${IN(widget)}).querySelectorAll(".pill")].find((p) => p.querySelector(".nm").textContent === ${JSON.stringify(name)}).click()`);
    /* types into the sheet that is open and presses its first button */
    const submit = (fields, button = 0) =>
      ev(`(async () => { const sheet = document.querySelector(".asheet.in"); for (const [sel, v] of ${JSON.stringify(fields)}) { const i = sheet.querySelector(sel); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); } sheet.querySelectorAll(".as-b")[${button}].click(); })()`);
    await run({ ev, rows, click, submit, sleep });
  } finally {
    browser.close();
    server.closeAllConnections();
    server.close();
  }
}

test("the to-do list adds an item, checks one off and puts it back, and removes one", { timeout: 120000, skip }, async () => {
  assert.ok(chrome, "CI needs Chrome or Chromium");
  await session(async ({ rows, click, submit, ev }) => {
    await sleep(1500);
    let list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Milk" && !r.checked), "the open items are listed");
    assert.ok(list.some((r) => r.name === "Add item"), "and there is a row to add one");

    await click("todo", "Add item");
    await sleep(700);
    await submit([["textarea", "Eggs"]]);
    await sleep(1500);
    list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Eggs" && !r.checked), "the new item is on the list");

    await click("todo", "Milk");
    await sleep(1500);
    list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Milk" && r.checked), "a checked item stays, struck as done");
    assert.ok(list.findIndex((r) => r.name === "Milk") > list.findIndex((r) => r.name === "Eggs"), "after the open ones");

    await click("todo", "Milk");
    await sleep(1500);
    list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Milk" && !r.checked), "tapping it again puts it back");

    await ev(`[...(${IN("todo")}).querySelectorAll(".pill")].find((p) => p.querySelector(".nm").textContent === "Bread").querySelector(".pact").click()`);
    await sleep(1500);
    list = await rows("todo");
    assert.equal(list.some((r) => r.name === "Bread"), false, "the trash takes an item off the list");
  });
});

test("the agenda adds an event with a title and a day, and an empty title adds nothing", { timeout: 120000, skip }, async () => {
  assert.ok(chrome, "CI needs Chrome or Chromium");
  await session(async ({ rows, click, submit, ev }) => {
    await sleep(1500);
    const before = (await rows("agenda")).map((r) => r.name);
    assert.ok(before.includes("Dentist") && before.includes("Add event"));

    await click("agenda", "Add event");
    await sleep(700);
    await submit([["input[type=date]", "2031-03-04"]], 1);
    await sleep(600);
    assert.ok(await ev(`!!document.querySelector(".asheet.in")`), "without a title the sheet stays open and nothing is added");
    await submit([["input[type=text]", "Team lunch"], ["input[type=date]", new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10)]], 1);
    await sleep(1800);
    const after = (await rows("agenda")).map((r) => r.name);
    assert.ok(after.includes("Team lunch"), "the new event is listed (" + after.join(", ") + ")");
  });
});

test("a note is written where it is, by an administrator, and what is written is kept", { timeout: 120000, skip }, async () => {
  assert.ok(chrome, "CI needs Chrome or Chromium");
  await session(async ({ ev, submit }) => {
    await sleep(1500);
    await ev(`[...document.querySelectorAll(".notec")].find((n) => n.textContent.includes("A wide note")).click()`);
    await sleep(700);
    await submit([["textarea", "Written on the page"]]);
    await sleep(700);
    assert.ok(await ev(`[...document.querySelectorAll(".notec")].some((n) => n.textContent === "Written on the page")`), "the page shows it");
    assert.ok(await ev(`JSON.stringify(UI.layout.rooms.showcase).includes("Written on the page")`), "and the dashboard keeps it");
  });
});
