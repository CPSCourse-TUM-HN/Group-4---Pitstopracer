import { isValidPayload } from '../validation';

const validState = {
  ts: 1787416010854, speed: 4.18, steering: 0.111,
  throttle: 0.86, lap: 3, lap_time_s: 11.64,
};

describe('isValidPayload', () => {
  it('accepts a well-formed payload for every topic', () => {
    expect(isValidPayload('state', validState)).toBe(true);
    expect(isValidPayload('battery', {
      ts: 1, voltage: 11.8, percent: 72, current_ma: 1400, eta_s: 300,
    })).toBe(true);
    expect(isValidPayload('fuel', { ts: 1, percent: 55, eta_s: 240 })).toBe(true);
    expect(isValidPayload('tires', {
      ts: 1, fl: 0.8, fr: 0.85, rl: 0.9, rr: 0.88, eta_s: 200,
    })).toBe(true);
    expect(isValidPayload('imu', {
      ts: 1, ax: 0.1, ay: 0.2, az: 1.0, gx: 1, gy: 2, gz: 3,
    })).toBe(true);
    expect(isValidPayload('strategy', {
      ts: 1, pit_recommended: true, reason: 'tire_wear', target_lap: 7,
    })).toBe(true);
    expect(isValidPayload('event', { ts: 1, type: 'pit_start' })).toBe(true);
  });

  // The realistic producer failure: valid JSON, wrong contents. These used to
  // pass straight through `payload as StateMsg` and reach the track maths.
  it('rejects a missing required field', () => {
    const { lap_time_s, ...missing } = validState;
    expect(isValidPayload('state', missing)).toBe(false);
  });

  it('rejects a null field', () => {
    expect(isValidPayload('state', { ...validState, lap_time_s: null })).toBe(false);
  });

  it('rejects a string where a number belongs', () => {
    expect(isValidPayload('state', { ...validState, speed: '4.18' })).toBe(false);
  });

  it('rejects NaN and Infinity, which survive a typeof check', () => {
    expect(isValidPayload('state', { ...validState, speed: NaN })).toBe(false);
    expect(isValidPayload('state', { ...validState, lap_time_s: Infinity })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isValidPayload('state', null)).toBe(false);
    expect(isValidPayload('state', 42)).toBe(false);
    expect(isValidPayload('state', 'not_json_but_valid_json_string')).toBe(false);
    expect(isValidPayload('state', [validState])).toBe(false);
  });

  it('rejects an unknown event type', () => {
    expect(isValidPayload('event', { ts: 1, type: 'safety_car' })).toBe(false);
  });

  it('rejects a strategy message whose pit flag is not boolean', () => {
    expect(isValidPayload('strategy', {
      ts: 1, pit_recommended: 'yes', reason: 'tire_wear', target_lap: 7,
    })).toBe(false);
  });

  it('ignores extra fields, so a producer may add to the packet spec', () => {
    expect(isValidPayload('state', { ...validState, pose_x: 120, pose_y: 400 })).toBe(true);
  });
});
