#!/usr/bin/env python3
"""
Pit-Stop Racer Pro — Mock Publisher
Simulates a 10-lap JetRacer race with realistic sensor data.
Sensors modelled: VESC (speed/steering/throttle), INA219 (voltage/current),
MPU9250 IMU (accel/gyro), wheel odometry, tire wear model.
"""

import argparse, json, math, signal, sys, time
from dataclasses import asdict, dataclass
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

    def __init__(self, broker: str, speed: float):
        self.broker  = broker
        self.speed   = speed
        self.client: Optional[mqtt.Client] = None
        self._running = True

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
        self.client.on_connect    = lambda c, u, f, rc, p: print("Connected to broker." if rc == 0 else f"Failed: {rc}")
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
        corner_freq = speed * 0.8 / (2 * math.pi * 3.0)   # ~3m corner radius
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
        import random
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

        for _ in range(int(self.PIT_DURATION_S * 10)):
            if not self._running: break
            time.sleep(0.1 / self.speed)

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
        time.sleep(1.0)

        STATE_INTERVAL = 1.0 / 20   # 20 Hz
        SLOW_INTERVAL  = 1.0 / 2    # 2 Hz

        last_state_t = last_slow_t = last_status_t = 0.0
        lap_start = race_start = time.time()

        while self._running and self.total_laps_done < self.TOTAL_LAPS:
            now = time.time()
            self.lap_time_s = (now - lap_start) * self.speed

            # Advance corner phase (track position)
            self._corner_phase += STATE_INTERVAL * self.speed * 2.1

            # Compute motion state
            worst_tire   = min(self.tires.values())
            speed_factor = clamp(0.5 + 0.5 * worst_tire + self.fuel_pct / 200.0, 0.3, 1.0)
            speed_ms     = 3.8 * speed_factor * (1 + 0.1 * math.sin(self._corner_phase * 0.5))
            throttle     = clamp(speed_factor * 0.85 + 0.08 * math.sin(self._corner_phase), 0, 1)
            steering     = 0.45 * math.sin(self._corner_phase * 0.9)

            # Wear per tick
            if not self.in_pit:
                dt = STATE_INTERVAL * self.speed
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
                    lap_start = time.time()
                if not pit_needed and self.pit_rec_since:
                    self.pit_rec_since = None
                    self.pub_strategy(False, "", 0)

            # Publish state @ 20 Hz
            if now - last_state_t >= STATE_INTERVAL / self.speed:
                self.pub_state(speed_ms, steering, throttle)
                self.pub_imu(steering, throttle, speed_ms)
                last_state_t = now

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

            time.sleep(STATE_INTERVAL / self.speed)

        print("Race complete — 10 laps done.")
        self.pub_strategy(False, "race_complete", 0)
        self.cleanup()

    def cleanup(self):
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
    args = p.parse_args()

    if args.reset_only:
        reset_only(args.broker); return

    sim = RaceSimulator(broker=args.broker, speed=args.speed)
    def handle(sig, frame):
        print("\nShutting down…"); sim.cleanup(); sys.exit(0)
    signal.signal(signal.SIGINT, handle); signal.signal(signal.SIGTERM, handle)
    sim.run()

if __name__ == "__main__":
    main()
