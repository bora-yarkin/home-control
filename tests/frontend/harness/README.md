# Dashboard harness

Runs the real panel against a pretend Home Assistant, so a change can be looked at and clicked without touching a real one.

```bash
python3 tests/frontend/harness/serve.py    # from the root of this repository
# then open http://localhost:8765/tests/frontend/harness/index.html
```

Sealed: `mock-hass.js` answers every websocket command from invented data (fake names, fake ids, no personal data) and keeps saved
dashboard settings in memory only. Every service call is recorded in `window.__calls` and changes nothing except the few states
`mock-hass.js` updates itself, so a click can be checked afterwards (`__calls.map(c => c.domain + "." + c.service)`).

Query options: `?sync=0` leaves out the Hue Plus entities, `?box=0` the sync box, `?user=guest` makes the user a non-administrator, `?latency=150` delays every websocket answer by 150 ms (to see a slow start; the second visit draws from the copies kept on the device, see *Copies on this device* in `custom_components/home_control/frontend/README.md`).
`?kit=1` adds invented household devices for the kinds made from slots: an oven, a washer, a dryer and a dishwasher (named and typed the way Home Connect does), a vacuum with a map camera, room buttons and upkeep values, and scripts for a remote (`kit.js`); a press on the oven's Start and Stop and on the vacuum's buttons changes their states. `?door=ringing`, `?door=call`, `?door=security-ringing` and `?door=security-call` open the door call popup (a door station with a camera picture, or a guard desk with only the audio-wave picture and nothing to unlock). The pictures (`door-cam.svg`, `audio-wave.svg`) are stand-ins.

The harness always builds a page, Showcase (it includes the kit of `?kit=1`; `?showcase=0` leaves it out), with a device of every kind the dashboard supports (`showcase.js`): lights, an air conditioner, fans, an air purifier, TVs, a receiver, a speaker, a camera, a lock, a vacuum with extras, a blind, sensors, a number, a select, buttons, an oven, a washer, a dryer, a dishwasher, another appliance, a remote, scenes and a scene collection. They are put there with the same code the Add popup and the appliance and remote builders use. The page also holds a projector (rows in groups, source and picture mode, and a grid of buttons with a five-way pad and focus and zoom keys), a coffee machine and a fridge made with the appliance builder, and three remotes made the way the builder makes them: a Samsung TV remote as a grid, a common AV receiver remote as a grid and, when its picture is at `tests/frontend/harness/local/avr-remote.png` (not in the repository), as a picture with touch areas. The browser keeps the modules it has seen: after changing `showcase.js` or `mock-hass.js`, reload with the cache cleared.

## Checking the spacing

`await auditSpacing(["stg-hue", "hue-bridge"])` (in the page's console or the browser tool) opens each popup and measures the gap between its rows. Every
row of a page should sit the same distance from the next; a gap that differs is listed with the two rows around it. Run it over every page a change touches, and
look at the result, not only at a picture: a picture does not show a row that is 10 pixels too close.

The big gap the audit reports in the area editor (between the hint and the next row) is the drawing of the room, which is not a row; the rows around it
are what is measured. A page with one row has nothing to compare, and a page where no row is found is reported as not measured.

## Layout audit and snapshots (`layout.js`)

`await prepareKit()` puts an oven, a washer, a remote, a vacuum with extras and wall photos on the living room page. `standardSurfaces()` lists every page, popup, device tab, dropdown and question worth looking at, and every device of the Showcase page with its settings and popup.

- `await auditSurfaces(standardSurfaces())` opens each and reports radius (round controls round, rows at the row radius), padding, left and right alignment of rows, equal tile heights, cut-off text, overflow and overlapping controls. An empty list for a surface means nothing was found.
- `await snapshotSurfaces(list)` gives a hash of each surface's markup. Run it before and after a change that should not alter any popup (a refactor); the same hashes mean the popups are the same.

The preview pane does not run transitions while it is hidden, so both measure the finished layout, not the motion. Run long lists in the background and poll: the browser tool stops a script after 45 seconds.
