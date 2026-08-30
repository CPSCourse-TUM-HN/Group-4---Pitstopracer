#!/usr/bin/env python3
"""
Record a live telemetry session to a file, and check it against the packet spec
while doing so.

Two jobs in one pass:

  1. Capture, so a race can be replayed later with player.py -- a rehearsed
     demo that needs no car, and a real-data fixture for UI work.
  2. Report, so when a real producer replaces the mock you get told exactly
     which fields are missing, mistyped or out of range instead of guessing
     from a dashboard that renders nothing.

Usage:
    python3 tools/recorder.py -o sessions/race1.ndjson
    python3 tools/recorder.py -o sessions/race1.ndjson --duration 60
    Ctrl-C to stop early; the summary still prints.
"""

import argparse, json, signal, sys, time
from collections import Counter, defaultdict
from pathlib import Path

import paho.mqtt.client as mqtt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from packet_schema import EXPECTED_HZ, OPTIONAL_TOPICS, SCHEMA, topic_name, validate


class Recorder:
    def __init__(self, broker: str, topic_filter: str, out_path: Path, duration: float | None):
        self.broker = broker
        self.topic_filter = topic_filter
        self.out_path = out_path
        self.duration = duration

        self.counts: Counter[str] = Counter()
        self.bad_json = 0
        # topic -> problem -> count, so a producer with one systematic mistake
        # reports as one line rather than thousands.
        self.problems: dict[str, Counter[str]] = defaultdict(Counter)
        self.first_ts: float | None = None
        self.last_ts: float | None = None

        self.fh = None
        self.running = True

    def on_message(self, _client, _userdata, msg):
        now = time.time()
        if self.first_ts is None:
            self.first_ts = now
        self.last_ts = now

        name = topic_name(msg.topic)
        self.counts[name] += 1

        raw = msg.payload.decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self.bad_json += 1
            self.problems[name]["payload is not valid JSON"] += 1
            payload = None

        if payload is not None:
            for p in validate(msg.topic, payload):
                self.problems[name][p] += 1

        record = {
            "t_offset_ms": int((now - self.first_ts) * 1000),
            "topic": msg.topic,
            # Keep unparseable payloads verbatim so a replay reproduces the
            # exact bytes that broke something.
            **({"payload": payload} if payload is not None else {"raw": raw}),
        }
        self.fh.write(json.dumps(record) + "\n")

    def run(self):
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self.fh = self.out_path.open("w")

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="session-recorder")

        # Subscribe from on_connect, not once after connect(). Two reasons:
        # MQTT requires the client to wait for CONNACK before sending anything
        # else, and -- the one that actually bites -- paho re-runs on_connect
        # after an automatic reconnect. Subscribing once meant that if the
        # broker restarted mid-session the recorder stayed connected, captured
        # nothing further, and reported a short recording as if it were the
        # whole race.
        def on_connect(c, _u, _f, rc, _p):
            if rc == 0:
                c.subscribe(self.topic_filter, qos=1)
                print(f"Connected, recording {self.topic_filter}")
            else:
                print(f"Connect failed: {rc}")

        client.on_connect = on_connect
        client.on_message = self.on_message

        host, _, port = self.broker.partition(":")
        try:
            client.connect(host, int(port) if port else 1883, keepalive=60)
        except OSError as e:
            self.fh.close()
            sys.exit(f"Cannot reach broker at {self.broker}: {e}. "
                     "Is it running?  cd infra && docker compose up -d")
        client.loop_start()

        started = time.time()
        try:
            while self.running:
                if self.duration and time.time() - started >= self.duration:
                    break
                time.sleep(0.1)
        except KeyboardInterrupt:
            pass

        client.loop_stop()
        client.disconnect()
        self.fh.close()
        self.summarise()

    def summarise(self):
        # `is not None`, not truthiness: a first timestamp of exactly 0.0 is
        # falsy, which would collapse the span and report every topic as SLOW.
        span = (self.last_ts - self.first_ts) \
            if self.first_ts is not None and self.last_ts is not None else 0.0
        total = sum(self.counts.values())

        print()
        print(f"Recorded {total} messages over {span:.1f}s -> {self.out_path}")
        if self.bad_json:
            print(f"  {self.bad_json} of them were not valid JSON (kept verbatim for replay)")
        if total == 0:
            print("Nothing captured. Is a publisher running?")
            return

        print()
        print(f"{'topic':<12}{'msgs':>7}{'Hz':>9}   {'expected':>9}   status")
        print("-" * 62)
        for name in sorted(SCHEMA):
            n = self.counts.get(name, 0)
            hz = n / span if span > 0 else 0.0
            exp = EXPECTED_HZ.get(name)
            if n == 0:
                status = "optional, absent" if name in OPTIONAL_TOPICS else "SILENT"
            elif exp and hz < exp * 0.5:
                status = f"SLOW ({hz / exp:.0%} of expected)"
            elif self.problems.get(name):
                status = "NON-CONFORMANT"
            else:
                status = "ok"
            print(f"{name:<12}{n:>7}{hz:>9.1f}   {(f'{exp:.0f}' if exp else '-'):>9}   {status}")

        unknown = set(self.counts) - set(SCHEMA)
        for name in sorted(unknown):
            print(f"{name:<12}{self.counts[name]:>7}{'':>9}   {'-':>9}   NOT IN SPEC")

        if self.problems:
            print()
            print("Contract problems:")
            for name in sorted(self.problems):
                for problem, count in self.problems[name].most_common():
                    print(f"  {name}: {problem}  (x{count})")
        else:
            print()
            print("All payloads conform to the packet spec.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--broker", default="localhost:1883")
    ap.add_argument("--topic", default="race/car1/#")
    ap.add_argument("-o", "--out", type=Path, default=Path("sessions/session.ndjson"))
    ap.add_argument("--duration", type=float, default=None,
                    help="stop after N seconds (default: until Ctrl-C)")
    args = ap.parse_args()

    rec = Recorder(args.broker, args.topic, args.out, args.duration)
    signal.signal(signal.SIGTERM, lambda *_: setattr(rec, "running", False))
    rec.run()


if __name__ == "__main__":
    main()
