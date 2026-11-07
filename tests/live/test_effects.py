# SPDX-License-Identifier: GPL-3.0-or-later
import math
import unittest

from tests.live.fakes import FakeDriver, info
from tests.support import load

c = load("live.colours")
const = load("live.const")
d = load("live.definitions")
e = load("live.engine")
effects = load("live.effects")
lib = load("live.library")

PLACES = [{"entity_id": "light.a", "x": -1}, {"entity_id": "light.b", "x": 0.2, "y": 0.4}, {"entity_id": "light.c", "x": 1, "z": 1}]


def definition(**kw):
    data = {"scene_id": "s", "lights": PLACES, "palette": [{"hs": [0, 100]}, {"k": 2700, "b": 50}, {"xy": [0.3, 0.3]}]}
    data.update(kw)
    return d.parse_definition(data)


class SeamTests(unittest.TestCase):
    def test_every_source_name_has_a_builder_and_every_builder_a_name(self):
        self.assertEqual(set(effects.BUILDERS), set(const.COLOUR_SOURCES))

    def test_every_source_gives_a_finite_colour_for_every_light_at_any_moment(self):
        for name in const.COLOUR_SOURCES:
            source = effects.BUILDERS[name](definition(colour_source=name))
            self.assertGreaterEqual(source.steps_per_loop, 1, name)
            for light in PLACES:
                for phase in (0.0, 0.25, 0.999999):
                    for progress in (0.0, 0.3, 17.5, 10_000.25):
                        x, y, b = source.colour(light["entity_id"], phase, progress)
                        self.assertTrue(all(math.isfinite(v) for v in (x, y, b)), (name, phase, progress))
                        self.assertTrue(0 <= x <= 1 and 0 <= y <= 1 and 0 < b <= 100.0001, (name, x, y, b))

    def test_a_source_is_deterministic(self):
        for name in const.COLOUR_SOURCES:
            a, b = (effects.BUILDERS[name](definition(colour_source=name)) for _ in range(2))
            for progress in (0.0, 1.3, 250.75):
                self.assertEqual(a.colour("light.b", 0.4, progress), b.colour("light.b", 0.4, progress), name)

    def test_the_palette_source_is_the_palette_blend_at_each_lights_offset(self):
        v = definition(range=60, spread="x")
        offs = c.offsets(v.lights, v.spread, v.range_pct, len(v.palette))
        source = effects.BUILDERS["palette"](v)
        for light in v.lights:
            self.assertEqual(source.colour(light.entity_id, 0.35, 99.0), c.sample(v.palette, 0.35 + offs[light.entity_id]))
        self.assertEqual(source.steps_per_loop, len(v.palette) * effects.STEPS_PER_COLOUR)

    def test_a_plain_scene_shows_exactly_its_colour_source(self):
        v = definition(range=60, spread="x")
        look = effects.build(v)
        source = effects.BUILDERS["palette"](v)
        for light in v.lights:
            self.assertEqual(look.colour(light.entity_id, 0.35, 3.0, 99.0), source.colour(light.entity_id, 0.35, 3.0))
            self.assertEqual(look.brightness(light.entity_id), v.brightness)
            self.assertIsNone(look.native(light.entity_id))


class DefinitionTests(unittest.TestCase):
    def test_a_definition_without_a_colour_source_shows_the_palette(self):
        self.assertEqual(definition().colour_source, "palette")

    def test_an_unknown_or_malformed_colour_source_is_refused(self):
        for bad in ("disco", "", None, 3, ["palette"]):
            with self.assertRaises(d.DefinitionError, msg=bad):
                definition(colour_source=bad)


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.driver = FakeDriver({p["entity_id"]: info() for p in PLACES})
        self.now = 1000.0
        self.session = e.Session(definition(speed=6), self.now)

    def advance(self, seconds):
        self.now += seconds
        self.session.step(self.now, self.driver, set())

    def test_progress_counts_loops_at_the_scenes_speed_and_phase_stays_within_one(self):
        for speed in (2, 6, 11):
            session = e.Session(definition(speed=speed), self.now)
            session.step(self.now + c.cycle_seconds(speed) * 2.5, self.driver, set())
            self.assertAlmostEqual(session.progress, 2.5, msg=speed)
            self.assertAlmostEqual(session.phase, 0.5, msg=speed)

    def test_progress_only_goes_up_across_a_speed_change(self):
        self.advance(20)
        before = self.session.progress
        self.session.retune(definition(speed=11))
        self.advance(5)
        self.assertGreater(self.session.progress, before)

    def test_a_frozen_scene_stops_both(self):
        self.advance(20)
        self.session.frozen = True
        phase, progress = self.session.phase, self.session.progress
        self.advance(60)
        self.assertEqual((self.session.phase, self.session.progress), (phase, progress))

    def test_the_running_scene_reports_its_colour_source(self):
        engine = e.Engine(self.driver, clock=lambda: self.now, spawn=lambda coro: coro.close())
        engine.start(definition())
        self.assertEqual(engine.snapshot()["s"]["colour_source"], "palette")


class LibraryTests(unittest.TestCase):
    def test_a_saved_scene_keeps_its_colour_source_and_a_start_request_carries_it(self):
        library = lib.Library()
        scene = library.save_scene({"id": "s", "name": "S", "colour_source": "palette", "preset": "ocean", "lights": PLACES})
        self.assertEqual(scene["colour_source"], "palette")
        self.assertEqual(library.request({"scene_id": "s"})["colour_source"], "palette")

    def test_an_unknown_colour_source_is_not_saved(self):
        library = lib.Library()
        with self.assertRaises(d.DefinitionError):
            library.save_scene({"id": "s", "name": "S", "colour_source": "disco"})
        self.assertEqual(library.scenes, {})
        restored, problems = lib.Library.restore({"scenes": {"s": {"id": "s", "name": "S", "colour_source": "disco"}}})
        self.assertEqual(restored.scenes, {})
        self.assertEqual(len(problems), 1)


if __name__ == "__main__":
    unittest.main()


class SegmentedTests(unittest.TestCase):
    """Segmented: each colour of the palette as it is, one after the other, with none in between (linear blends them)."""

    PALETTE = [{"xy": [0.6, 0.35]}, {"xy": [0.2, 0.2]}, {"xy": [0.3, 0.55]}]

    def _look(self, **kw):
        return effects.build(definition(palette=self.PALETTE, range=0, **kw))

    def test_every_colour_a_light_shows_is_a_colour_of_the_palette(self):
        look = self._look(mode="segmented")
        shown = {tuple(round(v, 3) for v in look.colour("light.a", p / 200, 0.0, 0.0)[:2]) for p in range(200)}
        self.assertEqual(shown, {(0.6, 0.35), (0.2, 0.2), (0.3, 0.55)})

    def test_linear_shows_colours_between_them(self):
        look = self._look()
        shown = {tuple(round(v, 3) for v in look.colour("light.a", p / 200, 0.0, 0.0)[:2]) for p in range(200)}
        self.assertGreater(len(shown), 20)

    def test_the_colours_change_at_equal_parts_of_the_loop_and_the_wait_says_when(self):
        look = self._look(mode="segmented")
        self.assertEqual(look.colour("light.a", 0.0, 0, 0)[:2], (0.6, 0.35))
        self.assertEqual(look.colour("light.a", 0.3, 0, 0)[:2], (0.6, 0.35))
        self.assertAlmostEqual(look.until_next("light.a", 0.0), 1 / 3)
        self.assertAlmostEqual(look.until_next("light.a", 0.25), 1 / 3 - 0.25)
        self.assertAlmostEqual(look.until_next("light.a", 1 / 3 + 0.01), 1 / 3 - 0.01)
        after = look.colour("light.a", 0.25 + (1 / 3 - 0.25) + 0.001, 0, 0)[:2]
        self.assertEqual(after, (0.2, 0.2))

    def test_a_light_follows_its_own_place_so_two_lights_change_at_different_times(self):
        look = effects.build(definition(palette=self.PALETTE, range=100, mode="segmented"))
        self.assertNotAlmostEqual(look.until_next("light.a", 0.0), look.until_next("light.b", 0.0))

    def test_linear_and_a_single_colour_never_wait_for_a_change(self):
        self.assertIsNone(self._look().until_next("light.a", 0.0))
        one = effects.build(definition(palette=[{"xy": [0.3, 0.3]}], mode="segmented"))
        self.assertIsNone(one.until_next("light.a", 0.0))

    def test_the_rainbow_is_cut_into_its_steps_and_a_lights_own_palette_is_segmented_too(self):
        look = effects.build(definition(colour_source="rainbow", mode="segmented", range=0))
        shown = {look.colour("light.a", p / 400, 0, 0)[:2] for p in range(400)}
        self.assertEqual(len(shown), effects.RAINBOW_STEPS)
        own = effects.build(
            definition(mode="segmented", range=0, looks={"light.a": {"palette": [{"xy": [0.6, 0.35]}, {"xy": [0.2, 0.2]}]}})
        )
        colours = {tuple(round(v, 3) for v in own.colour("light.a", p / 100, 0, 0)[:2]) for p in range(100)}
        self.assertEqual(colours, {(0.6, 0.35), (0.2, 0.2)})
