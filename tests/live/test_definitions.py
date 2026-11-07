# SPDX-License-Identifier: GPL-3.0-or-later
import unittest

from tests.support import load

d = load("live.definitions")


def base(**kw):
    data = {
        "scene_id": "night",
        "lights": [{"entity_id": "light.a", "x": -1, "y": 0, "z": 0.5}, {"entity_id": "light.b", "x": 1}],
        "palette": [{"hs": [0, 100]}, {"k": 2700, "b": 50}, {"xy": [0.3, 0.3]}],
    }
    data.update(kw)
    return data


class DefinitionTests(unittest.TestCase):
    def test_valid_definition_has_defaults_and_converted_colours(self):
        v = d.parse_definition(base())
        self.assertEqual(v.speed, 6)
        self.assertEqual(v.range_pct, 100)
        self.assertEqual(v.brightness, 255)
        self.assertEqual(v.spread, "x")
        self.assertEqual(v.lights[1].z, 0.0)
        self.assertAlmostEqual(v.palette[0].x, 0.7, delta=0.02)  # red
        self.assertEqual(v.palette[1].b, 50)
        self.assertAlmostEqual(v.palette[1].x, 0.4575, delta=0.01)  # 2700 K

    def test_only_light_entities_are_accepted(self):
        for bad in ("switch.a", "lock.front_door", "light.", "light.A", "light", 5, None):
            with self.assertRaises(d.DefinitionError, msg=repr(bad)):
                d.parse_definition(base(lights=[{"entity_id": bad}]))

    def test_duplicate_light_is_rejected_whole(self):
        with self.assertRaises(d.DefinitionError):
            d.parse_definition(base(lights=[{"entity_id": "light.a"}, {"entity_id": "light.a"}]))

    def test_coordinates_must_be_finite_and_inside_the_cube(self):
        for bad in (1.01, -1.5, float("nan"), float("inf"), True, "0"):
            with self.assertRaises(d.DefinitionError, msg=repr(bad)):
                d.parse_definition(base(lights=[{"entity_id": "light.a", "x": bad}]))

    def test_list_sizes_are_limited(self):
        lights = [{"entity_id": f"light.l{i}"} for i in range(33)]
        with self.assertRaises(d.DefinitionError):
            d.parse_definition(base(lights=lights))
        with self.assertRaises(d.DefinitionError):
            d.parse_definition(base(lights=[]))
        with self.assertRaises(d.DefinitionError):
            d.parse_definition(base(palette=[{"hs": [1, 1]}] * 17))
        with self.assertRaises(d.DefinitionError):
            d.parse_definition(base(palette=[]))

    def test_a_palette_colour_has_exactly_one_form_and_valid_numbers(self):
        for bad in (
            {},
            {"hs": [0, 100], "k": 3000},
            {"hs": [400, 50]},
            {"hs": [10, 101]},
            {"k": 10},
            {"xy": [0.3]},
            {"xy": [0.3, 2]},
            {"hs": [0, 100], "b": 0},
            {"hs": [0, 100], "b": 101},
            "red",
        ):
            with self.assertRaises(d.DefinitionError, msg=repr(bad)):
                d.parse_definition(base(palette=[bad]))

    def test_speed_range_brightness_spread_fps_bounds(self):
        for key, bad in (
            ("speed", 0),
            ("speed", 13),
            ("speed", 2.5),
            ("range", -1),
            ("range", 101),
            ("brightness", 0),
            ("brightness", 256),
            ("spread", "diagonal"),
            ("fps", 5),
            ("scene_id", "Has Space"),
            ("scene_id", ""),
        ):
            with self.assertRaises(d.DefinitionError, msg=f"{key}={bad!r}"):
                d.parse_definition(base(**{key: bad}))

    def test_wake_is_a_flag_and_off_by_default(self):
        self.assertFalse(d.parse_definition(base()).wake)
        self.assertTrue(d.parse_definition(base(wake=True)).wake)
        for bad in (1, "yes", None):
            with self.assertRaises(d.DefinitionError, msg=repr(bad)):
                d.parse_definition(base(wake=bad))

    def test_whole_numbers_given_as_floats_are_accepted(self):
        v = d.parse_definition(base(speed=3.0, range=40.0))
        self.assertEqual((v.speed, v.range_pct), (3, 40))


if __name__ == "__main__":
    unittest.main()
