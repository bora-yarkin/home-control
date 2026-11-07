# SPDX-License-Identifier: GPL-3.0-or-later
"""The effects catalogue syntax: a good file is read as written, and every mistake is reported where it is (decision D-15)."""

import copy
import unittest

from tests.support import load

c = load("effects.catalogue")

GOOD = {
    "schema": 1,
    "name": "My Govee strips",
    "lights": {"entities": ["light.desk_strip"], "platforms": ["govee"], "models": ["H6159"]},
    "groups": [{"id": "calm", "label": "Calm"}, {"id": "party", "label": "Party"}],
    "effects": [
        {
            "id": "Aurora",
            "label": "Aurora",
            "group": "calm",
            "palette": ["#86ECFF", "#1f78bf"],
            "icon": "sparkle",
            "hue": 205,
            "brightness": 80,
            "speed": 6,
            "speed_range": [0.2, 0.5],
            "default_label": "Blue",
            "variants": [
                {"id": "purple", "label": "Purple", "colour": {"hs": [275, 85]}},
                {"id": "warm", "label": "Warm white", "colour": {"k": 2200}},
            ],
        },
        {"id": "Rainbow Chase", "group": "party"},
    ],
}


def bad(**changes):
    raw = copy.deepcopy(GOOD)
    for key, value in changes.items():
        if value is KeyError:
            del raw[key]
        else:
            raw[key] = value
    return c.parse(raw)


def with_effect(**changes):
    raw = copy.deepcopy(GOOD)
    for key, value in changes.items():
        if value is KeyError:
            del raw["effects"][0][key]
        else:
            raw["effects"][0][key] = value
    return c.parse(raw)


class GoodFileTests(unittest.TestCase):
    def test_a_good_file_is_read_as_written(self):
        cat = c.parse(GOOD)
        self.assertEqual(cat.problems, ())
        self.assertEqual(cat.name, "My Govee strips")
        self.assertEqual(cat.lights, c.Which(("light.desk_strip",), ("govee",), ("H6159",)))
        self.assertEqual([(g.id, g.label) for g in cat.groups], [("calm", "Calm"), ("party", "Party")])
        aurora, chase = cat.effects
        self.assertEqual((aurora.id, aurora.label, aurora.group, aurora.icon, aurora.hue), ("Aurora", "Aurora", "calm", "sparkle", 205))
        self.assertEqual(aurora.palette, ("#86ecff", "#1f78bf"), "colours are kept in lower case")
        self.assertEqual((aurora.brightness, aurora.speed, aurora.speed_range, aurora.default_label), (80, 6, (0.2, 0.5), "Blue"))
        self.assertEqual([(v.id, v.hs, v.kelvin) for v in aurora.variants], [("purple", (275, 85), None), ("warm", None, 2200)])
        self.assertEqual(
            (chase.id, chase.label), ("Rainbow Chase", "Rainbow Chase"), "a name with a space is a name; the label defaults to it"
        )

    def test_only_effects_and_lights_are_needed(self):
        cat = c.parse({"schema": 1, "name": "x", "lights": {"platforms": ["govee"]}, "effects": [{"id": "a"}]})
        self.assertEqual(cat.problems, ())
        self.assertEqual(cat.effects[0].group, None)


class MistakeTests(unittest.TestCase):
    def assertProblem(self, cat, where, fragment=""):
        self.assertTrue(
            any(p.startswith(where + ":") and fragment in p for p in cat.problems), f"{where} / {fragment!r} not in {cat.problems}"
        )

    def test_a_file_that_is_not_one_object_is_refused(self):
        for raw in ([], "text", 5, None):
            self.assertEqual(c.parse(raw).problems, ("the file must hold one JSON object",))

    def test_a_field_this_syntax_does_not_have_is_an_error_not_ignored(self):
        self.assertProblem(bad(extra=1), "extra", "spelling")
        self.assertProblem(with_effect(speeed=5), "effects[0].speeed", "spelling")
        self.assertProblem(
            with_effect(variants=[{"id": "a", "label": "A", "colour": {"k": 2200}, "extra": 1}]), "effects[0].variants[0].extra"
        )
        raw = copy.deepcopy(GOOD)
        raw["lights"]["colors"] = ["x"]
        self.assertProblem(c.parse(raw), "lights.colors")

    def test_schema_and_name(self):
        self.assertProblem(bad(schema=2), "schema")
        self.assertProblem(bad(schema=KeyError), "schema")
        self.assertProblem(bad(name=""), "name")
        self.assertProblem(bad(name="x" * 65), "name")
        self.assertProblem(bad(name=KeyError), "name")

    def test_which_lights_must_be_named(self):
        self.assertProblem(bad(lights={}), "lights", "at least one")
        self.assertProblem(bad(lights=KeyError), "lights")
        self.assertProblem(bad(lights={"entities": ["switch.x"]}), "lights.entities[0]", "light entity id")
        self.assertProblem(bad(lights={"platforms": ["Govee Lights"]}), "lights.platforms[0]")
        self.assertProblem(bad(lights={"entities": "light.x"}), "lights.entities", "list")
        self.assertProblem(bad(lights={"entities": [f"light.l{i}" for i in range(201)]}), "lights.entities", "at most 200")

    def test_groups(self):
        self.assertProblem(bad(groups=[{"id": "Calm", "label": "Calm"}]), "groups[0].id")
        self.assertProblem(bad(groups=[{"id": "a", "label": "A"}, {"id": "a", "label": "B"}]), "groups[1].id", "twice")
        self.assertProblem(bad(groups=[{"id": "a"}]), "groups[0].label")
        self.assertProblem(bad(groups=[{"id": f"g{i}", "label": "G"} for i in range(13)]), "groups", "at most 12")

    def test_an_effect_must_be_named_and_belong_to_a_group_that_exists(self):
        self.assertProblem(with_effect(id=""), "effects[0].id")
        self.assertProblem(with_effect(id=KeyError), "effects[0].id")
        self.assertProblem(with_effect(id="a\nb"), "effects[0].id")
        self.assertProblem(with_effect(group="nope"), "effects[0].group", "not one of the groups")
        raw = copy.deepcopy(GOOD)
        raw["effects"].append({"id": "Aurora"})
        self.assertProblem(c.parse(raw), "effects[2].id", "twice")

    def test_numbers_are_checked_against_their_ranges(self):
        for key, value in (
            ("brightness", 0),
            ("brightness", 101),
            ("brightness", 5.5),
            ("speed", 0),
            ("speed", 13),
            ("hue", 361),
            ("hue", True),
        ):
            self.assertProblem(with_effect(**{key: value}), f"effects[0].{key}")

    def test_speed_range(self):
        self.assertProblem(with_effect(speed_range=[0.5, 0.2]), "effects[0].speed_range", "less than")
        self.assertProblem(with_effect(speed_range=[0.1]), "effects[0].speed_range", "two numbers")
        self.assertProblem(with_effect(speed_range=[0, 2]), "effects[0].speed_range[1]")

    def test_palette_and_icon(self):
        self.assertProblem(with_effect(palette=["red"]), "effects[0].palette[0]", "#86ecff")
        self.assertProblem(with_effect(palette=[]), "effects[0].palette")
        self.assertProblem(with_effect(palette=["#000000"] * 6), "effects[0].palette", "at most 5")
        self.assertProblem(with_effect(icon="<script>"), "effects[0].icon")

    def test_variants(self):
        self.assertProblem(
            with_effect(variants=[{"id": "a", "label": "A", "colour": {"hs": [400, 50]}}]), "effects[0].variants[0].colour.hs[0]"
        )
        self.assertProblem(with_effect(variants=[{"id": "a", "label": "A", "colour": {"hs": [1]}}]), "effects[0].variants[0].colour.hs")
        self.assertProblem(with_effect(variants=[{"id": "a", "label": "A", "colour": {"k": 10}}]), "effects[0].variants[0].colour.k")
        self.assertProblem(
            with_effect(variants=[{"id": "a", "label": "A", "colour": {"hs": [1, 2], "k": 3000}}]), "effects[0].variants[0].colour"
        )
        self.assertProblem(with_effect(variants=[{"id": "a", "label": "A", "colour": {}}]), "effects[0].variants[0].colour")
        twice = [{"id": "a", "label": "A", "colour": {"k": 2200}}] * 2
        self.assertProblem(with_effect(variants=twice), "effects[0].variants[1].id", "twice")
        self.assertProblem(with_effect(variants=[{"id": "a", "label": "A", "colour": {"k": 2200}}] * 9), "effects[0].variants", "at most 8")

    def test_every_problem_is_listed_at_once(self):
        cat = bad(name="", effects=[{"id": "a", "speed": 99}, {"id": "b", "brightness": 0, "group": "x"}])
        self.assertGreaterEqual(len(cat.problems), 4)

    def test_nothing_is_kept_from_an_effect_that_has_a_problem(self):
        cat = c.parse({**GOOD, "effects": [{"id": "ok"}, {"id": "bad", "speed": 99}]})
        self.assertTrue(cat.problems)
        self.assertEqual([e.id for e in cat.effects], ["ok"], "good effects are read, but the catalogue has problems so it is not used")

    def test_the_effects_list_is_needed_and_limited(self):
        self.assertProblem(bad(effects=KeyError), "effects", "missing")
        self.assertProblem(bad(effects=[]), "effects", "at least one")
        self.assertProblem(bad(effects=[{"id": f"e{i}"} for i in range(65)]), "effects", "at most 64")


class PartTests(unittest.TestCase):
    """What a plus integration's declaration carries: groups and effects, with pictures allowed."""

    def test_groups_and_effects_are_read_without_a_name_or_lights(self):
        groups, effects, problems = c.parse_effects({"groups": GOOD["groups"], "effects": GOOD["effects"]})
        self.assertEqual(problems, ())
        self.assertEqual([g.id for g in groups], ["calm", "party"])
        self.assertEqual([e.id for e in effects], ["Aurora", "Rainbow Chase"])

    def test_mistakes_are_reported_and_other_fields_are_refused(self):
        _g, _e, problems = c.parse_effects({"groups": [], "effects": [{"id": "a", "speed": 99}], "name": "x"})
        self.assertTrue(any(p.startswith("effects[0].speed:") for p in problems))
        self.assertTrue(any(p.startswith("name:") for p in problems))
        self.assertEqual(c.parse_effects("text")[2], ("the catalogue must be an object with groups and effects",))


class PictureTests(unittest.TestCase):
    ART = "<svg viewBox='0 0 100 100'><rect width='100' height='100' fill='#123456'/></svg>"

    def test_a_users_file_cannot_carry_a_picture(self):
        cat = with_effect(art=self.ART)
        self.assertTrue(any(p.startswith("effects[0].art:") and "plus integration" in p for p in cat.problems), cat.problems)

    def test_a_plus_integration_may(self):
        raw = copy.deepcopy(GOOD)
        raw["effects"][0]["art"] = self.ART
        cat = c.parse(raw, allow_art=True)
        self.assertEqual(cat.problems, ())
        self.assertEqual(cat.effects[0].art, self.ART)

    def test_a_picture_has_a_size_limit(self):
        raw = copy.deepcopy(GOOD)
        raw["effects"][0]["art"] = "<svg>" + "x" * 5000 + "</svg>"
        self.assertTrue(c.parse(raw, allow_art=True).problems)


if __name__ == "__main__":
    unittest.main()


class DocumentationTests(unittest.TestCase):
    def test_the_example_in_the_documentation_is_a_good_file(self):
        import json
        import re
        from pathlib import Path

        text = (Path(__file__).resolve().parents[2] / "docs" / "effects-file.md").read_text()
        block = re.search(r"```json\n(.*?)\n```", text, re.DOTALL).group(1)
        self.assertEqual(c.parse(json.loads(block)).problems, ())

    def test_every_field_of_the_syntax_is_documented(self):
        from pathlib import Path

        text = (Path(__file__).resolve().parents[2] / "docs" / "effects-file.md").read_text()
        for key in sorted(c.FILE_KEYS | c.LIGHTS_KEYS | c.GROUP_KEYS | (c.EFFECT_KEYS - {"art"}) | c.VARIANT_KEYS):
            self.assertIn(f"`{key}`", text, key)
