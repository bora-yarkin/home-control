/* Measures the spacing of a popup page: the vertical gap between each row and the next. Every row of one page should be the same distance
   from the next (the app's own rows are), so a gap that differs from the page's usual one is reported with the two rows it lies between.
   Looking at a picture does not find this; measuring does. Use from the browser:
     await auditSpacing(["stg-hue", "hue-bridge", ...])  ->  { page: { gap: 10, rows: 7, odd: ["Mode → Intensity: 0px"] } } */
const ROWS = ".pill,.sel,.sqw,.erow,.seg,.grid2,.grid3,.gridl,.rrow,.glance,.notec,.chartc,.subsec,.hs,.sec,.hint";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function label(el) {
  return (el.innerText || el.className || "row").split("\n")[0].slice(0, 28);
}

function pageRows() {
  const sheets = document.querySelectorAll(".sheet.in");
  const root = sheets.length ? sheets[sheets.length - 1] : null;
  if (!root) return [];
  const all = [...root.querySelectorAll(ROWS)].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.height > 8 && box.width > 100 && getComputedStyle(el).display !== "none" && !el.closest(".sh-h");
  });
  // Only the outermost rows: a control inside a row is not a row of the page.
  return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

/* `tweak(key)` may change the open page before it is measured (used to check that a spacing fault would be found). */
export async function auditSpacing(keys, tweak) {
  const report = {};
  for (const key of keys) {
    closeSheet();
    await sleep(500);
    showPopup(key, true);
    await sleep(1800);
    if (tweak) {
      tweak(key);
      await sleep(100);
    }
    const rows = pageRows().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
      gaps.push({
        between: `${label(rows[i - 1])} → ${label(rows[i])}`,
        px: Math.round(rows[i].getBoundingClientRect().top - rows[i - 1].getBoundingClientRect().bottom),
      });
    }
    // A page that shows nothing measured is a failed check, not a clean one.
    const unmeasured = rows.length === 0 ? ["no rows found: nothing was measured"] : [];
    const counts = {};
    gaps.forEach((g) => (counts[g.px] = (counts[g.px] || 0) + 1));
    // The app's own gap between rows (--sp) is what a row should have; if the page has none of it, the most common gap stands in.
    const standard = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sp"));
    const usual = standard || Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    report[key] = {
      gap: usual === undefined ? null : Number(usual),
      rows: rows.length,
      odd: [...unmeasured, ...gaps.filter((g) => Math.abs(g.px - Number(usual)) > 1).map((g) => `${g.between}: ${g.px}px`)],
    };
  }
  closeSheet();
  return report;
}
