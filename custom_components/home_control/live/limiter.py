# SPDX-License-Identifier: GPL-3.0-or-later
"""Keeps commands to one bridge or hub under a rate: each call waits for its turn."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable


class Limiter:
    """Spaces calls at least 1/rate seconds apart. Calls are served in the order they arrive."""

    def __init__(
        self,
        rate: float,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        if rate <= 0:
            raise ValueError("rate must be positive")
        self._gap = 1.0 / rate
        self._clock = clock
        self._sleep = sleep
        self._next = 0.0

    async def acquire(self) -> None:
        now = self._clock()
        turn = max(now, self._next)
        self._next = turn + self._gap
        if turn > now:
            await self._sleep(turn - now)
