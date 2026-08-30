import {
  CENTERLINE, CENTERLINE_CUM_CM, FIELD_CM, PIT_ENTRY_PROGRESS, PIT_EXIT_PROGRESS,
  PIT_LANE, PIT_LANE_LENGTH_CM, PIT_BOX_CM, PIT_WIDTH_CM, START_FINISH, TRACK_LENGTH_CM,
} from '../monza.generated';
import {
  lapProgress, medianLapTime, positionInPit, positionOnCenterline, PIT_SERVICE_WINDOW,
  resolveCarPose, wrapProgress,
} from '../position';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Shortest signed angle between two headings, in degrees. */
function angleDelta(a: number, b: number): number {
  let d = ((b - a + 180) % 360) - 180;
  if (d < -180) d += 360;
  return Math.abs(d);
}

describe('extracted geometry', () => {
  it('is a closed loop', () => {
    const first = CENTERLINE[0];
    const last = CENTERLINE[CENTERLINE.length - 1];
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeLessThan(1);
  });

  it('has a monotonic arc-length table matching the point count', () => {
    expect(CENTERLINE_CUM_CM).toHaveLength(CENTERLINE.length);
    for (let i = 1; i < CENTERLINE_CUM_CM.length; i++) {
      expect(CENTERLINE_CUM_CM[i]).toBeGreaterThanOrEqual(CENTERLINE_CUM_CM[i - 1]);
    }
    expect(CENTERLINE_CUM_CM[CENTERLINE_CUM_CM.length - 1]).toBeCloseTo(TRACK_LENGTH_CM, 1);
  });

  it('measures the track at roughly 22 m', () => {
    expect(TRACK_LENGTH_CM / 100).toBeGreaterThan(20);
    expect(TRACK_LENGTH_CM / 100).toBeLessThan(24);
  });

  it('fits inside the physical playing field', () => {
    for (const [x, y] of CENTERLINE) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(FIELD_CM.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(FIELD_CM.height);
    }
  });
});

describe('wrapProgress', () => {
  it.each([
    [0, 0], [0.25, 0.25], [1, 0], [1.3, 0.3], [-0.1, 0.9], [2.5, 0.5],
  ])('wraps %p to %p', (input, expected) => {
    expect(wrapProgress(input)).toBeCloseTo(expected, 6);
  });

  it('treats non-finite input as the start line', () => {
    expect(wrapProgress(NaN)).toBe(0);
    expect(wrapProgress(Infinity)).toBe(0);
  });
});

describe('positionOnCenterline', () => {
  it('places progress 0 at the start/finish line', () => {
    const p = positionOnCenterline(0);
    expect(dist(p, START_FINISH)).toBeLessThan(1);
  });

  it('wraps at 1.0 back to the start', () => {
    expect(dist(positionOnCenterline(1), positionOnCenterline(0))).toBeLessThan(1);
  });

  it('treats negative progress as the equivalent point earlier in the lap', () => {
    expect(dist(positionOnCenterline(-0.25), positionOnCenterline(0.75))).toBeLessThan(1);
  });

  it('is half a lap away at progress 0.5', () => {
    // Distance travelled, not straight-line distance: walk the returned point
    // back to its arc-length position and check it is TRACK_LENGTH/2.
    const half = positionOnCenterline(0.5);
    let nearest = 0;
    let best = Infinity;
    CENTERLINE.forEach(([x, y], i) => {
      const d = Math.hypot(x - half.x, y - half.y);
      if (d < best) { best = d; nearest = i; }
    });
    expect(CENTERLINE_CUM_CM[nearest]).toBeCloseTo(TRACK_LENGTH_CM / 2, -1);
  });

  it('advances smoothly with no positional jumps', () => {
    const step = 0.001;
    let prev = positionOnCenterline(0);
    for (let p = step; p < 1; p += step) {
      const cur = positionOnCenterline(p);
      // One step is ~2.2 cm of track; allow generous slack for vertex spacing.
      expect(dist(prev, cur)).toBeLessThan(15);
      prev = cur;
    }
  });

  it('has continuous heading with no 180-degree flips', () => {
    const step = 0.001;
    let prev = positionOnCenterline(0).heading;
    for (let p = step; p < 1; p += step) {
      const cur = positionOnCenterline(p).heading;
      expect(angleDelta(prev, cur)).toBeLessThan(90);
      prev = cur;
    }
  });
});

describe('pit lane', () => {
  it('branches from and rejoins the racing line at the recorded progress', () => {
    const entry = positionOnCenterline(PIT_ENTRY_PROGRESS);
    const exit = positionOnCenterline(PIT_EXIT_PROGRESS);
    const laneStart = { x: PIT_LANE[0][0], y: PIT_LANE[0][1] };
    const laneEnd = {
      x: PIT_LANE[PIT_LANE.length - 1][0],
      y: PIT_LANE[PIT_LANE.length - 1][1],
    };
    // Within half a track width of the racing line at both ends.
    expect(dist(entry, laneStart)).toBeLessThan(40);
    expect(dist(exit, laneEnd)).toBeLessThan(40);
  });

  it('starts at the lane entry and finishes at the lane exit', () => {
    expect(dist(positionInPit(0), { x: PIT_LANE[0][0], y: PIT_LANE[0][1] })).toBeLessThan(1);
    const last = PIT_LANE[PIT_LANE.length - 1];
    expect(dist(positionInPit(1), { x: last[0], y: last[1] })).toBeLessThan(1);
  });

  it('holds the car stationary through the service window', () => {
    const [holdStart, holdEnd] = PIT_SERVICE_WINDOW;
    const mid = (holdStart + holdEnd) / 2;
    const a = positionInPit(holdStart + 0.01);
    const b = positionInPit(mid);
    const c = positionInPit(holdEnd - 0.01);
    expect(dist(a, b)).toBeLessThan(0.5);
    expect(dist(b, c)).toBeLessThan(0.5);
  });

  it('clamps phases outside 0..1', () => {
    expect(dist(positionInPit(-5), positionInPit(0))).toBeLessThan(0.5);
    expect(dist(positionInPit(5), positionInPit(1))).toBeLessThan(0.5);
  });

  // Regression: the hold point used to be PIT_SERVICE_WINDOW[0] * lane length,
  // a share of the visit's duration misapplied as a share of its length. That
  // parked the car ~104 cm from the box -- visible on a 590x1000 cm field, and
  // during the one moment the whole pit-stop story is about.
  it('holds the car level with the service bay, not merely somewhere in the lane', () => {
    const [holdStart, holdEnd] = PIT_SERVICE_WINDOW;
    const boxCentre = {
      x: PIT_BOX_CM.x + PIT_BOX_CM.width / 2,
      y: PIT_BOX_CM.y + PIT_BOX_CM.height / 2,
    };
    const parked = positionInPit((holdStart + holdEnd) / 2);

    // The lane centre cannot coincide with the box centre -- the box sits
    // beside the lane -- so allow half the box diagonal plus half the lane.
    const tolerance = Math.hypot(PIT_BOX_CM.width, PIT_BOX_CM.height) / 2 + PIT_WIDTH_CM / 2;
    expect(dist(parked, boxCentre)).toBeLessThan(tolerance);
  });

  it('drives in and out rather than teleporting to the box', () => {
    const [holdStart] = PIT_SERVICE_WINDOW;
    // Entry leg covers ground monotonically.
    let prev = positionInPit(0);
    for (let p = 0.02; p <= holdStart; p += 0.02) {
      const next = positionInPit(p);
      expect(dist(prev, next)).toBeLessThan(PIT_LANE_LENGTH_CM / 4);
      prev = next;
    }
    // Exit leg ends at the lane exit.
    expect(dist(positionInPit(1), { x: PIT_LANE[PIT_LANE.length - 1][0], y: PIT_LANE[PIT_LANE.length - 1][1] }))
      .toBeLessThan(1);
  });
});

describe('resolveCarPose degradation ladder', () => {
  it('prefers a measured pose over lap progress', () => {
    const p = resolveCarPose({ pose: { x: 123, y: 456, heading: 90 }, progress: 0.5 });
    expect(p).toEqual({ x: 123, y: 456, heading: 90, source: 'pose' });
  });

  it('defaults heading to 0 when a pose omits it', () => {
    expect(resolveCarPose({ pose: { x: 1, y: 2 } }).heading).toBe(0);
  });

  it('ignores a malformed pose and falls back to progress', () => {
    const p = resolveCarPose({ pose: { x: NaN, y: 5 }, progress: 0 });
    expect(p.source).toBe('progress');
    expect(dist(p, START_FINISH)).toBeLessThan(1);
  });

  it('puts the car in the pit lane when a pit is in progress', () => {
    const p = resolveCarPose({ progress: 0.5, pitPhase: 0 });
    expect(p.source).toBe('progress');
    expect(dist(p, { x: PIT_LANE[0][0], y: PIT_LANE[0][1] })).toBeLessThan(1);
  });

  it('reports no position when nothing is available', () => {
    expect(resolveCarPose({}).source).toBe('none');
    expect(resolveCarPose({ pose: null, progress: null }).source).toBe('none');
  });
});

describe('medianLapTime', () => {
  it('returns null before any lap completes', () => {
    expect(medianLapTime([])).toBeNull();
  });

  it('takes the median of the last three laps', () => {
    expect(medianLapTime([10, 12, 14])).toBe(12);
  });

  it('ignores laps older than the window', () => {
    expect(medianLapTime([99, 99, 10, 12, 14])).toBe(12);
  });

  it('is not skewed by a single pit-extended lap', () => {
    // Mean would be 24.7; the median stays near the true pace.
    expect(medianLapTime([18, 48, 19])).toBe(19);
  });

  it('averages the middle two when the window is even', () => {
    expect(medianLapTime([10, 20], 2)).toBe(15);
  });

  it('discards non-finite and non-positive durations', () => {
    expect(medianLapTime([NaN, 0, -5, 18], 4)).toBe(18);
  });
});

describe('lapProgress', () => {
  it('maps elapsed time onto the lap', () => {
    expect(lapProgress(0, 18)).toBeCloseTo(0);
    expect(lapProgress(9, 18)).toBeCloseTo(0.5);
    expect(lapProgress(17.9, 18)).toBeCloseTo(0.994, 3);
  });

  // The regression this exists for: as tires wear the car slows, so a lap runs
  // longer than the median of the previous three. Wrapping there sent the car
  // back across the start line and round a phantom extra lap -- 3% of frames
  // on a recorded 10-lap race.
  it('holds at the line when a lap overruns instead of wrapping to zero', () => {
    const overrun = lapProgress(22.3, 18)!;         // the measured lap 6
    expect(overrun).toBeGreaterThan(0.99);
    expect(overrun).toBeLessThan(1);
  });

  it('never returns a value that would re-cross start/finish', () => {
    for (const t of [18, 20, 25, 40, 180, 1e6]) {
      const p = lapProgress(t, 18)!;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });

  it('is monotonic across an overrun, so the car never moves backwards', () => {
    let prev = -1;
    for (let t = 0; t <= 30; t += 0.25) {
      const p = lapProgress(t, 18)!;
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('clamps a negative elapsed time to the start line', () => {
    expect(lapProgress(-5, 18)).toBe(0);
  });

  it('returns null rather than Infinity for an unusable expected lap time', () => {
    expect(lapProgress(9, 0)).toBeNull();
    expect(lapProgress(9, -18)).toBeNull();
    expect(lapProgress(9, NaN)).toBeNull();
    expect(lapProgress(NaN, 18)).toBeNull();
  });
});
