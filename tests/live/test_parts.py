# SPDX-License-Identifier: GPL-3.0-or-later
"""Colour sources, brightness effects, per-light looks and device actions (HP-10.2 to HP-10.4, HP-10.6, HP-10.7)."""

import math
import unittest
from itertools import pairwise

from tests.live.fakes import FakeDriver, info
from tests.support import load

c = load("live.colours")
const = load("live.const")
d = load("live.definitions")
e = load("live.engine")
fx = load("live.effects")
lib = load("live.library")

LIGHTS = [
    {"entity_id": "light.a", "x": -1},
    {"entity_id": "light.b", "x": 0.0, "y": 0.5},
    {"entity_id": "light.c", "x": 1},
]


def definition(**kw):
    data = {
        "scene_id": "s",
        "lights": LIGHTS,
        "palette": [{"hs": [0, 100]}, {"k": 2700, "b": 50}],
        "speed": 6,
        "range": 100,
        "brightness": 200,
    }
    data.update(kw)
    return d.parse_definition(data)


def moments(count=400, step=0.37):
    return [i * step for i in range(count)]


class RainbowTests(unittest.TestCase):
    def test_range_zero_gives_every_light_the_same_colour_and_full_range_gives_them_different_ones(self):
        same = fx.BUILDERS["rainbow"](definition(colour_source="rainbow", range=0))
        self.assertEqual(len({same.colour(light["entity_id"], 0.3, 0.3) for light in LIGHTS}), 1)
        apart = fx.BUILDERS["rainbow"](definition(colour_source="rainbow", range=100))
        self.assertEqual(len({apart.colour(light["entity_id"], 0.3, 0.3) for light in LIGHTS}), 3)

    def test_it_goes_once_round_the_wheel_per_loop_and_is_always_full_brightness(self):
        source = fx.BUILDERS["rainbow"](definition(colour_source="rainbow", range=0))
        colours = [source.colour("light.a", i / 60, 0) for i in range(60)]
        self.assertGreater(len({(x, y) for x, y, _ in colours}), 30)
        self.assertTrue(all(b == 100.0 for _, _, b in colours))
        a, b = source.colour("light.a", 0.0, 0), source.colour("light.a", 0.999999, 0)
        self.assertAlmostEqual(a[0], b[0], delta=0.01)  # the loop closes without a jump
        self.assertAlmostEqual(a[1], b[1], delta=0.01)


class ModulatorTests(unittest.TestCase):
    def make(self, kind, speed=6, strength=100):
        look = fx.build(
            definition(palette=[{"k": 2700}], effects=[{"type": kind, "speed": speed, "strength": strength}])
        )  # one full-brightness colour
        return lambda entity_id, seconds: look.colour(entity_id, 0.0, 0.0, seconds)[2] / 100.0

    def test_every_effect_stays_above_zero_and_never_brightens_beyond_the_colour(self):
        for kind in const.EFFECT_TYPES:
            for speed in (1, 6, 12):
                for strength in (1, 50, 100):
                    factor = self.make(kind, speed, strength)
                    for t in moments():
                        value = factor("light.a", t)
                        self.assertTrue(0.0 < value <= 1.0 + 1e-9, (kind, speed, strength, t, value))

    def test_every_effect_is_repeatable(self):
        for kind in const.EFFECT_TYPES:
            a, b = self.make(kind), self.make(kind)
            self.assertEqual([a("light.b", t) for t in moments(60)], [b("light.b", t) for t in moments(60)], kind)

    def test_strength_sets_how_far_the_brightness_falls(self):
        for kind in const.EFFECT_TYPES:
            weak, strong = self.make(kind, strength=10), self.make(kind, strength=100)
            low_weak = min(weak("light.a", t) for t in moments(2000, 0.11))
            low_strong = min(strong("light.a", t) for t in moments(2000, 0.11))
            self.assertGreater(low_weak, low_strong, kind)
            self.assertGreater(low_weak, 0.85, kind)

    def test_pulse_breathes_between_its_depth_and_full(self):
        factor = self.make("pulse", speed=6, strength=100)
        values = [factor("light.a", t) for t in moments(1000, 0.05)]
        self.assertAlmostEqual(max(values), 1.0, delta=0.01)
        self.assertAlmostEqual(min(values), 0.3, delta=0.01)

    def test_pulse_runs_a_little_behind_in_the_next_light(self):
        factor = self.make("pulse")
        self.assertNotEqual([factor("light.a", t) for t in moments(30)], [factor("light.c", t) for t in moments(30)])

    def test_flicker_and_sparkle_give_each_light_its_own_course(self):
        for kind in ("flicker", "sparkle"):
            factor = self.make(kind)
            courses = {tuple(round(factor(light["entity_id"], t), 4) for t in moments(80)) for light in LIGHTS}
            self.assertEqual(len(courses), 3, kind)

    def test_sparkle_brightens_now_and_then_to_full(self):
        factor = self.make("sparkle", speed=8, strength=100)
        values = [factor("light.a", t) for t in moments(3000, 0.07)]
        self.assertGreater(max(values), 0.95)
        self.assertGreater(sum(v < 0.5 for v in values), len(values) * 0.4)  # mostly dim

    def test_lightning_is_dim_between_flashes_and_flashes_to_full(self):
        factor = self.make("lightning", speed=12, strength=100)
        values = [factor("light.a", t) for t in moments(8000, 0.05)]
        self.assertAlmostEqual(max(values), 1.0, delta=0.01)
        self.assertAlmostEqual(min(values), 0.15, delta=0.01)
        self.assertGreater(sum(v < 0.2 for v in values), len(values) * 0.8)

    def test_lightning_sometimes_flashes_twice_in_a_row(self):
        factor = self.make("lightning", speed=12, strength=100)
        bright = [factor("light.a", i * 0.02) > 0.6 for i in range(40_000)]
        flashes = sum(1 for i in range(1, len(bright)) if bright[i] and not bright[i - 1])
        windows = 40_000 * 0.02 / c.cycle_seconds(12)
        self.assertGreater(flashes, windows * 1.15)  # more flashes than windows: some windows have two
        self.assertLess(flashes, windows * 2.05)

    def test_lights_flash_nearly_together(self):
        factor = self.make("lightning", speed=12, strength=100)
        first = {
            light["entity_id"]: next(i * 0.01 for i in range(100_000) if factor(light["entity_id"], i * 0.01) > 0.9) for light in LIGHTS
        }
        self.assertLess(max(first.values()) - min(first.values()), 0.2)


class AppearanceTests(unittest.TestCase):
    def test_scene_effects_apply_to_every_light_and_multiply(self):
        both = fx.build(definition(effects=[{"type": "pulse"}, {"type": "flicker"}]))
        pulse = fx.build(definition(effects=[{"type": "pulse"}]))
        flicker = fx.build(definition(effects=[{"type": "flicker"}]))
        plain = fx.build(definition())
        for t in (1.0, 7.3, 31.9):
            base = plain.colour("light.b", 0.2, 0, t)[2]
            expected = base * (pulse.colour("light.b", 0.2, 0, t)[2] / base) * (flicker.colour("light.b", 0.2, 0, t)[2] / base)
            self.assertAlmostEqual(both.colour("light.b", 0.2, 0, t)[2], expected, places=6)

    def test_a_lights_own_effects_replace_the_scenes_and_an_empty_list_means_none(self):
        v = definition(effects=[{"type": "pulse"}], looks={"light.a": {"effects": []}, "light.b": {"effects": [{"type": "flicker"}]}})
        look, plain = fx.build(v), fx.build(definition())
        t = 12.3
        self.assertEqual(look.colour("light.a", 0.2, 0, t), plain.colour("light.a", 0.2, 0, t))  # none
        self.assertNotEqual(look.colour("light.b", 0.2, 0, t), plain.colour("light.b", 0.2, 0, t))  # flicker only
        self.assertNotEqual(look.colour("light.c", 0.2, 0, t), plain.colour("light.c", 0.2, 0, t))  # the scene's pulse

    def test_a_lights_own_palette_rotates_on_that_light_alone(self):
        v = definition(looks={"light.a": {"palette": [{"hs": [120, 100]}, {"hs": [240, 100]}]}})
        look, plain = fx.build(v), fx.build(definition())
        self.assertNotEqual(look.colour("light.a", 0.1, 0, 0), plain.colour("light.a", 0.1, 0, 0))
        self.assertNotEqual(look.colour("light.a", 0.1, 0, 0), look.colour("light.a", 0.6, 0, 0))  # it moves
        self.assertEqual(look.colour("light.b", 0.1, 0, 0), plain.colour("light.b", 0.1, 0, 0))

    def test_brightness_and_native_effect_belong_to_one_light(self):
        look = fx.build(definition(looks={"light.a": {"brightness": 50, "native": "underwater"}}))
        self.assertEqual((look.brightness("light.a"), look.brightness("light.b")), (50, 200))
        self.assertEqual((look.native("light.a"), look.native("light.b")), ("underwater", None))

    def test_fast_effects_ask_for_faster_updates_and_a_lower_floor(self):
        plain = fx.build(definition())
        wanted, floor = plain.interval("light.a", c.cycle_seconds(6))
        self.assertIsNone(floor)
        for kind in ("flicker", "sparkle", "lightning"):
            look = fx.build(definition(effects=[{"type": kind, "speed": 10}]))
            quick, low = look.interval("light.a", c.cycle_seconds(6))
            self.assertLess(quick, wanted, kind)
            self.assertLess(low, 1.5, kind)


class DefinitionTests(unittest.TestCase):
    def test_bad_effects_are_refused(self):
        for bad in (
            "pulse",
            [{"type": "disco"}],
            [{}],
            [{"type": "pulse", "speed": 13}],
            [{"type": "pulse", "strength": 0}],
            [{"type": "pulse"}] * 5,
            [3],
        ):
            with self.assertRaises(d.DefinitionError, msg=bad):
                definition(effects=bad)

    def test_actions_are_on_or_off_in_the_allowed_domains_only(self):
        ok = d.parse_actions([{"entity_id": f"{domain}.x", "do": "off"} for domain in const.ACTION_DOMAINS])
        self.assertEqual(len(ok), len(const.ACTION_DOMAINS))
        for bad in (
            [{"entity_id": "lock.door", "do": "off"}],
            [{"entity_id": "script.go", "do": "on"}],
            [{"entity_id": "automation.a", "do": "on"}],
            [{"entity_id": "alarm_control_panel.a", "do": "off"}],
            [{"entity_id": "light.x", "do": "toggle"}],
            [{"entity_id": "light.x"}],
            [{"entity_id": "light.x", "do": "on"}, {"entity_id": "light.x", "do": "off"}],
            [{"entity_id": "light.x.y", "do": "on"}],
            [{"entity_id": "Light.X", "do": "on"}],
            [{"entity_id": "light.x", "do": "on"}] * 2,
            [{"entity_id": f"light.l{i}", "do": "on"} for i in range(const.MAX_ACTIONS + 1)],
            "light.x",
        ):
            with self.assertRaises(d.DefinitionError, msg=bad):
                d.parse_actions(bad)

    def test_a_look_for_a_light_that_is_not_in_the_scene_is_refused(self):
        with self.assertRaises(d.DefinitionError):
            definition(looks={"light.zzz": {"brightness": 5}})

    def test_bad_looks_are_refused(self):
        for bad in ({"light.a": {"native": "Not An Effect!"}}, {"light.a": {"palette": []}}, {"light.a": {"brightness": 0}}, {"light.a": "x"}, [1]):
            with self.assertRaises(d.DefinitionError, msg=bad):
                definition(looks=bad)


class LibraryTests(unittest.TestCase):
    def test_a_saved_scene_keeps_its_parts_in_one_canonical_form(self):
        library = lib.Library()
        scene = library.save_scene(
            {
                "id": "s",
                "name": "S",
                "preset": "ocean",
                "effects": [{"type": "pulse"}],
                "looks": {"light.a": {"native": "underwater", "palette": [{"hs": [10, 90]}], "junk": 1}},
                "actions": [{"entity_id": "media_player.tv", "do": "off", "junk": 2}],
            }
        )
        self.assertEqual(scene["effects"], [{"type": "pulse", "speed": 6, "strength": 60}])
        self.assertEqual(scene["looks"], {"light.a": {"palette": [{"hs": [10, 90]}], "native": "underwater"}})
        self.assertEqual(scene["actions"], [{"entity_id": "media_player.tv", "do": "off"}])

    def test_bad_parts_are_not_saved(self):
        library = lib.Library()
        for bad in (
            {"effects": [{"type": "disco"}]},
            {"actions": [{"entity_id": "lock.door", "do": "off"}]},
            {"looks": {"switch.a": {"brightness": 5}}},
            {"looks": {"light.a": {"native": "Not An Effect!"}}},
        ):
            with self.assertRaises(d.DefinitionError, msg=bad):
                library.save_scene({"id": "s", "name": "S", **bad})
        self.assertEqual(library.scenes, {})

    def test_a_stored_scene_with_a_forbidden_action_is_left_out_on_restore(self):
        stored = {"scenes": {"s": {"id": "s", "name": "S", "actions": [{"entity_id": "lock.door", "do": "off"}]}}}
        library, problems = lib.Library.restore(stored)
        self.assertEqual(library.scenes, {})
        self.assertEqual(len(problems), 1)

    def test_a_start_request_carries_the_parts_and_drops_looks_of_lights_that_left_the_area(self):
        library = lib.Library()
        library.save_area({"id": "room", "name": "Room", "lights": [{"entity_id": "light.a"}, {"entity_id": "light.b"}]})
        library.save_scene(
            {
                "id": "s",
                "name": "S",
                "preset": "ocean",
                "area": "room",
                "effects": [{"type": "pulse"}],
                "looks": {"light.a": {"brightness": 9}, "light.gone": {"brightness": 9}},
                "actions": [{"entity_id": "media_player.tv", "do": "off"}],
            }
        )
        v = d.parse_definition(library.request({"scene_id": "s"}))
        self.assertEqual([x.kind for x in v.effects], ["pulse"])
        self.assertEqual(list(v.looks), ["light.a"])
        self.assertEqual([(a.entity_id, a.do) for a in v.actions], [("media_player.tv", "off")])


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.driver = FakeDriver({"light.a": info(), "light.b": info(), "light.c": info()})

    def run_for(self, v, seconds=120.0, step=0.25):
        session = e.Session(v, 1000.0)
        now, commands = 1000.0, []
        for _ in range(int(seconds / step)):
            now += step
            result = session.step(now, self.driver, set())
            self.driver.follow(result.commands)
            commands.extend((round(now - 1000.0, 2), eid, data) for eid, data in result.commands)
        return session, commands

    def test_a_pulse_moves_the_brightness_between_its_bounds_while_a_plain_scene_holds_it(self):
        _, plain = self.run_for(definition(palette=[{"k": 2700}]))
        _, pulsing = self.run_for(definition(palette=[{"k": 2700}], effects=[{"type": "pulse", "speed": 10, "strength": 100}]))
        self.assertEqual({data["brightness"] for _, eid, data in plain}, {200})
        levels = [data["brightness"] for _, eid, data in pulsing if eid == "light.a"]
        self.assertLessEqual(max(levels), 200)
        self.assertLess(min(levels), 90)
        self.assertGreater(len(set(levels)), 5)

    def test_a_flicker_is_updated_faster_than_a_plain_scene(self):
        _, plain = self.run_for(definition(), 60)
        _, flick = self.run_for(definition(effects=[{"type": "flicker", "speed": 12}]), 60)
        count = lambda commands: sum(1 for _, eid, _ in commands if eid == "light.a")  # noqa: E731
        self.assertGreater(count(flick), count(plain) * 2)
        self.assertTrue(all(data["transition"] < 1.5 for _, _, data in flick))

    def test_a_light_that_plays_its_own_effect_is_sent_the_effect_and_a_moving_colour(self):
        self.driver.lights["light.a"] = info(effects=("underwater", "candle"))
        v = definition(looks={"light.a": {"native": "underwater"}}, palette=[{"hs": [0, 100]}, {"hs": [240, 100]}])
        _, commands = self.run_for(v, 60, 0.5)
        mine = [data for _, eid, data in commands if eid == "light.a"]
        self.assertTrue(all("native_effect" in data and "xy_color" not in data and "transition" not in data for data in mine))
        self.assertTrue(all(data["native_effect"]["effect"] == "underwater" for data in mine))
        self.assertGreater(len({tuple(data["native_effect"]["xy"]) for data in mine}), 3)  # the colours rotate
        self.assertTrue(all("native_effect" not in data for _, eid, data in commands if eid != "light.a"))

    def test_a_native_effect_is_not_resent_more_often_than_the_bridge_should_be_asked(self):
        self.driver.lights["light.a"] = info(effects=("underwater",))
        _, commands = self.run_for(definition(looks={"light.a": {"native": "underwater"}}, speed=12), 60, 0.25)
        times = [t for t, eid, _ in commands if eid == "light.a"]
        self.assertGreaterEqual(min(b - a for a, b in pairwise(times)), e.NATIVE_MIN_INTERVAL - 0.01)

    def test_a_light_that_does_not_offer_the_effect_gets_plain_colours(self):
        v = definition(looks={"light.a": {"native": "underwater"}})
        _, commands = self.run_for(v, 20)
        self.assertTrue(all("native_effect" not in data and "xy_color" in data for _, eid, data in commands))

    def test_a_native_light_switched_off_leaves_the_scene(self):
        self.driver.lights["light.a"] = info(effects=("underwater",))
        session, _ = self.run_for(definition(looks={"light.a": {"native": "underwater"}}), 10)
        self.driver.lights["light.a"] = info("off", effects=("underwater",))
        result = session.step(1100.0, self.driver, set())
        self.assertEqual(result.dropped, ["light.a"])

    def test_a_light_with_its_own_brightness_uses_it(self):
        _, commands = self.run_for(definition(palette=[{"k": 2700}], looks={"light.a": {"brightness": 40}}), 10)
        self.assertEqual({data["brightness"] for _, eid, data in commands if eid == "light.a"}, {40})
        self.assertEqual({data["brightness"] for _, eid, data in commands if eid == "light.b"}, {200})

    def test_a_frozen_scene_stops_the_effects(self):
        session, _ = self.run_for(definition(effects=[{"type": "pulse"}]), 20)
        seconds = session.seconds
        session.frozen = True
        session.step(session.last + 50, self.driver, set())
        self.assertEqual(session.seconds, seconds)

    def test_rainbow_plays_through_the_engine_on_a_white_only_light_as_whites(self):
        self.driver.lights["light.a"] = info(colour=False, xy=None, kelvin=2700, mode="color_temp")
        _, commands = self.run_for(definition(colour_source="rainbow"), 30)
        self.assertTrue(
            all("color_temp_kelvin" in data and not math.isnan(data["color_temp_kelvin"]) for _, eid, data in commands if eid == "light.a")
        )


if __name__ == "__main__":
    unittest.main()


class BrightnessEffectsKeepTheirLightsTests(unittest.TestCase):
    """Found on the real lights: lightning and sparkle swing the brightness so far, and a light follows so slowly, that the
    engine took it for a light a person had changed and dropped it, so the scene went still."""

    def run_scene(self, effects, lights, seconds=120.0, step=0.25, follow=False):
        driver = FakeDriver({light: info() for light in lights})
        v = definition(palette=[{"k": 2700}], effects=effects, lights=[{"entity_id": light, "x": i} for i, light in enumerate(lights)])
        session = e.Session(v, 1000.0)
        now, dropped = 1000.0, set()
        for _ in range(int(seconds / step)):
            now += step
            result = session.step(now, driver, set())
            if follow:
                driver.follow(result.commands)  # otherwise the lights stay as they were: far from every target
            dropped.update(result.dropped)
            for entity_id in result.dropped:
                session.lights.pop(entity_id, None)
        return session, dropped, driver

    def test_a_light_that_lags_behind_a_strong_brightness_effect_stays_in_the_scene(self):
        for kind in ("lightning", "sparkle", "flicker", "pulse"):
            _, dropped, _ = self.run_scene([{"type": kind, "speed": 12, "strength": 100}], ["light.a", "light.b"])
            self.assertEqual(dropped, set(), kind)

    def test_without_brightness_effects_a_light_far_from_its_target_is_still_taken_for_changed_by_a_person(self):
        driver = FakeDriver({"light.a": info(brightness=10)})  # the scene asks for 200
        session = e.Session(definition(palette=[{"k": 2700}], lights=[{"entity_id": "light.a"}]), 1000.0)
        dropped = set()
        for i in range(1, 80):
            dropped.update(session.step(1000.0 + i * 0.5, driver, set()).dropped)
        self.assertEqual(dropped, {"light.a"})

    def test_with_brightness_effects_a_light_switched_off_or_given_another_colour_still_leaves(self):
        session, _, driver = self.run_scene([{"type": "lightning", "speed": 12, "strength": 100}], ["light.a", "light.b"], 20, follow=True)
        driver.lights["light.a"] = info("off")
        driver.lights["light.b"] = info(xy=(0.15, 0.7))  # a person picked green; the scene's colour is a warm white
        result = session.step(session.last + 5, driver, set())
        self.assertEqual(set(result.dropped), {"light.a", "light.b"})


class NativeEffectTests(unittest.TestCase):
    def test_any_well_formed_effect_name_is_accepted_and_the_light_decides_whether_it_can_play_it(self):
        for name in ("candle", "underwater", "govee_aurora", "x1"):
            self.assertEqual(fx.build(definition(looks={"light.a": {"native": name}})).native("light.a"), name)

    def test_an_area_light_keeps_its_unique_id_and_an_old_one_has_none(self):
        area = lib.clean_area({"id": "r", "name": "R", "lights": [{"entity_id": "light.a", "x": 0.5, "uid": "abc-1"}, {"entity_id": "light.b"}]})
        self.assertEqual(area["lights"][0]["uid"], "abc-1")
        self.assertNotIn("uid", area["lights"][1])
        with self.assertRaises(d.DefinitionError):
            lib.clean_area({"id": "r", "name": "R", "lights": [{"entity_id": "light.a", "uid": 5}]})
