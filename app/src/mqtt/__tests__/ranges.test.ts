import { isValidPayload } from '../validation';

/**
 * The app's guard checks shape, not range -- range policing belongs to
 * tools/recorder.py, which can report it properly. These pin that division
 * down, because "the app accepts it" and "it is conformant" are different
 * claims and confusing them would send someone debugging in the wrong place.
 */
describe('app guard vs packet spec ranges', () => {
  it('accepts an out-of-range value the spec would reject', () => {
    // 95 m/s is way past the spec's 30 ceiling. The app takes it: a plausible
    // shape from a miscalibrated producer should render, not vanish, and the
    // recorder is what tells you the units are wrong.
    expect(isValidPayload('state', {
      ts: 1, speed: 95, steering: 0, throttle: 0.5, lap: 1, lap_time_s: 1,
    })).toBe(true);
  });

  it('accepts negative values that are structurally fine', () => {
    expect(isValidPayload('state', {
      ts: 1, speed: -5, steering: -2, throttle: 5, lap: -1, lap_time_s: -3,
    })).toBe(true);
  });

  it('still rejects anything that would poison the maths', () => {
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, '4', {}]) {
      expect(isValidPayload('state', {
        ts: 1, speed: bad, steering: 0, throttle: 0.5, lap: 1, lap_time_s: 1,
      })).toBe(false);
    }
  });
});
