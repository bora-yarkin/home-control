# SPDX-License-Identifier: GPL-3.0-or-later
"""The moving palette gives exactly the commands it gave before effects became a seam (HP-10.1).

`golden/palette_commands.json` holds, for each scenario, the number of commands and a SHA-256 of all of them, recorded from the
engine as it was before the change. Every command the palette sends over several scenes, speeds, ranges, spreads and kinds
of light must stay identical, to the last digit.
Regenerate it only for a change of the palette's behaviour that was asked for: `python -m tests.scenes.test_palette_unchanged --write`.
"""

import hashlib
import json
import sys
import unittest
from pathlib import Path

from tests.live.fakes import FakeDriver, info
from tests.support import load

d = load("live.definitions")
e = load("live.engine")

GOLDEN = Path(__file__).parent / "golden" / "palette_commands.json"

PLACES = [
    ("light.a", -1, -0.5, 0),
    ("light.b", -0.2, 0.3, 0.5),
    ("light.c", 0.1, 0.9, -0.5),
    ("light.d", 0.7, -0.4, 1),
    ("light.e", 1, 1, 0),
]
PALETTES = {
    "one": [{"k": 2700}],
    "two": [{"xy": [0.2, 0.2]}, {"xy": [0.6, 0.35], "b": 40}],
    "five": [{"hs": [0, 100]}, {"hs": [60, 80], "b": 70}, {"k": 3500, "b": 50}, {"hs": [200, 90]}, {"xy": [0.3, 0.3]}],
}
KINDS = {
    "colour_fade": info(),
    "white_fade": info(colour=False, xy=None, kelvin=2700, mode="color_temp"),
    "no_fade": info(transition=False),
}


def scenarios():
    for spread in ("x", "y", "z", "radial"):
        for range_pct in (0, 50, 100):
            for speed in (1, 6, 12):
                for palette in PALETTES:
                    yield {
                        "spread": spread,
                        "range": range_pct,
                        "speed": speed,
                        "palette": palette,
                        "brightness": 255,
                        "kind": "colour_fade",
                    }
    for kind in ("white_fade", "no_fade"):
        for palette in PALETTES:
            yield {"spread": "x", "range": 100, "speed": 8, "palette": palette, "brightness": 120, "kind": kind}
    yield {"spread": "x", "range": 80, "speed": 4, "palette": "five", "brightness": 255, "kind": "colour_fade", "retune": True}
    yield {"spread": "radial", "range": 100, "speed": 5, "palette": "five", "brightness": 255, "kind": "colour_fade", "freeze": True}


def run(scenario):
    data = {
        "scene_id": "s",
        "lights": [{"entity_id": i, "x": x, "y": y, "z": z} for i, x, y, z in PLACES],
        "palette": PALETTES[scenario["palette"]],
        "speed": scenario["speed"],
        "range": scenario["range"],
        "brightness": scenario["brightness"],
        "spread": scenario["spread"],
        "wake": True,
    }
    driver = FakeDriver({i: KINDS[scenario["kind"]] for i, *_ in PLACES})
    now = 1000.0
    session = e.Session(d.parse_definition(data), now)
    out = []
    for tick in range(240):
        now += 1.25
        if scenario.get("retune") and tick == 80:
            session.retune(d.parse_definition({**data, "speed": 9, "range": 30, "brightness": 90}))
        if scenario.get("freeze") and tick == 60:
            session.frozen = True
        if scenario.get("freeze") and tick == 120:
            session.frozen = False
        result = session.step(now, driver, set())
        driver.follow(result.commands)
        out.extend([round(now - 1000.0, 2), entity_id, command] for entity_id, command in result.commands)
    return out


def record():
    out = []
    for scenario in scenarios():
        commands = json.dumps(run(scenario), separators=(",", ":"), sort_keys=True)
        out.append({"scenario": scenario, "count": commands.count('"light.'), "sha256": hashlib.sha256(commands.encode()).hexdigest()})
    return out


class PaletteUnchangedTests(unittest.TestCase):
    def test_the_commands_are_those_recorded_before_the_change(self):
        golden = json.loads(GOLDEN.read_text())
        self.assertEqual(len(golden), len(list(scenarios())))
        self.assertGreater(sum(g["count"] for g in golden), 10_000)
        for expected, actual in zip(golden, record(), strict=True):
            self.assertEqual(expected["scenario"], actual["scenario"])
            self.assertEqual(expected["count"], actual["count"], expected["scenario"])
            self.assertEqual(expected["sha256"], actual["sha256"], expected["scenario"])


if __name__ == "__main__":
    if "--write" in sys.argv:
        GOLDEN.write_text(json.dumps(record(), indent=0))
        print("written", GOLDEN, GOLDEN.stat().st_size, "bytes")
    else:
        unittest.main()
