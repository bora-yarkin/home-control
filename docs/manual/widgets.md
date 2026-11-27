# Widgets

*Add item → Widgets*. A widget has settings of its own (tap it in the editor) and some come in several sizes (a section is four columns wide).

| Widget | Shows |
|---|---|
| Attention | What needs a look; hides when nothing does. |
| At a glance | Counts of what is on, open or running; choose and order the tiles, add your own. |
| Rooms | Links to every page. |
| On now | What is running now and where. |
| Climate overview | Temperature and humidity of the rooms. |
| Pinned | Up to twelve favourite devices and scenes. |
| Linked section | A section of another page, edited once and shown in several places. |
| Security, Cameras, Energy and usage | Overviews built from your entities. Energy can show cost from a price per kWh. |
| Note | Free text. |
| Chart | History of up to four sensors, 6 h to 30 days. |
| Clock and weather, Now playing, Camera snapshot, Vacuum | Home-screen style tiles for one thing each. |
| Power ring, Sensor sparkline | One sensor against a maximum, or with its recent curve. |
| Agenda, To-do | A calendar's next events; a to-do list you can tick and add to. |
| Folder | Up to twelve devices and scenes behind one tile. |
| Stack | Up to five widgets in one place; swipe between them. |
| Popup | A button that opens a popup of your own: devices as their usual rows, and other widgets. See below. |
| Lights master | See [lights and scenes](lights-and-scenes.md). (The Remote master is added under *Remote*: [TVs and remotes](media-and-remotes.md).) |

## Popup

Add the widget, give it a name and an icon, then *Add to the popup* in its settings: the same list as a page's *Add item* (devices, switches, scenes, remotes, appliances, widgets, also another popup). A device can be on the page and in a popup. Tap one in the list to change or remove it, drag to reorder. The row on the page says how many items it holds and how many are on. Removing the widget removes what was in it.

## Action button

Runs any Home Assistant action: choose it, what it acts on (entities or areas), its details or JSON data, and whether it asks first. The same *A Home Assistant action* choice is offered wherever a button's action is chosen: remote buttons, picture areas, and tap, hold and double tap.

Commands that run programs, restart or stop the system or remove data can be run only by administrators and always ask first. So do unlocking, disarming, installing updates and removing or reloading. Your access rules apply to every entity an action names; for users who are not administrators, actions aimed at a floor, a label or everything are refused.

## Template text

A row whose text Home Assistant works out from a template, for example `{{ states('sensor.name') }} W`. It updates when what it reads changes.
