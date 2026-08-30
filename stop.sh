#!/usr/bin/env bash
# Stop everything run.sh started, and verify it actually stopped.
#
# Verification is the point. The previous version killed by pidfile and trusted
# it; a publisher loop whose signal handler swallowed SIGTERM survived that
# silently and kept respawning, which put two races on the broker at once.
set -uo pipefail
cd "$(dirname "$0")"

PORT=${PORT:-8082}

echo "Stopping publisher..."
pkill -f '[p]ublisher-loop\.sh' 2>/dev/null
sleep 1
pkill -f '[p]ublisher\.py' 2>/dev/null
sleep 1
# Anything still alive after a polite TERM gets SIGKILL.
pkill -9 -f '[p]ublisher-loop\.sh' 2>/dev/null
pkill -9 -f '[p]ublisher\.py' 2>/dev/null
rm -f .run/publisher.pid

echo "Stopping Metro..."
if [[ -f .run/expo.pid ]]; then
  pid=$(cat .run/expo.pid)
  pkill -P "$pid" 2>/dev/null
  kill "$pid" 2>/dev/null
  rm -f .run/expo.pid
fi
lsof -ti:"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null

echo "Stopping broker..."
docker compose -f infra/docker-compose.yml stop >/dev/null 2>&1

# ── Verify ────────────────────────────────────────────────────────────────────
pubs=$(pgrep -f '[p]ublisher\.py' | wc -l | tr -d ' ')
loops=$(pgrep -f '[p]ublisher-loop\.sh' | wc -l | tr -d ' ')
metro=$(lsof -ti:"$PORT" 2>/dev/null | wc -l | tr -d ' ')
broker=$(docker ps --filter name=pitstop-mosquitto --format '{{.Names}}' 2>/dev/null | wc -l | tr -d ' ')

printf '\n  publishers %s   loops %s   metro %s   broker %s\n' "$pubs" "$loops" "$metro" "$broker"
if (( pubs || loops || metro || broker )); then
  echo "  SOMETHING IS STILL RUNNING"
  (( pubs || loops )) && pgrep -fl 'publisher\.py|publisher-loop\.sh'
  exit 1
fi
echo "  all stopped"

cat <<'EOF'

Note: the broker was stopped explicitly, and its restart policy is
`unless-stopped` -- so it will NOT come back by itself, not even after a
Docker restart. Bring it back with ./run.sh or:
    docker compose -f infra/docker-compose.yml start
EOF
