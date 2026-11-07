# SPDX-License-Identifier: GPL-3.0-or-later
import unittest

from tests.support import load

c = load("live.colours")
d = load("live.definitions")


def lights(*xs):
    return [d.AreaLight(f"light.l{i}", x, 0.0, 0.0) for i, x in enumerate(xs)]


class ColourTests(unittest.TestCase):
    def test_cycle_is_slowest_at_step_1_and_fastest_at_step_12(self):
        self.assertAlmostEqual(c.cycle_seconds(1), 120.0)
        self.assertAlmostEqual(c.cycle_seconds(12), 8.0)
        times = [c.cycle_seconds(s) for s in range(1, 13)]
        self.assertEqual(times, sorted(times, reverse=True))

    def test_range_zero_gives_every_light_the_same_offset(self):
        o = c.offsets(lights(-1, 0, 1), "x", 0, 4)
        self.assertEqual(set(o.values()), {0.0})

    def test_range_100_spreads_the_whole_palette_but_one_step(self):
        o = c.offsets(lights(-1, 0, 1), "x", 100, 4)
        self.assertEqual(o["light.l0"], 0.0)
        self.assertAlmostEqual(o["light.l1"], 0.375)
        self.assertAlmostEqual(o["light.l2"], 0.75)

    def test_lights_in_one_place_get_no_spread(self):
        o = c.offsets(lights(0.3, 0.3), "x", 100, 4)
        self.assertEqual(set(o.values()), {0.0})

    def test_offsets_follow_the_chosen_direction(self):
        ls = [d.AreaLight("light.a", 0, 1, -1), d.AreaLight("light.b", 0, -1, 1)]
        self.assertEqual(c.offsets(ls, "y", 100, 2)["light.b"], 0.0)
        self.assertEqual(c.offsets(ls, "z", 100, 2)["light.a"], 0.0)
        self.assertEqual(c.offsets(ls, "x", 100, 2), {"light.a": 0.0, "light.b": 0.0})

    def test_radial_orders_by_distance_from_the_middle(self):
        ls = [d.AreaLight("light.a", -1, 0, 0), d.AreaLight("light.b", 0, 0, 0), d.AreaLight("light.c", 1, 0, 0)]
        o = c.offsets(ls, "radial", 100, 3)
        self.assertEqual(o["light.b"], 0.0)
        self.assertGreater(o["light.a"], 0.0)
        self.assertAlmostEqual(o["light.a"], o["light.c"])

    def test_sample_hits_the_palette_colours_and_blends_between(self):
        pal = [d.Colour(0.1, 0.1, 100), d.Colour(0.5, 0.3, 50), d.Colour(0.3, 0.5, 100)]
        self.assertEqual(c.sample(pal, 0.0), (0.1, 0.1, 100))
        for got, want in zip(c.sample(pal, 1 / 3), (0.5, 0.3, 50), strict=True):
            self.assertAlmostEqual(got, want)
        for got, want in zip(c.sample(pal, 1 / 6), (0.3, 0.2, 75), strict=True):
            self.assertAlmostEqual(got, want)

    def test_the_palette_loops_without_a_jump(self):
        pal = [d.Colour(0.1, 0.1), d.Colour(0.5, 0.3), d.Colour(0.3, 0.5)]
        start = c.sample(pal, 0.0)
        for phase in (0.999999, 1.0, 2.0, -1.0):
            end = c.sample(pal, phase)
            self.assertAlmostEqual(end[0], start[0], places=4)
            self.assertAlmostEqual(end[1], start[1], places=4)

    def test_a_single_colour_is_constant(self):
        pal = [d.Colour(0.2, 0.3, 80)]
        self.assertEqual(c.sample(pal, 0.37), (0.2, 0.3, 80))

    def test_samples_never_leave_the_palettes_range(self):
        pal = [d.Colour(0.1, 0.2), d.Colour(0.5, 0.6), d.Colour(0.3, 0.4)]
        for i in range(200):
            x, y, _ = c.sample(pal, i / 200)
            self.assertTrue(0.1 - 1e-9 <= x <= 0.5 + 1e-9)
            self.assertTrue(0.2 - 1e-9 <= y <= 0.6 + 1e-9)


if __name__ == "__main__":
    unittest.main()


def strip_zones(centre, parts=3, length=0.1, alt="strip-1"):
    """The zones of one strip lying along x around `centre`, as an area saves them."""
    return [
        d.AreaLight(f"light.strip_zone_{k + 1}", centre + (k / (parts - 1) - 0.5) * length, 0.0, 0.0, f"strip-1_zone_{k + 1}", alt)
        for k in range(parts)
    ]


class ZoneTests(unittest.TestCase):
    def test_the_zones_of_a_short_strip_still_cover_the_palette_between_them(self):
        room = [d.AreaLight("light.far_left", -1.0, 0.0, 0.0), d.AreaLight("light.far_right", 1.0, 0.0, 0.0)]
        o = c.offsets(room + strip_zones(0.0, length=0.1), "x", 100, 4)
        by_position = [o[f"light.strip_zone_{k}"] for k in (1, 2, 3)]
        self.assertEqual(by_position, sorted(by_position))
        # By position alone they would differ by 0.0375 of a loop (a tenth of the room); now by the whole span of the palette.
        self.assertAlmostEqual(by_position[2] - by_position[0], 0.75)
        self.assertAlmostEqual(sum(by_position) / 3, 0.375)  # centred on where the strip stands

    def test_range_zero_still_gives_a_strip_one_colour_and_range_scales_its_spread(self):
        zones = strip_zones(0.0)
        self.assertEqual(set(c.offsets(zones, "x", 0, 4).values()), {0.0})
        half = c.offsets(zones, "x", 50, 4)
        self.assertAlmostEqual(half["light.strip_zone_3"] - half["light.strip_zone_1"], 0.375)

    def test_zones_the_direction_cannot_tell_apart_keep_the_order_of_their_names(self):
        zones = [d.AreaLight(f"light.strip_zone_{k}", 0.0, 0.0, 0.0, f"u{k}", "strip-1") for k in (1, 2, 3)]
        o = c.offsets(zones, "x", 100, 4)
        self.assertLess(o["light.strip_zone_1"], o["light.strip_zone_2"])
        self.assertLess(o["light.strip_zone_2"], o["light.strip_zone_3"])

    def test_a_light_that_is_alone_in_its_group_and_other_lights_are_placed_by_position(self):
        mixed = [d.AreaLight("light.a", -1.0, 0.0, 0.0), d.AreaLight("light.b", 1.0, 0.0, 0.0, "", "only-part")]
        o = c.offsets(mixed, "x", 100, 4)
        self.assertEqual(o, {"light.a": 0.0, "light.b": 0.75})

    def test_two_strips_each_cover_the_palette_and_stay_apart_by_position(self):
        left = [d.AreaLight(f"light.l_zone_{k}", -0.5 + k * 0.05, 0.0, 0.0, f"l_zone_{k}", "left") for k in (1, 2, 3)]
        right = [d.AreaLight(f"light.r_zone_{k}", 0.5 + k * 0.05, 0.0, 0.0, f"r_zone_{k}", "right") for k in (1, 2, 3)]
        o = c.offsets(left + right, "x", 100, 4)
        self.assertAlmostEqual(o["light.l_zone_3"] - o["light.l_zone_1"], 0.75)
        self.assertAlmostEqual(o["light.r_zone_3"] - o["light.r_zone_1"], 0.75)
        self.assertGreater(o["light.r_zone_2"], o["light.l_zone_2"])
