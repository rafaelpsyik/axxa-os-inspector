import { DisposableGroup, type IDisposable } from "../core/Disposable";

/** A snapshot of the plugin's runtime cost (Feature 16). */
export interface PerfSnapshot {
	/** Rolling estimate of frames-per-second. */
	fps: number;
	/** Approx JS heap size in MB, when the browser exposes it. */
	heapMb: number | null;
	/** Number of live overlay/observer resources currently registered. */
	activeResources: number;
	/** Whether inspect mode (the only continuous cost) is running. */
	inspectActive: boolean;
}

/**
 * Performance Monitor (Feature 16).
 *
 * Provides a lightweight FPS/heap probe used by the diagnostics panel and by
 * the test suite to assert that disabling inspect mode returns the plugin to
 * near-zero overhead. The rAF sampling loop only runs while explicitly polling,
 * so the monitor itself adds no idle cost.
 */
export class PerformanceMonitor implements IDisposable {
	private readonly group = new DisposableGroup();
	private frames = 0;
	private fps = 60;
	private lastSample = performance.now();
	private rafId: number | null = null;
	private resourceCount = 0;
	private inspectActive = false;

	/** Begin sampling FPS. Idempotent. */
	startSampling(): void {
		if (this.rafId !== null) return;
		const loop = () => {
			this.frames++;
			const now = performance.now();
			if (now - this.lastSample >= 1000) {
				this.fps = Math.round((this.frames * 1000) / (now - this.lastSample));
				this.frames = 0;
				this.lastSample = now;
			}
			this.rafId = requestAnimationFrame(loop);
		};
		this.rafId = requestAnimationFrame(loop);
		this.group.register(() => this.stopSampling());
	}

	stopSampling(): void {
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.rafId = null;
	}

	/** Engines report resource acquisition/release for leak diagnostics. */
	trackResources(delta: number): void {
		this.resourceCount = Math.max(0, this.resourceCount + delta);
	}

	setInspectActive(active: boolean): void {
		this.inspectActive = active;
	}

	snapshot(): PerfSnapshot {
		const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
		return {
			fps: this.fps,
			heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
			activeResources: this.resourceCount,
			inspectActive: this.inspectActive,
		};
	}

	dispose(): void {
		this.stopSampling();
		this.group.dispose();
	}
}
