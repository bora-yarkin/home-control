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

The harness always builds a page, Showcase (it includes the kit of `?kit=1`; `?showcase=0` leaves it out), with a device of every kind the dashboard supports (`showcase.js`): lights, an air conditioner, fans, an air purifier, TVs, a receiver, a speaker, a camera, a lock, a vacuum with extras, a blind, sensors, a number, a select, buttons, an oven, a washer, a dryer, a dishwasher, another appliance, a remote, scenes and a scene collection. They are put there with the same code the Add popup and the appliance and remote builders use. The page also holds a projector (rows in groups, source and picture mode, and a grid of buttons with a five-way pad and focus and zoom keys), a coffee machine and a fridge made with the appliance builder, and three remotes made the way the builder makes them: a Samsung TV remote as a grid (the dashboard's own Samsung remote rebuilt from the builder's parts: now playing, power and sources, settings, mute and keyboard, touchpad, back, home, play/pause, volume, backlight slider, channels), a common AV receiver remote as a grid and, when its picture is at `tests/frontend/harness/local/avr-remote.png` (not in the repository), as a picture with touch areas. The browser keeps the modules it has seen: after changing `showcase.js` or `mock-hass.js`, reload with the cache cleared.

## Your own home

The harness can show your own dashboard: your devices, rooms, saved layout, scenes, settings and the Hue Plus answers, with every popup as it is on your dashboard. It reads a snapshot of your home, kept on your computer only.

1. Start the receiver: `python3 tests/frontend/harness/snapshot_receiver.py` (it waits for one snapshot on 127.0.0.1 and stops).
2. In the Home Assistant page (signed in as an administrator), run the contents of `export-home.js` in the browser console. It only reads, leaves out what looks secret (access tokens, coordinates, addresses, network names) and posts to your own computer.
3. It is written to `tests/frontend/harness/local/home.json`. That folder is not tracked by git: the file holds your real entity ids and names, so it must never be committed or shared. Run the two steps again to refresh it.

With the file there, the harness opens on your Home page and uses it for everything the real dashboard reads. The invented rooms are added to your own: the Showcase (a device of every kind) and the demo living room. `?demo=0` leaves them out, so the pages are exactly your dashboard's (the invented lights and TVs add to totals such as "lights on" on the Home page); `?home=0` leaves your home out and gives the invented harness alone. Nothing is written back to Home Assistant: saves stay in the page.

Not in the snapshot: pictures and streams (cameras, a vacuum's map), history, and whatever changes after the export, so a value read from a live device (a temperature, a count) can differ a little from the real page at the moment you compare.

## The header sky

`index.html?sky` opens a small control at the bottom left: the weather (sunny, partly cloudy, cloudy, rain, heavy rain, storm, snow, fog, windy, clear night), the height of the sun (-30 to 60 degrees), and a button that sweeps the sun from night to day in about 30 seconds so the dawn and dusk colours can be watched. `?sky=storm@30` (also rain, heavy, snow, fog, wind, night, partly, sunny, cloudy) starts on a storm with the sun 30 degrees up. It sets the pretend weather and sun of the harness only; the sky is on the Home page and on every room without a picture, and *Weather sky* in Appearance turns it off.

## Checking the spacing

`await auditSpacing(["stg-hue", "hue-bridge"])` (in the page's console or the browser tool) opens each popup and measures the gap between its rows. Every
row of a page should sit the same distance from the next; a gap that differs is listed with the two rows around it. Run it over every page a change touches, and
look at the result, not only at a picture: a picture does not show a row that is 10 pixels too close.

The big gap the audit reports in the area editor (between the hint and the next row) is the drawing of the room, which is not a row; the rows around it
are what is measured. A page with one row has nothing to compare, and a page where no row is found is reported as not measured.

## Layout audit and snapshots (`layout.js`)

`await prepareKit()` puts an oven, a washer, a remote, a vacuum with extras and wall photos on the living room page. `standardSurfaces()` lists every page, popup, device tab, dropdown and question worth looking at, and every device of the Showcase page with its settings and popup.

- `await auditSurfaces(standardSurfaces())` opens each and reports radius (round controls round, rows at the row radius), padding, left and right alignment of rows, equal tile heights, cut-off text, overflow and overlapping controls. An empty list for a surface means nothing was found.
- The audit also fails a card (`.pane`) with square corners, a card or control of text with less than 6px of padding, and two controls or cards that touch (less than 4px apart). `{ page, within: "<selector>" }` audits each element that matches it. `tests/frontend/widgetediting.test.mjs` drives the widgets the same way (adding, checking off and removing to-do items, adding an event, writing a note). `tests/frontend/layoutaudit.test.mjs` runs it headlessly in Chrome over the Showcase page's widgets at a phone and a tablet width (`node --test tests/frontend`; set `CHROME_PATH` if Chrome is not found; the test is skipped without a browser, and fails where `CI` is set).
- `await snapshotSurfaces(list)` gives a hash of each surface's markup. Run it before and after a change that should not alter any popup (a refactor); the same hashes mean the popups are the same.

The preview pane does not run transitions while it is hidden, so both measure the finished layout, not the motion. Run long lists in the background and poll: the browser tool stops a script after 45 seconds.
