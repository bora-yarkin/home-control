# Dashboard harness

Runs the real panel against a pretend Home Assistant, so a change can be looked at and clicked without touching a real one.

```bash
python3 tests/frontend/harness/serve.py    # from the root of this repository
# then open http://localhost:8765/tests/frontend/harness/index.html
```

Sealed: `mock-hass.js` answers every websocket command from invented data (fake names, fake ids, no personal data) and keeps saved
dashboard settings in memory only. Every service call is recorded in `window.__calls` and changes nothing except the few states
`mock-hass.js` updates itself, so a click can be checked afterwards (`__calls.map(c => c.domain + "." + c.service)`).

Query options: `?sync=0` leaves out the Hue Plus entities, `?box=0` the sync box, `?user=guest` makes the user a non-administrator.

## Checking the spacing

`await auditSpacing(["stg-hue", "hue-bridge"])` (in the page's console or the browser tool) opens each popup and measures the gap between its rows. Every
row of a page should sit the same distance from the next; a gap that differs is listed with the two rows around it. Run it over every page a change touches, and
look at the result, not only at a picture: a picture does not show a row that is 10 pixels too close.

The big gap the audit reports in the area editor (between the hint and the next row) is the drawing of the room, which is not a row; the rows around it
are what is measured. A page with one row has nothing to compare, and a page where no row is found is reported as not measured.
