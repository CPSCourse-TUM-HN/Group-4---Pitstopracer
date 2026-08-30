import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

export { act };

/**
 * A four-line renderHook.
 *
 * `@testing-library/react-native` v14 does not work under React 19 -- its
 * renderHook returns an empty object, because react-test-renderer is deprecated
 * there and the wrapper has not caught up. The renderer itself works fine, so
 * this drives it directly rather than leaving every hook untested.
 */
export interface HookResult<T, P> {
  /** Latest value returned by the hook. */
  readonly current: () => T;
  /** Re-render with new props. */
  rerender: (props: P) => void;
  unmount: () => void;
}

/**
 * Advance jest's fake timers inside act(), so state updates scheduled by an
 * interval are actually flushed before the next assertion. Advancing outside
 * act() fires the callbacks but leaves React with an uncommitted render.
 */
export function advanceTimers(ms: number): void {
  act(() => { jest.advanceTimersByTime(ms); });
}

export function renderHook<T, P>(
  hook: (props: P) => T,
  initialProps: P,
): HookResult<T, P> {
  let value: T;

  function Probe({ p }: { p: P }) {
    value = hook(p);
    return null;
  }

  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe p={initialProps} />);
  });

  return {
    current: () => value,
    rerender: (props: P) => act(() => { renderer.update(<Probe p={props} />); }),
    unmount: () => act(() => { renderer.unmount(); }),
  };
}
