import React from 'react';
import TestRenderer from 'react-test-renderer';
import { cleanup, render as baseRender } from '../../__tests__/renderComponent';
import StrategyPredictor from '../StrategyPredictor';
import { FuelMsg, StrategyMsg, TiresMsg } from '../../types';

const tires = (worst: number): TiresMsg =>
  ({ ts: 1, fl: worst, fr: 0.9, rl: 0.9, rr: 0.9, eta_s: 100 });
const fuel = (pct: number): FuelMsg => ({ ts: 1, percent: pct, eta_s: 100 });
const strategy = (over: Partial<StrategyMsg> = {}): StrategyMsg =>
  ({ ts: 1, pit_recommended: false, reason: '', target_lap: 0, ...over });

function render(props: React.ComponentProps<typeof StrategyPredictor>) {
  return baseRender(<StrategyPredictor {...props} />);
}

/**
 * All text rendered by the tree, concatenated.
 *
 * Joined with nothing and then collapsed: React splits `L{lap} ~now` into three
 * text nodes, so joining with a space would assert on "L 3  ~now" and hide what
 * the user actually sees.
 */
function text(r: TestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: TestRenderer.ReactTestInstance | string) => {
    if (typeof n === 'string') { out.push(n); return; }
    (n.children ?? []).forEach(walk as never);
  };
  r.root.children.forEach(walk as never);
  return out.join('').replace(/\s+/g, ' ').trim();
}

afterEach(cleanup);

describe('StrategyPredictor', () => {
  it('renders nothing when there is nothing to say', () => {
    const r = render({ strategy: null, tires: null, fuel: null, currentLap: 1 });
    expect(r.toJSON()).toBeNull();
  });

  it('counts down the laps until a pit is needed', () => {
    const r = render({ strategy: null, tires: tires(0.85), fuel: fuel(80), currentLap: 2 });
    // 0.85 health, pit at 0.25, worst corner wears 0.12 a lap -> 5 laps.
    expect(text(r)).toContain('PIT IN');
    expect(text(r)).toContain('5');
  });

  it('shows the scheduled pit lap when the planner names one', () => {
    const r = render({
      strategy: strategy({ pit_recommended: true, reason: 'tire_wear', target_lap: 7 }),
      tires: tires(0.3), fuel: fuel(40), currentLap: 6,
    });
    const t = text(r);
    expect(t).toContain('tire wear');   // underscores replaced for display
    expect(t).toContain('L7');
  });

  it('labels the current lap, not the middle of the race', () => {
    // This used to read L{totalLaps/2}, announcing "L5 ~now" for a whole race.
    const r = render({ strategy: null, tires: tires(0.85), fuel: fuel(80), currentLap: 3 });
    expect(text(r)).toContain('L3 ~now');
    expect(text(r)).not.toContain('L5 ~now');
  });

  it('announces the finish instead of a phantom pit plan', () => {
    // race_complete arrives with pit_recommended false and target_lap 0, and
    // used to render as "PIT IN 6 laps (race complete)".
    const r = render({
      strategy: strategy({ reason: 'race_complete' }),
      tires: tires(1.0), fuel: fuel(100), currentLap: 10,
    });
    const t = text(r);
    expect(t).toContain('RACE COMPLETE');
    expect(t).not.toContain('PIT IN');
  });

  it('never places a marker outside the timeline', () => {
    // A lap past the end of the race must not push the dot off the bar.
    const r = render({
      strategy: strategy({ target_lap: 14 }),
      tires: tires(0.85), fuel: fuel(80), currentLap: 13, totalLaps: 10,
    });
    const lefts: string[] = [];
    const walk = (n: TestRenderer.ReactTestInstance) => {
      const style = n.props?.style;
      const flat = Array.isArray(style) ? style : [style];
      flat.forEach(s => { if (s && typeof s.left === 'string') lefts.push(s.left); });
      (n.children ?? []).forEach(c => typeof c !== 'string' && walk(c));
    };
    r.root.children.forEach(c => typeof c !== 'string' && walk(c));
    expect(lefts.length).toBeGreaterThan(0);
    lefts.forEach(l => {
      const pct = parseFloat(l);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    });
  });

  it('falls back to fuel when it runs out sooner than the tires', () => {
    const r = render({ strategy: null, tires: tires(0.95), fuel: fuel(25), currentLap: 1 });
    // fuel: (25-15)/10 = 1 lap; tires: (0.95-0.25)/0.12 = 5 laps -> shows 1.
    expect(text(r)).toContain('1');
  });
});
