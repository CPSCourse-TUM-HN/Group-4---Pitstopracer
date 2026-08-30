import { useEffect, useRef, useState } from 'react';
import { EventMsg, PoseMsg, StateMsg } from '../types';
import {
  CarPose, lapProgress, medianLapTime, recordLap, resolveCarPose, resolvePitVisit,
} from './position';

/**
 * Fallback lap time before any lap has completed.
 *
 * 18 s is the lap the measured track implies: 22.01 m at a plausible JetRacer
 * pace of ~1.22 m/s. Design spec section 7 flagged the mock as inconsistent
 * with the track, and it was -- but the lap TIME was already right; only the
 * published speed (a literal 3.8 m/s, implying a 68 m circuit) was wrong. The
 * publisher now derives speed from length over lap time, and
 * tools/test_roundtrip.py asserts this constant still matches it.
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

/** Completed laps retained for the rolling median. */
const LAP_HISTORY = 8;

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
  /** Measured localization. Wins over the lap-progress estimate when present. */
  pose: PoseMsg | null = null,
  /** Treated as absent once stale, so the map falls back rather than lying. */
  poseStale = false,
): CarPositionState {
  const lapTimesRef = useRef<number[]>([]);
  const lastLapRef = useRef<number | null>(null);
  const lastLapTimeRef = useRef(0);

  // Pit visits are timed against local receipt, not the publisher's clock, so
  // the animation stays sane if the car's clock is skewed from the phone's.
  const pitStartTsRef = useRef<number | null>(null);
  const pitStartLocalRef = useRef(0);

  const [, forceTick] = useState(0);
  // Lap durations are held in state, not read straight off the ref, so that a
  // completed lap actually re-renders the map with the new expected lap time.
  const [measured, setMeasured] = useState<number | null>(null);

  // Capture each completed lap's duration: the last lap_time_s observed before
  // the lap counter advanced.
  //
  // This runs in an effect rather than during render because it *mutates*.
  // React 18 invokes render twice in StrictMode and may discard a render
  // entirely under concurrent features; doing this inline recorded some laps
  // twice and skewed the median that the whole progress estimate depends on.
  useEffect(() => {
    if (!state) return;

    const next = recordLap(
      lapTimesRef.current, lastLapRef.current, state.lap,
      lastLapTimeRef.current, LAP_HISTORY,
    );
    if (next !== lapTimesRef.current) {
      lapTimesRef.current = next as number[];
      setMeasured(medianLapTime(next));
    }
    lastLapRef.current = state.lap;
    lastLapTimeRef.current = state.lap_time_s;
  }, [state]);

  const pitStart = latestOfType(events, 'pit_start');
  const pitEnd = latestOfType(events, 'pit_end');

  const pitOpen = pitStart !== null && (pitEnd === null || pitStart.ts > pitEnd.ts);
  const pitStartTs = pitOpen ? pitStart!.ts : null;

  // Pit visits are timed from local receipt, so the clock starts when the event
  // arrives rather than during a render that may never commit.
  useEffect(() => {
    if (pitStartTs === null) {
      pitStartTsRef.current = null;
      return;
    }
    if (pitStartTsRef.current !== pitStartTs) {
      pitStartTsRef.current = pitStartTs;
      pitStartLocalRef.current = Date.now();
      forceTick(n => n + 1);
    }
  }, [pitStartTs]);

  // Guard the first frame: the effect above has not run yet on the render that
  // first sees the event, so treat an unrecorded visit as starting now.
  const pitClockStarted = pitStartTsRef.current === pitStartTs && pitStartTs !== null;
  const elapsed = pitClockStarted ? Date.now() - pitStartLocalRef.current : 0;
  const visit = resolvePitVisit(
    pitStart?.ts ?? null, pitEnd?.ts ?? null,
    elapsed, PIT_EXPECTED_MS, PIT_WATCHDOG_MS,
  );
  const { inPit, assumedComplete: watchdogFired } = visit;

  // The publisher stops emitting state while it is pitting, so without a local
  // timer the pit animation would freeze on its first frame.
  useEffect(() => {
    if (!inPit) return;
    const id = setInterval(() => forceTick(n => n + 1), 100);
    return () => clearInterval(id);
  }, [inPit]);

  const expectedLapTimeS = measured ?? SEED_LAP_TIME_S;

  // Progress is clamped, never wrapped -- see lapProgress for why.
  const progress = state ? lapProgress(state.lap_time_s, expectedLapTimeS) : null;

  const pitPhase = visit.phase;

  const measuredPose = pose && !poseStale ? pose : null;
  const carPose = resolveCarPose({ pose: measuredPose, progress, pitPhase });

  return {
    pose: carPose,
    progress,
    inPit,
    pitAssumedComplete: watchdogFired,
    expectedLapTimeS,
    lapTimeMeasured: measured !== null,
  };
}
