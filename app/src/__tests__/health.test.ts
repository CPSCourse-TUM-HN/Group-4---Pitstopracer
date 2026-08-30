import { pctHealth, tireHealth, HEALTH_COLOR, HEALTH_BG } from '../types';
import { lapToPercent } from '../components/StrategyPredictor';
import { TIRE_PIT_THRESHOLD } from '../raceConfig';

describe('tireHealth', () => {
  it('bands the range', () => {
    expect(tireHealth(1.0)).toBe('green');
    expect(tireHealth(0.75)).toBe('green');
    expect(tireHealth(0.45)).toBe('yellow');
    expect(tireHealth(0.1)).toBe('red');
  });

  it('is inclusive at each boundary, with no gap between bands', () => {
    expect(tireHealth(0.6)).toBe('green');
    expect(tireHealth(0.5999)).toBe('yellow');
    expect(tireHealth(0.3)).toBe('yellow');
    expect(tireHealth(0.2999)).toBe('red');
  });

  it('is red before the planner would call a pit', () => {
    // The colour must warn ahead of the recommendation, never after it.
    expect(tireHealth(TIRE_PIT_THRESHOLD)).toBe('red');
  });

  it('handles the extremes without falling through', () => {
    expect(tireHealth(0)).toBe('red');
    expect(['green', 'yellow', 'red']).toContain(tireHealth(-1));
    expect(['green', 'yellow', 'red']).toContain(tireHealth(2));
  });
});

describe('pctHealth', () => {
  it('bands percentages on the same shape as tires', () => {
    expect(pctHealth(100)).toBe('green');
    expect(pctHealth(60)).toBe('green');
    expect(pctHealth(59.9)).toBe('yellow');
    expect(pctHealth(30)).toBe('yellow');
    expect(pctHealth(29.9)).toBe('red');
    expect(pctHealth(0)).toBe('red');
  });

  it('agrees with tireHealth on the same underlying fraction', () => {
    for (const f of [0, 0.1, 0.29, 0.3, 0.45, 0.6, 0.75, 1]) {
      expect(pctHealth(f * 100)).toBe(tireHealth(f));
    }
  });
});

describe('health palettes', () => {
  it('defines a colour and a background for every band', () => {
    for (const band of ['green', 'yellow', 'red'] as const) {
      expect(HEALTH_COLOR[band]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(HEALTH_BG[band]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('lapToPercent', () => {
  it('spans the timeline from first lap to last', () => {
    expect(lapToPercent(1, 10)).toBe(0);
    expect(lapToPercent(10, 10)).toBe(100);
    expect(lapToPercent(5, 9)).toBe(50);
  });

  it('clamps a lap beyond the race rather than overflowing the bar', () => {
    // The publisher can report a lap past TOTAL_LAPS; the marker must not
    // escape its container.
    expect(lapToPercent(15, 10)).toBe(100);
    expect(lapToPercent(0, 10)).toBe(0);
    expect(lapToPercent(-3, 10)).toBe(0);
  });

  it('does not divide by zero on a one-lap race', () => {
    expect(lapToPercent(1, 1)).toBe(0);
    expect(Number.isFinite(lapToPercent(1, 1))).toBe(true);
  });
});
