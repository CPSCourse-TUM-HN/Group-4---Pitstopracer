#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"

for name in expo publisher; do
  pidfile=".run/$name.pid"
  if [[ -f $pidfile ]]; then
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
      echo "Stopped $name (pid $pid)"
    fi
    rm -f "$pidfile"
  fi
done

docker compose -f infra/docker-compose.yml stop >/dev/null 2>&1 && echo "Stopped broker"
