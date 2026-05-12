import React from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';

export interface InfoContent {
  title: string;
  value?: string;
  rows: { label: string; value: string; note?: string }[];
  description: string;
  source?: string;
}

interface Props {
  visible: boolean;
  info: InfoContent | null;
  onClose: () => void;
}

export default function InfoModal({ visible, info, onClose }: Props) {
  if (!info) return null;
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* handle */}
        <View style={styles.handle} />

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* title + live value */}
          <View style={styles.header}>
            <Text style={styles.title}>{info.title}</Text>
            {info.value ? <Text style={styles.liveValue}>{info.value}</Text> : null}
          </View>

          {/* data rows */}
          {info.rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>{r.value}</Text>
                {r.note ? <Text style={styles.rowNote}>{r.note}</Text> : null}
              </View>
            </View>
          ))}

          {/* description */}
          <View style={styles.descBox}>
            <Text style={styles.descText}>{info.description}</Text>
          </View>

          {info.source ? (
            <Text style={styles.source}>Sensor: {info.source}</Text>
          ) : null}
        </ScrollView>

        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeTxt}>Dismiss</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#13161c',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: '#2a2d35',
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#374151',
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f9fafb',
    letterSpacing: 0.5,
  },
  liveValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f59e0b',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2128',
  },
  rowLabel: {
    fontSize: 13,
    color: '#9ca3af',
    flex: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f9fafb',
  },
  rowNote: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  descBox: {
    backgroundColor: '#1a1d24',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  descText: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 20,
  },
  source: {
    fontSize: 11,
    color: '#4b5563',
    marginTop: 10,
    textAlign: 'center',
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: '#1e2128',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
  },
});
