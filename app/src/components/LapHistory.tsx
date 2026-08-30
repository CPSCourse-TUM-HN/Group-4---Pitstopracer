import React from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
  currentLap: number;
  totalLaps: number;
}

function LapHistory({ currentLap, totalLaps }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: totalLaps }, (_, i) => {
        const lap = i + 1;
        const done    = lap < currentLap;
        const current = lap === currentLap;
        return (
          <View
            key={lap}
            style={[
              styles.dot,
              done    && styles.dotDone,
              current && styles.dotCurrent,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2a2d35',
  },
  dotDone: {
    backgroundColor: '#22c55e',
  },
  dotCurrent: {
    backgroundColor: '#f59e0b',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

/**
 * Memoised: the lap counter changes once every 18 s, so most renders cannot change anything here. Props are
 * plain values and the handlers are useCallback'd in DashboardScreen, so the
 * default shallow comparison is enough.
 */
export default React.memo(LapHistory);
