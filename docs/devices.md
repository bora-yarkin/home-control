# Setting up devices

A device on the dashboard is one main entity (a media player, a camera). Some devices have other entities that belong to them:
a TV has a remote, a camera has pan/tilt buttons, presets and a privacy switch. `app/kinds.js` handles them.

- **Adding.** When a TV or a camera is added, the dashboard links what Home Assistant says belongs to it (entities on the same
  device) and opens the setup page. Anything it did not find is chosen from a searchable list, with the entities on the same
  device first.
- **Later.** *Settings of the device → Set up this device* opens the same page. The links are kept with the device (`links`).
- **Advanced settings** of a device list the entities of its Home Assistant device and the linked ones, so a linked entity from
  another device shows there too.
- **TVs.** The page says whether the TV reports what the full remote needs (power, volume, sources) or only a basic remote is
  possible. A Samsung TV on the core integration is told that Samsung TV Smart (HACS) gives more.
- **New kinds.** Add an entry to `DEVSETUP` in `kinds.js` (slots with entity types, a name pattern and a hint) and to
  `devSetupKind`. Nothing else changes.
