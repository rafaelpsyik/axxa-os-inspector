import type { App } from "obsidian";
import { DisposableGroup, type IDisposable } from "./Disposable";
import { EventBus } from "./EventBus";
import type { AxxaEventMap } from "../types/events";

/**
 * A minimal dependency-injection container.
 *
 * Engines are registered lazily as singleton factories and resolved on demand.
 * The container owns a single {@link DisposableGroup} and {@link EventBus} that
 * every engine receives, so teardown and cross-engine messaging are uniform.
 *
 * Using DI (rather than `new`-ing engines inside each other) means each engine
 * declares its collaborators explicitly, can be swapped for a fake in tests,
 * and never creates hidden global state.
 */
export class ServiceContainer implements IDisposable {
	readonly app: App;
	readonly bus: EventBus<AxxaEventMap>;
	readonly disposables: DisposableGroup;

	private readonly factories = new Map<symbol, (c: ServiceContainer) => unknown>();
	private readonly instances = new Map<symbol, unknown>();

	constructor(app: App) {
		this.app = app;
		this.bus = new EventBus<AxxaEventMap>();
		this.disposables = new DisposableGroup();
	}

	/** Register a singleton factory under a unique token. */
	register<T>(token: ServiceToken<T>, factory: (c: ServiceContainer) => T): void {
		this.factories.set(token.id, factory as (c: ServiceContainer) => unknown);
	}

	/** Resolve (and lazily construct) the singleton for a token. */
	resolve<T>(token: ServiceToken<T>): T {
		if (this.instances.has(token.id)) {
			return this.instances.get(token.id) as T;
		}
		const factory = this.factories.get(token.id);
		if (!factory) {
			throw new Error(
				`[AXXA Inspector] No service registered for token "${token.description}".`,
			);
		}
		const instance = factory(this);
		this.instances.set(token.id, instance);
		// Engines that implement IDisposable are torn down with the container.
		if (isDisposable(instance)) {
			this.disposables.register(instance);
		}
		return instance as T;
	}

	dispose(): void {
		this.disposables.dispose();
		this.bus.clear();
		this.instances.clear();
		this.factories.clear();
	}
}

/** A typed token identifying a service in the container. */
export class ServiceToken<_T> {
	readonly id = Symbol(this.description);
	constructor(readonly description: string) {}
}

function isDisposable(value: unknown): value is IDisposable {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as IDisposable).dispose === "function"
	);
}
