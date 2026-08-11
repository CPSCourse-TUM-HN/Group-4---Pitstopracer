# Pit-Stop Racer Pro

Real-time telemetry dashboard for an autonomous JetRacer. Shows battery, fuel, tire health, lap data, and a pit-recommendation banner. Built with React Native + Expo; simulated by a Python MQTT publisher; brokered by Mosquitto in Docker.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker + Docker Compose | latest | https://docs.docker.com/get-docker/ |
| Node.js | 20+ | https://nodejs.org |
| Python | 3.10+ | https://python.org |
| Expo Go (on phone) | latest | App Store / Google Play |

---

## 1 — Start the broker

```bash
cd infra
docker compose up -d
```

Verify it works:

```bash
# In one terminal — subscribe
mosquitto_sub -h localhost -p 1883 -t 'race/car1/#' -v

# In another — publish a test message
mosquitto_pub -h localhost -p 1883 -t 'race/car1/test' -m '{"hello":"world"}'
```

You should see the message appear in the subscriber terminal.

---

## 2 — Start the mock publisher

```bash
cd mock-publisher
pip install -r requirements.txt
python publisher.py
```

You'll see one status line per second. To iterate faster:

```bash
python publisher.py --speed 5    # 5× real-time
```

To clear stale UI state (useful during dev):

```bash
python publisher.py --reset-only
```

---

## 3 — Start the app

```bash
cd app
npm install
npx expo start
```

### Open on device / emulator

| Target | Action |
|--------|--------|
| **Expo Go on phone** | Scan the QR code in the terminal |
| **Android emulator** | Press `a` in the Expo terminal |
| **iOS simulator** | Press `i` in the Expo terminal |

> **Important — set the broker address for your setup.** It is an environment variable, not a committed value, so we don't all fight over one line in `config.ts`:

```bash
cp app/.env.example app/.env    # then edit it
```

| Scenario | `EXPO_PUBLIC_BROKER_URL` |
|----------|--------------------------|
| Android emulator on the same machine | `ws://10.0.2.2:9001` *(the default when unset)* |
| iOS simulator on the same machine | `ws://localhost:9001` |
| Physical phone on the same WiFi | `ws://<your-laptop-LAN-IP>:9001` |

`app/.env` is gitignored. **Restart Metro after changing it** — Expo inlines the value at bundle time.

To find your laptop's LAN IP on macOS: `ipconfig getifaddr en0`

On Windows (cmd): `ipconfig` → look for IPv4 Address under your WiFi adapter.

---

## 4 — Verify it works

1. Connection badge at the top goes **green** within ~3 seconds.
2. Battery %, Fuel %, Speed, Lap values visibly update.
3. Tire cards change from green → yellow → red as wear accumulates.
4. After tire wear or fuel drops far enough, a red **PIT NOW** banner appears and pulses.
5. The banner disappears after the simulated pit completes.

---

## 5 — Kill and restart broker (auto-reconnect test)

```bash
# In infra/
docker compose down
# Badge turns red within ~5 seconds

docker compose up -d
# Badge goes green again automatically, no app restart needed
```

---

## Troubleshooting

### Phone cannot reach the broker

- Make sure phone and laptop are on the same WiFi network.
- Check firewall: port 9001 must be open. On macOS: System Settings → Network → Firewall.
- Use `ws://<laptop-LAN-IP>:9001` — not `localhost` on a physical phone.

### MQTT.js / polyfill error on startup

The `react-native-url-polyfill` import at the top of `App.tsx` is required. If you see a `URL` not defined error, make sure `npm install` completed successfully.

### `paho-mqtt` / connection refused

Make sure the broker container is running:
```bash
cd infra && docker compose ps
```
The `pitstop-mosquitto` container must show status `Up`.

### Malformed JSON test (must NOT crash the app)

```bash
mosquitto_pub -h localhost -p 1883 -t 'race/car1/battery' -m 'not_json'
```

The app logs a warning and ignores it — no crash.

---

## Architecture

```
[Python publisher] --MQTT/TCP:1883--> [Mosquitto] <--MQTT/WS:9001-- [React Native App]
```

The publisher uses TCP (port 1883) because paho-mqtt uses native sockets.  
The app uses WebSocket (port 9001) because MQTT.js in React Native needs WS transport.

---

## Data contract

All topics are under `race/car1/`. See `app/src/types.ts` for TypeScript types and `mock-publisher/publisher.py` for Python dataclasses. Field names and units must stay in sync between the two.

The contract is also machine-checkable in `tools/packet_schema.py` — required fields, types and ranges per topic. That is what `recorder.py` validates against.

---

## Track geometry

The dashboard's digital twin is drawn from the real foam layout, not a hand-made map. `docs/track/monza_foam_grid_simple_rolls.pdf` is a vector blueprint at 1:1 scale; the extractor picks paths out of it by stroke signature.

```bash
python3 tools/extract_track.py            # regenerate app/src/track/monza.generated.ts
python3 tools/extract_track.py --verify   # check a revised blueprint, write nothing
```

Current layout: **22.01 m** closed centreline, 72 cm lane, pit lane branching at 74.2% and rejoining at 86.3% of the lap.

Run `--verify` whenever the team redraws the track. If it fails, the app's distance-based logic needs revisiting rather than silently regenerating.

---

## Session record & replay

Replay goes through the broker, so the app cannot tell it from live data and needs no special mode.

```bash
# Capture a session, and check every payload against the packet spec
python3 tools/recorder.py -o sessions/race1.ndjson --duration 60

# Replay it — a rehearsed demo with no car required
python3 tools/player.py sessions/race1.ndjson
python3 tools/player.py sessions/race1.ndjson --speed 5 --loop
```

`recorder.py` prints a per-topic report on exit: message counts, observed rate against expected, and any contract violations grouped by kind. **When you first publish from real hardware, record 30 seconds and read that report** — it will tell you exactly which fields are missing, mistyped or out of range.

`--rewrite-prefix race/test` republishes under a different prefix so a replay can run alongside a live publisher without colliding.

Recorded sessions are gitignored.

---

## Tests

```bash
cd app && npm test                          # geometry + position maths (32 tests)
python3 tools/test_roundtrip.py             # schema + record/replay round trip
python3 tools/extract_track.py --verify     # blueprint still parses as expected
```

The round-trip test needs a broker on `localhost:1883` and skips itself without one.
