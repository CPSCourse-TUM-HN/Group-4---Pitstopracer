import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ImuMsg } from '../types';

interface Props {
  imu: ImuMsg | null;
  stale?: boolean;
  onPress?: () => void;
}

const SIZE = 90;
const MAX_G = 1.5;

function GForceWidget({ imu, stale, onPress }: Props) {
  // ax = lateral (left/right), ay = longitudinal (fwd/back)
  //
  // A missing reading is not a zero reading. Defaulting to 0 drew a dot dead
  // centre and printed "0.00 G" before the IMU had ever spoken -- a fabricated
  // measurement, and indistinguishable from a car sitting still.
  const known = imu !== null && imu !== undefined;
  const ax = imu?.ax ?? 0;
  const ay = imu?.ay ?? 0;

  // Pin to the rim past MAX_G rather than letting the circle's overflow:hidden
  // swallow the dot -- "at the limit" reads correctly, "gone" reads as broken.
  const R = SIZE / 2 - 10;
  const nx = ax / MAX_G;
  const ny = ay / MAX_G;
  const mag = Math.hypot(nx, ny);
  const k = mag > 1 ? 1 / mag : 1;
  const dotX = SIZE / 2 + nx * k * R;
  const dotY = SIZE / 2 - ny * k * R;
  const atLimit = mag > 1;

  const totalG = Math.sqrt(ax * ax + ay * ay).toFixed(2);

  return (
    <Pressable onPress={onPress} style={styles.wrapper}>
      <Text style={styles.label}>G-FORCE</Text>
      <View style={[styles.circle, stale && styles.staleCircle]}>
        {/* crosshairs */}
        <View style={styles.hLine} />
        <View style={styles.vLine} />
        {/* rings */}
        <View style={[styles.ring, { width: SIZE * 0.5, height: SIZE * 0.5, borderRadius: SIZE * 0.25 }]} />
        {/* dot */}
        {!stale && known && (
          <View style={[
            styles.dot,
            { left: dotX - 5, top: dotY - 5 },
            atLimit && styles.dotAtLimit,
          ]} />
        )}
      </View>
      <Text style={[styles.value, (stale || !known) && styles.staleText]}>
        {!known ? '—' : stale ? 'stale' : `${totalG} G`}
      </Text>
      <Text style={styles.sub}>
        {known ? `ax ${ax.toFixed(2)}  ay ${ay.toFixed(2)}` : 'awaiting IMU'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    flex: 1,
  },
  label: {
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#1a1d24',
    borderWidth: 1,
    borderColor: '#2a2d35',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staleCircle: {
    opacity: 0.4,
  },
  hLine: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: '#2a2d35',
  },
  vLine: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: '#2a2d35',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#2a2d35',
  },
  dot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  dotAtLimit: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f9fafb',
    marginTop: 6,
  },
  staleText: { color: '#4b5563' },
  sub: {
    fontSize: 10,
    color: '#4b5563',
    marginTop: 2,
  },
});

/**
 * Memoised: imu arrives at 20 Hz, half the render rate, so most renders cannot change anything here. Props are
 * plain values and the handlers are useCallback'd in DashboardScreen, so the
 * default shallow comparison is enough.
 */
export default React.memo(GForceWidget);
