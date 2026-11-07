# SPDX-License-Identifier: GPL-3.0-or-later
"""Conversions between the ways a colour is written: white temperature, hue and saturation, xy.

The xy colour of a white is a point on the colour of a glowing black body (Kim et al.,
a standard cubic approximation); it agrees with the whites Hue lights use. Hue and
saturation are converted with the wide-gamut matrix Hue lights use.
"""

from __future__ import annotations

XY = tuple[float, float]

MIN_KELVIN = 2000
MAX_KELVIN = 6535


def kelvin_to_xy(kelvin: float) -> XY:
    """The xy colour of a white temperature (clamped to 2000 to 6535 K)."""
    t = max(MIN_KELVIN, min(MAX_KELVIN, float(kelvin)))
    if t <= 4000:
        x = -0.2661239e9 / t**3 - 0.2343589e6 / t**2 + 0.8776956e3 / t + 0.179910
    else:
        x = -3.0258469e9 / t**3 + 2.1070379e6 / t**2 + 0.2226347e3 / t + 0.240390
    if t <= 2222:
        y = -1.1063814 * x**3 - 1.34811020 * x**2 + 2.18555832 * x - 0.20219683
    elif t <= 4000:
        y = -0.9549476 * x**3 - 1.37418593 * x**2 + 2.09137015 * x - 0.16748867
    else:
        y = 3.0817580 * x**3 - 5.87338670 * x**2 + 3.75112997 * x - 0.37001483
    return (round(x, 4), round(y, 4))


_TABLE: list[tuple[int, XY]] = [(k, kelvin_to_xy(k)) for k in range(MIN_KELVIN, MAX_KELVIN + 1, 25)]


def nearest_kelvin(xy: XY) -> int:
    """The white temperature whose colour is closest to an xy colour."""
    return min(_TABLE, key=lambda item: (item[1][0] - xy[0]) ** 2 + (item[1][1] - xy[1]) ** 2)[0]


def _srgb_to_linear(v: float) -> float:
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def hs_to_xy(hue: float, sat: float) -> XY:
    """The xy colour of a hue (0 to 360) and saturation (0 to 100) at full brightness."""
    s = sat / 100
    hp = (hue % 360) / 60
    x = s * (1 - abs(hp % 2 - 1))
    m = 1 - s
    r, g, b = [(s, x, 0), (x, s, 0), (0, s, x), (0, x, s), (x, 0, s), (s, 0, x)][min(int(hp), 5)]
    r, g, b = (_srgb_to_linear(v + m) for v in (r, g, b))
    big_x = r * 0.664511 + g * 0.154324 + b * 0.162028
    big_y = r * 0.283881 + g * 0.668433 + b * 0.047685
    big_z = r * 0.000088 + g * 0.07231 + b * 0.986039
    total = (big_x + big_y + big_z) or 1.0
    return (big_x / total, big_y / total)
