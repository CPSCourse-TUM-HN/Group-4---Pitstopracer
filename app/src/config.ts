// Broker address differs per developer, so it is an environment override
// rather than a committed value -- otherwise every checkout fights over this
// one line. Put your own in app/.env (gitignored):
//
//   EXPO_PUBLIC_BROKER_URL=ws://localhost:9001
//
// Android emulator: ws://10.0.2.2:9001   (10.0.2.2 maps to host loopback)
// iOS simulator:    ws://localhost:9001
// Physical phone:   ws://<laptop-LAN-IP>:9001   (ipconfig getifaddr en0)
//
// Restart Metro after changing .env -- values are inlined at bundle time.
const DEFAULT_BROKER_URL = 'ws://10.0.2.2:9001';

export const config = {
  brokerUrl: process.env.EXPO_PUBLIC_BROKER_URL ?? DEFAULT_BROKER_URL,
  topicPrefix: 'race/car1',
  reconnectMs: 2000,
} as const;
