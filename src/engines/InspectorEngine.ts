import { DisposableGroup, type IDisposable } from "../core/Disposable";
import { EventBus } from "../core/EventBus";
import type { AxxaEventMap } from "../types/events";
import type { OverlayManager } from "./OverlayManager";
import { throttle, type Cancellable } from "../utils/schedule";
import { isTouchPrimary } from "../utils/platform";

/**
 * Inspector Engine — drives Interactive Inspect Mode (Feature 1).
 *
 * When active it listens for pointer movement (throttled, Feature 16), asks the
 * {@link OverlayManager} to highlight the element under the cursor, and on click
 * freezes the selection and broadcasts it on the {@link EventBus}. It keeps a
 * single "frozen" selection so the rest of the app (panel, CSS engine, visual
 * tests) all operate on one agreed target.
 *
 * It deliberately ignores its own UI (anything inside `.axxa-overlay-root` or
 * the inspector panel) so the tool can never inspect itself.
 */
export class InspectorEngine implements IDisposable {
	/** Recreated on each detach so inspect-mode listeners are cleanly scoped. */
	private group = new DisposableGroup();
	private active = false;
	private frozen: HTMLElement | null = null;
	private selection: HTMLElement | null = null;
	private readonly onMove: Cancellable<(e: PointerEvent) => void>;

	constructor(
		private readonly bus: EventBus<AxxaEventMap>,
		private readonly overlay: OverlayManager,
		throttleMs: number,
	) {
		this.onMove = throttle((e: PointerEvent) => this.handleMove(e), throttleMs);
		this.group.register(() => this.onMove.cancel());
	}

	get isActive(): boolean {
		return this.active;
	}

	get selected(): HTMLElement | null {
		return this.selection;
	}

	/** Toggle inspect mode. No listeners exist while inactive (Feature 16). */
	setActive(active: boolean): void {
		if (active === this.active) return;
		this.active = active;
		if (active) this.attach();
		else this.detach();
		this.bus.emit("inspect-mode-changed", { active });
	}

	/** Programmatically select an element (from tree, breadcrumb, search). */
	select(el: HTMLElement): void {
		this.selection = el;
		this.frozen = el;
		this.overlay.highlight(el);
		this.bus.emit("selection-changed", { element: el });
	}

	/** Clear the current selection. */
	clearSelection(): void {
		this.selection = null;
		this.frozen = null;
		this.overlay.hide();
		this.bus.emit("selection-changed", { element: null });
	}

	private attach(): void {
		const onPointerMove = (e: Event) => this.onMove(e as PointerEvent);
		const onPointerDown = (e: Event) => this.handlePointerDown(e as PointerEvent);
		const onClick = (e: Event) => this.handleClick(e as PointerEvent);
		const onKey = (e: Event) => this.handleKey(e as KeyboardEvent);

		// Capture phase so we see events before Obsidian's own handlers and can
		// preventDefault on the inspecting click.
		document.addEventListener("pointermove", onPointerMove, true);
		// Touch devices have no hover: a tap (pointerdown) must immediately show
		// what is under the finger so the user can confirm before selecting.
		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("click", onClick, true);
		document.addEventListener("keydown", onKey, true);
		this.group.register(() => {
			document.removeEventListener("pointermove", onPointerMove, true);
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("click", onClick, true);
			document.removeEventListener("keydown", onKey, true);
		});
		document.body.addClass("axxa-inspecting");
		this.group.register(() => document.body.removeClass("axxa-inspecting"));
	}

	private detach(): void {
		// Re-create a fresh group: dispose tears down listeners added in attach.
		this.group.dispose();
		this.overlay.hide();
		this.group = new DisposableGroup();
		this.group.register(() => this.onMove.cancel());
	}

	private handleMove(e: PointerEvent): void {
		if (this.frozen) return; // selection frozen — stop following the pointer
		const el = this.elementAt(e);
		if (!el) {
			this.overlay.hide();
			this.bus.emit("hover-element", { element: null });
			return;
		}
		this.overlay.highlight(el);
		this.bus.emit("hover-element", { element: el });
	}

	/**
	 * Touch tap feedback. On touch-primary devices there is no hover, so the
	 * first tap un-freezes any prior selection and highlights what is under the
	 * finger; the subsequent `click` confirms the selection. On mouse devices
	 * this is a no-op (hover already drives the highlight).
	 */
	private handlePointerDown(e: PointerEvent): void {
		if (!isTouchPrimary() && e.pointerType !== "touch") return;
		const el = this.elementAt(e);
		if (!el) return;
		this.frozen = null; // allow re-targeting with a new tap
		this.overlay.highlight(el);
		this.bus.emit("hover-element", { element: el });
	}

	private handleClick(e: PointerEvent): void {
		const el = this.elementAt(e);
		if (!el) return;
		e.preventDefault();
		e.stopPropagation();
		this.select(el);
	}

	private handleKey(e: KeyboardEvent): void {
		if (e.key === "Escape") {
			if (this.frozen) {
				this.frozen = null; // un-freeze, resume hovering
				this.bus.emit("selection-changed", { element: this.selection });
			} else {
				this.setActive(false);
			}
		}
	}

	/** Resolve the element under the pointer, skipping AXXA's own overlay/UI. */
	private elementAt(e: PointerEvent): HTMLElement | null {
		const target = document.elementFromPoint(e.clientX, e.clientY);
		if (!(target instanceof HTMLElement)) return null;
		if (target.closest(".axxa-overlay-root, .axxa-inspector-view, .axxa-panel")) {
			return null;
		}
		return target;
	}

	dispose(): void {
		this.detach();
		this.group.dispose();
	}
}
