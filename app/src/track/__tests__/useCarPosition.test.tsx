import { advanceTimers, renderHook } from '../../__tests__/renderHook';
import { EventMsg, PoseMsg, StateMsg } from '../../types';
import { PIT_WATCHDOG_MS, SEED_LAP_TIME_S, useCarPosition } from '../useCarPosition';
import { PIT_BOX_CM } from '../monza.generated';

const state = (lap: number, lapTimeS: number): StateMsg => ({
  ts: Date.now(), speed: 1.2, steering: 0, throttle: 0.8, lap, lap_time_s: lapTimeS,
});
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

interface Props { s: StateMsg | null; e: readonly EventMsg[]; p?: PoseMsg | null; stale?: boolean }
const run = (init: Props) =>
  renderHook((x: Props) => useCarPosition(x.s, x.e, x.p ?? null, x.stale ?? false), init);

describe('useCarPosition lap tracking', () => {
  it('uses the seed lap time until a lap completes', () => {
    const h = run({ s: state(1, 9), e: [] });
    expect(h.current().lapTimeMeasured).toBe(false);
    expect(h.current().expectedLapTimeS).toBe(SEED_LAP_TIME_S);
    expect(h.current().progress).toBeCloseTo(0.5, 3);
  });

  it('records a completed lap exactly once', () => {
    // The regression this guards: lap capture used to mutate a ref during
    // render, so React's double-invoked render recorded some laps twice and
    // skewed the median the whole position estimate depends on.
    const h = run({ s: state(1, 1), e: [] });
    h.rerender({ s: state(1, 17.9), e: [] });
    h.rerender({ s: state(2, 0.1), e: [] });
    h.rerender({ s: state(2, 1.0), e: [] });

    expect(h.current().lapTimeMeasured).toBe(true);
    expect(h.current().expectedLapTimeS).toBeCloseTo(17.9, 2);
  });

  it('is not skewed by one pit-extended lap', () => {
    const h = run({ s: state(1, 0), e: [] });
    const lap = (n: number, dur: number) => {
      h.rerender({ s: state(n, dur), e: [] });
      h.rerender({ s: state(n + 1, 0.1), e: [] });
    };
    lap(1, 18); lap(2, 18); lap(3, 40);
    expect(h.current().expectedLapTimeS).toBeCloseTo(18, 1);
  });

  it('holds at the line when a lap overruns instead of wrapping', () => {
    const h = run({ s: state(1, 0), e: [] });
    h.rerender({ s: state(1, 18), e: [] });
    h.rerender({ s: state(2, 0.1), e: [] });
    h.rerender({ s: state(2, 22.3), e: [] });   // worn tires, slower lap

    expect(h.current().progress!).toBeGreaterThan(0.99);
    expect(h.current().progress!).toBeLessThan(1);
  });

  it('never moves the car backwards during an overrun', () => {
    const h = run({ s: state(1, 0), e: [] });
    let prev = -1;
    for (let t = 0; t <= 30; t += 1) {
      h.rerender({ s: state(1, t), e: [] });
      expect(h.current().progress!).toBeGreaterThanOrEqual(prev);
      prev = h.current().progress!;
    }
  });
});

describe('useCarPosition pit handling', () => {
  const pitStart = (ts: number): EventMsg => ({ ts, type: 'pit_start' });
  const pitEnd = (ts: number): EventMsg => ({ ts, type: 'pit_end' });

  // An open pit visit runs a 100 ms animation timer. Left alive after a test it
  // keeps calling setState outside act(), which floods the run with warnings.
  const open: { unmount: () => void }[] = [];
  const track = <T extends { unmount: () => void }>(h: T) => { open.push(h); return h; };
  afterEach(() => { open.splice(0).forEach(h => h.unmount()); });

  it('enters the pit on pit_start', () => {
    const now = Date.now();
    const h = track(run({ s: state(3, 5), e: [] }));
    expect(h.current().inPit).toBe(false);
    h.rerender({ s: state(3, 5), e: [pitStart(now)] });
    expect(h.current().inPit).toBe(true);
  });

  it('leaves the pit when pit_end arrives', () => {
    const now = Date.now();
    const h = track(run({ s: state(3, 5), e: [pitStart(now)] }));
    expect(h.current().inPit).toBe(true);
    h.rerender({ s: state(3, 5), e: [pitEnd(now + 8000), pitStart(now)] });
    expect(h.current().inPit).toBe(false);
    expect(h.current().pitAssumedComplete).toBe(false);
  });

  it('rejoins on its own if pit_end never arrives', () => {
    // Without the watchdog the car sits in the box forever and the demo dies.
    //
    // The visit is timed from local receipt, not from the event's timestamp --
    // deliberately, so a car with a skewed clock still pits correctly. So an
    // old pit_start does NOT look like an old visit; the clock has to advance.
    jest.useFakeTimers();
    try {
      const now = Date.now();
      const h = run({ s: state(3, 5), e: [pitStart(now)] });
      expect(h.current().inPit).toBe(true);

      advanceTimers(PIT_WATCHDOG_MS + 1000);
      h.rerender({ s: state(3, 5), e: [pitStart(now)] });

      expect(h.current().inPit).toBe(false);
      expect(h.current().pitAssumedComplete).toBe(true);
      h.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps animating the pit while the producer is silent', () => {
    // The publisher used to stop sending during a stop, so without a local
    // timer the pit animation froze on its first frame.
    jest.useFakeTimers();
    try {
      const now = Date.now();
      const h = run({ s: state(3, 5), e: [pitStart(now)] });
      const first = { ...h.current().pose };

      advanceTimers(4000);
      const later = h.current().pose;

      expect(h.current().inPit).toBe(true);
      expect(Math.hypot(later.x - first.x, later.y - first.y)).toBeGreaterThan(1);
      h.unmount();
    } finally {
      jest.useRealTimers();
    }
  });

  it('parks in the service bay rather than somewhere in the lane', () => {
    const now = Date.now();
    const h = track(run({ s: state(3, 5), e: [pitStart(now)] }));
    // Position is driven by the local pit clock; at entry it is at the lane start.
    expect(h.current().inPit).toBe(true);
    const box = {
      x: PIT_BOX_CM.x + PIT_BOX_CM.width / 2,
      y: PIT_BOX_CM.y + PIT_BOX_CM.height / 2,
    };
    // Somewhere on the pit lane, i.e. within a lane length of the box.
    expect(dist(h.current().pose, box)).toBeLessThan(400);
  });

  it('does not reopen a finished visit when a stale pit_start lingers in the buffer', () => {
    const now = Date.now();
    const h = track(run({ s: state(3, 5), e: [pitEnd(now), pitStart(now - 8000)] }));
    expect(h.current().inPit).toBe(false);
  });
});

describe('useCarPosition position source', () => {
  const pose = (x: number, y: number): PoseMsg => ({ ts: Date.now(), x, y, heading: 45 });

  it('estimates from lap progress when nothing publishes a pose', () => {
    expect(run({ s: state(1, 9), e: [] }).current().pose.source).toBe('progress');
  });

  it('prefers a measured pose when one arrives', () => {
    const h = run({ s: state(1, 9), e: [], p: pose(300, 500) });
    expect(h.current().pose.source).toBe('pose');
    expect(h.current().pose.x).toBe(300);
  });

  it('ignores a stale pose rather than pinning the car to an old fix', () => {
    const h = run({ s: state(1, 9), e: [], p: pose(300, 500), stale: true });
    expect(h.current().pose.source).toBe('progress');
  });

  it('reports no position when there is neither pose nor state', () => {
    const h = run({ s: null, e: [] });
    expect(h.current().pose.source).toBe('none');
    expect(h.current().progress).toBeNull();
  });
});
