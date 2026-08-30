import React from 'react';
import { act } from 'react-test-renderer';
import { cleanup, render, styles, text } from '../../__tests__/renderComponent';
import GForceWidget from '../GForceWidget';
import PitBanner from '../PitBanner';
import ArcGauge from '../ArcGauge';
import TrackMap from '../TrackMap';
import FuelBar from '../FuelBar';
import { ImuMsg, StrategyMsg } from '../../types';
import { CarPose } from '../../track/position';

afterEach(cleanup);

const imu = (ax: number, ay: number): ImuMsg =>
  ({ ts: 1, ax, ay, az: 1, gx: 0, gy: 0, gz: 0 });
const pose = (over: Partial<CarPose> = {}): CarPose =>
  ({ x: 100, y: 200, heading: 0, source: 'progress', ...over });

describe('GForceWidget', () => {
  const dot = (r: ReturnType<typeof render>) =>
    styles(r).find(s => typeof s.left === 'number' && typeof s.top === 'number');

  it('places the dot at the centre when the car is not loaded', () => {
    const r = render(<GForceWidget imu={imu(0, 0)} />);
    const d = dot(r)!;
    expect(d.left).toBeCloseTo(90 / 2 - 5, 5);
    expect(d.top).toBeCloseTo(90 / 2 - 5, 5);
  });

  it('offsets the dot with lateral load', () => {
    const centre = dot(render(<GForceWidget imu={imu(0, 0)} />))!;
    const right = dot(render(<GForceWidget imu={imu(0.5, 0)} />))!;
    expect(right.left as number).toBeGreaterThan(centre.left as number);
  });

  it('pins the dot to the rim past the limit instead of losing it', () => {
    // The circle has overflow:hidden, so an unclamped dot silently vanished
    // under hard cornering rather than reading as "at the limit".
    const far = dot(render(<GForceWidget imu={imu(9, 9)} />))!;
    const R = 90 / 2 - 10;
    const dx = (far.left as number) + 5 - 45;
    const dy = (far.top as number) + 5 - 45;
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(R + 0.001);
  });

  it('hides the dot and says so when the feed is stale', () => {
    const r = render(<GForceWidget imu={imu(0.3, 0.3)} stale />);
    expect(text(r)).toContain('stale');
    expect(dot(r)).toBeUndefined();
  });
});

describe('PitBanner', () => {
  const strategy = (over: Partial<StrategyMsg> = {}): StrategyMsg =>
    ({ ts: 1, pit_recommended: false, reason: '', target_lap: 0, ...over });

  it('stays hidden until a pit is recommended', () => {
    expect(render(<PitBanner strategy={null} />).toJSON()).toBeNull();
    expect(render(<PitBanner strategy={strategy()} />).toJSON()).toBeNull();
  });

  it('shows the reason when a pit is called', () => {
    const r = render(<PitBanner strategy={strategy({ pit_recommended: true, reason: 'low_fuel' })} />);
    expect(text(r)).toContain('PIT NOW');
    expect(text(r)).toContain('low fuel');
  });
});

describe('ArcGauge', () => {
  it('shows the rounded value', () => {
    const r = render(<ArcGauge value={4.4} max={8} label="SPEED" unit="km/h" color="#fff" />);
    expect(text(r)).toContain('4');
    expect(text(r)).toContain('km/h');
  });

  it('degrades to an empty dial rather than putting NaN in the SVG path', () => {
    const r = render(<ArcGauge value={NaN} max={8} label="SPEED" unit="km/h" color="#fff" />);
    expect(text(r)).toContain('—');
  });

  it('survives a zero maximum', () => {
    expect(() => render(
      <ArcGauge value={5} max={0} label="X" unit="" color="#fff" />)).not.toThrow();
  });
});

describe('FuelBar', () => {
  it('reports stale rather than a stale number', () => {
    expect(text(render(<FuelBar percent={40} stale />))).toContain('stale');
  });

  it('shows the percentage when live', () => {
    expect(text(render(<FuelBar percent={40} />))).toContain('40');
  });
});

describe('TrackMap', () => {
  it('labels an estimated position honestly', () => {
    const r = render(<TrackMap pose={pose()} inPit={false} stale={false} height={300} />);
    expect(text(r)).toContain('estimated');
  });

  it('says measured only when a real fix drives it', () => {
    const r = render(<TrackMap pose={pose({ source: 'pose' })} inPit={false} stale={false} height={300} />);
    expect(text(r)).toContain('measured');
  });

  it('says stale instead of pretending the position is current', () => {
    const r = render(<TrackMap pose={pose()} inPit={false} stale height={300} />);
    expect(text(r)).toContain('stale');
  });

  it('flags the pit visit', () => {
    const r = render(<TrackMap pose={pose()} inPit stale={false} height={300} />);
    expect(text(r)).toContain('IN PIT');
  });

  it('still draws the track when there is no position at all', () => {
    const r = render(<TrackMap pose={pose({ source: 'none' })} inPit={false} stale={false} height={300} />);
    expect(r.toJSON()).not.toBeNull();
    expect(text(r)).toContain('no position');
  });
});

describe('PitBanner animation lifecycle', () => {
  const strategy = (rec: boolean): StrategyMsg =>
    ({ ts: 1, pit_recommended: rec, reason: rec ? 'tire_wear' : '', target_lap: 0 });

  it('stops pulsing when the recommendation clears', () => {
    // The loop only stops on cleanup; leaking one keeps animating forever.
    const r = render(<PitBanner strategy={strategy(true)} />);
    expect(text(r)).toContain('PIT NOW');
    act(() => { r.update(<PitBanner strategy={strategy(false)} />); });
    expect(r.toJSON()).toBeNull();
  });

  it('renders without a reason when the planner gives none', () => {
    const r = render(<PitBanner strategy={{ ts: 1, pit_recommended: true, reason: '', target_lap: 0 }} />);
    expect(text(r)).toContain('PIT NOW');
    expect(text(r)).not.toContain('critical');
  });
});

describe('ArcGauge staleness', () => {
  it('withholds the value and says stale when the feed is quiet', () => {
    // Every other readout dims when its feed dies. The battery gauge did not:
    // staleBattery was computed and then never used, so a dead battery feed
    // showed a confident percentage indefinitely.
    const r = render(
      <ArcGauge value={72} max={100} label="BATTERY" unit="%" color="#fff" stale />);
    const t = text(r);
    expect(t).toContain('stale');
    expect(t).toContain('—');
    expect(t).not.toContain('72');
  });

  it('shows the value again once the feed returns', () => {
    const r = render(<ArcGauge value={72} max={100} label="BATTERY" unit="%" color="#fff" />);
    expect(text(r)).toContain('72');
  });
});

describe('FuelBar absent vs stale', () => {
  it('shows a dash before anything has arrived', () => {
    // Not "stale": nothing has stopped, nothing has started. Saying stale here
    // sends whoever is debugging a dead broker looking in the wrong place.
    const t = text(render(<FuelBar percent={null} />));
    expect(t).toContain('—');
    expect(t).not.toContain('stale');
  });

  it('shows stale once a feed that was arriving stops', () => {
    const t = text(render(<FuelBar percent={40} stale />));
    expect(t).toContain('stale');
  });

  it('shows the value when live', () => {
    expect(text(render(<FuelBar percent={40} />))).toContain('40');
  });
});

describe('GForceWidget with no IMU yet', () => {
  it('does not fabricate a zero reading', () => {
    // Defaulting ax/ay to 0 printed "0.00 G" and put the dot dead centre --
    // indistinguishable from a car sitting perfectly still.
    const t = text(render(<GForceWidget imu={null} />));
    expect(t).toContain('—');
    expect(t).not.toContain('0.00 G');
    expect(t).toContain('awaiting IMU');
  });

  it('shows the reading once the IMU speaks', () => {
    const t = text(render(<GForceWidget imu={imu(0.3, 0.4)} />));
    expect(t).toContain('0.50 G');
    expect(t).toContain('ax 0.30');
  });
});
