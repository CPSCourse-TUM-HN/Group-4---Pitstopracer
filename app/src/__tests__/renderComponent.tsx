import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mounted: TestRenderer.ReactTestRenderer[] = [];

/**
 * Render a component tree for assertions.
 *
 * Every render is tracked so `cleanup()` can unmount it. That matters more than
 * it looks: PitBanner starts an Animated.loop that only stops on unmount, and a
 * left-running loop keeps jest's event loop alive so the whole run hangs after
 * the last assertion has already passed.
 */
export function render(element: React.ReactElement): TestRenderer.ReactTestRenderer {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => { r = TestRenderer.create(element); });
  mounted.push(r);
  return r;
}

/** Unmount everything rendered so far. Call from afterEach. */
export function cleanup(): void {
  act(() => { mounted.splice(0).forEach(r => r.unmount()); });
}

/**
 * All text in the tree, concatenated and whitespace-collapsed.
 *
 * Joined with nothing: React splits `L{lap} ~now` into three text nodes, so
 * joining with a space would assert on "L 3  ~now" rather than what is shown.
 */
export function text(r: TestRenderer.ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: TestRenderer.ReactTestInstance | string) => {
    if (typeof n === 'string') { out.push(n); return; }
    (n.children ?? []).forEach(walk as never);
  };
  r.root.children.forEach(walk as never);
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** Every flattened style object applied anywhere in the tree. */
export function styles(r: TestRenderer.ReactTestRenderer): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: TestRenderer.ReactTestInstance | string) => {
    if (typeof n === 'string') return;
    const s = n.props?.style;
    (Array.isArray(s) ? s : [s]).forEach(x => { if (x && typeof x === 'object') out.push(x); });
    (n.children ?? []).forEach(walk as never);
  };
  r.root.children.forEach(walk as never);
  return out;
}
