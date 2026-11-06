# SPDX-License-Identifier: GPL-3.0-or-later
import asyncio
import unittest

from tests.live.fakes import HUE_RATE, Clock, FakeDriver, VirtualClock, info
from tests.support import load

d = load("live.definitions")
e = load("live.engine")
ident = load("live.identify")


def definition(lights=("light.a", "light.b"), **kw):
    data = {
        "scene_id": kw.pop("scene_id", "s1"),
        "lights": [{"entity_id": light, "x": i / 10} for i, light in enumerate(lights)],
        "palette": [{"xy": [0.2, 0.2]}, {"xy": [0.6, 0.35]}],
        "speed": 6,
        "range": 100,
        "brightness": 200,
    }
    data.update(kw)
    return d.parse_definition(data)


def session(driver, **kw):
    clock = Clock()
    return e.Session(definition(**kw), clock.now), clock


class StepTests(unittest.TestCase):
    def test_every_light_that_is_on_gets_a_colour_with_a_transition(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        r = s.step(clock.now, drv, set())
        self.assertEqual([c[0] for c in r.commands], ["light.a", "light.b"])
        data = r.commands[0][1]
        self.assertEqual(set(data), {"brightness", "xy_color", "transition"})
        self.assertGreaterEqual(data["transition"], e.MIN_INTERVAL)
        self.assertLessEqual(data["transition"], e.MAX_INTERVAL)
        self.assertEqual(data["brightness"], 200)

    def test_a_light_that_is_off_is_never_turned_on_by_a_scene(self):
        drv = FakeDriver({"light.a": info("off"), "light.b": info()})
        s, clock = session(drv)
        for _ in range(5):
            r = s.step(clock.now, drv, set())
            self.assertNotIn("light.a", [c[0] for c in r.commands])
            clock.now += 3
        self.assertIn("light.a", s.lights)  # it still belongs to the scene

    def test_a_scene_started_by_a_person_turns_on_the_lights_that_are_off(self):
        drv = FakeDriver({"light.a": info("off"), "light.b": info()})
        s, clock = session(drv, wake=True)
        r = s.step(clock.now, drv, set())
        self.assertEqual([c[0] for c in r.commands], ["light.a", "light.b"])

    def test_a_woken_light_switched_off_again_leaves_the_scene(self):
        drv = FakeDriver({"light.a": info("off"), "light.b": info()})
        s, clock = session(drv, wake=True)
        drv.follow(s.step(clock.now, drv, set()).commands)
        drv.lights["light.a"] = info("off")
        clock.now += 6
        self.assertEqual(s.step(clock.now, drv, set()).dropped, ["light.a"])

    def test_a_light_that_is_switched_on_later_joins(self):
        drv = FakeDriver({"light.a": info("off"), "light.b": info()})
        s, clock = session(drv)
        s.step(clock.now, drv, set())
        drv.lights["light.a"] = info()
        r = s.step(clock.now, drv, set())
        self.assertIn("light.a", [c[0] for c in r.commands])

    def test_unavailable_lights_are_skipped_and_kept(self):
        drv = FakeDriver({"light.a": info("unavailable"), "light.b": info()})
        s, clock = session(drv)
        r = s.step(clock.now, drv, set())
        self.assertEqual([c[0] for c in r.commands], ["light.b"])
        self.assertEqual(r.dropped, [])

    def test_updates_are_spaced_by_the_interval(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        drv.follow(s.step(clock.now, drv, set()).commands)
        clock.now += 0.5
        self.assertEqual(s.step(clock.now, drv, set()).commands, [])
        clock.now += 6.0
        self.assertEqual(len(s.step(clock.now, drv, set()).commands), 2)

    def test_a_light_without_transition_gets_static_commands_at_the_fps(self):
        drv = FakeDriver({"light.a": info(transition=False), "light.b": info(transition=False)})
        s, clock = session(drv, fps=4)
        first = s.step(clock.now, drv, set())
        drv.follow(first.commands)
        self.assertNotIn("transition", first.commands[0][1])
        clock.now += 0.2
        self.assertEqual(s.step(clock.now, drv, set()).commands, [])
        clock.now += 0.1
        self.assertEqual(len(s.step(clock.now, drv, set()).commands), 2)

    def test_a_white_only_light_gets_a_temperature_and_a_colour_light_gets_xy(self):
        drv = FakeDriver({"light.a": info(colour=False, xy=None), "light.b": info()})
        s, clock = session(drv)
        cmds = dict(s.step(clock.now, drv, set()).commands)
        self.assertIn("color_temp_kelvin", cmds["light.a"])
        self.assertNotIn("xy_color", cmds["light.a"])
        self.assertIn("xy_color", cmds["light.b"])

    def test_a_light_with_no_colour_support_at_all_gets_brightness_only(self):
        drv = FakeDriver({"light.a": info(colour=False, white=False, xy=None), "light.b": info()})
        s, clock = session(drv)
        data = dict(s.step(clock.now, drv, set()).commands)["light.a"]
        self.assertNotIn("xy_color", data)
        self.assertNotIn("color_temp_kelvin", data)
        self.assertIn("brightness", data)

    def test_range_spreads_the_colours_over_the_lights(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        cmds = dict(s.step(clock.now, drv, set()).commands)
        self.assertNotEqual(cmds["light.a"]["xy_color"], cmds["light.b"]["xy_color"])
        s2, clock2 = session(drv, **{"range": 0})
        cmds = dict(s2.step(clock2.now, drv, set()).commands)
        self.assertEqual(cmds["light.a"]["xy_color"], cmds["light.b"]["xy_color"])

    def test_the_palette_moves_with_time(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        r = s.step(clock.now, drv, set())
        drv.follow(r.commands)
        first = dict(r.commands)["light.a"]["xy_color"]
        clock.now += 20
        later = dict(s.step(clock.now, drv, set()).commands)["light.a"]["xy_color"]
        self.assertNotEqual(first, later)

    def test_a_held_light_is_left_alone(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        r = s.step(clock.now, drv, {"light.a"})
        self.assertEqual([c[0] for c in r.commands], ["light.b"])

    def test_a_light_changed_by_someone_leaves_after_its_colour_was_due(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        drv.follow(s.step(clock.now, drv, set()).commands)
        drv.lights["light.a"] = info(xy=(0.15, 0.7))  # far from what was sent
        clock.now += 6
        r = s.step(clock.now, drv, set())
        self.assertEqual(r.dropped, ["light.a"])
        self.assertEqual([c[0] for c in r.commands], ["light.b"])

    def test_a_light_switched_off_during_the_scene_leaves(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        drv.follow(s.step(clock.now, drv, set()).commands)
        drv.lights["light.a"] = info("off")
        clock.now += 6
        self.assertEqual(s.step(clock.now, drv, set()).dropped, ["light.a"])

    def test_a_light_a_little_behind_in_a_fade_is_not_taken_for_changed(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        first = s.step(clock.now, drv, set()).commands
        drv.follow(first)
        target = dict(first)["light.a"]["xy_color"]
        drv.lights["light.a"] = info(xy=(target[0] + 0.03, target[1] - 0.03), brightness=190)
        clock.now += 6
        self.assertEqual(s.step(clock.now, drv, set()).dropped, [])

    def test_a_frozen_session_sends_nothing_and_resumes_without_a_jump(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        drv.follow(s.step(clock.now, drv, set()).commands)
        s.frozen = True
        phase = s.phase
        clock.now += 50
        self.assertEqual(s.step(clock.now, drv, set()).commands, [])
        s.frozen = False
        s.last = clock.now
        s.step(clock.now, drv, set())
        self.assertAlmostEqual(s.phase, phase)

    def test_a_frozen_session_still_loses_lights_that_something_else_changed(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        drv.follow(s.step(clock.now, drv, set()).commands)
        s.frozen = True
        drv.lights["light.a"] = info(xy=(0.15, 0.7))
        clock.now += 8
        r = s.step(clock.now, drv, set())
        self.assertEqual(r.dropped, ["light.a"])
        self.assertEqual(r.commands, [])
        del s.lights["light.a"]  # the engine takes a dropped light out of the session
        drv.lights["light.b"] = info("off")
        clock.now += 1
        self.assertEqual(s.step(clock.now, drv, set()).dropped, ["light.b"])

    def test_a_frozen_session_keeps_lights_that_still_show_its_colours(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        s, clock = session(drv)
        drv.follow(s.step(clock.now, drv, set()).commands)
        s.frozen = True
        for _ in range(5):
            clock.now += 3
            self.assertEqual(s.step(clock.now, drv, set()).dropped, [])

    def test_brightness_follows_the_palette_colour_factor(self):
        data = {
            "scene_id": "s1",
            "lights": [{"entity_id": "light.a"}],
            "palette": [{"xy": [0.3, 0.3], "b": 50}],
            "brightness": 200,
        }
        s = e.Session(d.parse_definition(data), 0.0)
        drv = FakeDriver({"light.a": info()})
        self.assertEqual(s.step(0.0, drv, set()).commands[0][1]["brightness"], 100)


class EngineTests(unittest.TestCase):
    def test_the_loop_keeps_sending_and_respects_the_hue_rate(self):
        lights = tuple(f"light.l{i}" for i in range(8))
        drv = FakeDriver({light: info() for light in lights})

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition(lights=lights))
            await clock.run(30)
            engine.stop_all()

        asyncio.run(go())
        sent = len(drv.calls)
        self.assertGreater(sent, 8 * 4)
        self.assertLessEqual(sent / 30, HUE_RATE + 0.5)

    def test_two_scenes_cannot_hold_one_light_and_the_newer_wins(self):
        drv = FakeDriver({"light.a": info(), "light.b": info(), "light.c": info()})

        async def go():
            engine = e.Engine(drv)
            engine.start(definition(("light.a", "light.b"), scene_id="one"))
            engine.start(definition(("light.b", "light.c"), scene_id="two"))
            engine.stop_all()
            return engine

        async def check():
            engine = e.Engine(drv)
            engine.start(definition(("light.a", "light.b"), scene_id="one"))
            engine.start(definition(("light.b", "light.c"), scene_id="two"))
            result = (
                list(engine.sessions["one"].lights),
                list(engine.sessions["two"].lights),
                engine._owner["light.b"],
            )
            engine.stop_all()
            return result

        self.assertEqual(asyncio.run(check()), (["light.a"], ["light.b", "light.c"], "two"))

    def test_a_scene_that_loses_all_its_lights_ends(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            engine = e.Engine(drv)
            engine.start(definition(("light.a",), scene_id="one"))
            engine.start(definition(("light.a", "light.b"), scene_id="two"))
            result = "one" in engine.sessions
            engine.stop_all()
            return result

        self.assertFalse(asyncio.run(go()))

    def test_at_most_eight_scenes_run_at_once(self):
        drv = FakeDriver({f"light.l{i}": info() for i in range(9)})

        async def go():
            engine = e.Engine(drv)
            for i in range(8):
                engine.start(definition((f"light.l{i}",), scene_id=f"s{i}"))
            with self.assertRaises(ValueError):
                engine.start(definition(("light.l8",), scene_id="s8"))
            engine.start(definition(("light.l0",), scene_id="s0"))  # replacing one is fine
            engine.stop_all()

        asyncio.run(go())

    def test_stop_sends_nothing_more_and_leaves_the_lights_alone(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition())
            await clock.run(20)
            engine.stop("s1")
            count = len(drv.calls)
            await clock.run(60)
            return engine, count

        engine, count = asyncio.run(go())
        self.assertGreater(count, 0)
        self.assertEqual(len(drv.calls), count)
        self.assertEqual(engine.sessions, {})
        self.assertEqual(engine._owner, {})
        self.assertTrue(all(kind == "on" for kind, _, _ in drv.calls))  # nothing was turned off

    def test_starting_a_scene_again_replaces_it_and_ends_the_old_loop(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition())
            await clock.run(10)
            old = engine._tasks["s1"]
            engine.start(definition(speed=12))
            await clock.run(1)
            old_ended = old.done()
            first = len(drv.calls)
            await clock.run(30)
            engine.stop_all()
            return old_ended, engine, len(drv.calls) - first

        old_ended, _engine, sent = asyncio.run(go())
        self.assertTrue(old_ended)
        # one loop: at most one update of each light every MIN_INTERVAL
        self.assertLessEqual(sent, 2 * (30 / e.MIN_INTERVAL + 2))

    def test_freeze_and_play(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition())
            await clock.run(20)
            engine.freeze("s1")
            await clock.run(1)
            frozen_at = len(drv.calls)
            await clock.run(60)
            still = len(drv.calls)
            engine.play("s1")
            await clock.run(20)
            after = len(drv.calls)
            engine.stop_all()
            return frozen_at, still, after

        frozen_at, still, after = asyncio.run(go())
        self.assertEqual(frozen_at, still)
        self.assertGreater(after, still)

    def test_a_frozen_scene_ends_when_something_else_takes_all_its_lights(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition())
            await clock.run(10)
            engine.freeze("s1")
            await clock.run(3)
            still = "s1" in engine.sessions
            for light in ("light.a", "light.b"):  # a static scene sets other colours
                drv.lights[light] = info(xy=(0.15, 0.7), brightness=255)
            await clock.run(5)
            ended = "s1" not in engine.sessions
            await clock.run(1)
            return still, ended, dict(engine._tasks)

        still, ended, tasks = asyncio.run(go())
        self.assertTrue(still)
        self.assertTrue(ended)
        self.assertEqual(tasks, {})

    def test_update_changes_speed_and_is_shown_at_once(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition())
            await clock.run(20)
            before = len(drv.calls)
            engine.update("s1", speed=12, brightness=100)
            await clock.run(0.5)
            snap = engine.snapshot()["s1"]
            sent = drv.calls[before:]
            engine.stop_all()
            return snap, sent

        snap, sent = asyncio.run(go())
        self.assertEqual((snap["speed"], snap["brightness"]), (12, 100))
        self.assertEqual(len(sent), 2)
        self.assertTrue(all(c[2]["brightness"] <= 100 for c in sent))

    def test_update_of_an_unknown_scene_is_an_error(self):
        engine = e.Engine(FakeDriver({}))
        with self.assertRaises(KeyError):
            engine.update("nope", speed=3)

    def test_a_person_changing_a_light_removes_only_that_light(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            engine = e.Engine(drv)
            engine.start(definition())
            engine.changed_by_someone("light.a")
            engine.changed_by_someone("light.zzz")  # not in any scene: nothing happens
            result = list(engine.sessions["s1"].lights)
            engine.stop_all()
            return result

        self.assertEqual(asyncio.run(go()), ["light.b"])

    def test_one_failing_light_does_not_stop_the_others(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})
        drv.fail.add("light.a")

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition())
            await clock.run(20)
            engine.stop_all()

        asyncio.run(go())
        self.assertTrue(drv.calls)
        self.assertTrue(all(c[1] == "light.b" for c in drv.calls))

    def test_a_light_switched_off_by_a_person_mid_scene_stays_off(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition())
            await clock.run(10)
            drv.lights["light.a"] = info("off")
            await clock.run(30)
            engine.stop_all()

        asyncio.run(go())
        later = [c for c in drv.calls if c[1] == "light.a"]
        self.assertTrue(all(c[0] == "on" for c in later))
        self.assertLessEqual(len(later), 3)  # nothing after it went off

    def test_an_unexpected_error_ends_the_scene_instead_of_leaving_it_listed(self):
        class Breaks(FakeDriver):
            broken = False

            def info(self, entity_id):
                if self.broken:
                    raise RuntimeError("bad state")
                return super().info(entity_id)

        drv = Breaks({"light.a": info(), "light.b": info()})

        async def go():
            clock = VirtualClock()
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            engine.start(definition())
            await clock.run(10)
            drv.broken = True
            with self.assertLogs(level="ERROR"):
                await clock.run(10)
            return engine

        engine = asyncio.run(go())
        self.assertEqual(engine.sessions, {})
        self.assertEqual(engine._tasks, {})
        self.assertEqual(engine._owner, {})

    def test_the_state_lists_running_scenes(self):
        drv = FakeDriver({"light.a": info(), "light.b": info()})

        async def go():
            engine = e.Engine(drv)
            engine.start(definition())
            engine.freeze("s1")
            snap = engine.snapshot()
            engine.stop_all()
            return snap

        snap = asyncio.run(go())
        self.assertEqual(snap["s1"]["state"], "frozen")
        self.assertEqual(snap["s1"]["lights"], ["light.a", "light.b"])


class IdentifyTests(unittest.TestCase):
    def make(self, lights):
        drv = FakeDriver(lights)
        clock = VirtualClock()
        engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
        idf = ident.Identifier(drv, engine, sleep=clock.sleep, seconds=30)
        return drv, engine, idf, clock

    def test_a_colour_light_turns_red_and_is_put_back(self):
        async def go():
            drv, engine, idf, _ = self.make({"light.a": info(brightness=120, xy=(0.3, 0.33))})
            await idf.start("light.a")
            held = "light.a" in engine.held
            await idf.stop("light.a")
            return drv, engine, held

        drv, engine, held = asyncio.run(go())
        self.assertTrue(held)
        self.assertEqual(drv.calls[0][2]["xy_color"], ident.RED)
        self.assertEqual(drv.calls[1][2], {"brightness": 120, "xy_color": [0.3, 0.33]})
        self.assertNotIn("light.a", engine.held)

    def test_a_white_light_dims_instead(self):
        async def go():
            drv, _, idf, _ = self.make({"light.a": info(colour=False, xy=None, brightness=200, kelvin=2700, mode="color_temp")})
            await idf.start("light.a")
            await idf.stop("light.a")
            return drv

        drv = asyncio.run(go())
        self.assertEqual(drv.calls[0][2], {"brightness": ident.DIM_BRIGHTNESS})
        self.assertEqual(drv.calls[1][2], {"brightness": 200, "color_temp_kelvin": 2700})

    def test_a_light_that_was_off_is_turned_off_again(self):
        async def go():
            drv, _, idf, _ = self.make({"light.a": info("off")})
            await idf.start("light.a")
            await idf.stop("light.a")
            return drv

        drv = asyncio.run(go())
        self.assertEqual(drv.calls[-1][0], "off")

    def test_it_ends_by_itself_after_the_time_even_if_nobody_stops_it(self):
        async def go():
            drv, engine, idf, clock = self.make({"light.a": info(brightness=90)})
            await idf.start("light.a")
            await clock.run(29)
            during = ("light.a" in engine.held, len(drv.calls))
            await clock.run(2)
            return drv, engine, during

        drv, engine, during = asyncio.run(go())
        self.assertEqual(during, (True, 1))
        self.assertEqual(len(drv.calls), 2)
        self.assertNotIn("light.a", engine.held)

    def test_starting_twice_keeps_the_first_saved_state(self):
        async def go():
            drv, _, idf, _ = self.make({"light.a": info(brightness=77)})
            await idf.start("light.a")
            await idf.start("light.a")
            await idf.stop("light.a")
            return drv

        drv = asyncio.run(go())
        self.assertEqual(drv.calls[-1][2]["brightness"], 77)

    def test_the_light_is_released_even_when_putting_it_back_fails(self):
        async def go():
            drv, engine, idf, _ = self.make({"light.a": info()})
            await idf.start("light.a")
            drv.fail.add("light.a")
            await idf.stop("light.a")
            return engine

        engine = asyncio.run(go())
        self.assertNotIn("light.a", engine.held)

    def test_an_unavailable_or_unknown_light_is_refused(self):
        async def go():
            _, _, idf, _ = self.make({"light.a": info("unavailable")})
            for light in ("light.a", "light.zzz"):
                with self.assertRaises(ValueError):
                    await idf.start(light)

        asyncio.run(go())

    def test_a_scene_does_not_touch_a_light_while_it_is_identified(self):
        async def go():
            drv, engine, idf, clock = self.make({"light.a": info(), "light.b": info()})
            await idf.start("light.a")
            engine.start(definition())
            await clock.run(10)
            engine.stop_all()
            return drv

        drv = asyncio.run(go())
        self.assertEqual([c for c in drv.calls[1:] if c[1] == "light.a"], [])

    def test_stop_all_puts_every_light_back(self):
        async def go():
            drv, engine, idf, _ = self.make({"light.a": info(brightness=60), "light.b": info(brightness=70)})
            await idf.start("light.a")
            await idf.start("light.b")
            await idf.stop_all()
            return drv, engine

        drv, engine = asyncio.run(go())
        self.assertEqual(len(drv.calls), 4)
        self.assertEqual(engine.held, set())


if __name__ == "__main__":
    unittest.main()
