#!/usr/bin/env bash
# Everything that can be checked without a phone. Run before a demo.
set -uo pipefail
cd "$(dirname "$0")"

fail=0
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
run()  { if "${@:2}" >/tmp/verify.$$ 2>&1; then printf '  \033[32mok\033[0m %s\n' "$1";
         else printf '  \033[31mFAIL\033[0m %s\n' "$1"; sed 's/^/      /' /tmp/verify.$$ | tail -15; fail=1; fi; }

PY=./mock-publisher/.venv/bin/python
[[ -x $PY ]] || PY=python3

step "App"
run "typecheck"            bash -c 'cd app && npx tsc --noEmit'
run "unit tests"           bash -c 'cd app && npx jest --silent'

step "Tools"
run "packet schema + replay round trip" $PY tools/test_roundtrip.py
run "track blueprint still parses"      python3 tools/extract_track.py --verify

step "Scripts"
for f in run.sh stop.sh scripts/publisher-loop.sh scripts/stop-publisher.sh; do
  run "syntax: $f" bash -n "$f"
done

step "Assets referenced by app.json exist"
run "app icon" bash -c '
  icon=$(python3 -c "import json;print(json.load(open(\"app/app.json\"))[\"expo\"].get(\"icon\",\"\"))")
  [[ -z $icon ]] || [[ -f app/${icon#./} ]]'

step "Contract agreement (app guard vs packet_schema)"
run "same required fields" $PY - <<'PYEOF'
import re, sys
sys.path.insert(0, 'tools')
from packet_schema import SCHEMA
ts = open('app/src/mqtt/validation.ts').read()
block = ts[ts.index('REQUIRED_NUMBERS'):ts.index('const EVENT_TYPES')]
app = {m.group(1): set(re.findall(r"'(\w+)'", m.group(2)))
       for m in re.finditer(r"(\w+):\s*\[([^\]]*)\]", block)}
bad = []
for topic, fields in SCHEMA.items():
    py = {f.name for f in fields if f.allowed is None and f.kind is not bool}
    a = app.get(topic, set())
    if py != a and not (topic == 'pose' and py - a == {'heading'}):
        bad.append(f"{topic}: python={sorted(py)} app={sorted(a)}")
if bad:
    print('\n'.join(bad)); sys.exit(1)
PYEOF

printf '\n'
if (( fail )); then printf '\033[31mVERIFY FAILED\033[0m\n'; exit 1; fi
printf '\033[32mall checks passed\033[0m\n'
