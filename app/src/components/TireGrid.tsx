import React from 'react';
import { StyleSheet, View } from 'react-native';
import TireCard from './TireCard';
import { TiresMsg } from '../types';

interface Props {
  tires: TiresMsg | null;
  stale?: boolean;
}

export default function TireGrid({ tires, stale }: Props) {
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <TireCard position="FL" value={tires?.fl ?? null} stale={stale} />
        <TireCard position="FR" value={tires?.fr ?? null} stale={stale} />
      </View>
      <View style={styles.row}>
        <TireCard position="RL" value={tires?.rl ?? null} stale={stale} />
        <TireCard position="RR" value={tires?.rr ?? null} stale={stale} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    marginHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
  },
});
