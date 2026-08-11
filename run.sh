#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p .run

if ! docker info >/dev/null 2>&1; then
  echo "Starting Docker Desktop..."
  open -a Docker
  until docker info >/dev/null 2>&1; do sleep 2; done
fi

echo "Starting broker..."
if docker compose -f infra/docker-compose.yml ps -a --format '{{.Name}}' | grep -q pitstop-mosquitto; then
  docker compose -f infra/docker-compose.yml start >/dev/null
else
  docker compose -f infra/docker-compose.yml up -d >/dev/null
fi

echo "Starting publisher (loops races)..."
(
  cd mock-publisher
  while true; do
    .venv/bin/python publisher.py
    sleep 2
  done
) >.run/publisher.log 2>&1 &
echo $! > .run/publisher.pid

echo "Starting Expo on port 8082..."
( cd app && npx expo start --port 8082 ) >.run/expo.log 2>&1 &
echo $! > .run/expo.pid

echo "Waiting for Metro..."
until grep -q "Waiting on http" .run/expo.log 2>/dev/null; do sleep 1; done

echo "Opening Simulator..."
open -a Simulator
sleep 2
xcrun simctl openurl booted "exp://127.0.0.1:8082"

cat <<EOF

Ready.
  Publisher log: tail -f .run/publisher.log
  Expo log:      tail -f .run/expo.log
  Stop:          ./stop.sh
EOF
