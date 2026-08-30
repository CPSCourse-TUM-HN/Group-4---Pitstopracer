import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { pctHealth } from '../types';

interface Props {
  percent: number | null;
  etaLaps?: number;
  stale?: boolean;
}

const HEALTH_COLOR = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' };

function FuelBar({ percent, etaLaps, stale }: Props) {
  const h     = percent !== null ? pctHealth(percent) : 'green';
  const color = HEALTH_COLOR[h];
  const width = percent !== null ? `${Math.max(0, Math.min(100, percent))}%` : '0%';

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.label}>FUEL</Text>
        {etaLaps !== undefined && (
          <Text style={styles.eta}>ETA ~{etaLaps} laps</Text>
        )}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: width as `${number}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.footer}>
        <Text style={styles.cap}>0</Text>
        <Text style={[styles.pct, { color: stale || percent === null ? '#4b5563' : color }]}>
          {/* "stale" means a feed stopped; before first contact there is
              nothing to be stale, and saying so misdirects anyone debugging a
              broker that never came up. Absent reads as a dash, like every
              other tile. */}
          {percent === null ? '—' : stale ? 'stale' : `${Math.round(percent)}%`}
        </Text>
        <Text style={styles.cap}>F</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  eta: {
    fontSize: 11,
    color: '#6b7280',
  },
  track: {
    height: 10,
    backgroundColor: '#1e2128',
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: 10,
    borderRadius: 5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cap: {
    fontSize: 10,
    color: '#4b5563',
  },
  pct: {
    fontSize: 12,
    fontWeight: '600',
  },
});

/**
 * Memoised: fuel arrives at 2 Hz, so most renders cannot change anything here. Props are
 * plain values and the handlers are useCallback'd in DashboardScreen, so the
 * default shallow comparison is enough.
 */
export default React.memo(FuelBar);
