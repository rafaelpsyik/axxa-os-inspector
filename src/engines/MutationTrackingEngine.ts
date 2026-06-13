import { DisposableGroup, type IDisposable } from "../core/Disposable";
import { EventBus } from "../core/EventBus";
import type { AxxaEventMap } from "../types/events";
import { buildUniqueSelector } from "../utils/selector";
import { debounce, type Cancellable } from "../utils/schedule";
import { uid } from "../utils/id";
import type { MutationEvent, MutationRecording, MutationKind } from "../types/mutation";

/**
 * Mutation Tracking Engine (Feature 7).
 *
 * Wraps a single {@link MutationObserver} watching the whole document subtree
 * for added/removed nodes, attribute, class and style changes. Events are
 * coalesced and capped (Feature 16) and surfaced as a timeline the UI renders.
 * Recording can be started/stopped and the captured session exported.
 *
 * Critically, the observer is created lazily and **always disconnected** on
 * stop/dispose, satisfying the "MutationObservers must disconnect properly"
 * requirement.
 */
export class MutationTrackingEngine implements IDisposable {
	private readonly group = new DisposableGroup();
	private observer: MutationObserver | null = null;
	private recording: MutationRecording | null = null;
	private readonly liveEvents: MutationEvent[] = [];
	private readonly flush: Cancellable<() => void>;
	private pending: MutationRecord[] = [];

	constructor(
		private readonly bus: EventBus<AxxaEventMap>,
		private readonly maxEvents: number,
	) {
		// Batch DOM-storm bursts into a single processing pass per frame-ish.
		this.flush = debounce(() => this.process(), 60);
		this.group.register(() => this.flush.cancel());
	}

	get isObserving(): boolean {
		return this.observer !== null;
	}

	get isRecording(): boolean {
		return this.recording !== null && this.recording.endedAt === null;
	}

	/** Recent live events (most recent last), capped to {@link maxEvents}. */
	get events(): readonly MutationEvent[] {
		return this.liveEvents;
	}

	/** Begin observing the document for mutations. */
	start(root: HTMLElement = document.body): void {
		if (this.observer) return;
		this.observer = new MutationObserver((records) => {
			this.pending.push(...records);
			this.flush();
		});
		this.observer.observe(root, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeOldValue: true,
			attributeFilter: ["class", "style", "id", "data-type", "aria-hidden"],
		});
		this.group.register(() => this.stop());
	}

	/** Stop observing and disconnect the observer (memory-safe). */
	stop(): void {
		this.observer?.disconnect();
		this.observer = null;
		this.pending = [];
	}

	/** Start a named recording session (auto-starts observation). */
	startRecording(name: string): MutationRecording {
		this.start();
		this.recording = {
			id: uid("rec"),
			name,
			startedAt: Date.now(),
			endedAt: null,
			events: [],
		};
		return this.recording;
	}

	/** Stop the active recording and return it for export/persistence. */
	stopRecording(): MutationRecording | null {
		if (!this.recording) return null;
		this.recording.endedAt = Date.now();
		const done = this.recording;
		this.recording = null;
		return done;
	}

	/** Clear the live timeline. */
	clear(): void {
		this.liveEvents.length = 0;
	}

	private process(): void {
		const records = this.pending;
		this.pending = [];
		for (const record of records) {
			for (const event of this.toEvents(record)) {
				this.push(event);
			}
		}
	}

	private push(event: MutationEvent): void {
		this.liveEvents.push(event);
		if (this.liveEvents.length > this.maxEvents) this.liveEvents.shift();
		if (this.recording) {
			this.recording.events.push(event);
			if (this.recording.events.length > this.maxEvents) {
				this.recording.events.shift();
			}
		}
		this.bus.emit("mutation-recorded", { event });
	}

	private toEvents(record: MutationRecord): MutationEvent[] {
		const events: MutationEvent[] = [];
		const target = record.target instanceof HTMLElement ? record.target : null;
		const selector = target ? safeSelector(target) : "(detached)";

		if (record.type === "childList") {
			record.addedNodes.forEach((n) => {
				if (n instanceof HTMLElement && !isOwnUi(n)) {
					events.push(this.make("element-added", safeSelector(n), `Added <${n.tagName.toLowerCase()}>`));
				}
			});
			record.removedNodes.forEach((n) => {
				if (n instanceof HTMLElement && !isOwnUi(n)) {
					events.push(this.make("element-removed", selector, `Removed <${n.tagName.toLowerCase()}>`));
				}
			});
		} else if (record.type === "attributes" && target && !isOwnUi(target)) {
			const attr = record.attributeName ?? "";
			const kind: MutationKind =
				attr === "class" ? "class-modified" : attr === "style" ? "style-changed" : "attribute-changed";
			const newValue = target.getAttribute(attr) ?? "";
			events.push({
				...this.make(kind, selector, `${attr} changed on <${target.tagName.toLowerCase()}>`),
				previousValue: record.oldValue ?? undefined,
				newValue,
			});
		}
		return events;
	}

	private make(kind: MutationKind, targetSelector: string, summary: string): MutationEvent {
		return { id: uid("mut"), kind, timestamp: Date.now(), targetSelector, summary };
	}

	dispose(): void {
		this.stop();
		this.group.dispose();
		this.liveEvents.length = 0;
	}
}

function safeSelector(el: HTMLElement): string {
	try {
		return buildUniqueSelector(el);
	} catch {
		return el.tagName.toLowerCase();
	}
}

/** Ignore mutations caused by AXXA's own overlays/UI to avoid feedback loops. */
const OWN_UI = ".axxa-overlay-root, .axxa-inspector-view, .axxa-floating, .axxa-debuglog";
function isOwnUi(el: HTMLElement): boolean {
	return (
		!!el.closest?.(OWN_UI) ||
		el.classList.contains("axxa-overlay-root") ||
		el.classList.contains("axxa-floating")
	);
}
