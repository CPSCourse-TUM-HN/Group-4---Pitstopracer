# Mock Publisher

Simulates a 10-lap JetRacer race, publishing telemetry to the local Mosquitto broker.

## Prerequisites

- Python 3.10+
- Mosquitto broker running (`cd ../infra && docker compose up -d`)

## Install

```bash
pip install -r requirements.txt
```

## Run

```bash
# Normal speed (10-lap race takes ~3 minutes real-time)
python publisher.py

# 5x faster (useful for dev iteration)
python publisher.py --speed 5

# Custom broker
python publisher.py --broker 192.168.1.10

# Reset all topics to healthy state and exit (clears stale UI state)
python publisher.py --reset-only
```

## What you'll see

One status line per second:
```
Lap 3 | Speed 4.2 m/s | Bat 72% | Fuel 61% | Worst tire 0.78
```

A pit sequence looks like:
```
[STRATEGY] Pit recommended: tire_wear — FL=0.23
[EVENT] pit_start
  ...pit in progress (8s)...
[EVENT] pit_end  — tires+fuel restored
```
