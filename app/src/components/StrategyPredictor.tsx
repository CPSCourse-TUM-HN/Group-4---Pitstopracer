import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StrategyMsg, TiresMsg, FuelMsg } from '../types';

interface Props {
  strategy: StrategyMsg | null;
  tires: TiresMsg | null;
  fuel: FuelMsg | null;
  currentLap: number;
  totalLaps?: number;
}

export default function StrategyPredictor({ strategy, tires, fuel, currentLap, totalLaps = 10 }: Props) {
  // Predict laps until pit needed
  const worstTire = tires ? Math.min(tires.fl, tires.fr, tires.rl, tires.rr) : null;
  const fuelPct   = fuel?.percent ?? null;

  // Rough prediction: how many laps until threshold
  // Each lap wears FL by ~12%, fuel by ~10%
  let lapsUntilTire = worstTire !== null
    ? Math.max(0, Math.floor((worstTire - 0.25) / 0.10))
    : null;
  let lapsUntilFuel = fuelPct !== null
    ? Math.max(0, Math.floor((fuelPct - 15) / 10))
    : null;

  const pitLap = strategy?.target_lap ?? null;
  const lapsAway = pitLap ? pitLap - currentLap : null;
  const reason  = strategy?.reason ?? '';

  const isPitNow = strategy?.pit_recommended;

  if (!isPitNow && lapsAway === null && lapsUntilTire === null) return null;

  const displayLaps = lapsAway ?? (lapsUntilTire !== null && lapsUntilFuel !== null
    ? Math.min(lapsUntilTire, lapsUntilFuel)
    : lapsUntilTire ?? lapsUntilFuel ?? 0);

  const urgentColor = isPitNow ? '#ef4444' : displayLaps <= 2 ? '#f59e0b' : '#22c55e';

  // Timeline: show lap markers
  const markers = [1, Math.floor(totalLaps / 4), Math.floor(totalLaps / 2), totalLaps];

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.label}>PIT IN </Text>
        <Text style={[styles.lapsNum, { color: urgentColor }]}>{displayLaps}</Text>
        <Text style={styles.label}> laps</Text>
        {reason ? (
          <Text style={styles.reason}> ({reason.replace(/_/g, ' ')})</Text>
        ) : null}
      </View>

      {/* Timeline */}
      <View style={styles.timeline}>
        <View style={styles.track} />
        {/* current position */}
        <View style={[styles.marker, styles.markerNow, {
          left: `${((currentLap - 1) / (totalLaps - 1)) * 100}%` as `${number}%`,
        }]} />
        {/* pit marker. Ternary, not &&: target_lap is 0 when no pit is
            scheduled, and {0 && ...} renders a bare 0 that React Native
            rejects with "Text strings must be rendered within a <Text>". */}
        {pitLap ? (
          <View style={[styles.marker, styles.markerPit, {
            left: `${((pitLap - 1) / (totalLaps - 1)) * 100}%` as `${number}%`,
          }]} />
        ) : null}
      </View>
      <View style={styles.timelineLaps}>
        <Text style={styles.lapMark}>L1</Text>
        <Text style={styles.lapMark}>L{Math.floor(totalLaps / 2)} ~now</Text>
        {pitLap ? <Text style={[styles.lapMark, { color: urgentColor }]}>L{pitLap} ⚑pit</Text> : null}
        <Text style={styles.lapMark}>L{totalLaps}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e2128',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: '#9ca3af',
  },
  lapsNum: {
    fontSize: 22,
    fontWeight: '800',
  },
  reason: {
    fontSize: 12,
    color: '#6b7280',
    marginLeft: 2,
  },
  timeline: {
    height: 4,
    backgroundColor: '#1e2128',
    borderRadius: 2,
    marginBottom: 4,
    position: 'relative',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#2a2d35',
    borderRadius: 2,
  },
  marker: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
    top: -3,
  },
  markerNow: {
    backgroundColor: '#f59e0b',
  },
  markerPit: {
    backgroundColor: '#ef4444',
  },
  timelineLaps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  lapMark: {
    fontSize: 10,
    color: '#4b5563',
  },
});
