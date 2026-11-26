# The robot vacuum appliance

A custom appliance of type **Robot vacuum**: a page with a live map, readings, rooms, cleaning settings, Start, Pause, Resume and Stop. It knows no brand. What is
particular to a robot (how it is told to clean a room, how it reports its no-go zones) is data of the appliance, so any vacuum Home Assistant can control can be set up.

Three ways to set one up, which can be mixed:

1. **The editor.** Page editor → the appliance → its set-up. *Fill from the vacuum* finds the battery, map, position and mode selects of the vacuum's device.
2. **A file.** *Set-up file* at the end of the set-up saves the whole set-up as a `.json` file, to edit, keep or take to another home, and loads one.
3. **An AI.** Give it this document and your robot's details (below), ask for the `.json` file, and load it under *Set-up file*.

Only administrators can change a set-up.

> Start runs the actions of the set-up, and the zones source is run each time the map opens. They are ordinary Home Assistant actions and can do anything an action can.
> Read a file someone else wrote, or an AI wrote, before loading it. The dashboard lists the actions it will run and asks before it takes a file.

## What to give an AI, or to look up yourself

- The entity ids: the `vacuum.` entity and, if they exist, the battery sensor, the map (an `image.` or `camera.` entity), the robot position sensor, and the
  `select.` entities for mode, suction and water. *Developer tools → States* lists them.
- The attributes of the map entity (copy them from *Developer tools → States*).
- How a room is cleaned on your robot: the action and its data, as the integration's own documentation gives it. Try it in *Developer tools → Actions* first.
- The room numbers or names the action takes.
- The values of the selects, and, if the action takes numbers instead of words, which number means which word.
- For no-go zones: an action that returns them and a sample of its answer, if the map does not carry them.

Do not publish a file with your own entity ids and room names if you consider them private.

## The format

```json
{
  "format": "home-control.vacuum",
  "version": 1,
  "entities": { "vacuum": "vacuum.robot" },
  "readings": [],
  "rooms": [],
  "settings": [],
  "start": [],
  "zones": null,
  "room_settings": true,
  "status_tile": true,
  "map": {}
}
```

`format` and `version` are required. Of the other parts, one that is **left out stays as it is**; one that is given replaces what was there (an empty list empties it).
Inside `map`, a setting left out stays as it is. Whatever is not accepted is dropped, and the dashboard names it (for example `rooms.2.value`). Code fences around the
JSON, as an AI often writes, are ignored.

### `entities`

| Key | Entity domain | Used for |
|---|---|---|
| `vacuum` | `vacuum` | State, Pause, Resume, Stop, fan speed, Advanced settings, and `$vacuum`. |
| `battery` | `sensor` | The Battery tile. Without it, the vacuum's own `battery_level`. |
| `state` | `sensor`, `binary_sensor`, `select`, `input_select` | A better status text than the vacuum's state. |
| `map` | `image`, `camera` | The map, and the room list when `rooms` is empty. |
| `position` | `sensor` | The robot's `x` and `y` attributes: the trail and the centring. Without it, the map's `vacuum_position`. |
| `no_go`, `walls` | `sensor` | Zones kept in a list attribute. |
| `dock` | `button`, `input_button`, `script` | What *Stop and dock* presses. Without it, `vacuum.stop` then `vacuum.return_to_base`. |

### `readings` (at most 40)

Further entities shown on the appliance.

| Key | Value |
|---|---|
| `entity` | `select`, `input_select`, `number`, `input_number`, `switch`, `input_boolean`, `binary_sensor`, `sensor`, `button`, `input_button` or `script`. Required. |
| `label` | At most 30 characters. |
| `group` | A heading, at most 24 characters. |
| `tile` | `true`: a tile beside Battery at the top (cleaned area, cleaning time). |

### `rooms` (at most 40)

| Key | Value |
|---|---|
| `value` | What the robot knows the room by: letters, digits, `_` or `-`, at most 24. Required. |
| `name` | Shown on the tile, at most 24 characters. |

With no rooms listed, the rooms of the map entity's `rooms` attribute are used.

### `settings` (at most 6)

A choice such as mode, suction, water or number of passes.

| Key | Value |
|---|---|
| `field` | The name used in `$set.<field>`, `$room.<field>` and `$room_settings`: letters, digits and `_`, at most 40. Required. |
| `label` | Shown above the choices, at most 24 characters. |
| `choices` | At most 8 words (letters, digits, space, `&`, `_`, `-`). With a `select`, only its options are shown, in this order; left empty, all of the select's options. |
| `select` | A `select` or `input_select`. The choice for all rooms is set on it before Start. |
| `per_room_only` | `true`: not offered for all rooms, only in a room's own settings (passes). |
| `codes` | `{"choice": number}`: what `$room.<field>` sends in place of the word. |
| `default` | The choice used in `$room.<field>` when none is chosen. |

Choices that are all digits (`"1", "2"`) are drawn as 1×, 2×.

### `start` (at most 4 actions)

Run in order, one second apart, when Start is tapped. With none, or when every one is skipped, Start calls `vacuum.start`.

| Key | Value |
|---|---|
| `action` | `domain.service`. Required. |
| `data` | The action's data, a JSON object of at most 1000 characters. Required. |
| `each_room` | `true`: run once for each room chosen (all rooms when none is chosen). |
| `expect` | At most 4 `{field: value}` of the action's answer, for integrations that call every action a success. If the answer differs, the action is sent once more, then Start fails with the answer's `error`. Only for actions that return an answer. |

#### Words in `data`

| Word | Becomes |
|---|---|
| `$vacuum` | The vacuum's entity id. |
| `$vacuum_device` | Its device id. |
| `$rooms` | The chosen room values as texts (`["3","4"]`), all rooms when none is chosen. |
| `$room_numbers` | The same, a value written as digits as a number (`[3,4]`). |
| `$set.<field>` | The choice for all rooms. |
| `$room_settings` | `{room: {field: choice}}`, only what was chosen. |
| `$room` | (once per room) The room's value. |
| `$room_name` | (once per room) Its name. |
| `$room.<field>` | (once per room) The room's own choice, else the choice for all rooms, else `default`; as its number when `codes` gives one. |

A text that is only a word becomes the value itself (a list stays a list, digits become a number). A word inside a longer text is written into it, lists and objects as
JSON: `"{\"room\":$rooms}"` gives `{"room":[3,4]}`. **An action that has a word with nothing behind it is skipped**: for example `$set.mode` when no mode is chosen.

### `room_settings`

`true` (default): each room tile has a gear, for administrators, with the settings for that room, when an action of `start` sends them (`$room.<field>` or
`$room_settings`). `false`: no gear, and choices saved for rooms are kept but not sent. The choices themselves are saved with the dashboard, not in this text.

### `zones`: where the no-go zones come from

Zones are drawn only when `map.zones` is `true`, and need a map with calibration points (below).

With `"zones": null`, they are read from the `no_go` and `walls` entities (the attribute `no_go_areas` / `virtual_walls`, else the first list attribute), else from those
two attributes of the map entity.

Otherwise an action that **returns a response** is called each time the map opens:

```json
{ "action": "script.vacuum_zones", "data": { "vacuum": "$vacuum" }, "no_go": "no_go", "walls": "walls" }
```

| Key | Value |
|---|---|
| `action` | `domain.service`. Home Assistant refuses an action that cannot return a response. |
| `data` | Its data; `$vacuum` and `$vacuum_device` are filled in. |
| `no_go`, `walls` | Where in the response the list is. Default `no_go_areas\|no_go` and `virtual_walls\|walls`. |

A path is names separated by `.`; `*` means every value of an object or list; `|` separates places to try, the first that holds anything is used. A text that holds
JSON is read as JSON on the way. Lists found at the end are joined.

**Any vacuum:** write a script that fetches the zones however your integration gives them and returns them, and use it as the action:

```yaml
vacuum_zones:
  sequence:
    - variables:
        result:
          no_go: [[24000, 24000, 26000, 26000]]
          walls: [[23000, 25000, 23000, 27000]]
    - stop: Zones
      response_variable: result
```

### Zone shapes

All in the robot's own coordinates, the same as the calibration points. Each zone of a list may be:

- `[x0, y0, x1, y1]`: a rectangle (a no-go zone) or a line (a wall);
- `[x0, y0, x1, y1, x2, y2, ...]`: corners in order;
- `[[x, y], ...]` or `[{"x": 0, "y": 0}, ...]`;
- `{"x0": 0, "y0": 0, "x1": 0, "y1": 0}`, or `{"points": ...}` in one of the forms above.

### `map`

| Key | Values (first is the default) |
|---|---|
| `minimal` | `false`, `true`: outlines and soft room colours instead of the picture as it comes. |
| `label_size` | `13.5`, `11`, `16`, `19`: room names. |
| `fill` | `70`, `0`, `30`, `130`: how strong the room colours are (minimal style, 0–255). |
| `lines` | `"ink"`, `"accent"`, `"room"`: line colour (minimal style). |
| `fill_color` | `"room"`, `"accent"` (minimal style). |
| `trail` | `false`, `true`: the path of the current or last run. |
| `zones` | `false`, `true`: draw no-go zones and walls. |
| `trail_color` | `"accent"`, `"ink"`. |
| `trail_width` | `3`, `2`, `5`. |

### What a map entity needs

The picture is the entity's `entity_picture`. The rest is read from its attributes; each is optional.

| Attribute | Shape | Gives |
|---|---|---|
| `calibration_points` | At least 3 of `{"vacuum": {"x", "y"}, "map": {"x", "y"}}`; the second differs from the first in vacuum `x`, the third in vacuum `y`. | Turns robot coordinates into pixels: needed for names, trail, zones and centring. |
| `rooms` | `{id: {"name", "number", "x0", "y0", "x1", "y1"}}` | Room names on the map, and the room list. |
| `vacuum_position` | `{"x", "y"}` | The robot, when no position entity is chosen. |

A map without these is still shown as a picture. The minimal style is tuned to the flat, few-colour pictures of robot_vacuum_map style maps and may look wrong on
others. The trail comes from the recorded history of the position entity.

Instead of a map entity, the appliance can have its own uploaded picture with touch areas that pick rooms (the remote builder). Such a picture has no trail or zones.

## Examples

Entity ids, rooms and numbers below are made up.

### A vacuum that starts with `vacuum.start`

```json
{
  "format": "home-control.vacuum",
  "version": 1,
  "entities": { "vacuum": "vacuum.robot", "battery": "sensor.robot_battery" },
  "rooms": [],
  "settings": [],
  "start": []
}
```

### Xiaomi (xiaomi_miot), with per-room settings and zones

The actions and numbers are those the dashboard's Xiaomi card uses (`siid` 2; `aiid` 10 saves a room's settings, `aiid` 13 cleans rooms; `piid` 11 and 12 hold the
zones). They were taken from that card; they differ between models, so check yours.

```json
{
  "format": "home-control.vacuum",
  "version": 1,
  "entities": {
    "vacuum": "vacuum.robot",
    "battery": "sensor.robot_battery",
    "map": "image.robot_live_map",
    "position": "sensor.robot_vacuum_position"
  },
  "readings": [
    { "entity": "sensor.robot_cleaning_area", "label": "Area", "tile": true },
    { "entity": "sensor.robot_cleaning_time", "label": "Time", "tile": true }
  ],
  "rooms": [
    { "value": "3", "name": "Living room" },
    { "value": "4", "name": "Hall" }
  ],
  "settings": [
    {
      "field": "mode",
      "label": "Mode",
      "choices": ["Sweep", "Sweep Mop", "Sweep Before Mopping", "Mop"],
      "select": "select.robot_sweep_mop_type",
      "codes": { "Sweep": 1, "Mop": 2, "Sweep Mop": 3, "Sweep Before Mopping": 4 },
      "default": "Sweep"
    },
    {
      "field": "suction",
      "label": "Suction",
      "choices": ["Silent", "Basic", "Strong", "Full Speed"],
      "select": "select.robot_suction_level",
      "codes": { "Silent": 1, "Basic": 2, "Strong": 3, "Full Speed": 4 },
      "default": "Full Speed"
    },
    {
      "field": "water",
      "label": "Water output",
      "choices": ["Off", "Level1", "Level2", "Level3"],
      "select": "select.robot_mop_water_output_level",
      "codes": { "Off": 0, "Level1": 1, "Level2": 2, "Level3": 3 },
      "default": "Off"
    },
    { "field": "times", "label": "Passes", "choices": ["1", "2"], "per_room_only": true, "default": "1" }
  ],
  "start": [
    {
      "action": "xiaomi_miot.call_action",
      "each_room": true,
      "data": {
        "entity_id": "$vacuum",
        "siid": 2,
        "aiid": 10,
        "params": ["{\"room_attrs\":[{\"id\":$room,\"room_name\":\"$room_name\",\"fan_level\":$room.suction,\"water_level\":$room.water,\"clean_mode\":$room.mode,\"clean_times\":$room.times,\"mop_mode\":0,\"on\":true}]}"]
      },
      "expect": { "code": 0 }
    },
    {
      "action": "xiaomi_miot.call_action",
      "data": { "entity_id": "$vacuum", "siid": 2, "aiid": 13, "params": ["{\"room\":$rooms}"] },
      "expect": { "code": 0 }
    }
  ],
  "zones": {
    "action": "xiaomi_miot.get_properties",
    "data": { "entity_id": "$vacuum", "mapping": [{ "siid": 2, "piid": 11 }, { "siid": 2, "piid": 12 }] },
    "no_go": "*.forbidden_regions|*.restricted_sweep_areas",
    "walls": "*.restricted_walls"
  },
  "room_settings": true,
  "status_tile": false,
  "map": { "minimal": true, "label_size": 19, "fill": 30, "trail": true, "zones": true }
}
```

### Other vacuums

Nothing here is specific to a brand: put the action your integration documents for cleaning rooms (or segments) in `start`, with `$rooms` (or `$room_numbers`) where it takes the list.
Home Assistant's own `vacuum.send_command` is used by many integrations, for example:

```json
{
  "format": "home-control.vacuum",
  "version": 1,
  "entities": { "vacuum": "vacuum.robot" },
  "rooms": [
    { "value": "16", "name": "Kitchen" },
    { "value": "17", "name": "Bedroom" }
  ],
  "start": [
    {
      "action": "vacuum.send_command",
      "data": { "entity_id": "$vacuum", "command": "app_segment_clean", "params": "$room_numbers" }
    }
  ]
}
```

The command name and the shape of `params` differ from one integration to another. This example is a pattern, not a tested set-up for any robot: only the Xiaomi
example above reproduces calls the dashboard itself already makes.

## What the appliance does not do

- It does not edit zones or the map; it shows them.
- Without `expect`, an action that the integration reports as done is taken as done.
- Words are replaced in `data` only, not in the action name or in a target.
