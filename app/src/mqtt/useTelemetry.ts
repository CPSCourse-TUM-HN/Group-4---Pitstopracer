import { useEffect, useRef, useState } from 'react';
import { config } from '../config';
import { connect, Status } from './client';
import { STALE_MS, TOPIC_SUFFIXES, TopicSuffix } from './topics';
import { isValidPayload } from './validation';
import {
  BatteryMsg, EventMsg, FuelMsg, ImuMsg,
  PoseMsg, StateMsg, StrategyMsg, TiresMsg,
} from '../types';


// Re-exported so existing importers keep working; defined in ./topics.
export { STALE_MS };

/**
 * How often staleness is re-evaluated. Staleness is the passage of time rather
 * than an event, so it needs its own clock -- see the ticker effect below.
 */
const STALE_TICK_MS = 1_000;

export interface TelemetryState {
  status: Status;
  /** Per-topic staleness, recomputed on a timer rather than on arrival. */
  stale: Record<TopicSuffix, boolean>;
  /** Payloads dropped for failing their shape check, by topic. */
  dropped: Record<string, number>;
  state: StateMsg | null;
  battery: BatteryMsg | null;
  fuel: FuelMsg | null;
  tires: TiresMsg | null;
  strategy: StrategyMsg | null;
  recentEvents: EventMsg[];
  imu: ImuMsg | null;
  /** Measured localization, when any producer publishes it. */
  pose: PoseMsg | null;
}

const NONE_STALE = Object.freeze(
  Object.fromEntries(TOPIC_SUFFIXES.map(s => [s, false])),
) as Record<TopicSuffix, boolean>;

export function useTelemetry(): TelemetryState {
  const [status,       setStatus]       = useState<Status>('disconnected');
  const [state,        setState]        = useState<StateMsg | null>(null);
  const [battery,      setBattery]      = useState<BatteryMsg | null>(null);
  const [fuel,         setFuel]         = useState<FuelMsg | null>(null);
  const [tires,        setTires]        = useState<TiresMsg | null>(null);
  const [strategy,     setStrategy]     = useState<StrategyMsg | null>(null);
  const [recentEvents, setRecentEvents] = useState<EventMsg[]>([]);
  const [imu,          setImu]          = useState<ImuMsg | null>(null);
  const [pose,         setPose]         = useState<PoseMsg | null>(null);
  const [stale,        setStale]        = useState<Record<TopicSuffix, boolean>>(NONE_STALE);
  const [dropped,      setDropped]      = useState<Record<string, number>>({});

  // Arrival times live in a ref, not state. Writing them to state allocated a
  // new object per message -- roughly 36 a second across state and imu -- and
  // re-rendered the entire dashboard each time purely to record a timestamp.
  const lastUpdateRef = useRef<Partial<Record<TopicSuffix, number>>>({});
  const droppedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const p = config.topicPrefix;

    const client = connect(
      config.brokerUrl,
      config.reconnectMs,
      setStatus,
      (topic, payload) => {
        const suffix = topic.slice(p.length + 1) as TopicSuffix;
        if (!TOPIC_SUFFIXES.includes(suffix)) return;

        if (!isValidPayload(suffix, payload)) {
          droppedRef.current[suffix] = (droppedRef.current[suffix] ?? 0) + 1;
          console.warn(`[mqtt] dropped malformed ${suffix} payload`, payload);
          return;
        }

        lastUpdateRef.current[suffix] = Date.now();

        switch (suffix) {
          case 'state':    setState(payload as StateMsg); break;
          case 'battery':  setBattery(payload as BatteryMsg); break;
          case 'fuel':     setFuel(payload as FuelMsg); break;
          case 'tires':    setTires(payload as TiresMsg); break;
          case 'strategy': setStrategy(payload as StrategyMsg); break;
          case 'imu':      setImu(payload as ImuMsg); break;
          case 'pose':     setPose(payload as PoseMsg); break;
          case 'event': {
            const evt = payload as EventMsg;
            // Pit events must survive a burst of lap events, so the buffer is
            // kept per kind rather than as one shared five-slot window: five
            // laps in a row used to evict an open pit_start and strand the car.
            setRecentEvents(prev => {
              const next = [evt, ...prev];
              const pits = next.filter(e => e.type !== 'lap').slice(0, 4);
              const laps = next.filter(e => e.type === 'lap').slice(0, 4);
              return [...pits, ...laps].sort((a, b) => b.ts - a.ts);
            });
            break;
          }
        }
      },
    );

    TOPIC_SUFFIXES.forEach(s => client.subscribe(`${p}/${s}`));
    return () => client.disconnect();
  }, []);

  // Staleness is the *absence* of messages, so it cannot be derived during a
  // render that is itself driven by messages: when the publisher dies nothing
  // re-renders and the dashboard freezes on values that still look live. This
  // timer is what makes the spec's "stale data freezes, it does not hide"
  // reachable at all.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();

      const next = { ...NONE_STALE };
      for (const s of TOPIC_SUFFIXES) {
        const t = lastUpdateRef.current[s];
        next[s] = t !== undefined && now - t > STALE_MS;
      }

      setStale(prev => {
        for (const s of TOPIC_SUFFIXES) {
          if (prev[s] !== next[s]) return next;
        }
        return prev;
      });

      // Surface drop counts without re-rendering on every dropped message.
      setDropped(prev => {
        const cur = droppedRef.current;
        const keys = Object.keys(cur);
        if (keys.length !== Object.keys(prev).length) return { ...cur };
        for (const k of keys) {
          if (prev[k] !== cur[k]) return { ...cur };
        }
        return prev;
      });
    }, STALE_TICK_MS);

    return () => clearInterval(id);
  }, []);

  return { status, stale, dropped, state, battery, fuel, tires, strategy, recentEvents, imu, pose };
}
