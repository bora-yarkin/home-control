# Setting up Home Control with an AI

This guide is for an AI assistant, or for anyone who wants to write a dashboard by hand. You produce a backup file, and the owner restores it under
Settings → Backup and about → Backup and restore. You don't need access to their Home Assistant.

The [user manual](manual/README.md) explains what each thing does.

## What to ask the owner for

1. **A backup of the dashboard** as it is now (*Backup and restore → Download backup file*). Always start from it: a restore **replaces** everything, so what is not
   in your file is lost (notification rules, access rules, remotes, colours). Change what you need and keep the rest exactly.
2. **The entities by area.** In *Developer tools → Template*, this lists them:

   ```jinja
   {% for a in areas() %}
   ## area {{ a }}: {{ area_name(a) }}
   {% for e in area_entities(a) %}{{ e }} | {{ state_attr(e, 'friendly_name') }} | {{ states(e) }}
   {% endfor %}{% endfor %}
   ```

   Also ask for anything that has no area and matters (weather, calendars, to-do lists, people).
3. **What matters to them:** which rooms they use, what they switch every day, TVs and what is plugged into them, cameras and locks, a robot vacuum, who else uses
   the dashboard, phone or wall tablet.

Tell the owner that the file holds their entity ids and room names, so they should treat it as private.

## Rules

- Use only entity ids the owner gave you. Never invent one.
- Do not remove anything the owner did not ask you to remove.
- Keep every id unique: room ids, section ids within a page, widget ids (`wid`) within a page, scene ids.
- Anything invalid is dropped on restore. Before replacing, the dashboard says how many rooms, devices and scenes it would not accept: if it says any, fix the file.
- Names are at most 40 characters.

## The file

```text
{ "app": "dashboard", "version": 1, "exported": "<date>", "data": { ... }, "extras": { ... } }
```

Leave `extras` as the owner's backup had it. `data` has `v: 1`, `ui` (pages), `scenes`, `eareas` (areas of live scenes), `presets`, `saved`, `cfg`, `access`,
`notify`, `icons`, `qaSeeded: true`. You normally change only `ui` and `scenes`.

### `ui`

| Key | What |
|---|---|
| `rooms` | At most 24: `{id, name, short, icon, area, hide, img}`. `id`: `a-z0-9_-`, at most 24, not `home`. `area`: the Home Assistant area id. `short` (≤16) is the name on the bottom bar. `img`: an `https://` or `/local/` picture. |
| `layout` | `{"v": 8, "home": [sections], "rooms": {"<room id>": [sections]}, "cols": {"home": 3, "<room id>": 2}}` |
| `stat` | Header status tiles: `{"<room id or home>": [tiles]}`, at most six each: `{l, id, u, dp, h, text}` (label ≤30, entity, unit, decimals, a second entity shown beside it, `text: 1` for a non-number) or `{"k": "alerts", "l": "Attention"}`. |
| `meta` | `{homeTab, homeTitle, eyebrow, clock, greet, sky, hdr, noadv}` (`noadv: 1` hides every Advanced settings button). `hdr`: up to four `{k}` of `weather`, `people`, `lights`, `alerts`, `entity` (`entity` needs `id`; `l` is a label). |
| `devs` | Rebuilt by the dashboard from the sections. Leave it. |
| others | `bats`, `batsOff`, `ignored`, `newSince`, `on`, `caps`, `offx`, `chips`: keep the owner's. |

### Sections

```json
{ "id": "lights", "k": "devs", "t": "Lights", "i": "lights", "hide": false, "devs": [] }
```

`id`: starts with a letter, then `a-z0-9_`, 2 to 15 characters. Optional: `span` (1 to 4 columns), `lay` (`list`, `grid2`, `grid3`, `grid4`), `when` (`{id, is, not}`:
shown only while an entity has a state).

### Devices

Every device has `kind`, `id` (the entity, or `""`), `name`, `icon`.

| `kind` | Entity | Optional |
|---|---|---|
| `light` | `light.*` | |
| `switch` | `switch.*`, `input_boolean.*` | |
| `fan` | `fan.*` | `dt`: `fan` or `purifier`; `links`: related entities |
| `climate` | `climate.*` | `dial: 1` |
| `media` | `media_player.*` | `dt`: `tv`, `receiver`, `speaker`; `links` (a TV's `remote.*` gives the full remote); `art: 1` |
| `vacuum` | `vacuum.*` | |
| `camera` | `camera.*` | `sz: "l"` (live picture), `talk: 1` |
| `sensor` | `sensor.*`, `binary_sensor.*`, … | `sz`: `xs` or `s` (a tile) |
| `number`, `select` | `number.*`, `select.*`, `input_*` | `sz` as above |
| `button` | `button.*`, `input_button.*`, `script.*` | |
| `cover` | `cover.*` | |
| `lock` | `lock.*` | `noslide: 1` |
| `scene` | `scene.*` | |
| `cscene` | `""` | `sid`: a scene of `data.scenes` |
| `scenes` | `""` | A collection: `spage` (`["page:home"]`, `["page:<room id>"]`, `["area:<id>"]`), `stag`, `xtag` (tags in, tags out) |
| `appliance` | `""` | `aid` (new id), `ap`: `{type, slots, extra}` (see below) |
| `remote` | `""` | `rid`, `rm`: `{cols, btns}`: best built in the dashboard |
| `widget` | `""` | `w`, `wid`, `wx`, `sz` |

`links` holds at most 12 entities.

**Icons:** `lights`, `light`, `lamp`, `floor`, `ceiling`, `strip`, `tv`, `media`, `speaker`, `ac`, `fan`, `purifier`, `vac`, `cam`, `printer`, `plug`, `battery`,
`thermo`, `drop`, `scene`, `sparkle`, `home`, `sofa`, `bed`, `moon`, `lock`, `bell`, `clock`, `person`, `leave`, `movie`, `power`, `info`, `pin`, `tune`; or any
`mdi:<name>`.

### Widgets

`{"kind": "widget", "id": "", "w": "<type>", "wid": "<2–15 of a-z0-9_, starting with a letter>", "name": "...", "icon": "...", "wx": {...}, "sz": "s"}`

| `w` | `wx` | Sizes |
|---|---|---|
| `alerts`, `security`, `cameras` | `{}` | `m` |
| `glance`, `now`, `rooms` | `{}` | `s`, `m` |
| `chips` | `{}` | `m` |
| `note` | `{txt}` | `s`, `m`, `l` |
| `chart` | `{ds: [{id, name}], r}`: up to 4 sensors; `r`: `6h`, `24h`, `7d`, `30d` | `m`, `l` |
| `energy` | `{price, cur}` | `m` |
| `pinned` | `{pins: [{id, name, icon, room}], lay}` | `m` |
| `link` | `{ref: "<room id>:<section id>"}` | `m` |
| `clock` | `{id: "weather.*"}` | `s`, `m` |
| `nowplaying` | `{id: "media_player.*"}` | `m` |
| `snapshot` | `{id: "camera.*"}` | `s`, `m` |
| `vacuum` | `{id: "vacuum.*"}` | `m` |
| `ring` | `{id: "sensor.*", max}` | `xs`, `s` |
| `sparkline` | `{id: "sensor.*", r}`: `6h`, `24h`, `7d` | `s`, `m` |
| `agenda`, `todo` | `{id: "calendar.*"}`, `{id: "todo.*"}` | `m`, `l` |
| `folder` | `{ids: [up to 12 entities]}` | `xs`, `s` |
| `stack` | `{items: [up to 5 widget devices]}` | `s`, `m`, `l` |
| `lmaster` | See below | row |
| `rmaster` | `{def: "media_player.tv", subs: [{id, src}], spk: [media players], keep}` | row |

**Popup** (`w: "popup"`, `wx: {}`): a row that opens a popup. Its contents are one more section of the same page, `{"id": "...", "k": "devs", "of": "<the widget's wid>", "devs": [...]}`; that section is never drawn on the page, and is dropped when no popup widget on the page has that `wid`.

**Buttons of a ready-made TV remote**: `ui.rbx`, `{"media_player.x": {"<role>": {"off": 1}}}`. Roles: `power`, `settings`, `mute`, `back`, `home`, `playpause`, `volup`, `voldown`, `chup`, `chdown` take `{"a": <remote action>}`; `keyboard` (remote, media_player, text, input_text, script), `brightness` (number, input_number) and `apps` (media_player, select, input_select) take `{"e": "<entity>"}`. Leave a role out for automatic.

**Lights master** (`w: "lmaster"`): for the lights of its own section, give it `wid` equal to the section's `id` and `wx: {"own": 1, "mn": "All lights"}`. For lights
chosen by hand: any other `wid` and `wx: {"mm": 1, "mn": "Evening", "ml": [light devices]}`. `msrc` chooses the scenes of its Scenes tab: `"page"`,
`"page:<room id>"`, `"area:<id>"`, `"tag:<tag>"`, `"ha:@page"` (Home Assistant's own scenes of the page's area).

**Remote master** (`rmaster`): `def` is the TV; each of `subs` is a device plugged into it with `src`, the TV's source name for it, exactly as the TV reports it in
`source_list`.

**Action button** (`w: "action"`, `wx: {"a": action, "q": 1}`) and **Template text** (`w: "template"`, `wx: {"t": "{{ states('sensor.x') }}"}`, at most 500 characters).

**Any action** (a remote button's `a`, a gesture's `{"t": "run", "a": ...}`, an action button): `{"t": "do", "s": "domain.service", "tg": {"entity_id": [], "area_id": [], "device_id": []}, "d": {data, at most 1000 characters}, "q": 1, "n": "name"}`.

**Blocks added to a device's popup**: a section like a popup's contents with `"pk"`, the popup's key (`"ac:climate.x"`, `"appliance:<aid>"`, `"adv:switch.x"`), next to its `of`.

**Advanced settings changes** (`ui.adv`): `{"<entity>": {"hide": [], "order": [], "name": {"<entity>": "..."}, "add": []}}`. **Appliance parts** (`ap.parts`): `{"order": [], "hide": []}`. **Added blocks** (`ap.add`, at most 12): `{"id": "xabc", "t": "dial"|"ring"|"bar"|"readings"|"actions"|"settings", "slots": {slot: entity}, "l": "name"}`.

### Scenes (`data.scenes`)

```json
{ "id": "evening", "name": "Evening", "room": "living", "icon": "moon", "others": "keep", "acts": [ { "id": "light.sofa", "on": true, "bri": 40, "col": { "k": 2700 } } ] }
```

`room` is a room id or `home`. `others`: `keep`, `lights` (other lights off), `all`. An action is a light (`on`, `bri` 1–100, `col` `{k}` or `{h, s}`), a
`media_player`, `fan`, `switch` or `input_boolean` (`on`), or a climate (`mode` `off`/`cool`/`heat`, `temp`). Optional `tags`: lower-case words.

An **auto scene** has no `acts`; it has `"auto": {"colors": [{"h": 30, "s": 80, "b": 60}, {"k": 2700, "b": 40}]}` (up to 10).

A **live scene** needs an area with positions; let the owner make areas and live scenes in the dashboard.

### Appliances

`ap.type`: `oven`, `washer`, `dryer`, `dishwasher`, `coffee`, `fridge`, `projector`, `vacuum`, `other`. `ap.slots`: `state`, `program`, `temperature`, `current`,
`duration`, `start`, `stop`, `progress`, `remaining`, `door`, `permission`, `level` → entity ids. `ap.extra`: `[{e, l, g}]` further entities with a label and group.

For a **robot vacuum** appliance, put `{"type": "vacuum", "slots": {"vacuum": "vacuum.x"}, "extra": []}` in the dashboard and give the owner a separate set-up file
as [the vacuum appliance](vacuum-appliance.md) describes; they load it in the appliance's set-up.

## What makes it look good

A layout that works well on phones and tablets:

**Home page** (`cols.home`: 2 or 3)

1. `meta.hdr`: weather, people, lights on.
2. An *Attention* widget in its own section: it disappears when all is well.
3. *At a glance* (what is on, open, running).
4. *Rooms*.
5. A *Scenes* section with a collection, or *Pinned* with the few things used daily.

**Each room page** (`cols.<room>`: 2 or 3)

1. Temperature, humidity and air quality as header status tiles (`stat`), not as rows.
2. **Lights**: one lights master for the section's lights at the top, then the lights. With many lights, set the section's `lay` to `grid2`.
3. **Media**: the TV, then speakers; a Remote master when something is plugged into the TV.
4. **Climate**: the air conditioner (a dial reads well), fans, purifier.
5. **Other**: vacuum, appliances, covers, locks.
6. **Camera**: large, last.

Habits that keep it clean: short names without the room's name ("Floor lamp", not "Living room floor lamp"); one icon per meaning; leave out entities nobody
touches; scenes in the lights master's Scenes tab rather than a long list of rows; tags to share scenes between rooms; hide rather than delete what the owner might
want back.

## A complete small example

Entity ids and names are made up.

```json
{
  "app": "dashboard",
  "version": 1,
  "exported": "2026-01-01T00:00:00.000Z",
  "data": {
    "v": 1,
    "qaSeeded": true,
    "ui": {
      "rooms": [ { "id": "living", "name": "Living room", "short": "Living", "icon": "sofa", "area": "living_room" } ],
      "meta": { "homeTab": "Home", "homeTitle": "Our home", "eyebrow": "Dashboard", "clock": true, "hdr": [ { "k": "weather" }, { "k": "people" }, { "k": "lights" } ] },
      "stat": { "living": [ { "l": "Temperature", "id": "sensor.living_temperature", "u": "°", "dp": 1 }, { "k": "alerts", "l": "Attention" } ] },
      "layout": {
        "v": 8,
        "cols": { "home": 2, "living": 2 },
        "home": [
          { "id": "alerts", "k": "devs", "t": "Attention", "i": "info", "devs": [ { "kind": "widget", "id": "", "w": "alerts", "wid": "walerts", "name": "Attention", "icon": "info", "wx": {} } ] },
          { "id": "glance", "k": "devs", "t": "At a glance", "i": "home", "devs": [ { "kind": "widget", "id": "", "w": "glance", "wid": "wglance", "name": "At a glance", "icon": "home", "wx": {} } ] },
          { "id": "rooms", "k": "devs", "t": "Rooms", "i": "home", "devs": [ { "kind": "widget", "id": "", "w": "rooms", "wid": "wrooms", "name": "Rooms", "icon": "home", "wx": {} } ] },
          { "id": "scenes", "k": "devs", "t": "Scenes", "i": "scene", "devs": [ { "kind": "cscene", "id": "", "sid": "evening", "name": "Evening", "icon": "moon" } ] }
        ],
        "rooms": {
          "living": [
            {
              "id": "lights", "k": "devs", "t": "Lights", "i": "lights",
              "devs": [
                { "kind": "widget", "id": "", "w": "lmaster", "wid": "lights", "name": "Lights master", "icon": "lights", "wx": { "own": 1, "mn": "All lights", "msrc": ["page"] } },
                { "kind": "light", "id": "light.living_ceiling", "name": "Ceiling", "icon": "ceiling" },
                { "kind": "light", "id": "light.living_floor", "name": "Floor lamp", "icon": "floor" }
              ]
            },
            {
              "id": "media", "k": "devs", "t": "Media", "i": "tv",
              "devs": [
                { "kind": "media", "id": "media_player.living_tv", "name": "TV", "icon": "tv", "dt": "tv", "links": ["remote.living_tv"] },
                { "kind": "widget", "id": "", "w": "rmaster", "wid": "wremote", "name": "Remote", "icon": "tv", "wx": { "def": "media_player.living_tv", "subs": [ { "id": "media_player.living_box", "src": "HDMI 1" } ] } }
              ]
            },
            {
              "id": "climate", "k": "devs", "t": "Climate", "i": "ac",
              "devs": [ { "kind": "climate", "id": "climate.living_ac", "name": "Air conditioner", "icon": "ac", "dial": 1 } ]
            },
            {
              "id": "other", "k": "devs", "t": "Other", "i": "plug",
              "devs": [
                { "kind": "appliance", "id": "", "aid": "robot1", "name": "Robot vacuum", "icon": "vac", "ap": { "type": "vacuum", "slots": { "vacuum": "vacuum.robot" }, "extra": [] } },
                { "kind": "sensor", "id": "sensor.living_humidity", "name": "Humidity", "icon": "drop", "sz": "s" }
              ]
            }
          ]
        }
      }
    },
    "scenes": [
      { "id": "evening", "name": "Evening", "room": "living", "icon": "moon", "others": "keep", "acts": [ { "id": "light.living_floor", "on": true, "bri": 40, "col": { "k": 2700 } } ] }
    ]
  }
}
```

(The example has no `extras`, `access` or `notify`: that is right only for a brand-new dashboard.)

## Before handing it over

- Is it based on the owner's backup, with everything they did not ask to change still there?
- Is every entity id one they gave you?
- Is the JSON valid?
- Tell them: restore it, read the question (rooms, devices, scenes, anything not accepted), and that a backup of the present dashboard is downloaded first.

## Customising

Per device (on the entry in a section): `color` (`#rrggbb`), `act` (`{"tap"|"hold"|"dbl": {"t": "popup"|"toggle"|"more"|"none"} | {"t": "page", "p": "<room id>"} | {"t": "run", "a": <remote action>}}`), `ask` (1), `txt` (at most 80 characters), `txtif` (`[{"c": <condition>, "t": "..."}]`), `when` (`[<condition>]`). For the whole dashboard: `ui.types` (`{"light": {"tap": ..., "ask": 1}}`), `ui.look` (`{"style": "mono", "radius": 0-200, "density": 50-200 (percent; leave out for the default), "kc": {"light": "#rrggbb"}}`), and in the shared settings `myAlerts` (`[{"c": <condition>, "t": "..."}]`).
