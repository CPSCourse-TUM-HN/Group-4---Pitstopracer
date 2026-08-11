import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect } from 'react-native-svg';
import {
  CENTERLINE, FIELD_CM, PIT_BOX_CM, PIT_LANE, START_FINISH,
} from '../track/monza.generated';
import { CarPose } from '../track/position';

interface Props {
  pose: CarPose;
  inPit: boolean;
  stale: boolean;
  /** Fills the height it is given; width follows the field's aspect ratio. */
  height: number;
  onPress?: () => void;
}

const SOURCE_LABEL: Record<CarPose['source'], string> = {
  pose:     'measured',
  progress: 'estimated',
  none:     'no position',
};

function toPointsString(pts: readonly (readonly [number, number])[]): string {
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

export default function TrackMap({ pose, inPit, stale, height, onPress }: Props) {
  // 627 points; joining them is not free, and the geometry never changes.
  const centerline = useMemo(() => toPointsString(CENTERLINE), []);
  const pitLane = useMemo(() => toPointsString(PIT_LANE), []);

  const width = height * (FIELD_CM.width / FIELD_CM.height);
  const known = pose.source !== 'none';
  const carOpacity = stale ? 0.35 : 1;

  return (
    <Pressable onPress={onPress} style={[styles.wrap, { height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${FIELD_CM.width} ${FIELD_CM.height}`}>
        {/* Track: white kerb under a dark surface, red dashes on the racing line */}
        <Polyline points={centerline} fill="none" stroke="#ffffff" strokeOpacity={0.12}
                  strokeWidth={80} strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={centerline} fill="none" stroke="#3a4150"
                  strokeWidth={72} strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={centerline} fill="none" stroke="#ef4444" strokeOpacity={0.55}
                  strokeWidth={3} strokeDasharray="18 22" strokeLinecap="round" />

        {/* Pit lane */}
        <Polyline points={pitLane} fill="none" stroke="#ffffff" strokeOpacity={0.12}
                  strokeWidth={60} strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={pitLane} fill="none" stroke={inPit ? '#f59e0b' : '#8a5a2b'}
                  strokeWidth={52} strokeLinejoin="round" strokeLinecap="round" />

        {/* Service bay */}
        <Rect x={PIT_BOX_CM.x} y={PIT_BOX_CM.y} width={PIT_BOX_CM.width} height={PIT_BOX_CM.height}
              rx={8} fill="#22c55e" fillOpacity={inPit ? 1 : 0.55} />

        {/* Start / finish */}
        <Line x1={START_FINISH.x - 34} y1={START_FINISH.y} x2={START_FINISH.x + 34} y2={START_FINISH.y}
              stroke="#f9fafb" strokeWidth={11} strokeDasharray="9 9" />

        {known && (
          <G transform={`translate(${pose.x} ${pose.y}) rotate(${pose.heading})`} opacity={carOpacity}>
            <Circle r={30} fill="#0E1116" fillOpacity={0.85} />
            <Circle r={30} fill="none" stroke="#f59e0b" strokeWidth={7} />
            {/* Nose, so heading is readable at a glance. Path rather than
                Polygon: Polygon here made RN report stray text children. */}
            <Path d="M 34 0 L 8 13 L 8 -13 Z" fill="#f59e0b" />
          </G>
        )}
      </Svg>

      <View style={styles.badge}>
        <View style={[
          styles.dot,
          { backgroundColor: pose.source === 'pose' ? '#22c55e'
                           : pose.source === 'progress' ? '#f59e0b' : '#6b7280' },
        ]} />
        <Text style={styles.badgeText}>{stale ? 'stale' : SOURCE_LABEL[pose.source]}</Text>
      </View>

      {inPit && (
        <View style={styles.pitTag}>
          <Text style={styles.pitTagText}>IN PIT</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: 6, left: 8, flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(14,17,22,0.85)', borderColor: '#232a35', borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 9, color: '#9ca3af', letterSpacing: 0.5 },
  pitTag: {
    position: 'absolute', top: 6, right: 8,
    backgroundColor: '#f59e0b', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3,
  },
  pitTagText: { fontSize: 9, fontWeight: '700', color: '#0E1116', letterSpacing: 1 },
});
