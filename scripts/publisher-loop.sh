#!/usr/bin/env bash
# Single-instance publisher loop.
#
# Two publishers on the same topics interleave two independent races: lap and
# lap_time_s jump between them and the digital twin reads that as a car
# skipping backwards. Two guards below, both learned the hard way.
set -u
cd "$(dirname "$0")/.."

# Guard 1: refuse to start alongside an existing publisher.
if pgrep -f '[p]ublisher\.py' >/dev/null; then
  echo "A publisher is already running (pid $(pgrep -f '[p]ublisher\.py' | head -1))." >&2
  echo "Stop it first:  ./scripts/stop-publisher.sh" >&2
  exit 1
fi

echo $$ > .run/publisher.pid

# Guard 2: the trap MUST exit. A handler that only cleans up leaves bash to
# resume the loop after the signal, making this script survive pkill and
# quietly respawn the very duplicate it is meant to prevent.
cleanup() {
  trap - EXIT INT TERM
  pkill -P $$ -f publisher.py 2>/dev/null
  rm -f .run/publisher.pid
}
trap 'cleanup; exit 0' INT TERM
trap cleanup EXIT

cd mock-publisher
while true; do
  .venv/bin/python publisher.py || true
  # Short: the app marks a topic stale after 5 s, and this pause plus Python
  # start-up is dead air between races in a looping demo.
  sleep 0.5
done
