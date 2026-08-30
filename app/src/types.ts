// All telemetry message types.
// Must stay in sync with mock-publisher/publisher.py dataclasses.

export interface StateMsg {
  ts: number;
  speed: number;       // m/s
  steering: number;    // -1.0 to 1.0
  throttle: number;    // 0.0 to 1.0
  lap: number;
  lap_time_s: number;
}

export interface BatteryMsg {
  ts: number;
  voltage: number;     // volts (INA219) 10.5–12.6V
  percent: number;     // 0–100
  current_ma: number;  // milliamps draw (INA219)
  eta_s: number;
}

export interface FuelMsg {
  ts: number;
  percent: number;     // 0–100 (logical fuel / energy budget)
  eta_s: number;
}

export interface TiresMsg {
  ts: number;
  fl: number;          // 0–1, 1.0=fresh
  fr: number;
  rl: number;
  rr: number;
  eta_s: number;
}

export interface StrategyMsg {
  ts: number;
  pit_recommended: boolean;
  reason: string;
  target_lap: number;
}

export interface EventMsg {
  ts: number;
  type: 'pit_start' | 'pit_end' | 'lap';
}

// IMU — MPU9250 9-axis sensor on JetRacer
export interface ImuMsg {
  ts: number;
  ax: number;   // lateral G  (left/right)
  ay: number;   // longitudinal G (accel/brake)
  az: number;   // vertical G
  gx: number;   // roll rate  deg/s
  gy: number;   // pitch rate deg/s
  gz: number;   // yaw rate   deg/s
}

/**
 * Optional localization. Field coordinates in centimetres, matching the
 * extracted track geometry. Nothing is obliged to publish this; when something
 * does, the map's position source flips from 'estimated' to 'measured'.
 */
export interface PoseMsg {
  ts: number;
  x: number;        // cm, 0..590
  y: number;        // cm, 0..1000
  heading?: number; // degrees, 0 = +x, clockwise
}

// ── Health helpers ────────────────────────────────────────────────────────────

export type HealthColor = 'green' | 'yellow' | 'red';

export function tireHealth(v: number): HealthColor {
  if (v >= 0.6) return 'green';
  if (v >= 0.3) return 'yellow';
  return 'red';
}

export function pctHealth(pct: number): HealthColor {
  if (pct >= 60) return 'green';
  if (pct >= 30) return 'yellow';
  return 'red';
}

export const HEALTH_COLOR: Record<HealthColor, string> = {
  green:  '#22c55e',
  yellow: '#f59e0b',
  red:    '#ef4444',
};

export const HEALTH_BG: Record<HealthColor, string> = {
  green:  '#14532d',
  yellow: '#3d1f00',
  red:    '#450a0a',
};
