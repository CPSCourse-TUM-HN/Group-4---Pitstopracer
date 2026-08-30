import { act, advanceTimers, renderHook } from '../../__tests__/renderHook';
import { STALE_MS } from '../topics';
import { config } from '../../config';

/**
 * Names are mock-prefixed because jest forbids a mock factory from closing
 * over anything else.
 *
 * The client is mocked rather than the `mqtt` package: it is the seam this hook
 * actually depends on, and mocking it lets a test deliver messages and connection
 * events on demand. It also keeps the untransformable ESM `mqtt` build out of jest.
 */
type OnStatus = (s: string) => void;
type OnMessage = (topic: string, payload: unknown) => void;

let mockDeliver: OnMessage;
let mockSetStatus: OnStatus;
let mockSubscribed: string[];
let mockDisconnected: number;

jest.mock('../client', () => ({
  connect: (_url: string, _ms: number, onStatus: OnStatus, onMessage: OnMessage) => {
    mockSetStatus = onStatus;
    mockDeliver = onMessage;
    mockSubscribed = [];
    onStatus('connected');
    return {
      subscribe: (t: string) => mockSubscribed.push(t),
      disconnect: () => { mockDisconnected++; },
    };
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useTelemetry } = require('../useTelemetry');

const P = config.topicPrefix;
const stateMsg = (over: object = {}) => ({
  ts: Date.now(), speed: 1.2, steering: 0, throttle: 0.8, lap: 1, lap_time_s: 1, ...over,
});

const run = () => renderHook(() => useTelemetry(), {});

/** Deliver a message the way the client would, inside act() so React commits. */
const send = (topic: string, payload: unknown) => act(() => { mockDeliver(topic, payload); });

beforeEach(() => { mockDisconnected = 0; jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('useTelemetry subscriptions', () => {
  it('subscribes to every topic, including the optional pose', () => {
    const h = run();
    expect(mockSubscribed).toContain(`${P}/state`);
    expect(mockSubscribed).toContain(`${P}/imu`);
    expect(mockSubscribed).toContain(`${P}/pose`);
    expect(mockSubscribed).toHaveLength(8);
    h.unmount();
  });

  it('disconnects on unmount', () => {
    run().unmount();
    expect(mockDisconnected).toBe(1);
  });

  it('surfaces every connection status the client reports', () => {
    const h = run();
    expect(h.current().status).toBe('connected');
    for (const s of ['reconnecting', 'offline', 'error', 'connected'] as const) {
      act(() => { mockSetStatus(s); });
      expect(h.current().status).toBe(s);
    }
    h.unmount();
  });
});

describe('useTelemetry message handling', () => {
  it('routes each topic to its own slot', () => {
    const h = run();
    advanceTimers(0);
    send(`${P}/state`, stateMsg({ lap: 7 }));
    advanceTimers(0);
    expect(h.current().state!.lap).toBe(7);
    h.unmount();
  });

  it('drops a malformed payload and counts it', () => {
    const h = run();
    send(`${P}/state`, { ...stateMsg(), speed: 'fast' });
    advanceTimers(1100);
    expect(h.current().state).toBeNull();
    expect(h.current().dropped.state).toBe(1);
    h.unmount();
  });

  it('ignores a topic outside the prefix rather than throwing', () => {
    const h = run();
    expect(() => send('other/thing', stateMsg())).not.toThrow();
    h.unmount();
  });

  it('bounds the event buffer however long the race runs', () => {
    // Unbounded, this grows for the whole demo. The cap is per kind (pits and
    // laps separately) so a flood of laps cannot evict an open pit_start.
    const h = run();
    for (let i = 0; i < 500; i++) send(`${P}/event`, { ts: i, type: 'lap' });
    expect(h.current().recentEvents.length).toBeLessThanOrEqual(8);
    h.unmount();
  });

  it('keeps pit events even when laps flood the buffer', () => {
    // A shared five-slot window let five lap events evict an open pit_start,
    // which stranded the car outside the pit lane.
    const h = run();
    send(`${P}/event`, { ts: 1, type: 'pit_start' });
    for (let i = 0; i < 6; i++) send(`${P}/event`, { ts: 100 + i, type: 'lap' });
    advanceTimers(0);
    const types = h.current().recentEvents.map((e: { type: string }) => e.type);
    expect(types).toContain('pit_start');
    h.unmount();
  });
});

describe('useTelemetry staleness', () => {
  it('does not report a topic stale before anything has arrived', () => {
    // Nothing has been heard yet, which is different from having gone quiet.
    const h = run();
    advanceTimers(STALE_MS * 2);
    expect(h.current().stale.state).toBe(false);
    h.unmount();
  });

  it('reports a topic stale once it stops arriving', () => {
    // This is the bug it exists for: staleness used to be computed during a
    // render that only happened when a message arrived, so a dead producer
    // simply froze the dashboard on values that still looked live.
    const h = run();
    send(`${P}/state`, stateMsg());
    advanceTimers(1000);
    expect(h.current().stale.state).toBe(false);

    advanceTimers(STALE_MS + 1000);
    expect(h.current().stale.state).toBe(true);
    h.unmount();
  });

  it('clears staleness when the feed comes back', () => {
    const h = run();
    send(`${P}/state`, stateMsg());
    advanceTimers(STALE_MS + 1000);
    expect(h.current().stale.state).toBe(true);

    send(`${P}/state`, stateMsg());
    advanceTimers(1000);
    expect(h.current().stale.state).toBe(false);
    h.unmount();
  });

  it('tracks staleness per topic, not globally', () => {
    const h = run();
    send(`${P}/state`, stateMsg());
    send(`${P}/fuel`, { ts: Date.now(), percent: 50, eta_s: 100 });
    advanceTimers(1000);

    // Keep state alive, let fuel go quiet.
    for (let i = 0; i < 6; i++) {
      send(`${P}/state`, stateMsg());
      advanceTimers(1000);
    }
    expect(h.current().stale.state).toBe(false);
    expect(h.current().stale.fuel).toBe(true);
    h.unmount();
  });

  it('stops its timer on unmount', () => {
    const h = run();
    h.unmount();
    expect(() => advanceTimers(STALE_MS * 3)).not.toThrow();
  });
});
