// Where the car is on the track.
//
// This module is the single seam between "how do we know where the car is" and
// "how do we draw it". Today position is *estimated* from lap progress. If a
// `pose` topic ever publishes real localization, only resolveCarPose changes --
// TrackMap and everything downstream stay as they are.
//
// Pure functions only, no React, so this is the part that is actually testable.

import {
  CENTERLINE, CENTERLINE_CUM_CM, TRACK_LENGTH_CM,
  PIT_LANE, PIT_LANE_CUM_CM, PIT_LANE_LENGTH_CM, PIT_BOX_CM,
} from './monza.generated';

export type PositionSource = 'pose' | 'progress' | 'none';

export interface CarPose {
  x: number;          // cm, field coordinates
  y: number;          // cm
  heading: number;    // degrees, 0 = +x (right), increasing clockwise (y is down)
  source: PositionSource;
}

/** Fraction of the pit visit spent stationary in the box, [start, end]. */
export const PIT_SERVICE_WINDOW: readonly [number, number] = [0.25, 0.75];

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wrap into [0,1). -0.1 -> 0.9, 1.3 -> 0.3 */
export function wrapProgress(p: number): number {
  if (!Number.isFinite(p)) return 0;
  const w = p % 1;
  return w < 0 ? w + 1 : w;
}

/**
 * Point and tangent at a distance along a polyline.
 * Binary search over the cumulative table, then linear interpolation.
 */
function sampleAt(
  points: readonly (readonly [number, number])[],
  cum: readonly number[],
  distCm: number,
): { x: number; y: number; heading: number } {
  const total = cum[cum.length - 1];
  const d = clamp(distCm, 0, total);

  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }

  const segLen = cum[hi] - cum[lo];
  const t = segLen > 1e-9 ? (d - cum[lo]) / segLen : 0;
  const [x0, y0] = points[lo];
  const [x1, y1] = points[hi];

  return {
    x: x0 + (x1 - x0) * t,
    y: y0 + (y1 - y0) * t,
    heading: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI,
  };
}

/** Position on the racing line. progress is wrapped into [0,1). */
export function positionOnCenterline(progress: number) {
  return sampleAt(CENTERLINE, CENTERLINE_CUM_CM, wrapProgress(progress) * TRACK_LENGTH_CM);
}

/**
 * Distance along the pit lane at which the car is level with the service bay.
 *
 * Derived from the extracted geometry rather than assumed: the previous version
 * held the car at `PIT_SERVICE_WINDOW[0] * PIT_LANE_LENGTH_CM`, which conflated
 * a fraction of the *visit's duration* with a fraction of the lane's *length*
 * and parked the car ~104 cm short of the box it is meant to be sitting in.
 */
export const PIT_BOX_DIST_CM = nearestDistanceOnPolyline(
  PIT_LANE,
  PIT_LANE_CUM_CM,
  PIT_BOX_CM.x + PIT_BOX_CM.width / 2,
  PIT_BOX_CM.y + PIT_BOX_CM.height / 2,
);

/**
 * Arc-length of the point on a polyline closest to (tx, ty).
 * Per-segment projection, so accuracy does not depend on point spacing.
 */
function nearestDistanceOnPolyline(
  points: readonly (readonly [number, number])[],
  cum: readonly number[],
  tx: number,
  ty: number,
): number {
  let bestDist = 0;
  let bestErr = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLenSq = dx * dx + dy * dy;

    // Project the target onto the segment, clamped to its endpoints.
    const t = segLenSq > 1e-9
      ? clamp(((tx - x0) * dx + (ty - y0) * dy) / segLenSq, 0, 1)
      : 0;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    const err = Math.hypot(px - tx, py - ty);

    if (err < bestErr) {
      bestErr = err;
      bestDist = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return bestDist;
}

/**
 * Position during a pit visit. `phase` runs 0 -> 1 across the whole visit:
 * drive in, hold stationary at the box for the service window, drive out.
 * The hold is what makes a pit stop read as a pit stop rather than a detour.
 *
 * Time and distance are deliberately decoupled: the service window is a share
 * of the visit's *duration*, while the hold point is a fixed *place* on the
 * lane (the box). The car covers entry and exit at whatever speed each leg
 * requires to arrive on time.
 */
export function positionInPit(phase: number) {
  const p = clamp(phase, 0, 1);
  const [holdStart, holdEnd] = PIT_SERVICE_WINDOW;

  let travelled: number;
  if (p < holdStart) {
    travelled = (p / holdStart) * PIT_BOX_DIST_CM;           // drive in
  } else if (p < holdEnd) {
    travelled = PIT_BOX_DIST_CM;                             // stationary at the box
  } else {
    // Guard the divisor: a service window ending at 1.0 would mean the car
    // never drives out, and dividing by zero would put NaN into the geometry.
    const exitSpan = 1 - holdEnd;
    const after = exitSpan > 1e-9 ? (p - holdEnd) / exitSpan : 1;
    travelled = PIT_BOX_DIST_CM + after * (PIT_LANE_LENGTH_CM - PIT_BOX_DIST_CM);
  }
  return sampleAt(PIT_LANE, PIT_LANE_CUM_CM, travelled);
}

export interface ResolveInput {
  /** Real localization, if anything ever publishes it. Wins when present. */
  pose?: { x: number; y: number; heading?: number } | null;
  /** Lap progress in [0,1), used when there is no pose. */
  progress?: number | null;
  /** Pit visit phase in [0,1], or null when not in the pit. */
  pitPhase?: number | null;
}

/**
 * The degradation ladder: measured pose, else estimated from lap progress,
 * else nothing. Always returns a value; callers check `source` before
 * presenting the position as fact.
 */
export function resolveCarPose(input: ResolveInput): CarPose {
  const { pose, progress, pitPhase } = input;

  if (pose && Number.isFinite(pose.x) && Number.isFinite(pose.y)) {
    return { x: pose.x, y: pose.y, heading: pose.heading ?? 0, source: 'pose' };
  }

  if (pitPhase != null && Number.isFinite(pitPhase)) {
    return { ...positionInPit(pitPhase), source: 'progress' };
  }

  if (progress != null && Number.isFinite(progress)) {
    return { ...positionOnCenterline(progress), source: 'progress' };
  }

  return { x: 0, y: 0, heading: 0, source: 'none' };
}

/** A pit visit as the UI needs to understand it. */
export interface PitVisit {
  /** The car is in the pit lane and should be drawn there. */
  inPit: boolean;
  /** Where through the visit we are, 0..1, or null when not pitting. */
  phase: number | null;
  /** The watchdog ended the visit, rather than a pit_end event. */
  assumedComplete: boolean;
}

/**
 * Decide the pit state from the event buffer and two clocks.
 *
 * Pure so the watchdog is actually testable: it is the one failure mode the
 * digital twin introduces, and the only way to see it in a running app is to
 * wait fifteen seconds for a `pit_end` that never comes.
 *
 * @param pitStartTs  ts of the most recent pit_start, or null
 * @param pitEndTs    ts of the most recent pit_end, or null
 * @param elapsedMs   locally measured time since the visit began
 * @param expectedMs  how long a visit is expected to take
 * @param watchdogMs  after this long with no pit_end, rejoin anyway
 */
export function resolvePitVisit(
  pitStartTs: number | null,
  pitEndTs: number | null,
  elapsedMs: number,
  expectedMs: number,
  watchdogMs: number,
): PitVisit {
  // Timestamps come from the producer, so compare them to each other and never
  // to the phone's clock: a car whose clock is skewed must still pit correctly.
  const open = pitStartTs !== null && (pitEndTs === null || pitStartTs > pitEndTs);
  if (!open) return { inPit: false, phase: null, assumedComplete: false };

  if (elapsedMs > watchdogMs) {
    return { inPit: false, phase: null, assumedComplete: true };
  }
  return {
    inPit: true,
    phase: expectedMs > 0 ? clamp(elapsedMs / expectedMs, 0, 1) : 0,
    assumedComplete: false,
  };
}

/**
 * Fold a new state message into the record of completed lap durations.
 *
 * A lap's duration is the last `lap_time_s` seen before the lap counter moved.
 * Returns a new array rather than mutating, so this can be called from an
 * effect without the double-recording that mutating during render caused.
 */
export function recordLap(
  history: readonly number[],
  previousLap: number | null,
  currentLap: number,
  lastLapTimeS: number,
  keep: number,
): readonly number[] {
  if (previousLap === null || currentLap === previousLap) return history;
  if (!(lastLapTimeS > 0) || !Number.isFinite(lastLapTimeS)) return history;
  return [...history, lastLapTimeS].slice(-keep);
}

/**
 * Lap progress from elapsed lap time, clamped rather than wrapped.
 *
 * `lap_time_s` resets to zero when the producer starts a new lap, so progress
 * never legitimately passes 1.0. The only way to exceed it is for the lap to
 * run longer than expected -- routine as tires wear and the car slows while the
 * median of the last three laps still reflects the quicker ones. Wrapping there
 * teleported the car back to the start line and sent it round a phantom extra
 * lap; on a measured race that was 3% of all frames.
 *
 * Holding just short of the line is the honest reading: the lap *event*, not
 * our arithmetic, is what carries the car past start/finish.
 */
export function lapProgress(lapTimeS: number, expectedLapTimeS: number): number | null {
  if (!Number.isFinite(lapTimeS) || !Number.isFinite(expectedLapTimeS)) return null;
  if (expectedLapTimeS <= 0) return null;
  return clamp(lapTimeS / expectedLapTimeS, 0, 0.999);
}

/** Median of the last `keep` entries. Median so one pit-extended lap cannot skew it. */
export function medianLapTime(laps: readonly number[], keep = 3): number | null {
  const recent = laps.slice(-keep).filter(v => Number.isFinite(v) && v > 0);
  if (recent.length === 0) return null;
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
