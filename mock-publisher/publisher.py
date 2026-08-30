#!/usr/bin/env python3
"""
Pit-Stop Racer Pro — Mock Publisher
Simulates a 10-lap JetRacer race with realistic sensor data.
Sensors modelled: VESC (speed/steering/throttle), INA219 (voltage/current),
MPU9250 IMU (accel/gyro), wheel odometry, tire wear model.
"""

import argparse, json, math, random, signal, sys, threading, time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional
import paho.mqtt.client as mqtt

# ── Data types (sync with app/src/types.ts) ──────────────────────────────────

@dataclass
class StateMsg:
    ts: int; speed: float; steering: float; throttle: float
    lap: int; lap_time_s: float

@dataclass
class BatteryMsg:
    ts: int; voltage: float; percent: float
    current_ma: float; eta_s: float

@dataclass
class FuelMsg:
    ts: int; percent: float; eta_s: float

@dataclass
class TiresMsg:
    ts: int; fl: float; fr: float; rl: float; rr: float; eta_s: float

@dataclass
class StrategyMsg:
    ts: int; pit_recommended: bool; reason: str; target_lap: int

@dataclass
class EventMsg:
    ts: int; type: str  # pit_start | pit_end | lap

@dataclass
class PoseMsg:
    ts: int; x: float; y: float; heading: float

@dataclass
class ImuMsg:
    ts: int
    ax: float   # lateral G   (MPU9250)
    ay: float   # longitudinal G
    az: float   # vertical G
    gx: float   # roll rate  deg/s
    gy: float   # pitch rate deg/s
    gz: float   # yaw rate   deg/s

# ── Helpers ───────────────────────────────────────────────────────────────────

def ts_now() -> int: return int(time.time() * 1000)
def clamp(v, lo, hi): return max(lo, min(hi, v))
def lerp(a, b, t): return a + (b - a) * clamp(t, 0, 1)

# ── Simulator ─────────────────────────────────────────────────────────────────

class RaceSimulator:
    TOTAL_LAPS       = 10
    BASE_LAP_TIME    = 18.0

    # Centreline length of the physical foam track, in metres, as extracted
    # from the blueprint by tools/extract_track.py. Checked against
    # app/src/track/monza.generated.ts by tools/test_roundtrip.py.
    TRACK_LENGTH_M   = 22.01

    # Derived, never hardcoded. This used to be a literal 3.8 m/s, which over an
    # 18 s lap implies a 68 m circuit -- three times the track that was actually
    # measured, and 13.7 km/h for a JetRacer on a 6x10 m foam mat with 72 cm
    # lanes. Deriving it keeps distance, speed and lap time in agreement no
    # matter which of them the team retunes.
    #
    # docs/specs/2026-08-10-digital-twin-design.md section 7 raised this as an
    # open question for Modeling. The lap TIME was already right; only the speed
    # was wrong, so nothing about the demo's pacing changes -- the speed readout
    # goes from ~13.7 km/h to ~4.4 km/h, which is what the car actually does.
    NOMINAL_SPEED_MS = TRACK_LENGTH_M / BASE_LAP_TIME
    BATTERY_START    = 100.0
    BATTERY_END      = 10.0
    VOLTAGE_MAX      = 12.6
    VOLTAGE_MIN      = 10.5
    CURRENT_IDLE_MA  = 800.0
    CURRENT_RACE_MA  = 3200.0

    # Tire wear per lap (fraction consumed) — FL fastest on right-handed track
    TIRE_WEAR_PER_LAP = {"fl": 0.12, "fr": 0.09, "rl": 0.10, "rr": 0.08}
    FUEL_PER_LAP      = 0.10      # 10% per lap

    PIT_TRIGGER_TIRE  = 0.25
    PIT_TRIGGER_FUEL  = 15.0
    PIT_HOLD_S        = 2.0
    PIT_DURATION_S    = 8.0

    def __init__(self, broker: str, speed: float, publish_pose: bool = False):
        self.broker  = broker
        self.speed   = speed
        self.publish_pose = publish_pose
        self.track = None
        if publish_pose:
            sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
            from track_geometry import Track
            self.track = Track()
        self.client: Optional[mqtt.Client] = None
        self._running = True
        self._cleaned = False

        self.lap          = 1
        self.lap_time_s   = 0.0
        self.battery_pct  = self.BATTERY_START
        self.fuel_pct     = 100.0
        self.tires        = {"fl": 1.0, "fr": 1.0, "rl": 1.0, "rr": 1.0}
        self.in_pit       = False
        self.pit_rec_since: Optional[float] = None
        self.total_laps_done = 0

        # IMU state
        self._corner_phase = 0.0   # track position angle

    # ── MQTT ──────────────────────────────────────────────────────────────────

    def connect(self):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="mock-publisher")
        self._connected = threading.Event()

        def _on_connect(c, u, f, rc, p):
            print("Connected to broker." if rc == 0 else f"Failed: {rc}")
            if rc == 0:
                self._connected.set()

        self.client.on_connect = _on_connect
        self.client.on_disconnect = lambda c, u, f, rc, p: (print(f"Disconnected ({rc}), reconnecting…") if self._running else None)
        host, _, port_str = self.broker.partition(":")
        self.client.connect(host, int(port_str) if port_str else 1883, keepalive=60)
        self.client.loop_start()

    def _pub(self, topic: str, payload: dict, qos: int = 0):
        self.client.publish(topic, json.dumps(payload), qos=qos)

    def pub_state(self, speed, steering, throttle):
        self._pub("race/car1/state", asdict(StateMsg(
            ts=ts_now(), speed=round(speed,2), steering=round(steering,3),
            throttle=round(throttle,2), lap=self.lap, lap_time_s=round(self.lap_time_s,2),
        )))

    def pub_battery(self, throttle: float):
        t = (self.BATTERY_START - self.battery_pct) / (self.BATTERY_START - self.BATTERY_END)
        voltage = lerp(self.VOLTAGE_MAX, self.VOLTAGE_MIN, t)
        current = lerp(self.CURRENT_IDLE_MA, self.CURRENT_RACE_MA, throttle)
        eta_s = (self.battery_pct / max((self.BATTERY_START - self.BATTERY_END) /
                 (self.TOTAL_LAPS * self.BASE_LAP_TIME), 0.001))
        self._pub("race/car1/battery", asdict(BatteryMsg(
            ts=ts_now(), voltage=round(voltage,3), percent=round(self.battery_pct,1),
            current_ma=round(current,0), eta_s=round(eta_s,1),
        )))

    def pub_fuel(self):
        eta_s = (self.fuel_pct / max(self.FUEL_PER_LAP * 100, 0.001)) * self.BASE_LAP_TIME
        self._pub("race/car1/fuel", asdict(FuelMsg(
            ts=ts_now(), percent=round(self.fuel_pct,1), eta_s=round(eta_s,1),
        )))

    def pub_tires(self):
        worst = min(self.tires.values())
        eta_s = (worst / max(self.TIRE_WEAR_PER_LAP["fl"], 0.001)) * self.BASE_LAP_TIME
        self._pub("race/car1/tires", asdict(TiresMsg(
            ts=ts_now(), fl=round(self.tires["fl"],3), fr=round(self.tires["fr"],3),
            rl=round(self.tires["rl"],3), rr=round(self.tires["rr"],3), eta_s=round(eta_s,1),
        )))

    def pub_imu(self, steering: float, throttle: float, speed: float):
        # Simulate MPU9250 readings from motion model
        # Lateral G from cornering: centripetal + steering input
        lateral_g   = steering * speed * 0.18 + 0.03 * math.sin(self._corner_phase)
        # Longitudinal G from throttle/brake model
        long_g      = (throttle - 0.45) * 0.6 + 0.04 * math.cos(self._corner_phase * 2)
        # Vertical ~1G + small vibration
        vert_g      = 1.0 + 0.02 * math.sin(self._corner_phase * 8)
        # Gyro rates from steering derivative
        yaw_rate    = steering * speed * 28.0 + 2 * math.sin(self._corner_phase)
        roll_rate   = lateral_g * 12.0
        pitch_rate  = long_g * 10.0
        # Add noise (IMU noise floor ~0.01G)
        noise = lambda: random.gauss(0, 0.008)
        self._pub("race/car1/imu", asdict(ImuMsg(
            ts=ts_now(),
            ax=round(lateral_g + noise(), 4),
            ay=round(long_g + noise(), 4),
            az=round(vert_g + noise(), 4),
            gx=round(roll_rate + random.gauss(0, 0.5), 2),
            gy=round(pitch_rate + random.gauss(0, 0.5), 2),
            gz=round(yaw_rate + random.gauss(0, 1.0), 2),
        )))

    def pub_pose(self, progress: float):
        """
        Optional measured localization, for exercising the app's 'measured' rung.

        Deliberately NOT published during a pit stop: this pose is derived from
        the racing line, and the app prefers a pose over its own pit animation,
        so publishing one here would draw the car sailing past the pit lane. Its
        absence makes the app fall back to 'estimated', which also demonstrates
        the degradation ladder.
        """
        if not self.track:
            return
        x, y, heading = self.track.position_at(progress)
        # A little noise, so it looks like a fix rather than a formula.
        self._pub("race/car1/pose", asdict(PoseMsg(
            ts=ts_now(),
            # Field bounds come from the same generated geometry the app draws,
            # so a redrawn track cannot leave this clamping to the old artboard.
            x=round(clamp(x + random.gauss(0, 1.5), 0, self.track.field_w_cm), 1),
            y=round(clamp(y + random.gauss(0, 1.5), 0, self.track.field_h_cm), 1),
            heading=round(heading + random.gauss(0, 2.0), 1),
        )))

    def pub_strategy(self, recommended: bool, reason: str = "", target_lap: int = 0):
        self._pub("race/car1/strategy", asdict(StrategyMsg(
            ts=ts_now(), pit_recommended=recommended, reason=reason, target_lap=target_lap,
        )), qos=1)

    def pub_event(self, etype: str):
        self._pub("race/car1/event", asdict(EventMsg(ts=ts_now(), type=etype)), qos=1)

    # ── Pit ───────────────────────────────────────────────────────────────────

    def _do_pit(self):
        print("[EVENT] pit_start")
        self.pub_event("pit_start")
        self.pub_strategy(False, "", 0)

        # Keep transmitting through the stop.
        #
        # This used to sleep silently for PIT_DURATION_S. The app marks a topic
        # stale after 5 s without a message, so an 8 s pit greyed out the whole
        # dashboard and dimmed the map to "stale" -- during the one moment the
        # entire pit-stop story is about. A real car does not stop reporting
        # when it stops moving; it reports being stationary.
        STATE_INTERVAL = 1.0 / 20
        SLOW_INTERVAL = 1.0 / 2
        pit_start_t = time.time()
        next_tick = pit_start_t
        last_slow = 0.0

        while self._running:
            now = time.time()
            if (now - pit_start_t) * self.speed >= self.PIT_DURATION_S:
                break

            # Stationary in the box: no speed, no throttle, wheels straight.
            self.pub_state(0.0, 0.0, 0.0)
            self.pub_imu(0.0, 0.0, 0.0)

            if now - last_slow >= SLOW_INTERVAL / self.speed:
                # Idle draw, not race draw -- the motor is not working.
                self.pub_battery(0.0)
                self.pub_fuel()
                self.pub_tires()
                last_slow = now

            next_tick += STATE_INTERVAL / self.speed
            slack = next_tick - time.time()
            if slack > 0:
                time.sleep(slack)
            else:
                next_tick = time.time()

        self.tires   = {"fl": 1.0, "fr": 1.0, "rl": 1.0, "rr": 1.0}
        self.fuel_pct = 100.0
        self.pit_rec_since = None
        self.in_pit = False

        self.pub_tires(); self.pub_fuel()
        self.pub_event("pit_end")
        print("[EVENT] pit_end — tires + fuel restored")

    # ── Main loop ─────────────────────────────────────────────────────────────

    def run(self):
        self.connect()
        # Wait for the CONNACK rather than sleeping a fixed second.
        #
        # run.sh loops races, and the app marks a topic stale after 5 s. A fixed
        # 1 s here plus the loop's own pause plus Python start-up left a 4.2 s
        # hole between races -- under the threshold, but only just, and on a
        # loaded machine it would tip over and flash "stale" mid-demo.
        if not self._connected.wait(timeout=5.0):
            print("No CONNACK within 5s; publishing anyway (paho will queue).")

        STATE_INTERVAL = 1.0 / 20   # 20 Hz
        SLOW_INTERVAL  = 1.0 / 2    # 2 Hz

        last_slow_t = last_status_t = 0.0
        next_tick = time.time()
        lap_start = race_start = last_tick = time.time()

        while self._running and self.total_laps_done < self.TOTAL_LAPS:
            now = time.time()
            # Simulated seconds since the previous iteration. Measured rather
            # than assumed: the loop sleeps STATE_INTERVAL/speed of real time,
            # so a fixed STATE_INTERVAL*speed step consumed `speed` times too
            # much per simulated second and made --speed distort the race
            # instead of merely accelerating it.
            dt = (now - last_tick) * self.speed
            last_tick = now
            self.lap_time_s = (now - lap_start) * self.speed

            # Advance corner phase (track position)
            self._corner_phase += STATE_INTERVAL * self.speed * 2.1

            # Compute motion state
            worst_tire   = min(self.tires.values())
            speed_factor = clamp(0.5 + 0.5 * worst_tire + self.fuel_pct / 200.0, 0.3, 1.0)
            speed_ms     = self.NOMINAL_SPEED_MS * speed_factor * (1 + 0.1 * math.sin(self._corner_phase * 0.5))
            throttle     = clamp(speed_factor * 0.85 + 0.08 * math.sin(self._corner_phase), 0, 1)
            steering     = 0.45 * math.sin(self._corner_phase * 0.9)

            # Wear per tick
            if not self.in_pit:
                for tire, rate in self.TIRE_WEAR_PER_LAP.items():
                    self.tires[tire] = clamp(self.tires[tire] - (rate / self.BASE_LAP_TIME) * dt, 0, 1)
                self.fuel_pct    = clamp(self.fuel_pct    - (self.FUEL_PER_LAP * 100 / self.BASE_LAP_TIME) * dt, 0, 100)
                discharge        = (self.BATTERY_START - self.BATTERY_END) / (self.TOTAL_LAPS * self.BASE_LAP_TIME)
                self.battery_pct = clamp(self.battery_pct - discharge * dt, 0, 100)

            # Lap completion
            actual_lap_time = self.BASE_LAP_TIME / speed_factor
            if not self.in_pit and self.lap_time_s >= actual_lap_time:
                self.total_laps_done += 1
                self.pub_event("lap")
                print(f"[EVENT] lap {self.lap} complete  ({actual_lap_time:.1f}s)")
                if self.lap < self.TOTAL_LAPS: self.lap += 1
                lap_start = time.time()
                self.lap_time_s = 0.0

            # Pit logic
            if not self.in_pit:
                pit_needed = worst_tire < self.PIT_TRIGGER_TIRE or self.fuel_pct < self.PIT_TRIGGER_FUEL
                if pit_needed and self.pit_rec_since is None:
                    reason = "tire_wear" if worst_tire < self.PIT_TRIGGER_TIRE else "low_fuel"
                    print(f"[STRATEGY] pit recommended: {reason}  tire={worst_tire:.2f} fuel={self.fuel_pct:.1f}%")
                    self.pub_strategy(True, reason, self.lap + 1)
                    self.pit_rec_since = now
                if self.pit_rec_since and (now - self.pit_rec_since) * self.speed >= self.PIT_HOLD_S:
                    self.in_pit = True
                    self._do_pit()
                    # _do_pit blocks for the whole service. Restart both clocks
                    # so the pause is not billed as a lap or as tire wear on the
                    # very tick after the tires were replaced.
                    lap_start = last_tick = next_tick = time.time()
                if not pit_needed and self.pit_rec_since:
                    self.pit_rec_since = None
                    self.pub_strategy(False, "", 0)

            # The loop itself now ticks at STATE_INTERVAL, so state and imu go
            # out once per tick. Gating them on elapsed time as well made two
            # 20 Hz clocks beat against each other and silently dropped a third
            # of the messages.
            self.pub_state(speed_ms, steering, throttle)
            self.pub_imu(steering, throttle, speed_ms)
            if self.publish_pose and not self.in_pit:
                self.pub_pose(self.lap_time_s / max(actual_lap_time, 0.001))

            # Publish slow topics @ 2 Hz
            if now - last_slow_t >= SLOW_INTERVAL / self.speed:
                self.pub_battery(throttle)
                self.pub_fuel()
                self.pub_tires()
                last_slow_t = now

            # Status print
            if now - last_status_t >= 1.0:
                print(f"Lap {self.lap}/{self.TOTAL_LAPS} | {speed_ms*3.6:.1f} km/h | "
                      f"Bat {self.battery_pct:.0f}% | Fuel {self.fuel_pct:.0f}% | "
                      f"Worst tire {worst_tire:.2f} | Throttle {throttle*100:.0f}%")
                last_status_t = now

            # Schedule against an absolute deadline rather than sleeping a
            # computed remainder. time.sleep overshoots by a few milliseconds,
            # and sleeping "the rest of this tick" lets that error repeat every
            # tick: the advertised 20 Hz came out at 17, which the recorder then
            # reports as a producer running slow. Chasing a deadline absorbs the
            # overshoot instead of compounding it.
            next_tick += STATE_INTERVAL / self.speed
            slack = next_tick - time.time()
            if slack > 0:
                time.sleep(slack)
            else:
                # Fallen behind (a blocking pit, a slow broker). Give up the
                # lost ticks rather than publishing a burst to catch up.
                next_tick = time.time()

        print("Race complete — 10 laps done.")
        self.pub_strategy(False, "race_complete", 0)
        self.cleanup()

    def cleanup(self):
        # Idempotent: SIGTERM runs this from the signal handler, which stops the
        # main loop, which then falls through and calls it again. Publishing a
        # reset to an already-disconnected client is harmless but noisy.
        if getattr(self, "_cleaned", False):
            return
        self._cleaned = True
        self._running = False
        if self.client:
            self.battery_pct = 100.0; self.fuel_pct = 100.0
            self.tires = {"fl": 1.0, "fr": 1.0, "rl": 1.0, "rr": 1.0}
            self.pub_battery(0); self.pub_fuel(); self.pub_tires()
            self.pub_strategy(False, "", 0)
            time.sleep(0.2)
            self.client.loop_stop(); self.client.disconnect()
            print("Disconnected cleanly.")

# ── Reset helper ──────────────────────────────────────────────────────────────

def reset_only(broker: str):
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="mock-reset")
    host, _, port_str = broker.partition(":")
    c.connect(host, int(port_str) if port_str else 1883); c.loop_start(); time.sleep(0.5)
    now = ts_now()
    c.publish("race/car1/battery",  json.dumps({"ts":now,"voltage":12.6,"percent":100.0,"current_ma":800.0,"eta_s":180.0}))
    c.publish("race/car1/fuel",     json.dumps({"ts":now,"percent":100.0,"eta_s":180.0}))
    c.publish("race/car1/tires",    json.dumps({"ts":now,"fl":1.0,"fr":1.0,"rl":1.0,"rr":1.0,"eta_s":180.0}))
    c.publish("race/car1/state",    json.dumps({"ts":now,"speed":0.0,"steering":0.0,"throttle":0.0,"lap":1,"lap_time_s":0.0}))
    c.publish("race/car1/strategy", json.dumps({"ts":now,"pit_recommended":False,"reason":"","target_lap":0}), qos=1)
    c.publish("race/car1/imu",      json.dumps({"ts":now,"ax":0.0,"ay":0.0,"az":1.0,"gx":0.0,"gy":0.0,"gz":0.0}))
    time.sleep(0.3); c.loop_stop(); c.disconnect()
    print("Reset published.")

# ── Entry ─────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--broker",     default="localhost:1883")
    p.add_argument("--speed",      type=float, default=1.0)
    p.add_argument("--reset-only", action="store_true")
    p.add_argument("--publish-pose", action="store_true",
                   help="also publish race/car1/pose, so the app's 'measured' "
                        "position mode can be exercised without the perception stack")
    args = p.parse_args()

    if args.reset_only:
        reset_only(args.broker); return

    sim = RaceSimulator(broker=args.broker, speed=args.speed,
                        publish_pose=args.publish_pose)
    def handle(sig, frame):
        print("\nShutting down…"); sim.cleanup(); sys.exit(0)
    signal.signal(signal.SIGINT, handle); signal.signal(signal.SIGTERM, handle)
    sim.run()

if __name__ == "__main__":
    main()
