import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { StrategyMsg } from '../types';

interface Props {
  strategy: StrategyMsg | null;
}

export default function PitBanner({ strategy }: Props) {
  const opacity = useRef(new Animated.Value(1)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (strategy?.pit_recommended) {
      animRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.65, duration: 500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1.0,  duration: 500, useNativeDriver: true }),
        ]),
      );
      animRef.current.start();
    } else {
      animRef.current?.stop();
      opacity.setValue(1);
    }
    return () => { animRef.current?.stop(); };
  }, [strategy?.pit_recommended, opacity]);

  if (!strategy?.pit_recommended) return null;

  const reason = strategy.reason
    ? strategy.reason.replace(/_/g, ' ')
    : '';

  return (
    <Animated.View style={[styles.banner, { opacity }]}>
      <Text style={styles.icon}>⚠</Text>
      <View>
        <Text style={styles.title}>PIT NOW</Text>
        {reason ? <Text style={styles.reason}>{reason} — critical</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a0505',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 0,
    marginHorizontal: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
  },
  icon: {
    fontSize: 18,
    color: '#ef4444',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 2,
  },
  reason: {
    fontSize: 11,
    color: '#f87171',
    marginTop: 1,
  },
});
