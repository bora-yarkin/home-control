# Effects file

Home Control shows the effects a light lists (`effect_list`) as the light and Home Assistant report them. An **effects file** lets you describe them
better, for lights of any brand: put them in groups, give them labels and a picture, say how bright and how fast they start, and how the speed maps
to the light's own scale. Import it in **Settings → Effects → Import an effects file**. Administrators only; the file is checked before it is kept,
and every mistake is listed with where it is.

A file is one JSON object. It never carries code. The only picture it can hold is a palette of colours, or the name of an icon.

Hue lights do not need a file: Hue Plus brings its own catalogue in the same syntax.

## What the effects do

Starting an effect from the effects page calls `light.turn_on` with the effect's name (and the brightness, when the effect has one). The name in the
file (`id`) must be **exactly** what the light lists in its `effect_list`. Colour variants and speed are for lights whose integration can start an
effect with a colour or a speed (a "plus" integration, like Hue Plus); for any other light they are shown but only the effect and the brightness are sent.

## The syntax

```json
{
  "schema": 1,
  "name": "My Govee strips",
  "lights": {
    "entities": ["light.desk_strip"],
    "platforms": ["govee"],
    "models": ["H6159"]
  },
  "groups": [
    { "id": "calm", "label": "Calm" },
    { "id": "party", "label": "Party" }
  ],
  "effects": [
    {
      "id": "Aurora",
      "label": "Aurora",
      "group": "calm",
      "palette": ["#86ecff", "#1f78bf", "#07203f"],
      "icon": "sparkle",
      "hue": 205,
      "brightness": 80,
      "speed": 6,
      "speed_range": [0.2, 0.5],
      "default_label": "Blue",
      "variants": [
        { "id": "purple", "label": "Purple", "colour": { "hs": [275, 85] } },
        { "id": "warm", "label": "Warm white", "colour": { "k": 2200 } }
      ]
    },
    { "id": "Rainbow Chase", "group": "party", "palette": ["#ff3b3b", "#ffe234", "#3fe05a", "#2bb8ff"] }
  ]
}
```

### The file

| Field | Needed | What it is |
|---|---|---|
| `schema` | yes | Always `1`. |
| `name` | yes | What the file is called in Settings (1 to 64 characters). |
| `lights` | yes | Which lights the effects are for. At least one of the three below; a light that matches any one is included. |
| `groups` | no | Up to 12 groups, shown in this order. Each has an `id` (lower case letters, digits and `_`, starting with a letter) and a `label`. |
| `effects` | yes | 1 to 64 effects. |

`lights` holds:

| Field | What it is |
|---|---|
| `entities` | Light entity ids, such as `light.desk_strip` (up to 200). |
| `platforms` | The integration that provides the lights, as Home Assistant names it: `govee`, `wiz`, `tuya` (up to 200). |
| `models` | The device model text Home Assistant shows for the light (up to 200). |

### An effect

| Field | Needed | What it is |
|---|---|---|
| `id` | yes | The effect's name **exactly as the light lists it**, such as `Aurora` or `Rainbow Chase` (1 to 64 characters). |
| `label` | no | What to show. Defaults to `id`. |
| `group` | no | One of the group ids above. Effects with no group are shown under **More**. |
| `palette` | no | 1 to 5 colours as `#rrggbb`. Drawn as the effect's picture. |
| `icon` | no | The name of one of the dashboard's icons. |
| `hue` | no | 0 to 360. Turns the picture to a colour variant. |
| `brightness` | no | 1 to 100: the brightness the effect starts with. Left as it is when not given. |
| `speed` | no | 1 to 12: the speed step it starts with. |
| `speed_range` | no | `[slowest, fastest]`, each 0 to 1, slowest less than fastest: the part of the light's own speed scale that the 12 speed steps cover. This is the calibration. |
| `default_label` | no | What the effect's own first tile is called (default `Default`). |
| `variants` | no | Up to 8 colour variants, each with an `id`, a `label` and a `colour`: `{"hs": [hue 0-360, saturation 0-100]}` or `{"k": kelvin 1000-20000}`. |

A field that is not in these tables is an **error**, not ignored, so a typo (`speeed`) is found at once.

## Writing one with an AI

Give the AI this page and your light's effect list (**Developer tools → States → your light → `effect_list`**), then ask, for example:

> Write an effects file in the syntax of this page for my light `light.desk_strip` (integration `govee`). Its effect_list is: Aurora, Rainbow Chase, Candle,
> Ocean. Put them in two groups, "Calm" and "Party", give each a palette of colours that suits it, and start Candle at brightness 30. Reply with only the JSON.

Save the answer as a `.json` file and import it. If something is wrong, the page lists every problem; paste that list back to the AI and ask it to fix them.

## For plus integrations

An integration for one brand (Hue Plus, or one you write) ships the same syntax inside its `home_control.json` under `catalogue` (`groups` and `effects`; it
can also carry `art`, a small SVG picture, which the dashboard checks against a short list of elements). See `custom_components/home_control/live/providers.py`.
