import React from 'react';
import { cleanup, render, text } from '../../__tests__/renderComponent';
import { act } from '../../__tests__/renderHook';
import { config } from '../../config';

/**
 * Smoke tests for the whole dashboard.
 *
 * It is 400+ lines of orchestration over eight topics, any of which may be
 * absent, malformed, or stale. The failure mode it has actually shipped is a
 * render error rather than a wrong number -- a bare `0` outside a <Text>, which
 * React Native rejects at runtime and TypeScript cannot see. These drive it
 * through the states a real race passes through and assert only that it renders.
 */
type OnStatus = (s: string) => void;
type OnMessage = (topic: string, payload: unknown) => void;

let mockDeliver: OnMessage;
let mockSetStatus: OnStatus;

jest.mock('../../mqtt/client', () => ({
  connect: (_u: string, _m: number, onStatus: OnStatus, onMessage: OnMessage) => {
    mockSetStatus = onStatus;
    mockDeliver = onMessage;
    onStatus('connected');
    return { subscribe: () => {}, disconnect: () => {} };
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const DashboardScreen = require('../DashboardScreen').default;

const P = config.topicPrefix;
const send = (topic: string, payload: unknown) =>
  act(() => { mockDeliver(`${P}/${topic}`, payload); });

const state = (over: object = {}) =>
  ({ ts: Date.now(), speed: 1.22, steering: 0.1, throttle: 0.8, lap: 3, lap_time_s: 9, ...over });
const battery = { ts: Date.now(), voltage: 11.8, percent: 72, current_ma: 1400, eta_s: 300 };
const fuel = { ts: Date.now(), percent: 55, eta_s: 240 };
const tires = { ts: Date.now(), fl: 0.8, fr: 0.85, rl: 0.9, rr: 0.88, eta_s: 200 };
const imu = { ts: Date.now(), ax: 0.2, ay: 0.1, az: 1.0, gx: 1, gy: 2, gz: 30 };

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { cleanup(); jest.useRealTimers(); });

describe('DashboardScreen', () => {
  it('renders before any telemetry has arrived', () => {
    const r = render(<DashboardScreen />);
    expect(r.toJSON()).not.toBeNull();
  });

  it('renders a full set of live telemetry', () => {
    const r = render(<DashboardScreen />);
    send('state', state());
    send('battery', battery);
    send('fuel', fuel);
    send('tires', tires);
    send('imu', imu);
    expect(r.toJSON()).not.toBeNull();
    expect(text(r)).toContain('lap');
  });

  it('renders a pit recommendation with no target lap', () => {
    // The shipped bug: target_lap 0 rendered a bare `0`, which React Native
    // rejects with "Text strings must be rendered within a <Text> component".
    const r = render(<DashboardScreen />);
    send('state', state());
    send('tires', tires);
    send('fuel', fuel);
    send('strategy', { ts: Date.now(), pit_recommended: true, reason: 'tire_wear', target_lap: 0 });
    expect(r.toJSON()).not.toBeNull();
    expect(text(r)).toContain('PIT NOW');
  });

  it('renders a scheduled pit', () => {
    const r = render(<DashboardScreen />);
    send('state', state({ lap: 6 }));
    send('tires', tires);
    send('fuel', fuel);
    send('strategy', { ts: Date.now(), pit_recommended: true, reason: 'low_fuel', target_lap: 7 });
    expect(text(r)).toContain('PIT NOW');
  });

  it('renders the end of the race', () => {
    const r = render(<DashboardScreen />);
    send('state', state({ lap: 10 }));
    send('tires', tires);
    send('strategy', { ts: Date.now(), pit_recommended: false, reason: 'race_complete', target_lap: 0 });
    expect(text(r)).toContain('RACE COMPLETE');
  });

  it('renders a pit stop in progress', () => {
    const r = render(<DashboardScreen />);
    send('state', state());
    send('event', { ts: Date.now(), type: 'pit_start' });
    expect(text(r)).toContain('IN PIT');
  });

  it('survives a malformed payload without crashing', () => {
    const r = render(<DashboardScreen />);
    send('state', state());
    send('state', { ts: 1, speed: 'fast', steering: 0, throttle: 0.5, lap: 1, lap_time_s: 1 });
    send('battery', [1, 2, 3]);
    send('tires', null);
    expect(r.toJSON()).not.toBeNull();
  });

  it('marks the feed stale when it goes quiet, without crashing', () => {
    const r = render(<DashboardScreen />);
    send('state', state());
    send('tires', tires);
    act(() => { jest.advanceTimersByTime(7000); });
    expect(r.toJSON()).not.toBeNull();
    expect(text(r)).toContain('stale');
  });

  it('renders every connection status', () => {
    const r = render(<DashboardScreen />);
    for (const s of ['connecting', 'reconnecting', 'disconnected', 'error', 'connected']) {
      act(() => { mockSetStatus(s); });
      expect(r.toJSON()).not.toBeNull();
    }
  });

  it('renders a measured pose', () => {
    const r = render(<DashboardScreen />);
    send('state', state());
    send('pose', { ts: Date.now(), x: 286.3, y: 741.3, heading: 90 });
    expect(text(r)).toContain('measured');
  });
});

/**
 * Find the pressable whose own subtree renders `label`.
 *
 * Selecting by index is brittle and misleading: index 0 is the header, not the
 * first tile, so a test meaning to open the speed sheet silently opened the
 * connection sheet and still passed.
 */
function pressableFor(r: ReturnType<typeof render>, label: string) {
  const found = pressables(r).find(p => {
    const out: string[] = [];
    const walk = (n: unknown) => {
      if (typeof n === 'string') { out.push(n); return; }
      ((n as { children?: unknown[] })?.children ?? []).forEach(walk);
    };
    walk(p);
    return out.join('').includes(label);
  });
  if (!found) throw new Error(`no pressable rendering ${label}`);
  return found;
}

/** Every Pressable in the tree, in render order. */
function pressables(r: ReturnType<typeof render>) {
  const out: { props: { onPress?: () => void } }[] = [];
  const walk = (n: unknown) => {
    const node = n as { props?: { onPress?: unknown }; children?: unknown[] };
    if (node?.props && typeof node.props.onPress === 'function') {
      out.push(node as { props: { onPress?: () => void } });
    }
    (node?.children ?? []).forEach(walk);
  };
  (r.root.children as unknown[]).forEach(walk);
  return out;
}

describe('DashboardScreen detail sheets', () => {
  const live = (r: ReturnType<typeof render>) => {
    send('state', state());
    send('battery', battery);
    send('fuel', fuel);
    send('tires', tires);
    send('imu', imu);
    return r;
  };

  it('opens every sheet without crashing', () => {
    // Each tile builds a different InfoContent; a bad row in any of them is a
    // runtime render error, not a type error.
    const r = live(render(<DashboardScreen />));
    const taps = pressables(r);
    expect(taps.length).toBeGreaterThan(5);

    for (const p of taps) {
      act(() => { p.props.onPress!(); });
      expect(r.toJSON()).not.toBeNull();
    }
  });

  it('shows sensor provenance in an opened sheet', () => {
    const r = live(render(<DashboardScreen />));
    act(() => { pressableFor(r, 'BATTERY').props.onPress!(); });
    expect(text(r)).toContain('Sensor:');
  });

  it('keeps the sheet numbers moving while it is open', () => {
    // The sheet used to be built once, at tap time, so a panel headed "live
    // value" froze the instant you opened it.
    //
    // Asserted on a value only the sheet renders: the tiles show speed to zero
    // decimals, the sheet to one. Comparing whole-tree text would pass even
    // with a frozen sheet, because the tiles update regardless.
    const r = live(render(<DashboardScreen />));
    act(() => { pressableFor(r, 'SPEED').props.onPress!(); });

    send('state', state({ speed: 1.0 }));       // 3.6 km/h
    expect(text(r)).toContain('3.6 km/h');

    send('state', state({ speed: 0.5 }));       // 1.8 km/h
    expect(text(r)).toContain('1.8 km/h');
    expect(text(r)).not.toContain('3.6 km/h');
  });

  it('reports dropped payloads on the connection sheet', () => {
    const r = live(render(<DashboardScreen />));

    // Three malformed payloads: valid JSON, wrong types.
    for (let i = 0; i < 3; i++) {
      send('state', { ts: 1, speed: 'fast', steering: 0, throttle: 0.5, lap: 1, lap_time_s: 1 });
    }
    act(() => { jest.advanceTimersByTime(1200); });

    // The header opens the connection sheet.
    act(() => { pressableFor(r, 'live').props.onPress!(); });

    const t = text(r);
    expect(t).toContain('Dropped payloads');
    expect(t).toContain('3');
  });
});

describe('DashboardScreen with nothing connected', () => {
  it('opens every sheet before any telemetry has arrived', () => {
    // The state the app is in for the first few seconds of every demo. Each
    // builder has a `value ? formatted : '—'` branch for every field, and none
    // of them are reached once data is flowing.
    const r = render(<DashboardScreen />);
    for (const p of pressables(r)) {
      act(() => { p.props.onPress!(); });
      expect(r.toJSON()).not.toBeNull();
    }
    expect(text(r)).toContain('—');
  });

  it('shows placeholders rather than zeroes for absent sensors', () => {
    const r = render(<DashboardScreen />);
    act(() => { pressableFor(r, 'BATTERY').props.onPress!(); });
    const t = text(r);
    expect(t).toContain('Battery');
    expect(t).toContain('—');
  });

  it('renders the twin sheet with no position', () => {
    const r = render(<DashboardScreen />);
    act(() => { pressableFor(r, 'no position').props.onPress!(); });
    expect(text(r)).toContain('Digital Twin');
  });
});

describe('DashboardScreen battery staleness', () => {
  it('dims the battery when its feed stops, while other feeds stay live', () => {
    const r = render(<DashboardScreen />);
    send('state', state());
    send('battery', battery);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(text(r)).toContain('72');

    // Keep state alive; let battery go quiet past the threshold.
    for (let i = 0; i < 7; i++) {
      send('state', state());
      act(() => { jest.advanceTimersByTime(1000); });
    }
    expect(text(r)).not.toContain('72%');
    expect(text(r)).toContain('stale');
  });
});

describe('DashboardScreen under sustained load', () => {
  it('survives a full race of messages without growing unbounded', () => {
    // 20 Hz state + 20 Hz imu for ten simulated laps, with the events a real
    // race emits. Guards against the buffers that are meant to be capped --
    // lap history and the recent-event window -- quietly growing forever.
    const r = render(<DashboardScreen />);

    let ts = Date.now();
    for (let lap = 1; lap <= 10; lap++) {
      for (let tick = 0; tick < 60; tick++) {
        ts += 50;
        send('state', { ...state({ lap }), ts, lap_time_s: tick * 0.3 });
        send('imu', { ...imu, ts });
      }
      send('event', { ts, type: 'lap' });
      if (lap === 6) {
        send('event', { ts, type: 'pit_start' });
        send('event', { ts: ts + 8000, type: 'pit_end' });
      }
      act(() => { jest.advanceTimersByTime(1000); });
    }

    expect(r.toJSON()).not.toBeNull();
    expect(text(r)).toContain('lap');
  });

  it('still renders after an event flood', () => {
    // The buffer's actual bound is asserted in useTelemetry's own tests; this
    // only checks the screen survives the flood and keeps drawing.
    const r = render(<DashboardScreen />);
    let ts = Date.now();
    for (let i = 0; i < 200; i++) {
      ts += 100;
      send('event', { ts, type: 'lap' });
    }
    expect(r.toJSON()).not.toBeNull();
  });

  it('recovers when the feed dies and returns', () => {
    const r = render(<DashboardScreen />);
    send('state', state());
    send('battery', battery);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(text(r)).not.toContain('--:--');

    act(() => { jest.advanceTimersByTime(7000); });      // feed dies
    expect(text(r)).toContain('stale');

    send('state', state());                              // and comes back
    send('battery', battery);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(text(r)).toContain('72');
  });
});

describe('DashboardScreen across a race restart', () => {
  it('handles the lap counter going backwards', () => {
    // run.sh loops races, so lap 10 is followed by lap 1 with a fresh clock.
    // The lap-time median and the position estimate both key off the counter.
    const r = render(<DashboardScreen />);
    let ts = Date.now();

    for (const lap of [8, 9, 10]) {
      for (let t = 0; t < 5; t++) {
        ts += 100;
        send('state', { ...state({ lap }), ts, lap_time_s: t * 3 });
      }
      send('event', { ts, type: 'lap' });
    }
    send('strategy', { ts, pit_recommended: false, reason: 'race_complete', target_lap: 0 });
    expect(text(r)).toContain('RACE COMPLETE');

    // New race.
    ts += 2000;
    send('strategy', { ts, pit_recommended: false, reason: '', target_lap: 0 });
    for (let t = 0; t < 5; t++) {
      ts += 100;
      send('state', { ...state({ lap: 1 }), ts, lap_time_s: t * 3 });
    }

    expect(r.toJSON()).not.toBeNull();
    expect(text(r)).not.toContain('RACE COMPLETE');
    expect(text(r)).toContain('lap');
  });

  it('does not carry a pit visit across the restart', () => {
    const r = render(<DashboardScreen />);
    const ts = Date.now();
    send('state', state({ lap: 6 }));
    send('event', { ts, type: 'pit_start' });
    expect(text(r)).toContain('IN PIT');

    send('event', { ts: ts + 8000, type: 'pit_end' });
    send('state', state({ lap: 1 }));
    expect(text(r)).not.toContain('IN PIT');
  });
});

describe('DashboardScreen with implausible but well-formed data', () => {
  it('renders a miscalibrated producer without breaking layout', () => {
    // The app's guard checks shape, not range. A producer sending km/h where
    // m/s belongs, or a tire above 1.0, must still render -- the recorder is
    // what tells you the units are wrong, not a blank screen.
    const r = render(<DashboardScreen />);
    send('state', { ts: Date.now(), speed: 95, steering: 5, throttle: 9, lap: 999, lap_time_s: 5000 });
    send('tires', { ts: Date.now(), fl: 1.8, fr: -0.4, rl: 0.5, rr: 0.5, eta_s: -1 });
    send('fuel', { ts: Date.now(), percent: 150, eta_s: -5 });
    send('battery', { ts: Date.now(), voltage: 99, percent: -20, current_ma: 99999, eta_s: 0 });
    expect(r.toJSON()).not.toBeNull();
  });

  it('keeps every bar and marker inside its container', () => {
    const r = render(<DashboardScreen />);
    send('state', { ts: Date.now(), speed: 95, steering: 0, throttle: 1, lap: 40, lap_time_s: 9 });
    send('fuel', { ts: Date.now(), percent: 150, eta_s: 10 });
    send('strategy', { ts: Date.now(), pit_recommended: true, reason: 'low_fuel', target_lap: 99 });

    const pcts: number[] = [];
    const walk = (n: unknown) => {
      const node = n as { props?: { style?: unknown }; children?: unknown[] };
      const st = node?.props?.style;
      (Array.isArray(st) ? st : [st]).forEach(x => {
        const o = x as Record<string, unknown> | undefined;
        for (const k of ['width', 'left'] as const) {
          if (o && typeof o[k] === 'string' && (o[k] as string).endsWith('%')) {
            pcts.push(parseFloat(o[k] as string));
          }
        }
      });
      (node?.children ?? []).forEach(walk);
    };
    (r.root.children as unknown[]).forEach(walk);

    expect(pcts.length).toBeGreaterThan(0);
    pcts.forEach(p => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    });
  });
});
