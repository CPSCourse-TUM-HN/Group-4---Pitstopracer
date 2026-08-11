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
  PIT_LANE, PIT_LANE_CUM_CM, PIT_LANE_LENGTH_CM,
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
 * Position during a pit visit. `phase` runs 0 -> 1 across the whole visit:
 * drive in, hold stationary at the box for the service window, drive out.
 * The hold is what makes a pit stop read as a pit stop rather than a detour.
 */
export function positionInPit(phase: number) {
  const p = clamp(phase, 0, 1);
  const [holdStart, holdEnd] = PIT_SERVICE_WINDOW;

  let travelled: number;
  if (p < holdStart) {
    travelled = (p / holdStart) * (holdStart * PIT_LANE_LENGTH_CM);
  } else if (p < holdEnd) {
    travelled = holdStart * PIT_LANE_LENGTH_CM;          // stationary at the box
  } else {
    const after = (p - holdEnd) / (1 - holdEnd);
    const from = holdStart * PIT_LANE_LENGTH_CM;
    travelled = from + after * (PIT_LANE_LENGTH_CM - from);
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

/** Median of the last `keep` entries. Median so one pit-extended lap cannot skew it. */
export function medianLapTime(laps: readonly number[], keep = 3): number | null {
  const recent = laps.slice(-keep).filter(v => Number.isFinite(v) && v > 0);
  if (recent.length === 0) return null;
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
