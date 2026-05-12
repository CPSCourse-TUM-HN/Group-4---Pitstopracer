import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface Props {
  value: number;
  max: number;
  label: string;
  unit: string;
  subText?: string;
  color: string;
  size?: number;
  onPress?: () => void;
}

const START_DEG = 210;
const SWEEP_DEG = 240;

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToXY(cx, cy, r, endDeg);
  const e = polarToXY(cx, cy, r, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export default function ArcGauge({ value, max, label, unit, subText, color, size = 130, onPress }: Props) {
  const pct    = Math.min(1, Math.max(0, value / max));
  const endDeg = START_DEG + pct * SWEEP_DEG;
  const cx     = size / 2;
  const cy     = size / 2;
  const r      = size * 0.36;
  const stroke = size * 0.072;

  const bgPath  = describeArc(cx, cy, r, START_DEG, START_DEG + SWEEP_DEG);
  const valPath = pct > 0.01 ? describeArc(cx, cy, r, START_DEG, endDeg) : null;

  return (
    <Pressable onPress={onPress} style={[styles.wrapper, { width: size, height: size + 18 }]}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Path d={bgPath}  fill="none" stroke="#2a2d35" strokeWidth={stroke} strokeLinecap="round" />
          {valPath && (
            <Path d={valPath} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          )}
        </Svg>
        <View style={styles.center}>
          <Text style={[styles.value, { color }]}>{Math.round(value)}</Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
        <Text style={[styles.label, { bottom: 6 }]}>{label}</Text>
      </View>
      {subText ? <Text style={styles.sub}>{subText}</Text> : null}
      {onPress ? <Text style={styles.tapHint}>tap for details</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -6,
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  unit: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: -2,
  },
  label: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 10,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  sub: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  tapHint: {
    fontSize: 9,
    color: '#374151',
    marginTop: 1,
  },
});
