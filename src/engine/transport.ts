import type { GameEvent } from '../sim/events';
import type { Intent } from '../sim/intents';

/** What the host sends to every peer after a tick. Plain data only. */
export type HostMessage =
  | { kind: 'events'; tick: number; events: GameEvent[] }
  | { kind: 'snapshot'; tick: number; world: string };

/**
 * Moves intents to the host and host messages to peers (SPEC §13 rule 10).
 * Single-player uses `LoopbackTransport`; co-op would add a networked one
 * without changing the sim.
 */
export interface Transport {
  /** True if this peer runs the sim and decides outcomes. */
  readonly isAuthority: boolean;
  /** Sends a local intent toward the host. */
  sendIntent(intent: Intent): void;
  /** Host only: takes every intent received since the last call, in order. */
  receiveIntents(): Intent[];
  /** Host only: sends a message to all peers (including the local one). */
  publish(message: HostMessage): void;
  /** Subscribes to host messages. Returns an unsubscribe function. */
  onMessage(handler: (message: HostMessage) => void): () => void;
}

/** Host and the only player in one process: everything is delivered locally. */
export class LoopbackTransport implements Transport {
  readonly isAuthority = true;
  private queue: Intent[] = [];
  private readonly handlers = new Set<(message: HostMessage) => void>();

  sendIntent(intent: Intent): void {
    // Copy so later mutation by the sender can't change a queued intent.
    this.queue.push(structuredClone(intent));
  }

  receiveIntents(): Intent[] {
    const intents = this.queue;
    this.queue = [];
    return intents;
  }

  publish(message: HostMessage): void {
    for (const handler of this.handlers) handler(message);
  }

  onMessage(handler: (message: HostMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
