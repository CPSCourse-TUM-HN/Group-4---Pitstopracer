import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HealthColor } from '../types';

interface Props {
  label: string;
  value: string;
  unit?: string;
  subText?: string;
  health?: HealthColor;
  stale?: boolean;
  flex?: number;
}

const HEALTH_BG: Record<HealthColor, string> = {
  green:  '#14532d',
  yellow: '#422006',
  red:    '#450a0a',
};

const HEALTH_BORDER: Record<HealthColor, string> = {
  green:  '#16a34a',
  yellow: '#d97706',
  red:    '#dc2626',
};

export default function StatCard({ label, value, unit, subText, health, stale, flex = 1 }: Props) {
  const bg     = health ? HEALTH_BG[health]     : '#1a1d24';
  const border = health ? HEALTH_BORDER[health] : '#2d3139';

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border, flex }]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, stale && styles.staleText]}>{stale ? '—' : value}</Text>
        {unit && !stale ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {stale ? (
        <Text style={styles.staleTag}>stale</Text>
      ) : subText ? (
        <Text style={styles.subText}>{subText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    margin: 4,
    minHeight: 80,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 11,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f9fafb',
  },
  unit: {
    fontSize: 14,
    color: '#9ca3af',
    marginLeft: 4,
    marginBottom: 4,
  },
  subText: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  staleText: {
    color: '#4b5563',
  },
  staleTag: {
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
