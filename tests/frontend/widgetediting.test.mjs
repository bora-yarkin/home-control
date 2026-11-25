// SPDX-License-Identifier: GPL-3.0-or-later
// Editing in the widgets, done in a real browser on the Showcase page: adding, checking off and removing items of the to-do list, adding an event to the agenda, writing a note where it is.
// It needs Chrome (see helpers/browser.mjs). Run: node --test tests/frontend
import assert from "node:assert/strict";
import test from "node:test";
import { findChrome, launch, open, serve, sleep } from "./helpers/browser.mjs";

const chrome = findChrome();
const skip = !chrome && !process.env.CI ? "no Chrome found (set CHROME_PATH)" : false;

/* A widget that is a card of the Showcase page, found by the name in its header. */
const CARD = (widget) => `[...document.querySelectorAll(".wcard")].find((c) => c.querySelector(".wh b").textContent.trim().toLowerCase().replace("-", "").startsWith(${JSON.stringify(widget)}))`;

async function session(run) {
  const server = await serve();
  const browser = await launch(chrome);
  try {
    await open(browser, `http://127.0.0.1:${server.address().port}`, 420, 1000);
    const ev = (code) => browser.evaluate(code);
    await ev(`go("showcase")`);
    for (let i = 0; i < 100 && !(await ev(`!!document.querySelector(".wcard .wr")`)); i++) await sleep(200);
    /* the lines of a card: their words, and whether they are done */
    const rows = (widget) => ev(`[...(${CARD(widget)}).querySelectorAll(".wr")].map((r) => ({ name: r.querySelector(".nm").textContent, done: r.classList.contains("done") }))`);
    const line = (widget, name) => `[...(${CARD(widget)}).querySelectorAll(".wr")].find((r) => r.querySelector(".nm").textContent === ${JSON.stringify(name)})`;
    const check = (widget, name) => ev(`${line(widget, name)}.querySelector(".ck2").click()`);
    const pen = (widget, name) => ev(`${line(widget, name)}.querySelector(".wedit").click()`);
    const add = (widget) => ev(`(${CARD(widget)}).querySelector(".wadd").click()`);
    /* types into the sheet that is open and presses one of its buttons */
    const submit = (fields, button = 0) =>
      ev(`(async () => { const sheet = document.querySelector(".asheet.in"); for (const [sel, v] of ${JSON.stringify(fields)}) { const i = sheet.querySelector(sel); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); } sheet.querySelectorAll(".as-b")[${button}].click(); })()`);
    await run({ ev, rows, check, pen, add, submit, sleep });
  } finally {
    browser.close();
    server.closeAllConnections();
    server.close();
  }
}

test("the to-do list adds an item, checks one off and puts it back, changes the words of one, and removes one from its edit sheet", { timeout: 120000, skip }, async () => {
  assert.ok(chrome, "CI needs Chrome or Chromium");
  await session(async ({ rows, check, pen, add, submit, ev }) => {
    await sleep(1500);
    let list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Milk" && !r.done), "the open items are listed");
    assert.equal(await ev(`(${CARD("todo")}).querySelectorAll(".pact, .wr [data-i=trash]").length`), 0, "no trash button sits on the rows");
    assert.equal(await ev(`(${CARD("todo")}).querySelectorAll(".wr .wedit").length`), list.length, "each row has its pen");

    await add("todo");
    await sleep(700);
    await submit([["textarea", "Eggs"]]);
    await sleep(1500);
    list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Eggs" && !r.done), "the new item is on the list");

    await check("todo", "Milk");
    await sleep(1500);
    list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Milk" && r.done), "a checked item stays, struck as done");
    assert.ok(list.findIndex((r) => r.name === "Milk") > list.findIndex((r) => r.name === "Eggs"), "after the open ones");
    await check("todo", "Milk");
    await sleep(1500);
    list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Milk" && !r.done), "tapping the circle again puts it back");

    await pen("todo", "Coffee beans");
    await sleep(700);
    assert.equal(await ev(`document.querySelector(".asheet.in textarea").value`), "Coffee beans", "the sheet has the words of the item");
    await submit([["textarea", "Coffee"]], 0);
    await sleep(1500);
    list = await rows("todo");
    assert.ok(list.some((r) => r.name === "Coffee") && !list.some((r) => r.name === "Coffee beans"), "the words are changed");

    await pen("todo", "Bread");
    await sleep(700);
    assert.ok(await ev(`!!document.querySelector(".asheet.in .as-b.danger")`), "taking it off the list is in the sheet, in red");
    await ev(`document.querySelector(".asheet.in .as-b.danger").click()`);
    await sleep(1500);
    list = await rows("todo");
    assert.equal(list.some((r) => r.name === "Bread"), false, "the item is off the list");
  });
});

test("the agenda adds an event with a title and a day, and an empty title adds nothing", { timeout: 120000, skip }, async () => {
  assert.ok(chrome, "CI needs Chrome or Chromium");
  await session(async ({ rows, add, submit, ev }) => {
    await sleep(1500);
    const before = (await rows("agenda")).map((r) => r.name);
    assert.ok(before.includes("Dentist"));
    assert.equal(await ev(`(${CARD("agenda")}).querySelectorAll(".wr .wedit, .wr .pact").length`), 0, "events cannot be changed from here, so no button says they can");

    await add("agenda");
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
