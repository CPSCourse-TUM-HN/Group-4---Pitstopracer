"""
The Pro-Racing Packet contract, in one place.

Mirrors docs/specs (packet spec v1), app/src/types.ts and the dataclasses in
mock-publisher/publisher.py. When a real producer replaces the mock, this is
what tells you whether its payloads are actually conformant.

Kept dependency-free on purpose so any team member can run it.
"""

from typing import Any, Callable, NamedTuple, Optional


class Field(NamedTuple):
    name: str
    kind: type | tuple[type, ...]
    lo: Optional[float] = None
    hi: Optional[float] = None
    allowed: Optional[frozenset] = None


# bool is a subclass of int in Python, so integer fields must reject it
# explicitly or `true` would silently pass as a lap number.
INT = int
NUM = (int, float)

TS = Field("ts", INT, lo=0)

SCHEMA: dict[str, tuple[Field, ...]] = {
    "state": (
        TS,
        Field("speed", NUM, lo=0, hi=30),
        Field("steering", NUM, lo=-1.0, hi=1.0),
        Field("throttle", NUM, lo=0.0, hi=1.0),
        Field("lap", INT, lo=0),
        Field("lap_time_s", NUM, lo=0),
    ),
    "imu": (
        TS,
        Field("ax", NUM, lo=-16, hi=16),
        Field("ay", NUM, lo=-16, hi=16),
        Field("az", NUM, lo=-16, hi=16),
        Field("gx", NUM, lo=-2000, hi=2000),
        Field("gy", NUM, lo=-2000, hi=2000),
        Field("gz", NUM, lo=-2000, hi=2000),
    ),
    "battery": (
        TS,
        Field("voltage", NUM, lo=0, hi=20),
        Field("percent", NUM, lo=0, hi=100),
        Field("current_ma", NUM, lo=-20000, hi=20000),
        Field("eta_s", NUM, lo=0),
    ),
    "fuel": (
        TS,
        Field("percent", NUM, lo=0, hi=100),
        Field("eta_s", NUM, lo=0),
    ),
    "tires": (
        TS,
        Field("fl", NUM, lo=0.0, hi=1.0),
        Field("fr", NUM, lo=0.0, hi=1.0),
        Field("rl", NUM, lo=0.0, hi=1.0),
        Field("rr", NUM, lo=0.0, hi=1.0),
        Field("eta_s", NUM, lo=0),
    ),
    "strategy": (
        TS,
        Field("pit_recommended", bool),
        Field("reason", str, allowed=frozenset(
            {"", "tire_wear", "low_fuel", "low_battery", "race_complete"})),
        Field("target_lap", INT, lo=0),
    ),
    "event": (
        TS,
        Field("type", str, allowed=frozenset({"lap", "pit_start", "pit_end"})),
    ),
    # Optional. Nothing is obliged to publish it; the app upgrades from
    # estimated to measured position if it ever appears.
    "pose": (
        TS,
        Field("x", NUM, lo=0, hi=590),
        Field("y", NUM, lo=0, hi=1000),
        Field("heading", NUM, lo=-360, hi=360),
    ),
}

OPTIONAL_TOPICS = frozenset({"pose"})

# Expected publish rates, used to report producers that are silent or slow.
EXPECTED_HZ: dict[str, float] = {
    "state": 20.0, "imu": 20.0,
    "battery": 2.0, "fuel": 2.0, "tires": 2.0,
}


def topic_name(topic: str) -> str:
    """race/car1/state -> state"""
    return topic.rsplit("/", 1)[-1]


def validate(topic: str, payload: Any) -> list[str]:
    """Return a list of human-readable problems. Empty means conformant."""
    name = topic_name(topic)
    fields = SCHEMA.get(name)
    if fields is None:
        return [f"unknown topic '{name}'"]
    if not isinstance(payload, dict):
        return [f"payload is {type(payload).__name__}, expected object"]

    problems: list[str] = []
    for f in fields:
        if f.name not in payload:
            problems.append(f"missing '{f.name}'")
            continue
        v = payload[f.name]

        if f.kind is INT:
            if isinstance(v, bool) or not isinstance(v, int):
                problems.append(f"'{f.name}' is {type(v).__name__}, expected int")
                continue
        elif f.kind is bool:
            if not isinstance(v, bool):
                problems.append(f"'{f.name}' is {type(v).__name__}, expected bool")
                continue
        elif f.kind is str:
            if not isinstance(v, str):
                problems.append(f"'{f.name}' is {type(v).__name__}, expected string")
                continue
        else:  # numeric
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                problems.append(f"'{f.name}' is {type(v).__name__}, expected number")
                continue

        if f.allowed is not None and v not in f.allowed:
            problems.append(f"'{f.name}'={v!r} not one of {sorted(f.allowed)}")
        if f.lo is not None and isinstance(v, (int, float)) and v < f.lo:
            problems.append(f"'{f.name}'={v} below minimum {f.lo}")
        if f.hi is not None and isinstance(v, (int, float)) and v > f.hi:
            problems.append(f"'{f.name}'={v} above maximum {f.hi}")

    extra = set(payload) - {f.name for f in fields}
    if extra:
        problems.append(f"unexpected field(s): {', '.join(sorted(extra))}")

    return problems
