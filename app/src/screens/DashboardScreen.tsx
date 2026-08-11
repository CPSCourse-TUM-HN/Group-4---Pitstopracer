import React, { useState } from 'react';
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
import { useTelemetry } from '../mqtt/useTelemetry';
import { useCarPosition } from '../track/useCarPosition';
import { TRACK_LENGTH_CM } from '../track/monza.generated';
import { config } from '../config';
import { pctHealth, HEALTH_COLOR, tireHealth } from '../types';

const STALE_MS    = 5_000;
const TOTAL_LAPS  = 10;

function isStale(lastUpdateMs: Record<string, number>, suffix: string): boolean {
  const t = lastUpdateMs[`${config.topicPrefix}/${suffix}`];
  if (t === undefined) return false;
  return Date.now() - t > STALE_MS;
}

const STATUS_COLOR = {
  connected:    '#22c55e',
  connecting:   '#f59e0b',
  reconnecting: '#f59e0b',
  disconnected: '#ef4444',
  error:        '#ef4444',
} as const;

export default function DashboardScreen() {
  const { status, lastUpdateMs, state, battery, fuel, tires, strategy, recentEvents, imu } =
    useTelemetry();

  const car = useCarPosition(state, recentEvents);

  const staleState   = isStale(lastUpdateMs, 'state');
  const staleBattery = isStale(lastUpdateMs, 'battery');
  const staleFuel    = isStale(lastUpdateMs, 'fuel');
  const staleTires   = isStale(lastUpdateMs, 'tires');
  const staleImu     = isStale(lastUpdateMs, 'imu');

  const [modal, setModal] = useState<InfoContent | null>(null);

  const lap        = state?.lap ?? 1;
  const lapTimeSec = state?.lap_time_s ?? 0;
  const lapMins    = Math.floor(lapTimeSec / 60);
  const lapSecs    = (lapTimeSec % 60).toFixed(1).padStart(4, '0');
  const lapTimeStr = `${lapMins}:${lapSecs}`;

  const speedKmh  = state ? state.speed * 3.6 : 0;
  const throttlePct = state ? Math.round(state.throttle * 100) : 0;
  const batPct    = battery?.percent ?? 0;
  const batColor  = HEALTH_COLOR[pctHealth(batPct)];
  const speedColor = '#f59e0b';
  const etaLaps   = fuel ? Math.floor(fuel.percent / 10) : undefined;

  // ── Info modal builders ────────────────────────────────────────────────────

  function openSpeed() {
    setModal({
      title: 'Speed & Throttle',
      value: `${speedKmh.toFixed(1)} km/h`,
      rows: [
        { label: 'Speed',         value: `${speedKmh.toFixed(1)} km/h`, note: 'Wheel odometry' },
        { label: 'Throttle',      value: `${throttlePct}%`,             note: 'VESC command' },
        { label: 'Steering',      value: state ? `${(state.steering * 100).toFixed(0)}%` : '—',
          note: 'Left=negative, Right=positive' },
        { label: 'Lap',           value: `${lap} / ${TOTAL_LAPS}` },
        { label: 'Lap time',      value: lapTimeStr },
      ],
      description:
        'Speed is derived from wheel encoder ticks via the VESC motor controller. ' +
        'The JetRacer uses a Flipsky VESC to send PWM commands for throttle (0–1) and ' +
        'steering (−1 to +1). Max speed at full throttle ≈ 4 m/s (14.4 km/h) on flat ground.',
      source: 'VESC speed controller + wheel odometry',
    });
  }

  function openBattery() {
    setModal({
      title: 'Battery',
      value: battery ? `${battery.percent.toFixed(0)}%` : '—',
      rows: [
        { label: 'Voltage',      value: battery ? `${battery.voltage.toFixed(2)} V` : '—',
          note: 'INA219 ADC (12-bit)' },
        { label: 'Current draw', value: battery ? `${battery.current_ma.toFixed(0)} mA` : '—',
          note: 'INA219 shunt measurement' },
        { label: 'State of charge', value: battery ? `${battery.percent.toFixed(1)}%` : '—',
          note: '12.6V=100%, 10.5V=0%' },
        { label: 'ETA',          value: battery ? `${Math.round(battery.eta_s)}s` : '—' },
      ],
      description:
        'The JetRacer uses an INA219 I²C sensor to measure bus voltage and shunt current. ' +
        'Nominal pack: 3S LiPo, 11.1V nominal, 12.6V full, 10.5V cutoff. ' +
        'High current draw (>3000 mA) during hard acceleration. ' +
        'Voltage drops ~0.3V per lap at race speed.',
      source: 'INA219 I²C power monitor',
    });
  }

  function openFuel() {
    setModal({
      title: 'Energy Budget (Fuel)',
      value: fuel ? `${fuel.percent.toFixed(0)}%` : '—',
      rows: [
        { label: 'Remaining',    value: fuel ? `${fuel.percent.toFixed(1)}%` : '—' },
        { label: 'ETA',          value: fuel ? `${Math.round(fuel.eta_s)}s` : '—' },
        { label: 'ETA (laps)',   value: etaLaps !== undefined ? `~${etaLaps} laps` : '—' },
        { label: 'Burn rate',    value: '~10% / lap', note: 'At nominal speed' },
      ],
      description:
        '"Fuel" represents the logical energy budget — a software-tracked metric that ' +
        'combines battery state-of-charge with estimated heat/wear budget. ' +
        'In a real CPS this would fuse INA219 current-integral with thermal model outputs. ' +
        'Pit strategy triggers when fuel < 15% to guarantee enough energy for a safe return.',
      source: 'Derived from INA219 current integral',
    });
  }

  function openImu() {
    setModal({
      title: 'IMU — MPU9250',
      value: imu ? `${Math.sqrt(imu.ax ** 2 + imu.ay ** 2).toFixed(2)} G` : '—',
      rows: [
        { label: 'Lateral G (ax)',      value: imu ? `${imu.ax.toFixed(3)} G` : '—',
          note: '+right / −left' },
        { label: 'Longitudinal G (ay)', value: imu ? `${imu.ay.toFixed(3)} G` : '—',
          note: '+accel / −brake' },
        { label: 'Vertical G (az)',     value: imu ? `${imu.az.toFixed(3)} G` : '—',
          note: '≈1.0 on flat ground' },
        { label: 'Yaw rate (gz)',       value: imu ? `${imu.gz.toFixed(1)} °/s` : '—' },
        { label: 'Roll rate (gx)',      value: imu ? `${imu.gx.toFixed(1)} °/s` : '—' },
      ],
      description:
        'The JetRacer integrates an MPU9250 9-axis IMU (3-axis accel + 3-axis gyro + ' +
        '3-axis magnetometer). An extended Kalman filter fuses IMU data with wheel odometry ' +
        'for higher-precision pose estimation. The dot on the G-force plot shows ' +
        'lateral vs longitudinal load — centre = straight, right = right-hand corner.',
      source: 'MPU9250 via I²C + EKF fusion',
    });
  }

  function openTire(pos: string, value: number) {
    const h = tireHealth(value);
    const pct = Math.round(value * 100);
    const wearDesc: Record<string, string> = {
      FL: 'Front-left wears fastest on a right-handed track — it takes the brunt of every left-to-right weight transfer during cornering.',
      FR: 'Front-right is the second-most stressed tire. It handles most of the braking load and moderate cornering.',
      RL: 'Rear-left is the rear drive tire on the inside of most corners — moderate wear from drive torque.',
      RR: 'Rear-right drive tire. Wears from longitudinal traction load. Often the limiting tire on oval tracks.',
    };
    setModal({
      title: `Tire — ${pos}`,
      value: `${pct}%`,
      rows: [
        { label: 'Health',         value: `${pct}%`,                   note: h.toUpperCase() },
        { label: 'Status',         value: h === 'red' ? 'CRITICAL — pit now' : h === 'yellow' ? 'Warning' : 'Good' },
        { label: 'Pit threshold',  value: '25%',                       note: 'Below this → pit_recommended' },
        { label: 'ETA',            value: tires ? `${Math.round(tires.eta_s)}s` : '—' },
      ],
      description:
        (wearDesc[pos] ?? '') +
        '\n\nTire wear is modelled as a linear function of distance travelled and lateral load. ' +
        'On the real JetRacer, wear could be inferred from grip loss (understeer detected via IMU ' +
        'vs commanded steering delta). Thresholds: green ≥60%, yellow 30–59%, red <30%.',
      source: 'Estimated from lap model + IMU lateral G',
    });
  }

  function openTwin() {
    setModal({
      title: 'Digital Twin — Track Position',
      value: car.pose.source === 'pose' ? 'Measured' : car.pose.source === 'progress' ? 'Estimated' : 'Unknown',
      rows: [
        { label: 'Position source', value: car.pose.source,
          note: car.pose.source === 'progress' ? 'Derived from lap progress' : undefined },
        { label: 'Lap progress',  value: car.progress !== null ? `${(car.progress * 100).toFixed(1)}%` : '—' },
        { label: 'Field position', value: car.pose.source !== 'none'
            ? `x ${car.pose.x.toFixed(0)} cm · y ${car.pose.y.toFixed(0)} cm` : '—' },
        { label: 'Expected lap',  value: `${car.expectedLapTimeS.toFixed(1)}s`,
          note: car.lapTimeMeasured ? 'Median of last 3 laps' : 'Seed value — no lap completed yet' },
        { label: 'Track length',  value: `${(TRACK_LENGTH_CM / 100).toFixed(2)} m`,
          note: 'Measured from the foam blueprint' },
        { label: 'In pit',        value: car.inPit ? 'Yes' : 'No',
          note: car.pitAssumedComplete ? 'Last visit ended by watchdog' : undefined },
      ],
      description:
        'The car marker is placed by projecting lap progress onto the racing line extracted ' +
        'from the physical Monza foam blueprint (22.01 m centreline, 72 cm lane). ' +
        'Position is therefore an ESTIMATE, not a measurement: it assumes constant speed around ' +
        'the lap, so the marker runs slightly ahead in slow corners and behind on the straight. ' +
        'If the perception pipeline ever publishes a pose topic, it takes priority automatically ' +
        'and this readout switches to "measured".',
      source: 'Lap progress × extracted track geometry',
    });
  }

  function openConnection() {
    setModal({
      title: 'MQTT Connection',
      value: status,
      rows: [
        { label: 'Broker',    value: config.brokerUrl },
        { label: 'Status',    value: status },
        { label: 'Protocol',  value: 'MQTT over WebSocket' },
        { label: 'Topics',    value: '7 active', note: 'QoS 0 telemetry + QoS 1 events' },
        { label: 'Reconnect', value: `${config.reconnectMs}ms` },
      ],
      description:
        'The app connects to the Mosquitto broker via MQTT over WebSocket (port 9001). ' +
        'The JetRacer publishes directly via TCP (port 1883). ' +
        'QoS 0 is used for high-rate telemetry (20 Hz state, 2 Hz sensors) to minimise latency. ' +
        'QoS 1 is used for strategy and event messages to guarantee delivery.',
      source: 'Eclipse Mosquitto v2 broker',
    });
  }

  return (
    <View style={styles.screen}>

      {/* ── HEADER ── */}
      <Pressable style={styles.header} onPress={openConnection}>
        <View>
          <Text style={styles.lapLabel}>lap</Text>
          <Text style={styles.lapValue}>
            {lap} <Text style={styles.lapTotal}>/ {TOTAL_LAPS}</Text>
          </Text>
        </View>

        <Text style={[styles.lapTime, staleState && styles.staleText]}>
          {staleState ? '--:--.--' : lapTimeStr}
        </Text>

        <View style={styles.liveBadge}>
          <View style={[styles.liveDot, { backgroundColor: STATUS_COLOR[status] }]} />
          <Text style={[styles.liveLabel, { color: STATUS_COLOR[status] }]}>
            {status === 'connected' ? 'live' : status}
          </Text>
          <Text style={styles.settingsIcon}>⚙</Text>
        </View>
      </Pressable>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── DIGITAL TWIN ── */}
        <View style={styles.mapRow}>
          <TrackMap
            pose={car.pose}
            inPit={car.inPit}
            stale={staleState}
            height={300}
            onPress={openTwin}
          />
          <View style={styles.mapSide}>
            <Pressable style={styles.miniTile} onPress={openSpeed}>
              <Text style={styles.miniLabel}>SPEED</Text>
              <Text style={styles.miniValue}>
                {speedKmh.toFixed(0)}<Text style={styles.miniUnit}> km/h</Text>
              </Text>
            </Pressable>

            <Pressable style={styles.miniTile} onPress={openBattery}>
              <Text style={styles.miniLabel}>BATTERY</Text>
              <Text style={[styles.miniValue, { color: batColor }]}>
                {battery ? `${batPct.toFixed(0)}%` : '—'}
              </Text>
            </Pressable>

            <Pressable style={styles.miniTile} onPress={openFuel}>
              <Text style={styles.miniLabel}>FUEL</Text>
              <Text style={[styles.miniValue, { color: HEALTH_COLOR[pctHealth(fuel?.percent ?? 0)] }]}>
                {fuel ? `${fuel.percent.toFixed(0)}%` : '—'}
              </Text>
            </Pressable>

            <View style={styles.chipGrid}>
              {(['fl', 'fr', 'rl', 'rr'] as const).map(pos => {
                const v = tires?.[pos];
                const c = v !== undefined ? HEALTH_COLOR[tireHealth(v)] : '#4b5563';
                return (
                  <Pressable
                    key={pos}
                    style={[styles.chip, { borderColor: c }]}
                    onPress={() => v !== undefined && openTire(pos.toUpperCase(), v)}
                  >
                    <Text style={[styles.chipText, { color: c }]}>
                      {pos.toUpperCase()} {v !== undefined ? `${Math.round(v * 100)}%` : '—'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Lap history */}
        <View style={styles.lapHistoryRow}>
          <LapHistory currentLap={lap} totalLaps={TOTAL_LAPS} />
          <Text style={styles.lapHistoryLabel}>lap history</Text>
        </View>

        {/* ── GAUGES + G-FORCE ── */}
        <View style={styles.gaugesRow}>
          <ArcGauge
            value={speedKmh}
            max={20}
            label="SPEED"
            unit="km/h"
            color={speedColor}
            size={120}
            onPress={openSpeed}
          />
          <ArcGauge
            value={batPct}
            max={100}
            label="BATTERY"
            unit="%"
            subText={battery ? `${battery.voltage.toFixed(1)}V · ${battery.current_ma.toFixed(0)}mA` : undefined}
            color={batColor}
            size={120}
            onPress={openBattery}
          />
        </View>

        {/* ── TIRES ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>TIRES</Text>
            {staleTires && <Text style={styles.staleTag}>stale</Text>}
          </View>
          <CarTireLayout tires={tires} stale={staleTires} onTirePress={openTire} />
        </View>

        {/* ── FUEL + G-FORCE side by side ── */}
        <View style={[styles.card, styles.rowCard]}>
          <View style={{ flex: 1.6 }}>
            <Pressable onPress={openFuel}>
              <FuelBar percent={fuel?.percent ?? null} etaLaps={etaLaps} stale={staleFuel} />
            </Pressable>
          </View>
          <View style={styles.dividerV} />
          <View style={{ flex: 1, paddingVertical: 10 }}>
            <GForceWidget imu={imu} stale={staleImu} onPress={openImu} />
          </View>
        </View>

        {/* ── STRATEGY PREDICTOR ── */}
        {(strategy || tires || fuel) && (
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

        {/* ── PIT BANNER ── */}
        <PitBanner strategy={strategy} />

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── STATUS TICKER ── */}
      <StatusTicker
        events={recentEvents}
        tires={tires ? { fl: tires.fl, fr: tires.fr, rl: tires.rl, rr: tires.rr } : null}
      />

      {/* ── INFO MODAL ── */}
      <InfoModal visible={modal !== null} info={modal} onClose={() => setModal(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E1116' },
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
  lapLabel: { fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1 },
  lapValue: { fontSize: 20, fontWeight: '700', color: '#f9fafb' },
  lapTotal: { fontSize: 14, color: '#6b7280', fontWeight: '400' },
  lapTime: { fontSize: 28, fontWeight: '700', color: '#f59e0b', letterSpacing: 1 },
  staleText: { color: '#4b5563' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  settingsIcon: { fontSize: 13, color: '#4b5563', marginLeft: 4 },
  scroll: { flex: 1 },
  content: { paddingTop: 8 },
  mapRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  mapSide: { flex: 1, gap: 6 },
  miniTile: { backgroundColor: '#161b22', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 9 },
  miniLabel: { fontSize: 8, color: '#6b7280', letterSpacing: 1.2 },
  miniValue: { fontSize: 18, fontWeight: '700', color: '#f9fafb' },
  miniUnit: { fontSize: 9, color: '#6b7280', fontWeight: '400' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  chip: { borderWidth: 1, borderRadius: 4, paddingVertical: 4, width: '47%', alignItems: 'center' },
  chipText: { fontSize: 9, fontWeight: '700' },
  lapHistoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, marginBottom: 4,
  },
  lapHistoryLabel: { fontSize: 10, color: '#4b5563' },
  gaugesRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingHorizontal: 8, paddingVertical: 8,
  },
  card: { borderTopWidth: 1, borderTopColor: '#1e2128' },
  rowCard: { flexDirection: 'row', alignItems: 'stretch' },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 10,
  },
  cardLabel: {
    fontSize: 11, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  staleTag: { fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: 1 },
  dividerV: { width: 1, backgroundColor: '#1e2128', marginVertical: 10 },
});
