import { recordLap, resolvePitVisit } from '../position';

const EXPECTED = 10_000;
const WATCHDOG = 15_000;
const visit = (start: number | null, end: number | null, elapsed: number) =>
  resolvePitVisit(start, end, elapsed, EXPECTED, WATCHDOG);

describe('resolvePitVisit', () => {
  it('is not pitting before any pit_start', () => {
    expect(visit(null, null, 0)).toEqual({ inPit: false, phase: null, assumedComplete: false });
  });

  it('opens on pit_start and tracks the phase', () => {
    expect(visit(1000, null, 0).inPit).toBe(true);
    expect(visit(1000, null, 0).phase).toBeCloseTo(0);
    expect(visit(1000, null, 5_000).phase).toBeCloseTo(0.5);
    expect(visit(1000, null, 10_000).phase).toBeCloseTo(1);
  });

  it('closes when a later pit_end arrives', () => {
    const v = visit(1000, 9000, 8_000);
    expect(v.inPit).toBe(false);
    expect(v.assumedComplete).toBe(false);
  });

  it('stays open when pit_end is older than pit_start', () => {
    // A second stop in the same race: the buffer still holds the previous
    // pit_end, and comparing by arrival order rather than ts would end the
    // new visit immediately.
    expect(visit(20_000, 9_000, 1_000).inPit).toBe(true);
  });

  it('rejoins on the watchdog when pit_end never arrives', () => {
    const v = visit(1000, null, WATCHDOG + 1);
    expect(v.inPit).toBe(false);
    expect(v.assumedComplete).toBe(true);
    expect(v.phase).toBeNull();
  });

  it('does not fire the watchdog one millisecond early', () => {
    expect(visit(1000, null, WATCHDOG).inPit).toBe(true);
    expect(visit(1000, null, WATCHDOG).assumedComplete).toBe(false);
  });

  it('caps the phase at 1 when the stop overruns but the watchdog has not fired', () => {
    expect(visit(1000, null, 12_000).phase).toBe(1);
    expect(visit(1000, null, 12_000).inPit).toBe(true);
  });

  it('compares producer timestamps to each other, not to the local clock', () => {
    // Both timestamps far in the past or future must still resolve correctly,
    // so a car with a skewed clock still pits.
    expect(visit(1, 0, 500).inPit).toBe(true);
    expect(visit(4_000_000_000_000, null, 500).inPit).toBe(true);
  });

  it('survives a zero expected duration instead of dividing by zero', () => {
    expect(resolvePitVisit(1000, null, 5_000, 0, WATCHDOG).phase).toBe(0);
  });
});

describe('recordLap', () => {
  const KEEP = 8;

  it('records nothing on the very first state message', () => {
    expect(recordLap([], null, 3, 17.5, KEEP)).toEqual([]);
  });

  it('records nothing while the lap counter is unchanged', () => {
    expect(recordLap([18], 3, 3, 12.0, KEEP)).toEqual([18]);
  });

  it('records the previous lap duration when the counter advances', () => {
    expect(recordLap([18], 3, 4, 17.9, KEEP)).toEqual([18, 17.9]);
  });

  it('returns the same array reference when nothing changed', () => {
    // The hook uses reference identity to decide whether to re-render.
    const h = [18, 18];
    expect(recordLap(h, 3, 3, 5, KEEP)).toBe(h);
  });

  it('ignores a zero or negative duration', () => {
    expect(recordLap([18], 3, 4, 0, KEEP)).toEqual([18]);
    expect(recordLap([18], 3, 4, -2, KEEP)).toEqual([18]);
  });

  it('ignores a non-finite duration', () => {
    expect(recordLap([18], 3, 4, NaN, KEEP)).toEqual([18]);
    expect(recordLap([18], 3, 4, Infinity, KEEP)).toEqual([18]);
  });

  it('keeps the history bounded across a long demo', () => {
    let h: readonly number[] = [];
    for (let lap = 1; lap <= 50; lap++) h = recordLap(h, lap, lap + 1, 18, KEEP);
    expect(h).toHaveLength(KEEP);
  });

  it('handles a lap counter that goes backwards, as it does when a race restarts', () => {
    // run.sh loops races, so lap 10 is followed by lap 1.
    expect(recordLap([18], 10, 1, 17.8, KEEP)).toEqual([18, 17.8]);
  });
});
