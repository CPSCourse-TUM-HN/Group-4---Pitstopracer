import { useEffect, useRef, useState } from 'react';
import { config } from '../config';
import { connect, MqttClient, Status } from './client';
import {
  BatteryMsg, EventMsg, FuelMsg, ImuMsg,
  StateMsg, StrategyMsg, TiresMsg,
} from '../types';

const TOPICS = [
  `${config.topicPrefix}/state`,
  `${config.topicPrefix}/battery`,
  `${config.topicPrefix}/fuel`,
  `${config.topicPrefix}/tires`,
  `${config.topicPrefix}/strategy`,
  `${config.topicPrefix}/event`,
  `${config.topicPrefix}/imu`,
] as const;

export interface TelemetryState {
  status: Status;
  lastUpdateMs: Record<string, number>;
  state: StateMsg | null;
  battery: BatteryMsg | null;
  fuel: FuelMsg | null;
  tires: TiresMsg | null;
  strategy: StrategyMsg | null;
  recentEvents: EventMsg[];
  imu: ImuMsg | null;
}

export function useTelemetry(): TelemetryState {
  const [status,       setStatus]       = useState<Status>('disconnected');
  const [lastUpdateMs, setLastUpdateMs] = useState<Record<string, number>>({});
  const [state,        setState]        = useState<StateMsg | null>(null);
  const [battery,      setBattery]      = useState<BatteryMsg | null>(null);
  const [fuel,         setFuel]         = useState<FuelMsg | null>(null);
  const [tires,        setTires]        = useState<TiresMsg | null>(null);
  const [strategy,     setStrategy]     = useState<StrategyMsg | null>(null);
  const [recentEvents, setRecentEvents] = useState<EventMsg[]>([]);
  const [imu,          setImu]          = useState<ImuMsg | null>(null);

  const clientRef = useRef<MqttClient | null>(null);

  useEffect(() => {
    const p = config.topicPrefix;

    const client = connect(
      config.brokerUrl,
      config.reconnectMs,
      setStatus,
      (topic, payload) => {
        const now = Date.now();
        setLastUpdateMs(prev => ({ ...prev, [topic]: now }));

        if (topic === `${p}/state`)    setState(payload as StateMsg);
        else if (topic === `${p}/battery`)  setBattery(payload as BatteryMsg);
        else if (topic === `${p}/fuel`)     setFuel(payload as FuelMsg);
        else if (topic === `${p}/tires`)    setTires(payload as TiresMsg);
        else if (topic === `${p}/strategy`) setStrategy(payload as StrategyMsg);
        else if (topic === `${p}/imu`)      setImu(payload as ImuMsg);
        else if (topic === `${p}/event`) {
          const evt = payload as EventMsg;
          setRecentEvents(prev => [evt, ...prev].slice(0, 5));
        }
      },
    );

    clientRef.current = client;
    TOPICS.forEach(t => client.subscribe(t));
    return () => { client.disconnect(); clientRef.current = null; };
  }, []);

  return { status, lastUpdateMs, state, battery, fuel, tires, strategy, recentEvents, imu };
}
