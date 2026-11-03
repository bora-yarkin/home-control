# Roadmap: appliances, remotes, scene engine and robustness (from 2026-11-03)

Status words: `planned`, `in_progress`, `blocked`, `complete`. Decisions are in `docs/decisions.md`. Every package keeps the existing behaviour and saved layouts working, passes `node --test tests/frontend` and `pytest`, and is checked in the sealed test copy of the dashboard before it is deployed.

## P0 Robustness (no new UI)
- P0-1 complete: a "connection lost" notice that stays after Home Assistant reports the connection back is cleared after 3 s; the connection handlers follow a new connection object. AC: the notice clears when Home Assistant reports connected for 3 s.
- P0-2 complete: a battery that only says low (a binary sensor with device class battery) can be tracked, shown as Low/OK, counted in the batteries tile and watched by the low-battery notification (a state trigger on `on`, next to the percentage trigger). AC: tests in `tests/frontend/notifications.test.mjs`.
- P0-3 complete (audited): unavailable and unknown states read "Offline" (`entVal`) and sliders show no value; no row shows a last value as live.
- P0-3 was: unavailable and unknown states are shown as such, never as the last value (audit of rows and popups).
- P0-4 complete (v218): `input_datetime` is a time row (hour and minute, date optional), not a sensor.
- P0-5 complete (v218): the lights master and the section brightness slider keep "the lights that are on" and gain an option "the whole room" (off by default).
- P0-6 partly: the new profiles use no names at all (D-1); the older wizard's name hints (`kinds.js`) are unchanged and still need a rewrite: mode and role discovery uses device class, unit, domain and options, not English names, and every guess can be changed by hand.

## P1 Devices that need a profile, brand independent
Each is a device kind of the page editor's "Add device" list. Its popup is built from slots, each bound with an entity selector; a slot that is not bound, or whose entity cannot do it, is not shown. Only the platforms' own data tells what a control is (domain, device class, unit, options, supported features).
- P1-1 complete: appliance (oven, washer, dryer, dishwasher and any other): program, options, temperature, duration, start, pause or stop, door, progress, remaining time, remote-start permission, free extra rows. Start is disabled with a reason while a bound remote-start permission is off.
- P1-2 partly (v220: map, room buttons, modes, care values; `vacuum.clean_area` by Home Assistant area is not used yet): vacuum profile for what the `vacuum` domain does not carry: map picture (a camera or image entity, or a picture of the user's own), room buttons or a room select, modes, maintenance values, cleaning history.
- P1-3 complete: intercom and camera profile: live view, receive audio, push to talk where the camera supports it, answer and reject on a call, unlock tied to a chosen lock only.
- P1-4 complete: a light with scenes from another entity (a select) next to its normal control (roles on the existing linked entities).
- P1-5 complete: devices with no area of Home Assistant are listed on the new-devices page and placed in a room by the user (saved with the dashboard layout only).

## P2 Remotes
- P2-1 complete (grid, frontend v217): a remote kind: a grid of buttons (3 columns by default, adjustable per remote; a button can take 2 columns), each bound to an entity (script, button, input button, scene, switch) with an icon and an optional label; created in the page editor with a "+" tile.
- P2-2 complete: an image remote: a picture (uploaded, or an existing `/local/` file) with touch areas drawn over it (rounded rectangle or ellipse), each bound to an entity. An error is shown only when a command fails.

## P3 Scenes with other brands
- P3-1 complete (not published: the repository could not be created without the owner's permission): scene engine brought to Home Assistant 2026.10, tests and docs updated, published as its own repository.
- P3-2 complete: scene engine plays scenes for any light and takes Hue's own abilities from Hue Plus (an expansion pack: nothing Hue-specific lives in scene engine); with both installed Hue lights are played by Hue Plus on a shared clock, so a mixed scene moves as one.
- P3-3 complete (v222): the dashboard shows one list of scenes and sends a scene to whoever owns it.

## P4 Notifications and checks
- P4-1 complete: a generic "when this entity reaches this state" notification rule (finished, needs attention, call).
- P4-2 partly: the checklist is in `docs/mobile-checklist.md`; Spotify handoff not started: mobile acceptance checklist for iOS and Android; the Spotify source list and device handoff.
