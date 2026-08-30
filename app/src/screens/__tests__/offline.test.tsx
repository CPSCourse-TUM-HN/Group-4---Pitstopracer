import React from 'react';
import { cleanup, render, text } from '../../__tests__/renderComponent';
import { act } from '../../__tests__/renderHook';

type OnStatus = (s: string) => void;
let mockSetStatus: OnStatus;

jest.mock('../../mqtt/client', () => ({
  connect: (_u: string, _m: number, onStatus: OnStatus) => {
    mockSetStatus = onStatus;
    onStatus('connecting');
    return { subscribe: () => {}, disconnect: () => {} };
  },
}));

const DashboardScreen = require('../DashboardScreen').default;

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { cleanup(); jest.useRealTimers(); });

describe('DashboardScreen with no broker', () => {
  it('renders while still trying to connect', () => {
    const r = render(<DashboardScreen />);
    expect(text(r)).toContain('connecting');
    expect(r.toJSON()).not.toBeNull();
  });

  it('keeps rendering through a failed connection', () => {
    const r = render(<DashboardScreen />);
    act(() => { mockSetStatus('error'); });
    expect(text(r)).toContain('error');
    act(() => { jest.advanceTimersByTime(30_000); });
    expect(r.toJSON()).not.toBeNull();
  });

  it('does not claim data is stale when none has ever arrived', () => {
    // "stale" means a feed stopped. Before first contact there is nothing to
    // be stale -- saying so would misdirect anyone debugging a dead broker.
    const r = render(<DashboardScreen />);
    act(() => { jest.advanceTimersByTime(30_000); });
    expect(text(r)).not.toContain('stale');
  });
});

describe('DashboardScreen shows no readings it has not taken', () => {
  it('does not display a critical battery before any battery message', () => {
    // batPct defaulted to 0, and pctHealth(0) is red -- so the gauge opened on
    // a confident red 0% every single time the app started.
    const r = render(<DashboardScreen />);
    const t = text(r);
    expect(t).not.toContain('0%');
    expect(t).toContain('—');
  });

  it('does not display a speed before any state message', () => {
    const r = render(<DashboardScreen />);
    expect(text(r)).not.toMatch(/\b0 km\/h/);
  });
});
