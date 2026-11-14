import type { EventOf, EventType, GameEvent } from '../sim/events';

type Handler<K extends EventType> = (event: EventOf<K>) => void;

/**
 * Delivers sim events (plain data) to the view, UI and audio. Listeners only
 * react; they never change sim state directly.
 */
export class EventBus {
  private readonly handlers = new Map<EventType | '*', Set<(event: GameEvent) => void>>();

  /** Subscribes to one event type. Returns an unsubscribe function. */
  on<K extends EventType>(type: K, handler: Handler<K>): () => void {
    return this.add(type, handler as (event: GameEvent) => void);
  }

  /** Subscribes to every event. */
  onAny(handler: (event: GameEvent) => void): () => void {
    return this.add('*', handler);
  }

  emit(event: GameEvent): void {
    for (const handler of this.handlers.get(event.type) ?? []) handler(event);
    for (const handler of this.handlers.get('*') ?? []) handler(event);
  }

  private add(key: EventType | '*', handler: (event: GameEvent) => void): () => void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }
}
