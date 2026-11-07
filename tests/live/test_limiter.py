# SPDX-License-Identifier: GPL-3.0-or-later
import asyncio
import unittest

from tests.live.fakes import Clock
from tests.support import load

lim = load("live.limiter")


class LimiterTests(unittest.TestCase):
    def test_calls_are_spaced_by_the_rate_and_never_faster(self):
        async def go():
            clock = Clock()
            limiter = lim.Limiter(5.0, clock, clock.sleep)
            stamps = []
            for _ in range(6):
                await limiter.acquire()
                stamps.append(round(clock.now - 1000.0, 3))
            return stamps

        self.assertEqual(asyncio.run(go()), [0.0, 0.2, 0.4, 0.6, 0.8, 1.0])

    def test_an_idle_limiter_lets_the_next_call_through_at_once(self):
        async def go():
            clock = Clock()
            limiter = lim.Limiter(2.0, clock, clock.sleep)
            await limiter.acquire()
            clock.now += 10
            before = clock.now
            await limiter.acquire()
            return clock.now - before

        self.assertEqual(asyncio.run(go()), 0.0)

    def test_rate_must_be_positive(self):
        with self.assertRaises(ValueError):
            lim.Limiter(0)


if __name__ == "__main__":
    unittest.main()
