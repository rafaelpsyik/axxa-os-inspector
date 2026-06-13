/**
 * Lifecycle primitives used throughout AXXA Inspector.
 *
 * Every engine, overlay, observer and event subscription created by the plugin
 * registers a teardown function here. When the plugin (or an individual engine)
 * unloads, {@link DisposableGroup.dispose} runs every teardown in reverse order,
 * guaranteeing that no listeners, timers, observers or injected DOM survive an
 * unload. This is the backbone of the plugin's "near-zero overhead when
 * disabled" and "no memory leaks" guarantees (Features 16 & 19).
 */

/** Anything that can be torn down. */
export interface IDisposable {
	dispose(): void;
}

/** A teardown callback. */
export type Teardown = () => void;

/**
 * Collects teardown callbacks and runs them exactly once, in LIFO order.
 *
 * LIFO matters: resources are typically created in dependency order (A then B
 * where B depends on A), so they must be released in the opposite order.
 */
export class DisposableGroup implements IDisposable {
	private teardowns: Teardown[] = [];
	private disposed = false;

	/**
	 * Register a teardown callback (or a child {@link IDisposable}).
	 * If the group is already disposed the callback runs immediately, which
	 * prevents leaks from late registrations during async teardown.
	 */
	register(item: Teardown | IDisposable): void {
		const teardown: Teardown =
			typeof item === "function" ? item : () => item.dispose();

		if (this.disposed) {
			teardown();
			return;
		}
		this.teardowns.push(teardown);
	}

	/** Convenience: register a DOM event listener and its automatic removal. */
	registerDomEvent<K extends keyof HTMLElementEventMap>(
		target: HTMLElement | Document | Window,
		type: K | string,
		handler: (ev: Event) => void,
		options?: AddEventListenerOptions | boolean,
	): void {
		target.addEventListener(type, handler as EventListener, options);
		this.register(() =>
			target.removeEventListener(type, handler as EventListener, options),
		);
	}

	/** Convenience: register an interval timer and its automatic clearing. */
	registerInterval(id: number): number {
		this.register(() => window.clearInterval(id));
		return id;
	}

	get isDisposed(): boolean {
		return this.disposed;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		// Run in reverse registration order; swallow individual failures so a
		// single broken teardown can never strand the remaining ones.
		for (let i = this.teardowns.length - 1; i >= 0; i--) {
			try {
				this.teardowns[i]();
			} catch (err) {
				console.error("[AXXA Inspector] teardown failed:", err);
			}
		}
		this.teardowns = [];
	}
}
