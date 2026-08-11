#!/usr/bin/env python3
"""
Round-trip and contract tests for the session tooling.

    python3 tools/test_roundtrip.py

The replay test needs a broker on localhost:1883 and is skipped without one.
It republishes under race/test/ so it can run while the mock publisher is
live without the two interfering.
"""

import json, sys, tempfile, time, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from packet_schema import validate
from player import load, play_once, remap

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

BROKER_HOST, BROKER_PORT = "localhost", 1883
TEST_PREFIX = "race/test"


def broker_available() -> bool:
    if mqtt is None:
        return False
    import socket
    with socket.socket() as s:
        s.settimeout(1.0)
        return s.connect_ex((BROKER_HOST, BROKER_PORT)) == 0


def write_session(path: Path, records: list[dict]) -> None:
    path.write_text("".join(json.dumps(r) + "\n" for r in records))


def sample_records() -> list[dict]:
    """A short session covering the fast and slow topics plus an event."""
    recs = []
    for i in range(20):
        t = i * 50
        recs.append({"t_offset_ms": t, "topic": "race/car1/state",
                     "payload": {"ts": 1000 + t, "speed": 3.0 + i * 0.01, "steering": 0.1,
                                 "throttle": 0.8, "lap": 1, "lap_time_s": t / 1000}})
        if i % 10 == 0:
            recs.append({"t_offset_ms": t, "topic": "race/car1/tires",
                         "payload": {"ts": 1000 + t, "fl": 0.9, "fr": 0.92,
                                     "rl": 0.91, "rr": 0.93, "eta_s": 100.0}})
    recs.append({"t_offset_ms": 1000, "topic": "race/car1/event",
                 "payload": {"ts": 2000, "type": "lap"}})
    return recs


class TestSchema(unittest.TestCase):
    def test_conformant_payload_passes(self):
        ok = {"ts": 1, "percent": 50.0, "eta_s": 12.0}
        self.assertEqual(validate("race/car1/fuel", ok), [])

    def test_missing_field_reported(self):
        problems = validate("race/car1/fuel", {"ts": 1, "percent": 50.0})
        self.assertTrue(any("missing 'eta_s'" in p for p in problems), problems)

    def test_wrong_unit_out_of_range_reported(self):
        # The realistic failure: speed reported in km/h where m/s is expected,
        # or a percentage sent as a 0-1 fraction.
        problems = validate("race/car1/fuel", {"ts": 1, "percent": 500.0, "eta_s": 1.0})
        self.assertTrue(any("above maximum" in p for p in problems), problems)

    def test_bool_is_not_an_int(self):
        problems = validate("race/car1/state", {
            "ts": 1, "speed": 1.0, "steering": 0.0, "throttle": 0.5,
            "lap": True, "lap_time_s": 1.0})
        self.assertTrue(any("'lap'" in p and "expected int" in p for p in problems), problems)

    def test_unknown_reason_reported(self):
        problems = validate("race/car1/strategy", {
            "ts": 1, "pit_recommended": True, "reason": "vibes", "target_lap": 3})
        self.assertTrue(any("not one of" in p for p in problems), problems)

    def test_unknown_topic_reported(self):
        self.assertTrue(validate("race/car1/telemetry", {"ts": 1}))


class TestRemap(unittest.TestCase):
    def test_prefix_rewrite(self):
        self.assertEqual(remap("race/car1/state", "race/test"), "race/test/state")

    def test_no_prefix_is_identity(self):
        self.assertEqual(remap("race/car1/state", None), "race/car1/state")


class TestLoad(unittest.TestCase):
    def test_skips_malformed_lines_without_dying(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "s.ndjson"
            p.write_text(
                json.dumps({"t_offset_ms": 0, "topic": "race/car1/state", "payload": {}}) + "\n"
                + "{not json\n"
                + json.dumps({"payload": {}}) + "\n"          # no topic
                + json.dumps({"t_offset_ms": 10, "topic": "race/car1/fuel", "payload": {}}) + "\n"
            )
            self.assertEqual(len(load(p)), 2)


@unittest.skipUnless(broker_available(), "no broker on localhost:1883")
class TestRoundTrip(unittest.TestCase):
    def test_replay_preserves_sequence_and_timing(self):
        records = sample_records()
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "session.ndjson"
            write_session(path, records)

            received: list[tuple[float, str, str]] = []
            sub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="roundtrip-sub")
            sub.on_message = lambda c, u, m: received.append(
                (time.time(), m.topic, m.payload.decode()))
            sub.connect(BROKER_HOST, BROKER_PORT, 30)
            sub.subscribe(f"{TEST_PREFIX}/#", qos=1)
            sub.loop_start()
            time.sleep(0.5)   # let the subscription settle

            pub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="roundtrip-pub")
            pub.connect(BROKER_HOST, BROKER_PORT, 30)
            pub.loop_start()

            t0 = time.time()
            sent = play_once(pub, load(path), speed=1.0, quiet=True, prefix=TEST_PREFIX)
            time.sleep(0.7)   # drain in-flight messages

            pub.loop_stop(); pub.disconnect()
            sub.loop_stop(); sub.disconnect()

            self.assertEqual(sent, len(records))
            self.assertEqual(len(received), len(records),
                             f"expected {len(records)} messages, got {len(received)}")

            # Order is preserved.
            expected_topics = [remap(r["topic"], TEST_PREFIX) for r in records]
            self.assertEqual([r[1] for r in received], expected_topics)

            # Payloads survive the round trip byte-for-byte after re-parsing.
            for rec, (_, _, body) in zip(records, received):
                self.assertEqual(json.loads(body), rec["payload"])

            # Inter-message timing is preserved within tolerance. Generous
            # bound: this asserts replay is not instantaneous or wildly slow,
            # not that a Python loop is a real-time scheduler.
            for rec, (ts, _, _) in zip(records, received):
                expected_offset = rec["t_offset_ms"] / 1000.0
                actual_offset = ts - t0
                self.assertLess(abs(actual_offset - expected_offset), 0.35,
                                f"{rec['topic']} at {rec['t_offset_ms']}ms arrived "
                                f"{actual_offset:.3f}s after start")


if __name__ == "__main__":
    if not broker_available():
        print("NOTE: broker not reachable -- replay test will be skipped.\n")
    unittest.main(verbosity=2)
