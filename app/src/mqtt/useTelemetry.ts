import { useEffect, useRef, useState } from 'react';

import { config } from '../config';

import {
  connect,
  Status,
} from './client';

import {
  STALE_MS,
  TOPIC_SUFFIXES,
  TopicSuffix,
} from './topics';

import { isValidPayload } from './validation';

import {
  BatteryMsg,
  EventMsg,
  FuelMsg,
  ImuMsg,
  PoseMsg,
  StateMsg,
  StrategyMsg,
  TiresMsg,
} from '../types';


// Re-exported so existing importers keep working.
export { STALE_MS };


/**
 * How often staleness is re-evaluated.
 */
const STALE_TICK_MS = 1_000;


export interface TelemetryState {

  status: Status;

  /** Per-topic staleness. */
  stale: Record<TopicSuffix, boolean>;

  /** Payloads dropped for failing their shape check. */
  dropped: Record<string, number>;

  state: StateMsg | null;

  battery: BatteryMsg | null;

  fuel: FuelMsg | null;

  tires: TiresMsg | null;

  strategy: StrategyMsg | null;

  recentEvents: EventMsg[];

  imu: ImuMsg | null;

  /** Measured localization. */
  pose: PoseMsg | null;

  /**
   * Publish a command through the existing MQTT connection.
   */
  publishCommand: (
    topic: string,
    payload: unknown
  ) => void;
}


const NONE_STALE = Object.freeze(

  Object.fromEntries(
    TOPIC_SUFFIXES.map(
      s => [s, false]
    )
  ),

) as Record<TopicSuffix, boolean>;


export function useTelemetry(): TelemetryState {

  const [
    status,
    setStatus,
  ] = useState<Status>('disconnected');


  const [
    state,
    setState,
  ] = useState<StateMsg | null>(null);


  const [
    battery,
    setBattery,
  ] = useState<BatteryMsg | null>(null);


  const [
    fuel,
    setFuel,
  ] = useState<FuelMsg | null>(null);


  const [
    tires,
    setTires,
  ] = useState<TiresMsg | null>(null);


  const [
    strategy,
    setStrategy,
  ] = useState<StrategyMsg | null>(null);


  const [
    recentEvents,
    setRecentEvents,
  ] = useState<EventMsg[]>([]);


  const [
    imu,
    setImu,
  ] = useState<ImuMsg | null>(null);


  const [
    pose,
    setPose,
  ] = useState<PoseMsg | null>(null);


  const [
    stale,
    setStale,
  ] = useState<Record<TopicSuffix, boolean>>(
    NONE_STALE
  );


  const [
    dropped,
    setDropped,
  ] = useState<Record<string, number>>({});


  /*
   * Store the MQTT client itself in a ref.
   *
   * This allows publishCommand() to use the same
   * MQTT connection that receives telemetry.
   */
  const clientRef =
    useRef<ReturnType<typeof connect> | null>(null);


  /*
   * Arrival times live in a ref.
   */
  const lastUpdateRef =
    useRef<Partial<Record<TopicSuffix, number>>>({});


  const droppedRef =
    useRef<Record<string, number>>({});


  /* ==========================================================
     MQTT CONNECTION
     ========================================================== */

  useEffect(() => {

    const p = config.topicPrefix;

    console.log(
      '[DEBUG MQTT] topicPrefix:',
      p
    );

    console.log(
      '[DEBUG MQTT] brokerUrl:',
      config.brokerUrl
    );


    const client = connect(

      config.brokerUrl,

      config.reconnectMs,

      setStatus,

      (topic, payload) => {

        const suffix =
          topic.slice(
            p.length + 1
          ) as TopicSuffix;


        if (
          !TOPIC_SUFFIXES.includes(
            suffix
          )
        ) {
          return;
        }


        if (
          !isValidPayload(
            suffix,
            payload
          )
        ) {

          droppedRef.current[suffix] =
            (
              droppedRef.current[suffix]
              ?? 0
            ) + 1;


          console.warn(
            `[mqtt] dropped malformed ${suffix} payload`,
            payload
          );

          return;

        }


        lastUpdateRef.current[suffix] =
          Date.now();


        switch (suffix) {

          case 'state':

            setState(
              payload as StateMsg
            );

            break;


          case 'battery':

            setBattery(
              payload as BatteryMsg
            );

            break;


          case 'fuel':

            setFuel(
              payload as FuelMsg
            );

            break;


          case 'tires':

            setTires(
              payload as TiresMsg
            );

            break;


          case 'strategy':

            setStrategy(
              payload as StrategyMsg
            );

            break;


          case 'imu':

            setImu(
              payload as ImuMsg
            );

            break;


          case 'pose':

            setPose(
              payload as PoseMsg
            );

            break;


          case 'event': {

            const evt =
              payload as EventMsg;


            setRecentEvents(
              prev => {

                const next =
                  [
                    evt,
                    ...prev,
                  ];


                const pits =
                  next
                    .filter(
                      e =>
                        e.type !== 'lap'
                    )
                    .slice(0, 4);


                const laps =
                  next
                    .filter(
                      e =>
                        e.type === 'lap'
                    )
                    .slice(0, 4);


                return [
                  ...pits,
                  ...laps,
                ].sort(
                  (a, b) =>
                    b.ts - a.ts
                );

              }
            );

            break;
          }

        }

      },

    );


    /*
     * Save the connection so DashboardScreen
     * can publish commands through it.
     */
    clientRef.current = client;


    /*
     * Subscribe to telemetry topics.
     */
    TOPIC_SUFFIXES.forEach(
      s =>
        client.subscribe(
          `${p}/${s}`
        )
    );


    return () => {

      client.disconnect();

      clientRef.current = null;

    };

  }, []);


  /* ==========================================================
     COMMAND PUBLISHER
     ========================================================== */

  const publishCommand = (
    topic: string,
    payload: unknown
  ) => {

    /*
     * IMPORTANT DEBUG:
     *
     * This tells us exactly what topic arrives
     * from DashboardScreen BEFORE client.ts sees it.
     */
    console.log(
      '========================================'
    );

    console.log(
      '[TRACE useTelemetry] RECEIVED TOPIC:',
      topic
    );

    console.log(
      '[TRACE useTelemetry] PAYLOAD:',
      payload
    );

    console.log(
      '[TRACE useTelemetry] EXPECTED COMMAND TOPIC:',
      `${config.topicPrefix}/command`
    );

    console.log(
      '[TRACE useTelemetry] TOPIC MATCH:',
      topic === `${config.topicPrefix}/command/rain`
    );

    console.log(
      '========================================'
    );


    if (!clientRef.current) {

      console.warn(
        '[mqtt] cannot publish command: client not connected'
      );

      return;

    }


    clientRef.current.publish(
      topic,
      payload
    );

  };


  /* ==========================================================
     STALENESS
     ========================================================== */

  useEffect(() => {

    const id =
      setInterval(() => {

        const now =
          Date.now();


        const next =
          {
            ...NONE_STALE,
          };


        for (
          const s of TOPIC_SUFFIXES
        ) {

          const t =
            lastUpdateRef.current[s];


          next[s] =
            t !== undefined &&
            now - t > STALE_MS;

        }


        setStale(
          prev => {

            for (
              const s of TOPIC_SUFFIXES
            ) {

              if (
                prev[s] !== next[s]
              ) {

                return next;

              }

            }


            return prev;

          }
        );


        /*
         * Surface dropped-payload counts.
         */

        setDropped(
          prev => {

            const cur =
              droppedRef.current;


            const keys =
              Object.keys(cur);


            if (
              keys.length !==
              Object.keys(prev).length
            ) {

              return {
                ...cur,
              };

            }


            for (
              const k of keys
            ) {

              if (
                prev[k] !== cur[k]
              ) {

                return {
                  ...cur,
                };

              }

            }


            return prev;

          }
        );

      }, STALE_TICK_MS);


    return () =>
      clearInterval(id);

  }, []);


  /* ==========================================================
     RETURN
     ========================================================== */

  return {

    status,

    stale,

    dropped,

    state,

    battery,

    fuel,

    tires,

    strategy,

    recentEvents,

    imu,

    pose,

    publishCommand,

  };

}