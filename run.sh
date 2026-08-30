#!/usr/bin/env bash
# Bring up the whole demo: broker, publisher, Metro, and a way to view it.
#
# Written to survive the things that actually went wrong in practice:
#   - the laptop's LAN IP changes between sessions, silently breaking the app's
#     broker URL (the app loads, the badge just stays red)
#   - no iOS runtime is installed, so the old unconditional Simulator step
#     failed the whole script after everything else had come up fine
#   - a second publisher gets started alongside the first, and the twin reads
#     two interleaved races as a car skipping backwards
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p .run

PORT=${PORT:-8082}
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '  \033[33m! %s\033[0m\n' "$*"; }
ok() { printf '  \033[32mok\033[0m %s\n' "$*"; }

# ── Docker ────────────────────────────────────────────────────────────────────
say "Broker"
if ! docker info >/dev/null 2>&1; then
  echo "  starting Docker Desktop..."
  open -a Docker 2>/dev/null || { echo "  Docker Desktop not found"; exit 1; }
  for _ in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || { echo "  Docker did not start in 3 minutes"; exit 1; }
fi
docker compose -f infra/docker-compose.yml up -d >/dev/null 2>&1
for _ in $(seq 1 30); do
  nc -z localhost 1883 2>/dev/null && break
  sleep 1
done
nc -z localhost 1883 2>/dev/null || { echo "  broker never opened port 1883"; exit 1; }
ok "mosquitto up on 1883 (mqtt) and 9001 (websocket)"

# ── Broker URL ────────────────────────────────────────────────────────────────
# Expo inlines .env at bundle time, so this must be right *before* Metro starts.
say "Broker URL"
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
if [[ -z $LAN_IP ]]; then
  warn "no LAN IP (Wi-Fi down?) -- falling back to localhost, phones will not connect"
  LAN_IP=localhost
fi
WANT="EXPO_PUBLIC_BROKER_URL=ws://$LAN_IP:9001"
if [[ ! -f app/.env ]] || ! grep -qxF "$WANT" app/.env; then
  printf '%s\n' "$WANT" > app/.env
  ok "app/.env set to ws://$LAN_IP:9001"
else
  ok "app/.env already ws://$LAN_IP:9001"
fi

# ── Publisher ─────────────────────────────────────────────────────────────────
say "Publisher"
if pgrep -f '[p]ublisher\.py' >/dev/null; then
  warn "already running (pid $(pgrep -f '[p]ublisher\.py' | head -1)) -- leaving it alone"
else
  nohup ./scripts/publisher-loop.sh > .run/publisher.log 2>&1 < /dev/null &
  disown
  sleep 3
  pgrep -f '[p]ublisher\.py' >/dev/null \
    && ok "publishing race/car1/# (loops races)" \
    || { warn "failed to start -- see .run/publisher.log"; tail -5 .run/publisher.log; }
fi

# ── Metro ─────────────────────────────────────────────────────────────────────
say "Metro"
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  warn "port $PORT already in use -- restarting it so the new .env is picked up"
  lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
  sleep 2
fi
# The subshell is backgrounded as a whole, so `cd app` applies to Metro while
# the pid is captured out here at the repo root. Writing the pid inside the
# parenthesised list instead would resolve ../.run relative to the wrong
# directory -- and silently lose the pid that stop.sh needs.
: > .run/expo.log
( cd app && exec npx expo start --port "$PORT" --lan >> ../.run/expo.log 2>&1 < /dev/null ) &
echo $! > .run/expo.pid
disown 2>/dev/null || true
for _ in $(seq 1 90); do grep -q "Waiting on http" .run/expo.log 2>/dev/null && break; sleep 1; done
grep -q "Waiting on http" .run/expo.log 2>/dev/null \
  && ok "bundler on $PORT" \
  || { warn "Metro did not report ready -- see .run/expo.log"; tail -5 .run/expo.log; }

if grep -qi "unable to resolve asset" .run/expo.log 2>/dev/null; then
  warn "a referenced asset is missing -- app.json points at a file that is not there"
  grep -i "unable to resolve asset" .run/expo.log | head -2
fi

# ── Viewer ────────────────────────────────────────────────────────────────────
say "Open it"
URL="exp://$LAN_IP:$PORT"
if xcrun simctl list devices available 2>/dev/null | grep -q "iPhone"; then
  open -a Simulator
  for _ in $(seq 1 30); do xcrun simctl list devices | grep -q "(Booted)" && break; sleep 1; done
  if xcrun simctl list devices | grep -q "(Booted)"; then
    xcrun simctl openurl booted "$URL" && ok "opened in the iOS Simulator"
  else
    warn "Simulator did not boot a device -- use the URL below"
  fi
else
  warn "no iOS runtime installed, so there is no Simulator to open"
  echo "     (install one with: xcodebuild -downloadPlatform iOS)"
fi

cat <<EOF

  Open on your phone (same Wi-Fi), in Expo Go:
      $URL
  iPhone: scan with the Camera app.  Android: Expo Go > Scan QR code.

  Publisher log : tail -f .run/publisher.log
  Metro log     : tail -f .run/expo.log
  Stop          : ./stop.sh
EOF
