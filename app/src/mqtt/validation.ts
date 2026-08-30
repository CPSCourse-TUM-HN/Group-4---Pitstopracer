import { TopicSuffix } from './topics';

// ── Payload validation ────────────────────────────────────────────────────────
//
// client.ts already rejects payloads that are not JSON at all. The realistic
// failure from a *real* producer is different: well-formed JSON with a field
// missing, null, or the wrong type -- speed in km/h, a null lap_time_s, a
// string where a number belongs. Unchecked, `payload as StateMsg` lets that
// through and NaN propagates into the track maths, which renders as a car that
// silently vanishes rather than an error anyone can diagnose.
//
// Design spec section 5 calls for exactly this guard. Kept deliberately
// shallow: presence and finiteness, not ranges. Range policing belongs to
// tools/recorder.py, which can report it properly.

const REQUIRED_NUMBERS: Record<TopicSuffix, readonly string[]> = {
  state:    ['ts', 'speed', 'steering', 'throttle', 'lap', 'lap_time_s'],
  battery:  ['ts', 'voltage', 'percent', 'current_ma', 'eta_s'],
  fuel:     ['ts', 'percent', 'eta_s'],
  tires:    ['ts', 'fl', 'fr', 'rl', 'rr', 'eta_s'],
  strategy: ['ts', 'target_lap'],
  event:    ['ts'],
  imu:      ['ts', 'ax', 'ay', 'az', 'gx', 'gy', 'gz'],
  pose:     ['ts', 'x', 'y'],   // heading optional: resolveCarPose defaults it to 0
};

const EVENT_TYPES: readonly string[] = ['pit_start', 'pit_end', 'lap'];

/** True when every required field is present, finite, and the right type. */
export function isValidPayload(suffix: TopicSuffix, payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
  const obj = payload as Record<string, unknown>;

  for (const field of REQUIRED_NUMBERS[suffix]) {
    const v = obj[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  }

  // Non-numeric fields still matter where the UI branches on them.
  if (suffix === 'strategy' && typeof obj.pit_recommended !== 'boolean') return false;
  if (suffix === 'event' && !EVENT_TYPES.includes(obj.type as string)) return false;

  return true;
}
