/**
 * Scheduling helpers that satisfy the performance mandate (Feature 16):
 * throttle, debounce and requestAnimationFrame coalescing. Each returns a
 * function exposing a `.cancel()` so timers/frames can be cleared on dispose.
 */

export interface Cancellable<F extends (...args: never[]) => void> {
	(...args: Parameters<F>): void;
	cancel(): void;
}

/**
 * Trailing-edge throttle. Invokes `fn` at most once per `wait` ms, always
 * firing with the most recent arguments. Used for hover highlighting.
 */
export function throttle<F extends (...args: never[]) => void>(
	fn: F,
	wait: number,
): Cancellable<F> {
	let last = 0;
	let timer: number | null = null;
	let lastArgs: Parameters<F> | null = null;

	const invoke = () => {
		last = Date.now();
		timer = null;
		if (lastArgs) fn(...lastArgs);
	};

	const throttled = ((...args: Parameters<F>) => {
		const now = Date.now();
		const remaining = wait - (now - last);
		lastArgs = args;
		if (remaining <= 0) {
			if (timer) {
				window.clearTimeout(timer);
				timer = null;
			}
			last = now;
			fn(...args);
		} else if (timer === null) {
			timer = window.setTimeout(invoke, remaining);
		}
	}) as Cancellable<F>;

	throttled.cancel = () => {
		if (timer) window.clearTimeout(timer);
		timer = null;
		lastArgs = null;
	};
	return throttled;
}

/** Trailing-edge debounce. Used for DOM-explorer re-sync after mutations. */
export function debounce<F extends (...args: never[]) => void>(
	fn: F,
	wait: number,
): Cancellable<F> {
	let timer: number | null = null;
	const debounced = ((...args: Parameters<F>) => {
		if (timer) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = null;
			fn(...args);
		}, wait);
	}) as Cancellable<F>;
	debounced.cancel = () => {
		if (timer) window.clearTimeout(timer);
		timer = null;
	};
	return debounced;
}

/**
 * Coalesce repeated calls into a single requestAnimationFrame. Ideal for
 * positioning overlays in lockstep with the browser's paint cycle.
 */
export function rafThrottle<F extends (...args: never[]) => void>(
	fn: F,
): Cancellable<F> {
	let frame: number | null = null;
	let lastArgs: Parameters<F> | null = null;
	const throttled = ((...args: Parameters<F>) => {
		lastArgs = args;
		if (frame !== null) return;
		frame = window.requestAnimationFrame(() => {
			frame = null;
			if (lastArgs) fn(...lastArgs);
		});
	}) as Cancellable<F>;
	throttled.cancel = () => {
		if (frame !== null) window.cancelAnimationFrame(frame);
		frame = null;
		lastArgs = null;
	};
	return throttled;
}
