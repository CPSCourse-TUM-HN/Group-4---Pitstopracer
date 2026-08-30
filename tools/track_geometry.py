"""
Read the generated track geometry from Python.

`app/src/track/monza.generated.ts` is the committed output of extract_track.py
and the single source of truth for where the track is. The app consumes it
directly; this lets the Python tools consume the same numbers rather than
keeping a second copy that can drift.

Dependency-free on purpose: it parses the arrays out of the TypeScript rather
than requiring a build step or a JSON duplicate.
"""

import math
import re
from pathlib import Path
from typing import List, Tuple

GENERATED = Path(__file__).resolve().parent.parent / "app/src/track/monza.generated.ts"

Point = Tuple[float, float]


def _floats(src: str, name: str) -> List[float]:
    m = re.search(rf"{name}[^=]*=\s*\[(.*?)\];", src, re.S)
    if not m:
        raise ValueError(f"{name} not found in {GENERATED}")
    return [float(x) for x in re.findall(r"-?\d+\.?\d*", m.group(1))]


def _points(src: str, name: str) -> List[Point]:
    m = re.search(rf"{name}:[^=]*=\s*\[(.*?)\];", src, re.S)
    if not m:
        raise ValueError(f"{name} not found in {GENERATED}")
    pairs = re.findall(r"\[(-?\d+\.?\d*),(-?\d+\.?\d*)\]", m.group(1))
    return [(float(a), float(b)) for a, b in pairs]


class Track:
    def __init__(self, path: Path = GENERATED):
        src = path.read_text()
        field = re.search(r"FIELD_CM = \{ width: (\d+), height: (\d+) \}", src)
        if not field:
            raise ValueError(f"FIELD_CM not found in {path}")
        self.field_w_cm = float(field.group(1))
        self.field_h_cm = float(field.group(2))
        self.centerline = _points(src, "CENTERLINE")
        self.cum_cm = _floats(src, "CENTERLINE_CUM_CM")
        self.length_cm = float(re.search(r"TRACK_LENGTH_CM = ([\d.]+)", src).group(1))
        if len(self.centerline) != len(self.cum_cm):
            raise ValueError("centreline and arc-length table disagree in length")

    def position_at(self, progress: float) -> Tuple[float, float, float]:
        """(x_cm, y_cm, heading_deg) at a fraction of a lap, wrapped into [0,1)."""
        if not math.isfinite(progress):
            progress = 0.0
        p = progress % 1.0
        d = p * self.length_cm

        lo, hi = 0, len(self.cum_cm) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self.cum_cm[mid] <= d:
                lo = mid
            else:
                hi = mid

        seg = self.cum_cm[hi] - self.cum_cm[lo]
        t = (d - self.cum_cm[lo]) / seg if seg > 1e-9 else 0.0
        (x0, y0), (x1, y1) = self.centerline[lo], self.centerline[hi]
        return (
            x0 + (x1 - x0) * t,
            y0 + (y1 - y0) * t,
            math.degrees(math.atan2(y1 - y0, x1 - x0)),
        )
