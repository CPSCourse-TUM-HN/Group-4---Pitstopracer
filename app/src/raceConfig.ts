// Race and consumption assumptions the UI needs in order to *predict*.
//
// These are not measurements and they are not part of the packet spec. They are
// the app's working model of how fast the car uses things up, and today every
// number here is read off the mock publisher's behaviour rather than off the
// physical car.
//
// They are gathered in one file for two reasons:
//
//   1. They were previously scattered as bare literals across StrategyPredictor
//      and DashboardScreen -- 0.10, 10, 0.25, 15, 10 -- where nothing marked
//      them as assumptions and no two of them could be checked against each
//      other.
//   2. The design spec (docs/specs/2026-08-10-digital-twin-design.md section 7)
//      recorded that the mock's distance, speed and lap time disagreed with the
//      measured 22.01 m track. That is now resolved in the publisher: speed is
//      derived as length / lap time, and the lap time was already correct. The
//      wear and threshold numbers below are still the mock's, and are what will
//      change when Modeling characterises the real car.
//
// PROVISIONAL: these describe the simulator, not a measured vehicle.

/**
 * Full-scale value for the speed gauge, in km/h.
 *
 * The car's nominal speed is the track length over the base lap time --
 * 22.01 m / 18 s = 1.22 m/s = 4.4 km/h -- and it varies about 10% either side.
 * The gauge was scaled to 20 km/h, from when the mock published an
 * unattainable 3.8 m/s; the needle would now sit in the first quarter of the
 * dial all race and read as a broken instrument.
 */
export const SPEED_GAUGE_MAX_KMH = 8;

/** Laps in a race. The mock runs a fixed-length race; a real one may not. */
export const TOTAL_LAPS = 10;

/**
 * Tire health lost per lap by the *fastest-wearing* corner, as a fraction.
 *
 * Must be the worst corner's rate, not an average: the prediction is made
 * against `min(fl, fr, rl, rr)`, so pairing that with a gentler rate reports
 * more laps of life than the car has. The publisher's per-corner rates are
 * fl 0.12, rl 0.10, fr 0.09, rr 0.08 (mock-publisher/publisher.py), and this
 * previously read 0.10 -- roughly 20% optimistic, in the direction that
 * strands a car on track.
 */
export const TIRE_WEAR_PER_LAP = 0.12;

/** Tire health at or below which the planner recommends a pit. */
export const TIRE_PIT_THRESHOLD = 0.25;

/** Energy budget consumed per lap, in percent. */
export const FUEL_BURN_PER_LAP_PCT = 10;

/** Energy budget at or below which the planner recommends a pit. */
export const FUEL_PIT_THRESHOLD_PCT = 15;

/**
 * Laps of running left before `value` reaches `threshold`, consuming
 * `perLap` each lap. Never negative; null when the input is unknown.
 */
export function lapsRemaining(
  value: number | null,
  threshold: number,
  perLap: number,
): number | null {
  if (value === null || !Number.isFinite(value) || perLap <= 0) return null;

  // Nudge before flooring. These are decimal fractions in binary floating
  // point, so an exact number of laps lands just under the integer:
  // (0.85 - 0.25) / 0.10 is 5.999999999999999, which floors to 5 and quietly
  // costs the driver a lap of usable life.
  const exact = (value - threshold) / perLap;
  return Math.max(0, Math.floor(exact + 1e-9));
}
