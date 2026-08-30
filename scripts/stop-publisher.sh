#!/usr/bin/env bash
# Stop the publisher loop and any publisher it left behind, then verify.
cd "$(dirname "$0")/.."
pkill -f '[p]ublisher-loop\.sh' 2>/dev/null
sleep 1
pkill -9 -f '[p]ublisher\.py' 2>/dev/null
sleep 1
n=$(pgrep -f '[p]ublisher\.py' | wc -l | tr -d ' ')
l=$(pgrep -f '[p]ublisher-loop\.sh' | wc -l | tr -d ' ')
rm -f .run/publisher.pid
echo "publishers: $n   loops: $l"
[ "$n" -eq 0 ] && [ "$l" -eq 0 ] && echo "clean" || { echo "STILL RUNNING"; exit 1; }
