# Lights and scenes

## The light popup

Colour, white temperature, effects and brightness, for one light or several. Lights that are made of colour zones (gradient strips) show a marker per zone. Effects
are those the light reports; more can be described in an [effects file](../effects-file.md) and imported under *Settings → Effects*.

## Lights masters

A **lights master** is one row that controls several lights, with their popup together.

- **Where:** *Add item → Lights → Lights master* in a section.
- **Which lights:** *Auto* (the lights of its section) or *Manual* (any lights of any room, each with its own name and icon). A section can hold several.
- **Settings:** name, order of the lights, grouped lights as one tile, which tab the popup opens on, hiding the section's own light rows, what the power button does
  (switch the lights, or run a scene), a sync tab, and moving or copying it to another section.

## Scenes: three kinds

| Kind | What it is | Made from |
|---|---|---|
| **Classic** | Fixed settings of lights, climate, fans, media players and switches. It can also start live scenes. | The *+* of the scenes, or *Save the lights as they are*. |
| **Auto** | Up to ten colours with a brightness each, given to the lights at random wherever it is played (a room or a master); tap again to shuffle. | *New scene → Auto scene*, colour wheel. |
| **Live** | Colours and effects that move across the lights of an **area**, run by Home Control's integration. | *New scene → Live scene*, after making an area. |

Home Assistant's own `scene.` entities (and those of integrations) can be used too.

## Where scenes can live: three ways

1. **In a section**, as rows or tiles: add a single scene, or a **Scene collection** that takes in scenes by page, by Home Assistant area or by tag (and leaves
   out others by tag).
2. **In a lights master**: its popup has a *Scenes* tab. Add scenes with its *+*, choose *where the scenes come from* (rooms, tags, this page), order them by
   dragging, and drop one on another to make a folder.
3. **On the Home page**, in the scenes section or *Pinned*.

Use **tags** to sort scenes: give a scene a tag in its editor, then include or exclude by tag in a collection or master.

## Areas (for live scenes)

*Settings → Areas*: choose a room, make an area, and place its lights where they are (left–right, back–front, floor–ceiling). A live scene moves across that space.
*Identify* flashes a light so you know which is which.

## Saved colours and light defaults

Colours can be saved from the light popup per room. A light can be given the state it should turn on with.

## Everything off

The round power button on a room page switches off what the room's pages hold and stops its live scenes. In the editor it opens the list of what to leave alone.
Home Control also keeps a script per room (`script.home_control_<room>_off`) for automations and voice assistants.
