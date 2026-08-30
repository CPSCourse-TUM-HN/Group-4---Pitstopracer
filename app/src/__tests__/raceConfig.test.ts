import {
  FUEL_BURN_PER_LAP_PCT, FUEL_PIT_THRESHOLD_PCT, lapsRemaining,
  TIRE_PIT_THRESHOLD, TIRE_WEAR_PER_LAP,
} from '../raceConfig';

describe('lapsRemaining', () => {
  // Explicit rates here rather than the exported constants: this exercises the
  // arithmetic, and must not start failing every time the team retunes a rate.
  it('counts whole laps left before the threshold', () => {
    expect(lapsRemaining(0.85, 0.25, 0.10)).toBe(6);   // 0.60 of life at 0.10 a lap
    expect(lapsRemaining(55, 15, 10)).toBe(4);         // 40 points at 10 a lap
  });

  it('is calibrated against the publisher: a fresh set lasts six laps', () => {
    // mock-publisher wears the worst corner (fl) 0.12 a lap and pits at 0.25,
    // which is the lap-5-to-6 pit stop the simulator actually performs.
    expect(lapsRemaining(1.0, TIRE_PIT_THRESHOLD, TIRE_WEAR_PER_LAP)).toBe(6);
  });

  it('never goes negative once past the threshold', () => {
    expect(lapsRemaining(0.05, TIRE_PIT_THRESHOLD, TIRE_WEAR_PER_LAP)).toBe(0);
    expect(lapsRemaining(0, FUEL_PIT_THRESHOLD_PCT, FUEL_BURN_PER_LAP_PCT)).toBe(0);
  });

  it('returns null for unknown input rather than a misleading zero', () => {
    expect(lapsRemaining(null, TIRE_PIT_THRESHOLD, TIRE_WEAR_PER_LAP)).toBeNull();
    expect(lapsRemaining(NaN, TIRE_PIT_THRESHOLD, TIRE_WEAR_PER_LAP)).toBeNull();
  });

  it('refuses a non-positive consumption rate instead of dividing by zero', () => {
    expect(lapsRemaining(0.85, TIRE_PIT_THRESHOLD, 0)).toBeNull();
    expect(lapsRemaining(0.85, TIRE_PIT_THRESHOLD, -0.1)).toBeNull();
  });

  it('is exact at the threshold', () => {
    expect(lapsRemaining(TIRE_PIT_THRESHOLD, TIRE_PIT_THRESHOLD, TIRE_WEAR_PER_LAP)).toBe(0);
  });
});
