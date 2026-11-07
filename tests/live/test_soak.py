# SPDX-License-Identifier: GPL-3.0-or-later
"""A long run in virtual time: scenes start, freeze, change, lose lights and end for an hour, and the engine stays within its limits."""

import asyncio
import random
import unittest

from tests.live.fakes import HUE_RATE, FakeDriver, VirtualClock, info
from tests.support import load

d = load("live.definitions")
e = load("live.engine")


class TimedDriver(FakeDriver):
    def __init__(self, lights, clock):
        super().__init__(lights)
        self.clock = clock
        self.times = []

    async def turn_on(self, entity_id, data):
        self.times.append(self.clock.now)
        await super().turn_on(entity_id, data)


def definition(scene_id, lights, **kw):
    data = {
        "scene_id": scene_id,
        "lights": [{"entity_id": light, "x": (i % 8) / 4 - 1, "y": (i // 8) / 2 - 0.5} for i, light in enumerate(lights)],
        "palette": [{"hs": [0, 100]}, {"hs": [120, 100]}, {"k": 2700, "b": 60}],
        "speed": kw.get("speed", 6),
        "range": 80,
        "brightness": 200,
        "wake": kw.get("wake", False),
    }
    return d.parse_definition(data)


class SoakTests(unittest.TestCase):
    def test_one_hour_of_scenes_coming_and_going(self):
        rng = random.Random(20261025)
        names = [f"light.l{i}" for i in range(16)]

        async def go():
            clock = VirtualClock()
            drv = TimedDriver({n: info() for n in names}, clock)
            engine = e.Engine(drv, clock=clock, sleep=clock.sleep)
            start = clock.now
            peak_tasks = 0
            for _minute in range(60):
                action = rng.choice(["start", "start", "freeze", "play", "update", "manual", "off", "stop"])
                scene = f"s{rng.randrange(3)}"
                try:
                    if action == "start":
                        picked = rng.sample(names, rng.randrange(2, 10))
                        engine.start(definition(scene, picked, speed=rng.randrange(1, 13), wake=rng.random() < 0.3))
                    elif action == "freeze":
                        engine.freeze(scene)
                    elif action == "play":
                        engine.play(scene)
                    elif action == "update":
                        engine.update(scene, speed=rng.randrange(1, 13), range_pct=rng.randrange(0, 101))
                    elif action == "manual":
                        engine.changed_by_someone(rng.choice(names))
                    elif action == "off":
                        light = rng.choice(names)
                        drv.lights[light] = info("off")
                    elif action == "stop":
                        engine.stop(scene)
                except KeyError:
                    pass  # the scene was not running
                if rng.random() < 0.3:  # a person turns a light back on
                    drv.lights[rng.choice(names)] = info()
                await clock.run(60)
                peak_tasks = max(peak_tasks, len(engine._tasks))
                # What the engine holds always matches what is running.
                self.assertEqual(set(engine._tasks), set(engine.sessions))
                owned = {light for s in engine.sessions.values() for light in s.lights}
                self.assertEqual(set(engine._owner), owned)
            engine.stop_all()
            await clock.run(1)
            return drv, engine, clock.now - start, peak_tasks

        drv, engine, _elapsed, peak = asyncio.run(go())
        self.assertEqual(engine.sessions, {})
        self.assertEqual(engine._tasks, {})
        self.assertEqual(engine._owner, {})
        self.assertLessEqual(len(engine._limiters), 1)
        self.assertLessEqual(peak, e.MAX_SESSIONS)
        # No second in the hour had more commands than the Hue limit allows.
        times = sorted(drv.times)
        worst = max((sum(1 for t in times[i : i + 40] if t - times[i] < 1.0) for i in range(len(times))), default=0)
        self.assertLessEqual(worst, int(HUE_RATE) + 1)
        self.assertGreater(len(times), 500)


if __name__ == "__main__":
    unittest.main()
