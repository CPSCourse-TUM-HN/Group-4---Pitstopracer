/**
 * Topic suffixes, in the order they are subscribed.
 *
 * `pose` is optional -- no producer is obliged to publish it (packet spec
 * OPTIONAL_TOPICS). Subscribing costs nothing when it is absent and is what
 * makes the position degradation ladder's 'measured' rung reachable at all.
 */
export const TOPIC_SUFFIXES = [
  'state', 'battery', 'fuel', 'tires', 'strategy', 'event', 'imu', 'pose',
] as const;

export const RAIN_COMMAND_TOPIC = 'command/rain';

export type TopicSuffix = (typeof TOPIC_SUFFIXES)[number];

/**
 * How long without a message before a topic is considered stale.
 *
 * Lives here rather than beside the client so tests and tooling can read it
 * without pulling in the `mqtt` package, and so the invariant it participates
 * in stays visible: no producer may go quiet for longer than this, or the
 * dashboard greys out while everything is in fact working. The mock publisher
 * keeps transmitting through a pit stop for exactly this reason.
 */
export const STALE_MS = 5_000;
