# Dashboard harness

Runs the real panel against a pretend Home Assistant, so a change can be looked at and clicked without touching a real one.

```bash
python3 -m http.server 8765        # from the root of this repository
# then open http://localhost:8765/tests/frontend/harness/index.html
```

Sealed: `mock-hass.js` answers every websocket command from invented data (fake names, fake ids, no personal data) and keeps saved
dashboard settings in memory only. Every service call is recorded in `window.__calls` and changes nothing except the few states
`mock-hass.js` updates itself, so a click can be checked afterwards (`__calls.map(c => c.domain + "." + c.service)`).

Query options: `?sync=0` leaves out the Hue Plus entities, `?box=0` the sync box, `?user=guest` makes the user a non-administrator.
