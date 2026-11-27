# Widgets

Add item → Widgets. Tap a widget in the editor to set it up. Some come in several sizes, and a section is four columns wide.

| Widget | Shows |
|---|---|
| Attention | Anything that needs a look |
| At a glance | How many things are on, open or running |
| Rooms | Links to every page |
| On now | What's running and where |
| Climate overview | Temperature and humidity by room |
| Pinned | Up to twelve favourites |
| Linked section | A section from another page, edited in one place |
| Security, Cameras, Energy and usage | Overviews built from your entities. Energy can show cost |
| Note | Your own text |
| Chart | History of up to four sensors, 6 hours to 30 days |
| Clock and weather, Now playing, Camera snapshot, Vacuum | Big tiles for one thing each |
| Power ring, Sensor sparkline | One sensor against a maximum, or with its recent curve |
| Agenda, To-do | Next calendar events, and a list you can tick off and add to |
| Folder | Up to twelve devices and scenes behind one tile |
| Stack | Up to five widgets you swipe between |
| Popup | A button that opens your own popup |
| Action button | A button that runs any Home Assistant action |
| Template text | Text from a Home Assistant template |
| Lights master | See [lights and scenes](lights-and-scenes.md) |

## Popup

Name the widget, then use Add to the popup in its settings. It offers the same things as a page, including other popups. Tap an item in the list to change or remove it, and drag to reorder. The row shows how many items it holds and how many are on. Removing the widget removes its contents.

## Action button

Choose the action, what it acts on and any details (there's a JSON box for the rest), and whether it should ask first. You'll find the same choice anywhere a button's action is picked, including remotes and tap, hold and double tap.

Actions that run programs, restart or stop the system, or delete data can only be run by administrators, and always ask. Unlocking, disarming, installing updates, removing and reloading always ask too. Your access rules apply to any entity the action names. Users who aren't administrators can't run actions aimed at a floor, a label or everything.

## Template text

Shows whatever a Home Assistant template returns, for example `{{ states('sensor.name') }} W`, and updates on its own.
