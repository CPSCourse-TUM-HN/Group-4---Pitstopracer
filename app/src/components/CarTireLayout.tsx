import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TiresMsg, tireHealth, HEALTH_COLOR, HEALTH_BG } from '../types';

type TirePos = 'FL' | 'FR' | 'RL' | 'RR';

interface Props {
  tires: TiresMsg | null;
  stale?: boolean;
  onTirePress?: (pos: TirePos, value: number) => void;
}

function TireChip({ label, value, stale, onPress }: {
  label: TirePos; value: number | null; stale?: boolean; onPress?: () => void;
}) {
  const h     = value !== null ? tireHealth(value) : 'green';
  const color = HEALTH_COLOR[h];
  const bg    = HEALTH_BG[h];
  const pct   = value !== null ? Math.round(value * 100) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: bg, borderColor: color },
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, { color }]}>
        {stale || pct === null ? '?' : `${pct}%`}
      </Text>
      <Text style={styles.tapHint}>tap</Text>
    </Pressable>
  );
}

function CarTireLayout({ tires, stale, onTirePress }: Props) {
  const tireVal = (pos: TirePos): number | null => {
    if (!tires) return null;
    return tires[pos.toLowerCase() as 'fl' | 'fr' | 'rl' | 'rr'];
  };

  const handlePress = (pos: TirePos) => {
    const v = tireVal(pos);
    if (onTirePress && v !== null) onTirePress(pos, v);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TireChip label="FL" value={tireVal('FL')} stale={stale} onPress={() => handlePress('FL')} />
        <View style={styles.spacer} />
        <TireChip label="FR" value={tireVal('FR')} stale={stale} onPress={() => handlePress('FR')} />
      </View>

      {/* Car body silhouette */}
      <View style={styles.carWrap}>
        <View style={styles.windshieldTop} />
        <View style={styles.cabin}>
          <View style={styles.cabinInner} />
        </View>
        <View style={styles.windshieldBot} />
      </View>

      <View style={styles.bottomRow}>
        <TireChip label="RL" value={tireVal('RL')} stale={stale} onPress={() => handlePress('RL')} />
        <View style={styles.spacer} />
        <TireChip label="RR" value={tireVal('RR')} stale={stale} onPress={() => handlePress('RR')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  spacer: { width: 86 },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 62,
  },
  chipPressed: { opacity: 0.7 },
  chipLabel: {
    fontSize: 10,
    color: '#9ca3af',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chipValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 1,
  },
  tapHint: {
    fontSize: 8,
    color: '#374151',
    marginTop: 1,
  },
  carWrap: {
    alignItems: 'center',
    width: 70,
  },
  windshieldTop: {
    width: 48,
    height: 14,
    backgroundColor: '#1a1d24',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2d35',
  },
  cabin: {
    width: 58,
    height: 48,
    backgroundColor: '#13161c',
    borderWidth: 1,
    borderColor: '#2a2d35',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cabinInner: {
    width: 38,
    height: 28,
    backgroundColor: '#1a1d24',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#374151',
  },
  windshieldBot: {
    width: 48,
    height: 14,
    backgroundColor: '#1a1d24',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2d35',
  },
});

/**
 * Memoised: tires arrive at 2 Hz; the dashboard renders at ~40, so most renders cannot change anything here. Props are
 * plain values and the handlers are useCallback'd in DashboardScreen, so the
 * default shallow comparison is enough.
 */
export default React.memo(CarTireLayout);
