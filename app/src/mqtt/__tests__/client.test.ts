/**
 * The thin wrapper over mqtt.js.
 *
 * Small, but it owns two things worth pinning down: the mapping from mqtt.js
 * events to the status the badge renders, and the guard that stops a
 * non-JSON payload from throwing inside the message handler.
 *
 * The `mqtt` package is mocked because its published build is ESM that jest
 * cannot transform -- the same reason validation lives in its own module.
 */
type Handler = (...args: unknown[]) => void;

const mockHandlers: Record<string, Handler> = {};
const mockSubscribed: { topic: string; opts: unknown }[] = [];
let mockEnded: boolean;
let mockOptions: Record<string, unknown>;

jest.mock('mqtt', () => ({
  __esModule: true,
  default: {
    connect: (_url: string, opts: Record<string, unknown>) => {
      mockOptions = opts;
      return {
        on: (evt: string, fn: Handler) => { mockHandlers[evt] = fn; },
        subscribe: (topic: string, opts2: unknown) => mockSubscribed.push({ topic, opts: opts2 }),
        end: () => { mockEnded = true; },
      };
    },
  },
}));

import { connect, Status } from '../client';

describe('mqtt client', () => {
  let statuses: Status[];
  let messages: { topic: string; payload: unknown }[];
  let client: ReturnType<typeof connect>;

  beforeEach(() => {
    statuses = [];
    messages = [];
    mockEnded = false;
    mockSubscribed.length = 0;
    for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    client = connect('ws://example:9001', 2000,
      s => statuses.push(s), (t, p) => messages.push({ topic: t, payload: p }));
  });

  afterEach(() => { (console.warn as jest.Mock).mockRestore?.(); });

  it('reports connecting before anything has happened', () => {
    expect(statuses[0]).toBe('connecting');
  });

  it('asks for resubscription explicitly', () => {
    // The whole reconnect story depends on it: without resubscription the
    // client comes back, reports itself connected, and receives nothing.
    expect(mockOptions.resubscribe).toBe(true);
    expect(mockOptions.reconnectPeriod).toBe(2000);
  });

  it('maps each mqtt event to the status the badge shows', () => {
    mockHandlers.connect();
    expect(statuses).toContain('connected');
    mockHandlers.reconnect();
    expect(statuses).toContain('reconnecting');
    mockHandlers.offline();
    expect(statuses).toContain('disconnected');
    mockHandlers.error(new Error('boom'));
    expect(statuses).toContain('error');
  });

  it('parses a JSON payload and passes it on with its topic', () => {
    mockHandlers.message('race/car1/state', Buffer.from('{"speed":1.2}'));
    expect(messages).toEqual([{ topic: 'race/car1/state', payload: { speed: 1.2 } }]);
  });

  it('swallows a non-JSON payload instead of throwing', () => {
    // A malformed message must not take the dashboard down with it.
    expect(() => mockHandlers.message('race/car1/state', Buffer.from('not json'))).not.toThrow();
    expect(messages).toHaveLength(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('subscribes at QoS 0', () => {
    client.subscribe('race/car1/state');
    expect(mockSubscribed).toEqual([{ topic: 'race/car1/state', opts: { qos: 0 } }]);
  });

  it('ends the connection and reports it on disconnect', () => {
    client.disconnect();
    expect(mockEnded).toBe(true);
    expect(statuses[statuses.length - 1]).toBe('disconnected');
  });
});
