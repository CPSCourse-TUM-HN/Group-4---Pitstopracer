import { useEffect, useRef, useState } from 'react';
import { EventMsg, StateMsg } from '../types';
import { CarPose, medianLapTime, resolveCarPose, wrapProgress } from './position';

/**
 * Fallback lap time before any lap has completed.
 *
 * PROVISIONAL. The mock publisher's 18 s at ~3.8 m/s implies a 68 m lap, but
 * the measured track is 22.01 m. Until Modeling and Software agree one set of
 * numbers (see docs/specs/2026-08-10-digital-twin-design.md section 7), this is
 * a placeholder chosen to match the mock, not the physical track.
 */
export const SEED_LAP_TIME_S = 18;

/**
 * How long a pit visit is expected to take, for animating the detour.
 * Deliberately app-side: the app must not read a producer's internals, and the
 * real duration will come from Hardware rather than the mock.
 */
export const PIT_EXPECTED_MS = 10_000;

/**
 * If `pit_end` never arrives the car would sit in the pit box forever and the
 * demo would be dead. On expiry we rejoin and mark the visit assumed complete.
 */
export const PIT_WATCHDOG_MS = 15_000;

export interface CarPositionState {
  pose: CarPose;
  /** Lap progress in [0,1), or null when unknown. */
  progress: number | null;
  inPit: boolean;
  /** True when the watchdog ended the pit visit rather than a pit_end event. */
  pitAssumedComplete: boolean;
  expectedLapTimeS: number;
  /** False until at least one lap has completed, i.e. still using the seed. */
  lapTimeMeasured: boolean;
}

function latestOfType(events: readonly EventMsg[], type: EventMsg['type']) {
  return events.find(e => e.type === type) ?? null;
}

export function useCarPosition(
  state: StateMsg | null,
  events: readonly EventMsg[],
): CarPositionState {
  const lapTimesRef = useRef<number[]>([]);
  const lastLapRef = useRef<number | null>(null);
  const lastLapTimeRef = useRef(0);

  // Pit visits are timed against local receipt, not the publisher's clock, so
  // the animation stays sane if the car's clock is skewed from the phone's.
  const pitStartTsRef = useRef<number | null>(null);
  const pitStartLocalRef = useRef(0);

  const [, forceTick] = useState(0);

  // Capture each completed lap's duration: the last lap_time_s observed before
  // the lap counter advanced.
  if (state) {
    if (lastLapRef.current === null) {
      lastLapRef.current = state.lap;
    } else if (state.lap !== lastLapRef.current) {
      if (lastLapTimeRef.current > 0) lapTimesRef.current.push(lastLapTimeRef.current);
      lastLapRef.current = state.lap;
    }
    lastLapTimeRef.current = state.lap_time_s;
  }

  const pitStart = latestOfType(events, 'pit_start');
  const pitEnd = latestOfType(events, 'pit_end');

  const pitOpen = pitStart !== null && (pitEnd === null || pitStart.ts > pitEnd.ts);

  if (pitOpen && pitStartTsRef.current !== pitStart!.ts) {
    pitStartTsRef.current = pitStart!.ts;
    pitStartLocalRef.current = Date.now();
  }
  if (!pitOpen) pitStartTsRef.current = null;

  const elapsed = pitOpen ? Date.now() - pitStartLocalRef.current : 0;
  const watchdogFired = pitOpen && elapsed > PIT_WATCHDOG_MS;
  const inPit = pitOpen && !watchdogFired;

  // The publisher stops emitting state while it is pitting, so without a local
  // timer the pit animation would freeze on its first frame.
  useEffect(() => {
    if (!inPit) return;
    const id = setInterval(() => forceTick(n => n + 1), 100);
    return () => clearInterval(id);
  }, [inPit]);

  const measured = medianLapTime(lapTimesRef.current);
  const expectedLapTimeS = measured ?? SEED_LAP_TIME_S;

  const progress = state ? wrapProgress(state.lap_time_s / expectedLapTimeS) : null;
  const pitPhase = inPit ? Math.min(elapsed / PIT_EXPECTED_MS, 1) : null;

  const pose = resolveCarPose({ progress, pitPhase });

  return {
    pose,
    progress,
    inPit,
    pitAssumedComplete: watchdogFired,
    expectedLapTimeS,
    lapTimeMeasured: measured !== null,
  };
}
