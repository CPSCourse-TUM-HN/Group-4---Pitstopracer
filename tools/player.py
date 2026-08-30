#!/usr/bin/env python3
"""
Replay a recorded session to the broker.

The app cannot tell replayed traffic from live traffic -- it just connects to
the broker as usual -- so this is the demo's safety net: a known-good race on
demand, with no car, no team, and no chance of a producer misbehaving on stage.

Usage:
    python3 tools/player.py sessions/race1.ndjson
    python3 tools/player.py sessions/race1.ndjson --speed 5
    python3 tools/player.py sessions/race1.ndjson --loop
"""

import argparse, json, sys, time
from pathlib import Path

import paho.mqtt.client as mqtt

# Events and strategy are published QoS 1 by the real producers; keeping that
# on replay means the app sees the same delivery guarantees it would live.
QOS1_TOPICS = ("strategy", "event")


def load(path: Path) -> list[dict]:
    records = []
    for lineno, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            print(f"{path}:{lineno}: skipping unparseable line", file=sys.stderr)
            continue
        if "topic" not in rec or "t_offset_ms" not in rec:
            print(f"{path}:{lineno}: skipping record without topic/t_offset_ms", file=sys.stderr)
            continue
        records.append(rec)
    return records


def remap(topic: str, prefix: str | None) -> str:
    """race/car1/state -> <prefix>/state. Used to replay alongside a live
    publisher without the two colliding on the same topics."""
    return f"{prefix}/{topic.rsplit('/', 1)[-1]}" if prefix else topic


def play_once(client: mqtt.Client, records: list[dict], speed: float, quiet: bool,
              prefix: str | None = None) -> int:
    start = time.time()
    sent = 0
    for rec in records:
        target = (rec["t_offset_ms"] / 1000.0) / speed
        delay = target - (time.time() - start)
        if delay > 0:
            time.sleep(delay)

        topic = remap(rec["topic"], prefix)
        # A record carries either a parsed payload or the raw bytes that failed
        # to parse; replaying the raw form reproduces the original fault.
        body = rec["raw"] if "raw" in rec else json.dumps(rec["payload"])
        qos = 1 if topic.rsplit("/", 1)[-1] in QOS1_TOPICS else 0
        client.publish(topic, body, qos=qos)
        sent += 1

        if not quiet and sent % 200 == 0:
            print(f"  {sent}/{len(records)} messages", end="\r", flush=True)
    return sent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("session", type=Path)
    ap.add_argument("--broker", default="localhost:1883")
    ap.add_argument("--speed", type=float, default=1.0, help="playback rate multiplier")
    ap.add_argument("--loop", action="store_true", help="repeat until interrupted")
    ap.add_argument("--rewrite-prefix", default=None, metavar="PREFIX",
                    help="republish under PREFIX (e.g. race/test) instead of the "
                         "recorded prefix, to avoid colliding with a live publisher")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    if not args.session.exists():
        sys.exit(f"Session file not found: {args.session}")
    if args.speed <= 0:
        sys.exit("--speed must be greater than 0")

    records = load(args.session)
    if not records:
        sys.exit(f"No usable records in {args.session}")

    # max, not [-1]: a hand-edited or concatenated session need not be in
    # chronological order, and a wrong span only misreports the banner.
    span = max(r["t_offset_ms"] for r in records) / 1000.0
    print(f"Replaying {len(records)} messages ({span:.1f}s of telemetry) "
          f"at {args.speed}x{' on loop' if args.loop else ''}")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="session-player")
    host, _, port = args.broker.partition(":")
    try:
        client.connect(host, int(port) if port else 1883, keepalive=60)
    except OSError as e:
        sys.exit(f"Cannot reach broker at {args.broker}: {e}. "
                 "Is it running?  cd infra && docker compose up -d")
    client.loop_start()

    try:
        while True:
            sent = play_once(client, records, args.speed, args.quiet, args.rewrite_prefix)
            print(f"  replayed {sent} messages" + " " * 20)
            if not args.loop:
                break
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
