# Digital Twin & Demo Robustness — Design

**Author:** Katrin (UI/UX & Digital Twin) · **Date:** 2026-08-10
**Status:** Approved, ready for implementation planning
**Target:** Presentation & submission, 2026-09-09

---

## 1. Context

The dashboard currently renders live telemetry — speed, battery, fuel, four-corner tire health, G-force, pit recommendation — from `mock-publisher/publisher.py` via Mosquitto. As of today no Hardware or Modeling topic publishes real data; every value on screen is simulated.

Two things are missing that this design addresses:

1. **There is no digital twin.** The Pit Crew Command Center shows the car's *state* but never its *place*. The pit-stop story — the core of the CPS narrative — is currently a text banner saying `PIT NOW`.
2. **The demo has no fallback.** A live presentation depends on the car, the broker, and every producer behaving. There is no way to rehearse or to replay a known-good race.

The physical track blueprint (`monza_foam_grid_simple_rolls.pdf`) is a vector drawing at 1:1 scale, which makes the twin far cheaper to build than a hand-digitised map would be.

### Goals

- Demo impact — the twin is the visual centrepiece
- Integration readiness — make it cheap for HW/Modeling to plug real data in correctly
- Demo robustness — the presentation cannot be broken by a missing producer or a bad run

### Non-goals

- Real localization / SLAM (depends on the perception slice; treated as an optional upgrade)
- Multi-car support
- Ghost-car / historical lap comparison
- Any breaking change to the Pro-Racing Packet spec

---

## 2. Architecture

**Replay goes through the broker, not through the app.** The recorder and player are Python tools alongside `mock-publisher/`, reusing its virtualenv. The app connects to `ws://localhost:9001` exactly as today and cannot distinguish live from replayed traffic. Robustness therefore costs the app zero lines of code and creates no second data path to keep in sync.

```
                 record ─────────────┐
 real car ──┐                        ▼
 modeling ──┼──► Mosquitto ──WS──► app        tools/session.ndjson
 mock pub ──┘        ▲                              │
                     └──────── replay ──────────────┘
```

### New components

| Component | Purpose |
|---|---|
| `tools/recorder.py` | Subscribes `race/car1/#`, appends NDJSON `{t_offset_ms, topic, payload}`. Validates each payload against the packet spec and prints a summary on exit: topics seen, observed rate, malformed count. |
| `tools/player.py` | Replays a session file to the broker preserving inter-message timing. Flags: `--speed`, `--loop`. |
| `tools/extract_track.py` | Build-time. Converts the blueprint PDF to track geometry (§3). |
| `app/src/track/monza.generated.ts` | Committed geometry output. No runtime PDF dependency. |
| `app/src/track/position.ts` | `carPosition(state, pose, track) → {x, y, heading, source}`. The single seam between "where the car is" and "how we drew it". |
| `app/src/components/TrackMap.tsx` | SVG renderer: track, pit lane, pit box, start/finish, car marker. |

### Integration payoff

The recorder's validation is the thin, cheap slice of contract enforcement. When Kelly first publishes from a real sensor, recording that session produces a file plus a report of exactly which fields were missing, mistyped, or out of range — and that file then becomes a real-data fixture for development, replacing guesswork.

---

## 3. Track geometry

The blueprint is vector at 1:1 scale: the SVG transform resolves to **1 path unit = 1 mm**, artboard **590 × 1000 cm**. Elements are identifiable by stroke signature.

| Element | Signature | Extracted |
|---|---|---|
| Track centreline | stroke-width 720 | 627 points, **22.01 m**, closed (start↔end gap 0 mm) |
| Track width | — | 72 cm |
| Pit lane | stroke-width 520 | 100 points, 3.63 m, branches and rejoins |
| Pit lane width | — | 52 cm |
| Pit box | green fill | rect x 256–316 cm, y 723–759 cm |

`extract_track.py` runs `pdftocairo -svg`, selects paths by signature, converts mm→cm, and emits the geometry plus a cumulative arc-length table. Committed to the repo, regenerable in one command when the foam layout changes.

`position.ts` maps `progress ∈ [0,1)` through the arc-length table to `{x, y}`, with heading from the segment tangent so the car marker points correctly.

**Progress v1** = `lap_time_s / expected_lap_time`, clamped to `[0, 1)`. On `pit_start` the lookup switches to the pit-lane polyline, runs the detour, and rejoins on `pit_end`.

`expected_lap_time` is the rolling median of completed lap times, measured from `event: lap` timestamps and kept over the last three laps. Before the first lap completes it falls back to a constant `SEED_LAP_TIME_S`, whose value is set once §7 is resolved and the team has agreed a realistic lap time. A median rather than a mean, so one pit-extended lap does not skew the estimate; three laps rather than all, so the estimate tracks tire degradation as the car slows.

### Two acknowledged caveats

**Position is an estimate, not a measurement.** A constant-speed assumption means the marker runs ahead in slow corners and behind on the straight. The `source` field (`'progress' | 'pose'`) is what keeps this honest: the UI badges it as *estimated*, and if a `pose` topic ever appears it takes priority and the badge flips to *measured*. Swapping in real localization is a one-function change.

**The arc-length origin is unverified.** The centreline's first point lands at (57, 723) cm on the left straight, which is where the start/finish checkers are drawn, but this was not confirmed against the checker path itself. If it is off, the fix is a constant offset on the arc-length origin.

---

## 4. UI layout

**Map hero, single portrait screen.** The map occupies roughly the top 55%. A compact summary strip beneath it carries speed, battery, fuel and four tire chips, so the operator can read position and health in one glance.

The screen already scrolls (`app/src/screens/DashboardScreen.tsx:216`), so nothing existing is removed: the full `CarTireLayout` with the car silhouette, the arc gauges, the G-force widget, the Strategy Predictor and their tap-to-explain sheets all remain below the fold. The chips are a second, more glanceable representation of the tires — not a replacement.

A landscape "pit wall" mode (map left, telemetry right) is a possible later addition. Out of scope for the first pass; the app is portrait-locked at `app/app.json:6`.

---

## 5. Behaviour under failure

**Position degradation ladder** — the map is always drawable, because the geometry is static:

| Condition | Behaviour |
|---|---|
| `pose` topic present | `source: 'pose'`, badge *measured* |
| `state` present only | `source: 'progress'`, badge *estimated* |
| Neither | No car marker; track still renders; badge *no position* |

**Stale data freezes, it does not hide.** Reusing the existing 5 s threshold (`DashboardScreen.tsx:16`), the marker dims and the badge reads *stale*, holding its last position. A frozen car communicates "feed lost here"; a vanished car just looks broken.

**Broker loss needs no new code.** `app/src/mqtt/client.ts:19` already auto-reconnects and the header badge already renders connection status.

**Malformed payloads.** `client.ts:33` already catches bad JSON. Add a per-topic shape guard in `useTelemetry` that drops messages missing required fields and counts them, never throwing. `README.md:134-140` documents a `not_json` test; extend it to well-formed-but-wrong-shape, which is the realistic failure when a real producer sends `speed` in km/h instead of m/s.

**Pit watchdog.** This is the one new failure mode the twin introduces. `pit_start` moves the car onto the pit lane; `pit_end` returns it. If `pit_end` never arrives — producer crash, planner bug — the car would sit in the pit box forever and the demo is dead.

The app therefore holds its own timeout, `PIT_WATCHDOG_MS`, defaulting to **15 s**. It is deliberately an app-side constant rather than a read of the publisher's `PIT_DURATION_S`: the app must not couple to a producer's internals, and the real pit duration will come from Hardware, not the mock. 15 s is roughly the mock's 8 s plus generous slack. On expiry the car auto-rejoins the main line and the visit is flagged *assumed complete*. Fail forward, never freeze.

---

## 6. Testing

The geometry and position maths are pure functions, which is where tests earn their keep.

- **`extract_track.py --verify`** — loop closes (< 1 cm gap), length within tolerance of 22.01 m, arc-length table monotonic, point count sane. Catches a silently revised foam layout.
- **`position.ts`** — progress 0 lands on start/finish; 0.5 lands ~11 m along; wraps cleanly at 1.0; heading continuous between adjacent samples (no 180° flips); pit detour enters and exits at the branch points.
- **Recorder/player round-trip** — record 30 s of mock, replay, assert message sequence and inter-message timing match within tolerance. One test covering the whole robustness story.

No UI snapshot tests — brittle, and at four weeks they would cost more than they catch.

---

## 7. Known issue: lap distance is inconsistent with the physical track

`mock-publisher/publisher.py:62-63` uses `BASE_LAP_TIME = 18.0` s at roughly 3.8 m/s, implying a **68 m** lap. The measured track centreline is **22.01 m**. At the simulated speed a lap takes ~5.8 s, not 18 s.

Beyond the arithmetic, 3.8 m/s (13.7 km/h) is not plausible for a JetRacer on a 6 × 10 m foam track with a 72 cm lane; 1–1.5 m/s is realistic.

This matters beyond the UI: it affects Soyeong's wear-per-distance model and Kangyun's planner horizon. **Action:** raise with Modeling and agree a single set of numbers, then fix the mock in one commit.

---

## 8. Dependencies and open questions

| Item | Owner | Status |
|---|---|---|
| Does the perception pipeline emit car `(x, y)`? | Vincent / perception | **Unknown.** Design does not depend on it; upgrade path is `pose`. |
| Optional `pose` topic added to the packet spec | Katrin → team | Proposed, non-breaking, no producer obliged to publish |
| Agreed lap distance and realistic top speed | Modeling + Katrin | Open — see §7 |
| Confirm arc-length origin = start/finish line | Katrin | Open — constant-offset fix if wrong |

---

## 9. Repository note

As of 2026-08-10 this repository has a single commit (`55ff6bd`, 2026-05-12) on `main`, no other branches, no PRs. This document is the first entry in `docs/`.
