import mqtt from 'mqtt';

export type Status = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface MqttClient {
  subscribe: (topic: string) => void;
  disconnect: () => void;
}

export function connect(
  url: string,
  reconnectMs: number,
  onStatus: (s: Status) => void,
  onMessage: (topic: string, payload: unknown) => void,
): MqttClient {
  onStatus('connecting');

  const client = mqtt.connect(url, {
    reconnectPeriod: reconnectMs,
    connectTimeout: 10_000,
    keepalive: 30,
    // Stated rather than inherited. It is mqtt.js's default today, but the
    // whole reconnect story depends on it: without resubscription the client
    // comes back after a broker restart, reports itself connected, and then
    // receives nothing -- a dashboard frozen on stale values while its badge
    // says live. tools/recorder.py had precisely that bug.
    resubscribe: true,
    clean: true,
  });

  client.on('connect', () => onStatus('connected'));
  client.on('reconnect', () => onStatus('reconnecting'));
  client.on('offline', () => onStatus('disconnected'));
  client.on('error', (err) => {
    console.warn('[mqtt] error:', err.message);
    onStatus('error');
  });

  client.on('message', (topic, buffer) => {
    try {
      const parsed: unknown = JSON.parse(buffer.toString());
      onMessage(topic, parsed);
    } catch (e) {
      console.warn('[mqtt] JSON parse error on topic', topic, e);
    }
  });

  return {
    subscribe: (topic) => client.subscribe(topic, { qos: 0 }),
    disconnect: () => {
      client.end(true);
      onStatus('disconnected');
    },
  };
}
