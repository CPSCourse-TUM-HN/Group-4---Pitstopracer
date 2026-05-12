import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tireHealth } from '../types';

interface Props {
  position: 'FL' | 'FR' | 'RL' | 'RR';
  value: number | null;  // 0–1
  stale?: boolean;
}

const HEALTH_COLORS = {
  green:  { bg: '#14532d', border: '#16a34a', bar: '#22c55e' },
  yellow: { bg: '#422006', border: '#d97706', bar: '#f59e0b' },
  red:    { bg: '#450a0a', border: '#dc2626', bar: '#ef4444' },
};

export default function TireCard({ position, value, stale }: Props) {
  const health = value !== null ? tireHealth(value) : 'green';
  const colors = HEALTH_COLORS[health];
  const barWidth = value !== null ? `${Math.round(value * 100)}%` : '0%';

  return (
    <View style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={styles.position}>{position}</Text>
      {stale || value === null ? (
        <Text style={styles.stale}>stale</Text>
      ) : (
        <>
          <Text style={styles.pct}>{Math.round(value * 100)}%</Text>
          <View style={styles.track}>
            <View style={[styles.bar, { width: barWidth as `${number}%`, backgroundColor: colors.bar }]} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    margin: 4,
    minHeight: 80,
    justifyContent: 'space-between',
  },
  position: {
    fontSize: 11,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pct: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f9fafb',
  },
  track: {
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: {
    height: 4,
    borderRadius: 2,
  },
  stale: {
    fontSize: 10,
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
