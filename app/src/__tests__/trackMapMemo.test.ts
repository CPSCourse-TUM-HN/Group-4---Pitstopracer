import { propsEqual, EPSILON_CM } from '../components/TrackMap';
import { CarPose } from '../track/position';

const noop = () => {};
const pose = (x: number, y: number, heading = 0): CarPose =>
  ({ x, y, heading, source: 'progress' });
const props = (p: CarPose, over: Partial<Parameters<typeof propsEqual>[0]> = {}) =>
  ({ pose: p, inPit: false, stale: false, height: 300, onPress: noop, ...over });

describe('TrackMap memo comparator', () => {
  it('skips the redraw when nothing drawn changed', () => {
    // The IMU case: a new render, an identical pose object.
    expect(propsEqual(props(pose(100, 200)), props(pose(100, 200)))).toBe(true);
  });

  it('redraws when the car actually moves', () => {
    expect(propsEqual(props(pose(100, 200)), props(pose(101, 200)))).toBe(false);
    expect(propsEqual(props(pose(100, 200)), props(pose(100, 201)))).toBe(false);
  });

  it('ignores movement too small to see', () => {
    const tiny = EPSILON_CM / 2;
    expect(propsEqual(props(pose(100, 200)), props(pose(100 + tiny, 200)))).toBe(true);
  });

  it('redraws when the car turns', () => {
    expect(propsEqual(props(pose(100, 200, 0)), props(pose(100, 200, 45)))).toBe(false);
  });

  it('redraws when the position source changes', () => {
    const a = props(pose(100, 200));
    const b = props({ ...pose(100, 200), source: 'pose' });
    expect(propsEqual(a, b)).toBe(false);
  });

  it('redraws when entering or leaving the pit, or going stale', () => {
    const base = props(pose(100, 200));
    expect(propsEqual(base, props(pose(100, 200), { inPit: true }))).toBe(false);
    expect(propsEqual(base, props(pose(100, 200), { stale: true }))).toBe(false);
    expect(propsEqual(base, props(pose(100, 200), { height: 400 }))).toBe(false);
  });

  it('redraws if the press handler identity changes', () => {
    // Guards the useCallback in DashboardScreen: an inline arrow there would
    // make every comparison false and the memo pointless.
    expect(propsEqual(props(pose(100, 200)),
                      props(pose(100, 200), { onPress: () => {} }))).toBe(false);
  });
});
