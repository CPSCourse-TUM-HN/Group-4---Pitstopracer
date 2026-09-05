import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import ArcGauge from '../components/ArcGauge';
import CarTireLayout from '../components/CarTireLayout';
import FuelBar from '../components/FuelBar';
import GForceWidget from '../components/GForceWidget';
import LapHistory from '../components/LapHistory';
import PitBanner from '../components/PitBanner';
import StrategyPredictor from '../components/StrategyPredictor';
import StatusTicker from '../components/StatusTicker';
import InfoModal, { InfoContent } from '../components/InfoModal';
import TrackMap from '../components/TrackMap';

import { useTelemetry, STALE_MS } from '../mqtt/useTelemetry';

import { RAIN_COMMAND_TOPIC } from '../mqtt/topics';

import { useCarPosition } from '../track/useCarPosition';
import { TRACK_LENGTH_CM } from '../track/monza.generated';

import { config } from '../config';

import {
  pctHealth,
  HEALTH_COLOR,
  tireHealth,
} from '../types';

import {
  FUEL_BURN_PER_LAP_PCT,
  SPEED_GAUGE_MAX_KMH,
  TIRE_PIT_THRESHOLD,
  TOTAL_LAPS,
} from '../raceConfig';


// ============================================================
// TYPES
// ============================================================

type TirePos = 'FL' | 'FR' | 'RL' | 'RR';

type Sheet =
  | {
      kind:
        | 'speed'
        | 'battery'
        | 'fuel'
        | 'imu'
        | 'twin'
        | 'connection';
    }
  | {
      kind: 'tire';
      pos: TirePos;
    };


// ============================================================
// CONNECTION COLORS
// ============================================================

const STATUS_COLOR = {
  connected: '#22c55e',
  connecting: '#f59e0b',
  reconnecting: '#f59e0b',
  disconnected: '#ef4444',
  error: '#ef4444',
} as const;


// ============================================================
// MODE CONFIGURATION
// ============================================================

const MODE_CONFIG = {
  driving: {
    label: 'DRIVING',
    color: '#22c55e',
  },

  raining: {
    label: 'RAINING',
    color: '#38bdf8',
  },

  charging: {
    label: 'CHARGING',
    color: '#f59e0b',
  },

  pitstop: {
    label: 'PITSTOP',
    color: '#a855f7',
  },
} as const;


// ============================================================
// DASHBOARD
// ============================================================

export default function DashboardScreen() {

  // ==========================================================
  // TELEMETRY
  // ==========================================================

  const {
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
  } = useTelemetry();


  // ==========================================================
  // CURRENT MODE
  //
  // IMPORTANT:
  // The JetRacer telemetry is the source of truth.
  //
  // The Rain button does NOT directly change the MODE display.
  // ==========================================================

  const currentMode =
    state?.mode ?? 'driving';

  const modeConfig =
    MODE_CONFIG[currentMode];


  // ==========================================================
  // RAIN BUTTON STATE
  //
  // This represents the requested Rain state.
  // The actual MODE still comes from JetRacer telemetry.
  // ==========================================================

  const [
    rainOn,
    setRainOn,
  ] = useState(false);


  // ==========================================================
  // SYNCHRONIZE RAIN BUTTON WITH JETRACER
  //
  // If JetRacer reports raining -> button ON.
  // Otherwise -> button OFF.
  // ==========================================================

  useEffect(() => {

    setRainOn(
      currentMode === 'raining'
    );

  }, [
    currentMode,
  ]);


  // ==========================================================
  // RAIN BUTTON
  // ==========================================================

  const toggleRain = useCallback(() => {

    const nextRainState =
      !rainOn;


    // Update button immediately.

    setRainOn(
      nextRainState
    );


    // --------------------------------------------------------
    // Send command to JetRacer
    //
    // Topic:
    // race/car1/command
    //
    // Payload:
    // {
    //   command: "rain",
    //   enabled: true/false
    // }
    // --------------------------------------------------------

    const topic =
      `${config.topicPrefix}/${RAIN_COMMAND_TOPIC}`;


    publishCommand(
      topic,
      {
        command: 'rain',
        enabled: nextRainState,
      },
    );


    console.log(
      '[rain] command sent:',
      nextRainState
        ? 'ON'
        : 'OFF'
    );

  }, [
    rainOn,
    publishCommand,
  ]);


  // ==========================================================
  // CAR POSITION
  //
  // IMPORTANT:
  // useCarPosition expects:
  //
  //   state
  //   recentEvents
  //   pose
  //   poseStale
  //
  // This fixes the previous events.find error.
  // ==========================================================

  const carPosition =
    useCarPosition(
      state,
      recentEvents,
      pose,
      stale.pose,
    );


  // ==========================================================
  // STALE STATES
  // ==========================================================

  const staleState =
    stale.state;

  const staleBattery =
    stale.battery;

  const staleFuel =
    stale.fuel;

  const staleTires =
    stale.tires;

  const staleImu =
    stale.imu;


  // ==========================================================
  // CONNECTION INFORMATION
  // ==========================================================

  const droppedTotal =
    Object.values(dropped).reduce(
      (a, b) => a + b,
      0,
    );

  const staleSuffixes =
    Object.entries(stale)
      .filter(([, s]) => s)
      .map(([k]) => k);


  // ==========================================================
  // INFO SHEET STATE
  // ==========================================================

  const [
    sheet,
    setSheet,
  ] = useState<Sheet | null>(null);


  // ==========================================================
  // SHEET CALLBACKS
  // ==========================================================

  const openTwin =
    useCallback(
      () =>
        setSheet({
          kind: 'twin',
        }),
      [],
    );

  const openSpeed =
    useCallback(
      () =>
        setSheet({
          kind: 'speed',
        }),
      [],
    );

  const openBattery =
    useCallback(
      () =>
        setSheet({
          kind: 'battery',
        }),
      [],
    );

  const openFuel =
    useCallback(
      () =>
        setSheet({
          kind: 'fuel',
        }),
      [],
    );

  const openImu =
    useCallback(
      () =>
        setSheet({
          kind: 'imu',
        }),
      [],
    );

  const openConnection =
    useCallback(
      () =>
        setSheet({
          kind: 'connection',
        }),
      [],
    );

  const openTire =
    useCallback(
      (pos: string) =>
        setSheet({
          kind: 'tire',
          pos:
            pos.toUpperCase() as TirePos,
        }),
      [],
    );

  const closeSheet =
    useCallback(
      () =>
        setSheet(null),
      [],
    );


  // ==========================================================
  // LAP
  // ==========================================================

  const lap =
    state?.lap ?? 1;

  const lapTimeSec =
    state?.lap_time_s ?? 0;

  const lapMins =
    Math.floor(
      lapTimeSec / 60
    );

  const lapSecs =
    (
      lapTimeSec % 60
    )
      .toFixed(1)
      .padStart(4, '0');

  const lapTimeStr =
    `${lapMins}:${lapSecs}`;


  // ==========================================================
  // SPEED / THROTTLE
  // ==========================================================

  const speedKmh =
    state
      ? state.speed * 3.6
      : NaN;

  const throttlePct =
    state
      ? Math.round(
          state.throttle * 100
        )
      : 0;


  // ==========================================================
  // BATTERY
  // ==========================================================

  const batPct =
    battery
      ? battery.percent
      : NaN;

  const batColor =
    battery
      ? HEALTH_COLOR[
          pctHealth(
            battery.percent
          )
        ]
      : '#4b5563';


  // ==========================================================
  // SPEED COLOR
  // ==========================================================

  const speedColor =
    '#f59e0b';


  // ==========================================================
  // FUEL
  // ==========================================================

  const etaLaps =
    fuel
      ? Math.floor(
          fuel.percent /
          FUEL_BURN_PER_LAP_PCT
        )
      : undefined;


  // ==========================================================
  // INFO MODAL BUILDERS
  // ==========================================================

  function buildSpeed(): InfoContent {

    return {

      title:
        'Speed & Throttle',

      value:
        `${speedKmh.toFixed(1)} km/h`,

      rows: [

        {
          label: 'Speed',
          value:
            `${speedKmh.toFixed(1)} km/h`,
          note:
            'Wheel odometry',
        },

        {
          label: 'Throttle',
          value:
            `${throttlePct}%`,
          note:
            'VESC command',
        },

        {
          label: 'Steering',
          value:
            state
              ? `${(
                  state.steering * 100
                ).toFixed(0)}%`
              : '—',
          note:
            'Left=negative, Right=positive',
        },

        {
          label: 'Mode',
          value:
            modeConfig.label,
        },

        {
          label: 'Lap',
          value:
            `${lap} / ${TOTAL_LAPS}`,
        },

        {
          label: 'Lap time',
          value:
            lapTimeStr,
        },

      ],

      description:
        'Speed is derived from wheel encoder ticks via the VESC motor controller. ' +
        'The JetRacer uses a Flipsky VESC to send PWM commands for throttle (0–1) and ' +
        'steering (−1 to +1). ' +
        'The driving mode is received directly from the JetRacer telemetry.',

      source:
        'VESC speed controller + wheel odometry',

    };
  }


  // ==========================================================
  // BATTERY INFO
  // ==========================================================

  function buildBattery(): InfoContent {

    return {

      title:
        'Battery',

      value:
        battery
          ? `${battery.percent.toFixed(0)}%`
          : '—',

      rows: [

        {
          label: 'Voltage',
          value:
            battery
              ? `${battery.voltage.toFixed(2)} V`
              : '—',
          note:
            'INA219 ADC (12-bit)',
        },

        {
          label: 'Current draw',
          value:
            battery
              ? `${battery.current_ma.toFixed(0)} mA`
              : '—',
          note:
            'INA219 shunt measurement',
        },

        {
          label: 'State of charge',
          value:
            battery
              ? `${battery.percent.toFixed(1)}%`
              : '—',
          note:
            '12.6V=100%, 10.5V=0%',
        },

        {
          label: 'ETA',
          value:
            battery
              ? `${Math.round(
                  battery.eta_s
                )}s`
              : '—',
        },

      ],

      description:
        'The JetRacer uses an INA219 I²C sensor to measure bus voltage and shunt current.',

      source:
        'INA219 I²C power monitor',

    };
  }


  // ==========================================================
  // FUEL INFO
  // ==========================================================

  function buildFuel(): InfoContent {

    return {

      title:
        'Energy Budget (Fuel)',

      value:
        fuel
          ? `${fuel.percent.toFixed(0)}%`
          : '—',

      rows: [

        {
          label: 'Remaining',
          value:
            fuel
              ? `${fuel.percent.toFixed(1)}%`
              : '—',
        },

        {
          label: 'ETA',
          value:
            fuel
              ? `${Math.round(
                  fuel.eta_s
                )}s`
              : '—',
        },

        {
          label: 'ETA (laps)',
          value:
            etaLaps !== undefined
              ? `~${etaLaps} laps`
              : '—',
        },

        {
          label: 'Burn rate',
          value:
            `~${FUEL_BURN_PER_LAP_PCT}% / lap`,
          note:
            'Assumed, at nominal speed',
        },

      ],

      description:
        '"Fuel" represents the logical energy budget tracked by the race software.',

      source:
        'Derived from telemetry',

    };
  }


  // ==========================================================
  // IMU INFO
  // ==========================================================

  function buildImu(): InfoContent {

    return {

      title:
        'IMU — MPU9250',

      value:
        imu
          ? `${Math.sqrt(
              imu.ax ** 2 +
              imu.ay ** 2
            ).toFixed(2)} G`
          : '—',

      rows: [

        {
          label: 'Lateral G (ax)',
          value:
            imu
              ? `${imu.ax.toFixed(3)} G`
              : '—',
          note:
            '+right / −left',
        },

        {
          label: 'Longitudinal G (ay)',
          value:
            imu
              ? `${imu.ay.toFixed(3)} G`
              : '—',
          note:
            '+accel / −brake',
        },

        {
          label: 'Vertical G (az)',
          value:
            imu
              ? `${imu.az.toFixed(3)} G`
              : '—',
          note:
            '≈1.0 on flat ground',
        },

        {
          label: 'Yaw rate (gz)',
          value:
            imu
              ? `${imu.gz.toFixed(1)} °/s`
              : '—',
        },

        {
          label: 'Roll rate (gx)',
          value:
            imu
              ? `${imu.gx.toFixed(1)} °/s`
              : '—',
        },

      ],

      description:
        'The JetRacer integrates an MPU9250 9-axis IMU.',

      source:
        'MPU9250 via I²C + EKF fusion',

    };
  }


  // ==========================================================
  // TIRE INFO
  // ==========================================================

  function buildTire(
    pos: TirePos
  ): InfoContent {

    const value =
      tires
        ? tires[
            pos.toLowerCase() as
              | 'fl'
              | 'fr'
              | 'rl'
              | 'rr'
          ]
        : 0;

    const h =
      tireHealth(value);

    const pct =
      Math.round(
        value * 100
      );

    return {

      title:
        `Tire — ${pos}`,

      value:
        `${pct}%`,

      rows: [

        {
          label: 'Health',
          value:
            `${pct}%`,
          note:
            h.toUpperCase(),
        },

        {
          label: 'Status',
          value:
            h === 'red'
              ? 'CRITICAL — pit now'
              : h === 'yellow'
                ? 'Warning'
                : 'Good',
        },

        {
          label: 'Pit threshold',
          value:
            `${TIRE_PIT_THRESHOLD * 100}%`,
          note:
            'Below this → pit_recommended',
        },

        {
          label: 'ETA',
          value:
            tires
              ? `${Math.round(
                  tires.eta_s
                )}s`
              : '—',
        },

      ],

      description:
        'Tire health is represented as a normalized value from 0 to 1.',

      source:
        'Estimated tire wear model',

    };
  }


  // ==========================================================
  // DIGITAL TWIN
  // ==========================================================

  function buildTwin(): InfoContent {

    return {

      title:
        'Digital Twin — Track Position',

      value:
        carPosition.pose.source === 'pose'
          ? 'Measured'
          : carPosition.pose.source === 'progress'
            ? 'Estimated'
            : 'Unknown',

      rows: [

        {
          label: 'Position source',
          value:
            carPosition.pose.source,
        },

        {
          label: 'Lap progress',
          value:
            carPosition.progress !== null
              ? `${(
                  carPosition.progress * 100
                ).toFixed(1)}%`
              : '—',
        },

        {
          label: 'Field position',
          value:
            carPosition.pose.source !== 'none'
              ? `x ${carPosition.pose.x.toFixed(0)} cm · y ${carPosition.pose.y.toFixed(0)} cm`
              : '—',
        },

        {
          label: 'Expected lap',
          value:
            `${carPosition.expectedLapTimeS.toFixed(1)}s`,
        },

        {
          label: 'Track length',
          value:
            `${(
              TRACK_LENGTH_CM / 100
            ).toFixed(2)} m`,
        },

        {
          label: 'In pit',
          value:
            carPosition.inPit
              ? 'Yes'
              : 'No',
        },

      ],

      description:
        'The car marker is placed using lap progress and extracted track geometry.',

      source:
        'Lap progress × extracted track geometry',

    };
  }


  // ==========================================================
  // CONNECTION INFO
  // ==========================================================

  function buildConnection(): InfoContent {

    return {

      title:
        'MQTT Connection',

      value:
        status,

      rows: [

        {
          label: 'Broker',
          value:
            config.brokerUrl,
        },

        {
          label: 'Status',
          value:
            status,
        },

        {
          label: 'Protocol',
          value:
            'MQTT over WebSocket',
        },

        {
          label: 'Topics',
          value:
            '7 active',
          note:
            'QoS 0 telemetry + QoS 1 events',
        },

        {
          label: 'Reconnect',
          value:
            `${config.reconnectMs}ms`,
        },

        {
          label: 'Stale feeds',
          value:
            staleSuffixes.length
              ? staleSuffixes.join(', ')
              : 'none',
          note:
            `No message for >${STALE_MS / 1000}s`,
        },

        {
          label: 'Dropped payloads',
          value:
            droppedTotal === 0
              ? '0'
              : String(droppedTotal),
        },

      ],

      description:
        'The app connects to the Mosquitto broker via MQTT over WebSocket.',

      source:
        'Eclipse Mosquitto v2 broker',

    };
  }


  // ==========================================================
  // SHEET BUILDER
  // ==========================================================

  function buildSheet(
    k: Sheet
  ): InfoContent {

    switch (k.kind) {

      case 'speed':
        return buildSpeed();

      case 'battery':
        return buildBattery();

      case 'fuel':
        return buildFuel();

      case 'imu':
        return buildImu();

      case 'twin':
        return buildTwin();

      case 'connection':
        return buildConnection();

      case 'tire':
        return buildTire(k.pos);

    }
  }


  const modal =
    sheet === null
      ? null
      : buildSheet(sheet);


  // ==========================================================
  // RENDER
  // ==========================================================

  return (

    <View style={styles.screen}>

      {/* ======================================================
          HEADER
          ====================================================== */}

      <Pressable
        style={styles.header}
        onPress={openConnection}
      >

        <View>

          <Text style={styles.lapLabel}>
            lap
          </Text>

          <Text style={styles.lapValue}>

            {lap}

            <Text style={styles.lapTotal}>
              {' '}
              / {TOTAL_LAPS}
            </Text>

          </Text>

        </View>


        <Text
          style={[
            styles.lapTime,
            staleState &&
              styles.staleText,
          ]}
        >

          {staleState
            ? '--:--.--'
            : lapTimeStr}

        </Text>


        <View style={styles.liveBadge}>

          <View
            style={[
              styles.liveDot,
              {
                backgroundColor:
                  STATUS_COLOR[status],
              },
            ]}
          />

          <Text
            style={[
              styles.liveLabel,
              {
                color:
                  STATUS_COLOR[status],
              },
            ]}
          >

            {status === 'connected'
              ? 'live'
              : status}

          </Text>

          <Text style={styles.settingsIcon}>
            ⚙
          </Text>

        </View>

      </Pressable>


      {/* ======================================================
          MAIN SCROLL
          ====================================================== */}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
      >


        {/* ====================================================
            DIGITAL TWIN
            ==================================================== */}

        <View style={styles.mapRow}>

          <TrackMap
            pose={carPosition.pose}
            inPit={carPosition.inPit}
            stale={stale.pose}
            height={300}
            onPress={openTwin}
          />


          <View style={styles.mapSide}>


            {/* SPEED */}

            <Pressable
              style={styles.miniTile}
              onPress={openSpeed}
            >

              <Text style={styles.miniLabel}>
                SPEED
              </Text>

              <Text style={styles.miniValue}>

                {state
                  ? speedKmh.toFixed(0)
                  : '—'}

                <Text
                  style={styles.miniUnit}
                >
                  {' '}km/h
                </Text>

              </Text>

            </Pressable>


            {/* BATTERY */}

            <Pressable
              style={styles.miniTile}
              onPress={openBattery}
            >

              <Text style={styles.miniLabel}>
                BATTERY
              </Text>

              <Text
                style={[
                  styles.miniValue,
                  {
                    color:
                      staleBattery
                        ? '#4b5563'
                        : batColor,
                  },
                ]}
              >

                {battery &&
                !staleBattery
                  ? `${battery.percent.toFixed(0)}%`
                  : '—'}

              </Text>

            </Pressable>


            {/* FUEL */}

            <Pressable
              style={styles.miniTile}
              onPress={openFuel}
            >

              <Text style={styles.miniLabel}>
                FUEL
              </Text>

              <Text
                style={[
                  styles.miniValue,
                  {
                    color:
                      fuel &&
                      !staleFuel
                        ? HEALTH_COLOR[
                            pctHealth(
                              fuel.percent
                            )
                          ]
                        : '#4b5563',
                  },
                ]}
              >

                {fuel &&
                !staleFuel
                  ? `${fuel.percent.toFixed(0)}%`
                  : '—'}

              </Text>

            </Pressable>


            {/* =================================================
                MODE
                ================================================= */}

            <View
              style={[
                styles.miniTile,
                {
                  borderLeftWidth: 3,
                  borderLeftColor:
                    modeConfig.color,
                },
              ]}
            >

              <Text style={styles.miniLabel}>
                MODE
              </Text>

              <Text
                style={[
                  styles.miniValue,
                  {
                    color:
                      modeConfig.color,
                  },
                ]}
              >

                {modeConfig.label}

              </Text>

            </View>


            {/* =================================================
                RAIN
                ================================================= */}

            <Pressable
              style={[
                styles.rainButton,
                rainOn &&
                  styles.rainButtonOn,
              ]}
              onPress={toggleRain}
            >

              <Text style={styles.rainLabel}>
                RAIN
              </Text>

              <Text
                style={[
                  styles.rainValue,
                  rainOn &&
                    styles.rainValueOn,
                ]}
              >

                {rainOn
                  ? 'ON'
                  : 'OFF'}

              </Text>

            </Pressable>


            {/* TIRES */}

            <View style={styles.chipGrid}>

              {(
                [
                  'fl',
                  'fr',
                  'rl',
                  'rr',
                ] as const
              ).map(pos => {

                const v =
                  tires?.[pos];

                const c =
                  v !== undefined
                    ? HEALTH_COLOR[
                        tireHealth(v)
                      ]
                    : '#4b5563';


                return (

                  <Pressable
                    key={pos}
                    style={[
                      styles.chip,
                      {
                        borderColor: c,
                      },
                    ]}
                    onPress={() =>
                      v !== undefined &&
                      openTire(pos)
                    }
                  >

                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: c,
                        },
                      ]}
                    >

                      {pos.toUpperCase()}{' '}

                      {v !== undefined
                        ? `${Math.round(
                            v * 100
                          )}%`
                        : '—'}

                    </Text>

                  </Pressable>

                );
              })}

            </View>

          </View>

        </View>


        {/* ====================================================
            LAP HISTORY
            ==================================================== */}

        <View
          style={styles.lapHistoryRow}
        >

          <LapHistory
            currentLap={lap}
            totalLaps={TOTAL_LAPS}
          />

          <Text
            style={
              styles.lapHistoryLabel
            }
          >
            lap history
          </Text>

        </View>


        {/* ====================================================
            GAUGES
            ==================================================== */}

        <View style={styles.gaugesRow}>

          <ArcGauge
            value={speedKmh}
            max={SPEED_GAUGE_MAX_KMH}
            label="SPEED"
            unit="km/h"
            color={speedColor}
            size={120}
            onPress={openSpeed}
          />

          <ArcGauge
            value={batPct}
            max={100}
            stale={staleBattery}
            label="BATTERY"
            unit="%"
            subText={
              battery
                ? `${battery.voltage.toFixed(1)}V · ${battery.current_ma.toFixed(0)}mA`
                : undefined
            }
            color={batColor}
            size={120}
            onPress={openBattery}
          />

        </View>


        {/* ====================================================
            TIRES
            ==================================================== */}

        <View style={styles.card}>

          <View
            style={styles.cardHeader}
          >

            <Text
              style={styles.cardLabel}
            >
              TIRES
            </Text>

            {staleTires && (

              <Text
                style={styles.staleTag}
              >
                stale
              </Text>

            )}

          </View>


          <CarTireLayout
            tires={tires}
            stale={staleTires}
            onTirePress={openTire}
          />

        </View>


        {/* ====================================================
            FUEL + G FORCE
            ==================================================== */}

        <View
          style={[
            styles.card,
            styles.rowCard,
          ]}
        >

          <View
            style={{ flex: 1.6 }}
          >

            <Pressable
              onPress={openFuel}
            >

              <FuelBar
                percent={
                  fuel?.percent ?? null
                }
                etaLaps={etaLaps}
                stale={staleFuel}
              />

            </Pressable>

          </View>


          <View
            style={styles.dividerV}
          />


          <View
            style={{
              flex: 1,
              paddingVertical: 10,
            }}
          >

            <GForceWidget
              imu={imu}
              stale={staleImu}
              onPress={openImu}
            />

          </View>

        </View>


        {/* ====================================================
            STRATEGY
            ==================================================== */}

        {(strategy ||
          tires ||
          fuel) && (

          <View style={styles.card}>

            <StrategyPredictor
              strategy={strategy}
              tires={tires}
              fuel={fuel}
              currentLap={lap}
              totalLaps={TOTAL_LAPS}
            />

          </View>

        )}


        {/* ====================================================
            PIT BANNER
            ==================================================== */}

        <PitBanner
          strategy={strategy}
        />


        <View
          style={{ height: 16 }}
        />

      </ScrollView>


      {/* ======================================================
          STATUS TICKER
          ====================================================== */}

      <StatusTicker
        events={recentEvents}
        tires={
          tires
            ? {
                fl: tires.fl,
                fr: tires.fr,
                rl: tires.rl,
                rr: tires.rr,
              }
            : null
        }
      />


      {/* ======================================================
          INFO MODAL
          ====================================================== */}

      <InfoModal
        visible={
          modal !== null
        }
        info={modal}
        onClose={closeSheet}
      />

    </View>

  );
}


// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({

  screen: {
    flex: 1,
    backgroundColor: '#0E1116',
  },


  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2128',
  },


  lapLabel: {
    fontSize: 10,
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },


  lapValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f9fafb',
  },


  lapTotal: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '400',
  },


  lapTime: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f59e0b',
    letterSpacing: 1,
  },


  staleText: {
    color: '#4b5563',
  },


  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },


  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },


  liveLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },


  settingsIcon: {
    fontSize: 13,
    color: '#4b5563',
    marginLeft: 4,
  },


  scroll: {
    flex: 1,
  },


  content: {
    paddingTop: 8,
  },


  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },


  mapSide: {
    flex: 1,
    gap: 6,
  },


  miniTile: {
    backgroundColor: '#161b22',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },


  miniLabel: {
    fontSize: 8,
    color: '#6b7280',
    letterSpacing: 1.2,
  },


  miniValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9fafb',
  },


  miniUnit: {
    fontSize: 9,
    color: '#6b7280',
    fontWeight: '400',
  },


  // ==========================================================
  // RAIN BUTTON
  // ==========================================================

  rainButton: {
    backgroundColor: '#161b22',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderLeftWidth: 3,
    borderLeftColor: '#4b5563',
  },


  rainButtonOn: {
    borderLeftColor: '#38bdf8',
    backgroundColor: '#12212b',
  },


  rainLabel: {
    fontSize: 8,
    color: '#6b7280',
    letterSpacing: 1.2,
  },


  rainValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9ca3af',
  },


  rainValueOn: {
    color: '#38bdf8',
  },


  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
  },


  chip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 4,
    width: '47%',
    alignItems: 'center',
  },


  chipText: {
    fontSize: 9,
    fontWeight: '700',
  },


  lapHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 4,
  },


  lapHistoryLabel: {
    fontSize: 10,
    color: '#4b5563',
  },


  gaugesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },


  card: {
    borderTopWidth: 1,
    borderTopColor: '#1e2128',
  },


  rowCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },


  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },


  cardLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },


  staleTag: {
    fontSize: 10,
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },


  dividerV: {
    width: 1,
    backgroundColor: '#1e2128',
    marginVertical: 8,
  },

});