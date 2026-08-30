import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StrategyMsg, TiresMsg, FuelMsg } from '../types';
import {
  FUEL_BURN_PER_LAP_PCT, FUEL_PIT_THRESHOLD_PCT, lapsRemaining,
  TIRE_PIT_THRESHOLD, TIRE_WEAR_PER_LAP, TOTAL_LAPS,
} from '../raceConfig';

interface Props {
  strategy: StrategyMsg | null;
  tires: TiresMsg | null;
  fuel: FuelMsg | null;
  currentLap: number;
  totalLaps?: number;
}

/** Fraction along the timeline for a lap, clamped so a marker cannot escape it. */
export function lapToPercent(lap: number, totalLaps: number): number {
  // A one-lap race has no span to place anything along; put everything at the start.
  if (totalLaps <= 1) return 0;
  const t = (lap - 1) / (totalLaps - 1);
  return Math.min(100, Math.max(0, t * 100));
}

function StrategyPredictor({
  strategy, tires, fuel, currentLap, totalLaps = TOTAL_LAPS,
}: Props) {
  const worstTire = tires ? Math.min(tires.fl, tires.fr, tires.rl, tires.rr) : null;
  const fuelPct   = fuel?.percent ?? null;

  // Consumption rates and thresholds live in raceConfig, where they are marked
  // as the provisional assumptions they are.
  const lapsUntilTire = lapsRemaining(worstTire, TIRE_PIT_THRESHOLD, TIRE_WEAR_PER_LAP);
  const lapsUntilFuel = lapsRemaining(fuelPct, FUEL_PIT_THRESHOLD_PCT, FUEL_BURN_PER_LAP_PCT);

  const pitLap = strategy?.target_lap ?? null;
  const lapsAway = pitLap ? pitLap - currentLap : null;

  // `race_complete` arrives with pit_recommended false and target_lap 0. It
  // explains why there is no longer a pit plan, so rendering it in the pit
  // reason slot produced "PIT IN 6 laps (race complete)".
  const rawReason = strategy?.reason ?? '';
  const raceOver = rawReason === 'race_complete';
  const reason = raceOver ? '' : rawReason;

  const isPitNow = strategy?.pit_recommended;

  if (raceOver) {
    return (
      <View style={styles.wrapper}>
        <View style={styles.header}>
          <Text style={styles.label}>RACE COMPLETE</Text>
        </View>
      </View>
    );
  }

  if (!isPitNow && lapsAway === null && lapsUntilTire === null) return null;

  const displayLaps = lapsAway ?? (lapsUntilTire !== null && lapsUntilFuel !== null
    ? Math.min(lapsUntilTire, lapsUntilFuel)
    : lapsUntilTire ?? lapsUntilFuel ?? 0);

  const urgentColor = isPitNow ? '#ef4444' : displayLaps <= 2 ? '#f59e0b' : '#22c55e';

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
          left: `${lapToPercent(currentLap, totalLaps)}%` as `${number}%`,
        }]} />
        {/* pit marker. Ternary, not &&: target_lap is 0 when no pit is
            scheduled, and {0 && ...} renders a bare 0 that React Native
            rejects with "Text strings must be rendered within a <Text>". */}
        {pitLap ? (
          <View style={[styles.marker, styles.markerPit, {
            left: `${lapToPercent(pitLap, totalLaps)}%` as `${number}%`,
          }]} />
        ) : null}
      </View>
      <View style={styles.timelineLaps}>
        <Text style={styles.lapMark}>L1</Text>
        {/* The "now" label tracks the actual lap. It used to read
            L{totalLaps / 2}, so it announced "L5 ~now" for the whole race
            regardless of where the car was. */}
        <Text style={styles.lapMark}>L{currentLap} ~now</Text>
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

/**
 * Memoised: strategy and tires arrive at 2 Hz or slower, so most renders cannot change anything here. Props are
 * plain values and the handlers are useCallback'd in DashboardScreen, so the
 * default shallow comparison is enough.
 */
export default React.memo(StrategyPredictor);
