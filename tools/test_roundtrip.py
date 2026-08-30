#!/usr/bin/env python3
"""
Round-trip and contract tests for the session tooling.

    python3 tools/test_roundtrip.py

The replay test needs a broker on localhost:1883 and is skipped without one.
It republishes under race/test/ so it can run while the mock publisher is
live without the two interfering.
"""

import io, json, math, re, sys, tempfile, time, unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
REPO = Path(__file__).resolve().parent.parent

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


VALID_STATE = {
    "ts": 1, "speed": 4.0, "steering": 0.0,
    "throttle": 0.5, "lap": 1, "lap_time_s": 9.0,
}


class TestRecorderReport(unittest.TestCase):
    """
    The summary is the recorder's actual product.

    When a real producer replaces the mock, this report is what tells the team
    which fields are wrong. A recorder that captures perfectly but reports badly
    is no use, so the report itself is worth pinning down.
    """

    def _summary(self, counts, problems=None, span=10.0):
        from recorder import Recorder
        r = Recorder("localhost:1883", "race/car1/#", Path(tempfile.mkdtemp()) / "s.ndjson", None)
        r.counts.update(counts)
        r.first_ts, r.last_ts = 1_000.0, 1_000.0 + span
        if problems:
            for topic, items in problems.items():
                r.problems[topic].update(items)
        buf = io.StringIO()
        with redirect_stdout(buf):
            r.summarise()
        return buf.getvalue()

    def test_names_a_topic_that_never_arrived(self):
        out = self._summary({"state": 200})
        self.assertIn("SILENT", out)
        self.assertRegex(out, r"battery\s+0\s")

    def test_does_not_call_an_optional_topic_silent(self):
        out = self._summary({"state": 200})
        self.assertIn("optional, absent", out)
        # pose is optional; its absence must not read as a fault.
        pose_line = [l for l in out.splitlines() if l.startswith("pose")][0]
        self.assertNotIn("SILENT", pose_line)

    def test_flags_a_producer_running_slow(self):
        # 20 Hz expected, 2 Hz delivered.
        out = self._summary({"state": 20}, span=10.0)
        self.assertIn("SLOW", out)

    def test_reports_contract_problems_grouped_with_counts(self):
        out = self._summary(
            {"state": 200},
            problems={"state": {"missing 'speed'": 200}},
        )
        self.assertIn("NON-CONFORMANT", out)
        self.assertIn("missing 'speed'", out)
        self.assertIn("x200", out)   # one line, not two hundred

    def test_names_a_topic_that_is_not_in_the_spec(self):
        out = self._summary({"state": 200, "gremlin": 5})
        self.assertIn("NOT IN SPEC", out)
        self.assertIn("gremlin", out)

    def test_says_so_when_everything_conforms(self):
        out = self._summary({"state": 200})
        self.assertIn("All payloads conform", out)

    def test_handles_capturing_nothing_at_all(self):
        out = self._summary({}, span=0.0)
        self.assertIn("Nothing captured", out)

    def test_a_zero_first_timestamp_does_not_collapse_the_span(self):
        # `if self.first_ts and ...` treated 0.0 as "no data", which made every
        # topic look SLOW.
        from recorder import Recorder
        r = Recorder("localhost:1883", "race/car1/#",
                     Path(tempfile.mkdtemp()) / "s.ndjson", None)
        r.counts.update({"state": 200})
        r.first_ts, r.last_ts = 0.0, 10.0
        buf = io.StringIO()
        with redirect_stdout(buf):
            r.summarise()
        self.assertIn("over 10.0s", buf.getvalue())
        self.assertNotIn("SLOW", buf.getvalue())


class TestPlayerLoad(unittest.TestCase):
    """Replay is the demo's safety net; it must not die on a scruffy file."""

    def _write(self, lines):
        p = Path(tempfile.mkdtemp()) / "s.ndjson"
        p.write_text("\n".join(lines))
        return p

    def test_loads_well_formed_records(self):
        p = self._write([
            json.dumps({"t_offset_ms": 0, "topic": "race/car1/state", "payload": {"a": 1}}),
            json.dumps({"t_offset_ms": 50, "topic": "race/car1/imu", "payload": {"b": 2}}),
        ])
        self.assertEqual(len(load(p)), 2)

    def test_skips_an_unparseable_line_rather_than_aborting(self):
        p = self._write([
            json.dumps({"t_offset_ms": 0, "topic": "race/car1/state", "payload": {}}),
            "{ this is not json",
            json.dumps({"t_offset_ms": 10, "topic": "race/car1/imu", "payload": {}}),
        ])
        self.assertEqual(len(load(p)), 2)

    def test_skips_a_record_missing_what_replay_needs(self):
        p = self._write([
            json.dumps({"topic": "race/car1/state", "payload": {}}),      # no offset
            json.dumps({"t_offset_ms": 5, "payload": {}}),                 # no topic
            json.dumps({"t_offset_ms": 10, "topic": "race/car1/imu", "payload": {}}),
        ])
        self.assertEqual(len(load(p)), 1)

    def test_ignores_blank_lines(self):
        p = self._write([
            "",
            json.dumps({"t_offset_ms": 0, "topic": "race/car1/state", "payload": {}}),
            "   ",
        ])
        self.assertEqual(len(load(p)), 1)


class TestTrackGeometry(unittest.TestCase):
    """The Python reader must agree with the geometry the app draws."""

    def setUp(self):
        from track_geometry import Track
        self.t = Track()
        self.src = (REPO / "app/src/track/monza.generated.ts").read_text()

    def test_reads_the_same_length_the_app_uses(self):
        want = float(re.search(r"TRACK_LENGTH_CM = ([\d.]+)", self.src).group(1))
        self.assertAlmostEqual(self.t.length_cm, want, places=1)

    def test_reads_every_point(self):
        n = len(re.findall(r"\[-?\d+\.?\d*,-?\d+\.?\d*\]",
                           self.src[self.src.index("CENTERLINE:"):
                                    self.src.index("CENTERLINE_CUM_CM")]))
        self.assertEqual(len(self.t.centerline), n)
        self.assertEqual(len(self.t.cum_cm), n)

    def test_progress_zero_is_the_start_finish_line(self):
        m = re.search(r"START_FINISH: TrackPoint = \{ x: ([\d.]+), y: ([\d.]+) \}", self.src)
        x, y, _ = self.t.position_at(0.0)
        self.assertAlmostEqual(x, float(m.group(1)), places=1)
        self.assertAlmostEqual(y, float(m.group(2)), places=1)

    def test_wraps_at_one_lap(self):
        a = self.t.position_at(0.0)[:2]
        b = self.t.position_at(1.0)[:2]
        self.assertAlmostEqual(math.dist(a, b), 0.0, places=3)

    def test_advances_smoothly_with_no_jumps(self):
        prev = self.t.position_at(0)[:2]
        worst = 0.0
        for i in range(1, 1000):
            cur = self.t.position_at(i / 1000)[:2]
            worst = max(worst, math.dist(prev, cur))
            prev = cur
        # One thousandth of a 22 m lap is ~2.2 cm; allow for vertex spacing.
        self.assertLess(worst, 15.0)

    def test_half_a_lap_is_half_the_distance(self):
        x, y, _ = self.t.position_at(0.5)
        nearest = min(range(len(self.t.centerline)),
                      key=lambda i: math.dist(self.t.centerline[i], (x, y)))
        self.assertAlmostEqual(self.t.cum_cm[nearest], self.t.length_cm / 2, delta=20)

    def test_reads_the_field_the_app_renders_into(self):
        m = re.search(r"FIELD_CM = \{ width: (\d+), height: (\d+) \}", self.src)
        self.assertEqual(self.t.field_w_cm, float(m.group(1)))
        self.assertEqual(self.t.field_h_cm, float(m.group(2)))

    def test_every_point_fits_the_field(self):
        for x, y in self.t.centerline:
            self.assertTrue(0 <= x <= self.t.field_w_cm, f"x {x} outside field")
            self.assertTrue(0 <= y <= self.t.field_h_cm, f"y {y} outside field")

    def test_survives_non_finite_progress(self):
        self.assertTrue(all(math.isfinite(v) for v in self.t.position_at(float("nan"))))


class TestPhysicalConsistency(unittest.TestCase):
    """The simulation must describe the track that was actually measured."""

    def _generated_length_m(self):
        gen = REPO / "app/src/track/monza.generated.ts"
        m = re.search(r"TRACK_LENGTH_CM = ([\d.]+)", gen.read_text())
        self.assertIsNotNone(m, "TRACK_LENGTH_CM not found in generated geometry")
        return float(m.group(1)) / 100

    def test_publisher_track_length_matches_extracted_geometry(self):
        sys.path.insert(0, str(REPO / "mock-publisher"))
        from publisher import RaceSimulator
        self.assertAlmostEqual(
            RaceSimulator.TRACK_LENGTH_M, self._generated_length_m(), places=1,
            msg="publisher and monza.generated.ts disagree about the track length",
        )

    def test_speed_lap_time_and_distance_agree(self):
        sys.path.insert(0, str(REPO / "mock-publisher"))
        from publisher import RaceSimulator as R
        # A literal 3.8 m/s here implied a 68 m lap on a 22 m track.
        self.assertAlmostEqual(
            R.NOMINAL_SPEED_MS * R.BASE_LAP_TIME, R.TRACK_LENGTH_M, places=2,
            msg="speed x lap time does not cover the track exactly once",
        )

    def test_nominal_speed_is_physically_plausible(self):
        sys.path.insert(0, str(REPO / "mock-publisher"))
        from publisher import RaceSimulator as R
        # A JetRacer on a 6x10 m foam mat with 72 cm lanes.
        self.assertGreater(R.NOMINAL_SPEED_MS, 0.5)
        self.assertLess(R.NOMINAL_SPEED_MS, 2.5)

    def test_app_seed_lap_time_matches_the_publisher(self):
        seed = REPO / "app/src/track/useCarPosition.ts"
        m = re.search(r"SEED_LAP_TIME_S = ([\d.]+)", seed.read_text())
        self.assertIsNotNone(m)
        sys.path.insert(0, str(REPO / "mock-publisher"))
        from publisher import RaceSimulator
        self.assertAlmostEqual(float(m.group(1)), RaceSimulator.BASE_LAP_TIME, places=1)


class TestSchema(unittest.TestCase):
    def test_conformant_payload_passes(self):
        ok = {"ts": 1, "percent": 50.0, "eta_s": 12.0}
        self.assertEqual(validate("race/car1/fuel", ok), [])

    def test_missing_field_reported(self):
        problems = validate("race/car1/fuel", {"ts": 1, "percent": 50.0})
        self.assertTrue(any("missing 'eta_s'" in p for p in problems), problems)

    def test_non_finite_numbers_reported(self):
        # json.loads accepts bare NaN/Infinity, and they compare False against
        # every bound -- so without an explicit check the range tests pass them
        # and the recorder reports a broken producer as conformant.
        for bad in (float("nan"), float("inf"), float("-inf")):
            payload = dict(VALID_STATE, speed=bad)
            problems = validate("race/car1/state", payload)
            self.assertTrue(problems, f"{bad} was accepted")
            self.assertIn("finite", problems[0])

    def test_json_round_trip_of_non_finite_is_caught(self):
        # The realistic path: a producer serialises NaN, we parse it back.
        raw = json.dumps(dict(VALID_STATE, speed=float("nan")))
        self.assertTrue(validate("race/car1/state", json.loads(raw)))

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
