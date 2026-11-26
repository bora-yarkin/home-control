# Getting started

## Install

Home Assistant Marketplace (2026.11 and later; HACS on older versions). Home Control is not in the default list, so add the repository
`https://github.com/bora-yarkin/home-control` as a custom repository, download it, restart Home Assistant, then add the integration under
*Settings → Devices & services → Add integration → Home Control*. A panel appears in the sidebar. Its address, title, icon and whether only administrators may open
it are the integration's options.

## The first run

The first layout is made from your Home Assistant: a room page for each **area**, with that area's lights, media players, climate, fans, switches, vacuums and
cameras in sections, and its temperature and humidity as status tiles. So give your devices areas in Home Assistant first; it saves work. Everything can be changed.

Open it as an **administrator** the first time: only administrators can save the dashboard.

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
