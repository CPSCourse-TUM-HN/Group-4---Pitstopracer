export const config = {
  // Android emulator: 10.0.2.2 maps to host loopback
  // iOS simulator:    localhost
  // Physical phone:   your laptop's LAN IP, e.g. 192.168.1.42
  brokerUrl: 'ws://10.0.2.2:9001',
  topicPrefix: 'race/car1',
  reconnectMs: 2000,
} as const;
