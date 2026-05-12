import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Status } from '../mqtt/client';
import { config } from '../config';

interface Props {
  status: Status;
}

const STATUS_COLOR: Record<Status, string> = {
  connected:    '#22c55e',
  connecting:   '#f59e0b',
  reconnecting: '#f59e0b',
  disconnected: '#ef4444',
  error:        '#ef4444',
};

const STATUS_LABEL: Record<Status, string> = {
  connected:    '● Connected',
  connecting:   '◌ Connecting…',
  reconnecting: '◌ Reconnecting…',
  disconnected: '● Disconnected',
  error:        '● Error',
};

export default function ConnectionBadge({ status }: Props) {
  const color = STATUS_COLOR[status];
  return (
    <View style={styles.wrapper}>
      <View style={[styles.pill, { borderColor: color }]}>
        <Text style={[styles.label, { color }]}>{STATUS_LABEL[status]}</Text>
      </View>
      <Text style={styles.url}>{config.brokerUrl}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  url: {
    fontSize: 10,
    color: '#6b7280',
  },
});
