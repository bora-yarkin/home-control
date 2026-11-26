# Getting started

## Install

Home Assistant Marketplace (2026.11 and later; HACS on older versions). Home Control is not in the default list, so add the repository
`https://github.com/bora-yarkin/home-control` as a custom repository, download it, restart Home Assistant, then add the integration under
*Settings → Devices & services → Add integration → Home Control*. A panel appears in the sidebar. Its address, title, icon and whether only administrators may open
it are the integration's options.

## The first run: guided setup

Give your devices **areas** in Home Assistant first: the setup is built from them. Then open the dashboard as an **administrator** (only administrators can save).

A new dashboard is empty and opens the **guided setup**. Nothing appears on it that you did not choose. Each step comes with a suggestion you can change:

1. **Rooms:** which areas get a page.
2. **Lights:** which lights. A light group is suggested rather than each light in it.
3. **Lights master:** whether rooms get one, from how many lights (2 to 6), and which lights also have a row of their own.
4. **Scenes:** in the room's lights master, in a Scenes section, both, or none. A master shows all of its room's scenes; for a section you pick them. A room without a master has them in a section.
5. **Media players:** which TVs and speakers. A second entry for the same box (a cast player) is not suggested.
6. **Other devices:** climate, fans, blinds, locks, vacuums, cameras, and switches (none suggested).
7. **Temperature and humidity:** shown in each room's header.
8. **Home page:** Attention, At a glance, Rooms, Scenes, and what the header shows.
9. **Check and create.**

*Not now* leaves the dashboard empty; the setup stays under *Settings → Guided setup*. Running it again later replaces your pages (a backup is downloaded first);
rooms keep their names and icons, and scenes, notifications and access rules stay.

## Finding your way

- **The bar at the bottom** switches between Home and your rooms.
- **The header** shows the page's name, the time, what you chose to see there (weather, people, lights on, attention) and its round buttons: *Everything off*
  (on a room page), *Search* and *Settings*.
- **A row** is a device. Tap its icon to switch it, tap the rest of the row to open its popup. Some rows have a slider: drag it.
- **A popup** closes with the ✕ or by tapping outside; the arrow goes back one step.

## Changing the dashboard

*Settings → Editor* opens the page editor on the current page. While it is open, tapping an item opens its settings instead of operating it, items can be dragged by
their handles, and each section has an *Add item* button. Tap *Done* when finished. Changes are saved as you make them; the toast offers **Undo**, and
*Settings → Backup and about → Change log* keeps the last ten changes.

The dashboard is shared by everyone who uses it. What is personal (theme, accent colour, start page) is under *Appearance*.
