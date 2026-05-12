import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { EventMsg } from '../types';

interface Props {
  events: EventMsg[];
  tires: { fl: number; fr: number; rl: number; rr: number } | null;
}

function fmtEvent(evt: EventMsg): string {
  const d = new Date(evt.ts);
  const t = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  return `${evt.type.replace(/_/g, ' ')} — ${t}`;
}

export default function StatusTicker({ events, tires }: Props) {
  const worstKey = tires
    ? Object.entries(tires).sort(([, a], [, b]) => a - b)[0]
    : null;

  const items: string[] = [];
  if (worstKey && worstKey[1] < 0.3) {
    items.push(`${worstKey[0].toUpperCase()} tire critical ${Math.round(worstKey[1] * 100)}%`);
  }
  events.slice(0, 3).forEach(e => items.push(fmtEvent(e)));

  if (items.length === 0) return null;

  const text = items.join('  •  ');

  return (
    <View style={styles.ticker}>
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0c0f',
    borderTopWidth: 1,
    borderTopColor: '#1e2128',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  text: {
    fontSize: 11,
    color: '#6b7280',
    flex: 1,
  },
});
