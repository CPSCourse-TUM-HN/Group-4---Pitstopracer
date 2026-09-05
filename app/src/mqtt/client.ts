import mqtt from 'mqtt';

export type Status =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface MqttClient {
  subscribe: (topic: string) => void;
  publish: (topic: string, payload: unknown) => void;
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
    resubscribe: true,
    clean: true,
  });

  client.on('connect', () => {
    console.log('[mqtt] CONNECTED TO:', url);
    onStatus('connected');
  });

  client.on('reconnect', () => {
    onStatus('reconnecting');
  });

  client.on('offline', () => {
    onStatus('disconnected');
  });

  client.on('error', (err) => {
    console.warn('[mqtt] error:', err.message);
    onStatus('error');
  });

  client.on('message', (topic, buffer) => {
    try {
      const parsed: unknown =
        JSON.parse(buffer.toString());

      onMessage(topic, parsed);

    } catch (e) {
      console.warn(
        '[mqtt] JSON parse error on topic',
        topic,
        e
      );
    }
  });

  return {
    subscribe: (topic) => {
      client.subscribe(topic, { qos: 0 });
    },

    publish: (topic, payload) => {
      const message = JSON.stringify(payload);

      console.log(
        '[mqtt] PUBLISHING TO:',
        topic
      );

      console.log(
        '[mqtt] PAYLOAD:',
        message
      );

      console.log(
        '[mqtt] CLIENT CONNECTED:',
        client.connected
      );

      try {
        client.publish(
          topic,
          message,
          { qos: 0 },
          (err) => {
            if (err) {
              console.warn(
                '[mqtt] PUBLISH CALLBACK ERROR:',
                err
              );
            } else {
              console.log(
                '[mqtt] PUBLISH SUCCESS:',
                topic
              );
            }
          }
        );

      } catch (e) {
        console.warn(
          '[mqtt] publish exception:',
          e
        );
      }
    },

    disconnect: () => {
      client.end(true);
      onStatus('disconnected');
    },
  };
}