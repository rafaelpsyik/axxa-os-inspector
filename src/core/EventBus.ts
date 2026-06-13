import { DisposableGroup, type Teardown } from "./Disposable";

/**
 * A strongly-typed, synchronous publish/subscribe bus.
 *
 * Engines never reference the UI directly and the UI never reaches into engine
 * internals — they communicate exclusively through this bus. This keeps the
 * architecture decoupled (separation of concerns) and makes every engine unit
 * testable in isolation by asserting on emitted events.
 *
 * @typeParam EventMap — a record mapping event names to their payload types.
 */
export class EventBus<EventMap extends Record<string, unknown>> {
	private readonly handlers = new Map<
		keyof EventMap,
		Set<(payload: unknown) => void>
	>();

	/**
	 * Subscribe to an event. Returns a {@link Teardown} that unsubscribes —
	 * register it with a {@link DisposableGroup} for automatic cleanup.
	 */
	on<K extends keyof EventMap>(
		event: K,
		handler: (payload: EventMap[K]) => void,
	): Teardown {
		let set = this.handlers.get(event);
		if (!set) {
			set = new Set();
			this.handlers.set(event, set);
		}
		const wrapped = handler as (payload: unknown) => void;
		set.add(wrapped);
		return () => set?.delete(wrapped);
	}

	/** Subscribe for a single emission, then auto-unsubscribe. */
	once<K extends keyof EventMap>(
		event: K,
		handler: (payload: EventMap[K]) => void,
	): Teardown {
		const off = this.on(event, (payload) => {
			off();
			handler(payload);
		});
		return off;
	}

	/** Emit an event. Handler exceptions are isolated so one bad listener
	 * cannot break the others or the emitter. */
	emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
		const set = this.handlers.get(event);
		if (!set) return;
		// Snapshot so handlers may unsubscribe during iteration safely.
		for (const handler of [...set]) {
			try {
				handler(payload);
			} catch (err) {
				console.error(
					`[AXXA Inspector] event handler for "${String(event)}" threw:`,
					err,
				);
			}
		}
	}

	/** Remove every subscription. Called on plugin unload. */
	clear(): void {
		this.handlers.clear();
	}
}
