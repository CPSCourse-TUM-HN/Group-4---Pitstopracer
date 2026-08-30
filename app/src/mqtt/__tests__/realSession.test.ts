import { readFileSync } from 'fs';
import { join } from 'path';
import { isValidPayload } from '../validation';
import { TOPIC_SUFFIXES, TopicSuffix } from '../topics';
import { STALE_MS } from '../topics';
import { resolveCarPose } from '../../track/position';
import { CENTERLINE, FIELD_CM } from '../../track/monza.generated';

/**
 * Contract test against real recorded traffic.
 *
 * The app's shape guard and tools/packet_schema.py describe the same contract
 * in two languages, and nothing stops them drifting apart. This replays a real
 * `tools/recorder.py` capture of three full races -- including pit stops and
 * race restarts -- through the app's guard, so a producer change that the
 * Python side accepts cannot silently start being dropped by the app.
 *
 * Regenerate with:
 *   python3 tools/recorder.py -o /tmp/s.ndjson --duration 60
 */
const FIXTURE = join(__dirname, 'fixtures', 'session.sample.ndjson');

interface SessionRecord { topic: string; payload?: unknown; raw?: string }

function load(): SessionRecord[] {
  return readFileSync(FIXTURE, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as SessionRecord);
}

const suffixOf = (topic: string) => topic.split('/').pop() as TopicSuffix;

describe('recorded session', () => {
  const records = load();

  it('is a usable fixture', () => {
    expect(records.length).toBeGreaterThan(100);
  });

  it('covers every topic the app subscribes to except the optional pose', () => {
    const seen = new Set(records.map(r => suffixOf(r.topic)));
    for (const s of TOPIC_SUFFIXES) {
      if (s === 'pose') continue;   // optional, no producer publishes it yet
      expect(seen).toContain(s);
    }
  });

  it('contains the pit sequence the twin depends on', () => {
    const types = records
      .filter(r => suffixOf(r.topic) === 'event')
      .map(r => (r.payload as { type: string }).type);
    expect(types).toContain('pit_start');
    expect(types).toContain('pit_end');
    expect(types).toContain('lap');
  });

  it('accepts every payload the real publisher emitted', () => {
    const rejected = records
      .filter(r => r.payload !== undefined)
      .filter(r => !isValidPayload(suffixOf(r.topic), r.payload))
      .map(r => `${r.topic}: ${JSON.stringify(r.payload)}`);

    // A failure here means the app would silently drop live telemetry.
    expect(rejected).toEqual([]);
  });

  it('would reject the same payloads with a field removed', () => {
    // Guards against the check being vacuously true.
    const sample = records.find(r => suffixOf(r.topic) === 'state')!;
    const { lap_time_s, ...missing } = sample.payload as Record<string, unknown>;
    expect(isValidPayload('state', missing)).toBe(false);
  });

  it('reports lap numbers and times that stay within the packet spec', () => {
    for (const r of records.filter(x => suffixOf(x.topic) === 'state')) {
      const p = r.payload as { lap: number; lap_time_s: number; speed: number };
      expect(p.lap).toBeGreaterThanOrEqual(0);
      expect(p.lap_time_s).toBeGreaterThanOrEqual(0);
      expect(p.speed).toBeGreaterThanOrEqual(0);
      expect(p.speed).toBeLessThanOrEqual(30);
    }
  });

  it('reports a speed a JetRacer could actually reach', () => {
    // The packet spec's 30 m/s ceiling is far too loose to catch this: the
    // publisher used to emit a literal 3.8 m/s, implying a 68 m lap on a
    // 22.01 m track. Speed is now derived as length / lap time.
    const speeds = records
      .filter(r => suffixOf(r.topic) === 'state')
      .map(r => (r.payload as { speed: number }).speed);

    expect(speeds.length).toBeGreaterThan(10);
    expect(Math.max(...speeds)).toBeLessThan(2.5);   // 9 km/h
    expect(Math.min(...speeds)).toBeGreaterThan(0.5);
  });

  it('covers the track once per lap at the speed it reports', () => {
    const state = records.filter(r => suffixOf(r.topic) === 'state')
      .map(r => r.payload as { speed: number; lap_time_s: number });
    const meanSpeed = state.reduce((a, s) => a + s.speed, 0) / state.length;
    const longestLap = Math.max(...state.map(s => s.lap_time_s));

    // Distance covered in a lap should be within 25% of the measured 22.01 m.
    const impliedLapLength = meanSpeed * longestLap;
    expect(impliedLapLength).toBeGreaterThan(22.01 * 0.75);
    expect(impliedLapLength).toBeLessThan(22.01 * 1.25);
  });
});

/**
 * A contiguous window around a pit stop, offsets rebased to start at zero.
 *
 * Unlike the sampled fixture above this keeps every message, so it can be used
 * to reason about gaps between them.
 */
const PIT_FIXTURE = join(__dirname, 'fixtures', 'pit-window.ndjson');

describe('telemetry during a pit stop', () => {
  const records: SessionRecord[] = readFileSync(PIT_FIXTURE, 'utf8')
    .split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as SessionRecord);

  const withOffsets = records as (SessionRecord & { t_offset_ms: number })[];

  it('contains a complete pit stop', () => {
    const types = withOffsets
      .filter(r => suffixOf(r.topic) === 'event')
      .map(r => (r.payload as { type: string }).type);
    expect(types).toContain('pit_start');
    expect(types).toContain('pit_end');
  });

  it('never goes quiet for longer than the stale threshold', () => {
    // The publisher used to sleep silently through the whole stop. The app
    // marks a topic stale after STALE_MS, so an 8 s pit greyed out the entire
    // dashboard and dimmed the map -- during the one moment the demo is about.
    const state = withOffsets.filter(r => suffixOf(r.topic) === 'state');
    let worst = 0;
    for (let i = 1; i < state.length; i++) {
      worst = Math.max(worst, state[i].t_offset_ms - state[i - 1].t_offset_ms);
    }
    expect(state.length).toBeGreaterThan(50);
    expect(worst).toBeLessThan(STALE_MS);
  });

  it('reports the car as stationary while it is being serviced', () => {
    const evs = withOffsets.filter(r => suffixOf(r.topic) === 'event');
    const start = evs.find(r => (r.payload as { type: string }).type === 'pit_start')!.t_offset_ms;
    const end = evs.find(r => (r.payload as { type: string }).type === 'pit_end')!.t_offset_ms;

    const during = withOffsets
      .filter(r => suffixOf(r.topic) === 'state')
      .filter(r => r.t_offset_ms > start && r.t_offset_ms < end)
      .map(r => (r.payload as { speed: number }).speed);

    expect(during.length).toBeGreaterThan(10);
    expect(Math.min(...during)).toBe(0);
  });
});

/**
 * Measured localization, captured from `publisher.py --publish-pose`.
 *
 * Nothing in the perception stack publishes this yet, so without a fixture the
 * app's whole 'measured' rung would ship untested and only be exercised for the
 * first time by whoever plugs real localization in.
 */
const POSE_FIXTURE = join(__dirname, 'fixtures', 'pose.sample.ndjson');

describe('measured pose', () => {
  const records: (SessionRecord & { t_offset_ms: number })[] =
    readFileSync(POSE_FIXTURE, 'utf8').split('\n').filter(l => l.trim())
      .map(l => JSON.parse(l));

  it('is accepted by the app guard', () => {
    const rejected = records.filter(r => !isValidPayload('pose', r.payload));
    expect(records.length).toBeGreaterThan(20);
    expect(rejected).toEqual([]);
  });

  it('lands inside the field the map draws', () => {
    for (const r of records) {
      const p = r.payload as { x: number; y: number; heading: number };
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(FIELD_CM.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(FIELD_CM.height);
    }
  });

  it('takes priority over the lap-progress estimate', () => {
    const p = records[0].payload as { x: number; y: number; heading: number };
    const resolved = resolveCarPose({ pose: p, progress: 0.5 });
    expect(resolved.source).toBe('pose');
    expect(resolved.x).toBe(p.x);
  });

  it('is ignored when it arrives without usable coordinates', () => {
    const resolved = resolveCarPose({ pose: { x: NaN, y: 10 }, progress: 0.5 });
    expect(resolved.source).toBe('progress');
  });

  it('stays close to the racing line it was derived from', () => {
    // A fix wandering far from the track would mean the geometry the publisher
    // reads and the geometry the app draws have diverged.
    for (const r of records) {
      const p = r.payload as { x: number; y: number };
      const nearest = Math.min(...CENTERLINE.map(([x, y]) => Math.hypot(x - p.x, y - p.y)));
      expect(nearest).toBeLessThan(30);   // well inside the 72 cm lane
    }
  });
});
