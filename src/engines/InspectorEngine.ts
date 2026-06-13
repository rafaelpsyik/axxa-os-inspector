import { DisposableGroup, type IDisposable } from "../core/Disposable";
import { EventBus } from "../core/EventBus";
import type { AxxaEventMap } from "../types/events";
import type { OverlayManager } from "./OverlayManager";
import { throttle, type Cancellable } from "../utils/schedule";

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

	/**
	 * Walk the DOM from the current selection using the floating arrow controls
	 * (Feature 1 navigation). Returns false when there is no element in that
	 * direction so the UI can disable the corresponding arrow.
	 */
	navigate(direction: "parent" | "child" | "next" | "previous"): boolean {
		const el = this.selection;
		if (!el) return false;
		let target: Element | null = null;
		switch (direction) {
			case "parent":
				target = el.parentElement;
				break;
			case "child":
				target = el.firstElementChild;
				break;
			case "next":
				target = el.nextElementSibling;
				break;
			case "previous":
				target = el.previousElementSibling;
				break;
		}
		if (target instanceof HTMLElement) {
			this.select(target);
			return true;
		}
		return false;
	}

	private attach(): void {
		const onPointerMove = (e: Event) => this.onMove(e as PointerEvent);
		const onPointerDown = (e: Event) => this.handlePointerDown(e as PointerEvent);
		const onPointerUp = (e: Event) => this.handlePointerUp(e as PointerEvent);
		const onClick = (e: Event) => this.handleClick(e as PointerEvent);
		const onKey = (e: Event) => this.handleKey(e as KeyboardEvent);

		// Capture phase so we intercept BEFORE Obsidian's own handlers. On touch
		// Obsidian reacts to pointerdown/touchstart (swipe to open sidebars,
		// scroll, long-press menus) — so to truly "freeze" the screen we must
		// preventDefault + stopPropagation at pointerdown AND pointerup, not just
		// on click. `touch-action: none` (body.axxa-inspecting) blocks scroll/zoom.
		document.addEventListener("pointermove", onPointerMove, true);
		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("pointerup", onPointerUp, true);
		document.addEventListener("click", onClick, true);
		document.addEventListener("keydown", onKey, true);
		this.group.register(() => {
			document.removeEventListener("pointermove", onPointerMove, true);
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("pointerup", onPointerUp, true);
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
	 * Down: swallow the gesture so Obsidian never sees it, and immediately
	 * highlight what's under the pointer/finger so the user gets feedback before
	 * committing. Events over AXXA's own UI pass through untouched.
	 */
	private handlePointerDown(e: PointerEvent): void {
		const el = this.elementAt(e);
		if (!el) return; // over our own UI — let it work normally
		e.preventDefault();
		e.stopPropagation();
		this.frozen = null; // allow re-targeting with a new press
		this.overlay.highlight(el);
		this.bus.emit("hover-element", { element: el });
	}

	/**
	 * Up: this is where selection commits (works identically for mouse and
	 * touch, and doesn't depend on a synthesized `click` that touch-action /
	 * preventDefault may suppress).
	 */
	private handlePointerUp(e: PointerEvent): void {
		const el = this.elementAt(e);
		if (!el) return;
		e.preventDefault();
		e.stopPropagation();
		this.select(el);
	}

	/** Click is selection-neutral now — we only swallow it so Obsidian never
	 * receives the tap that already drove a selection. */
	private handleClick(e: PointerEvent): void {
		const el = this.elementAt(e);
		if (!el) return;
		e.preventDefault();
		e.stopPropagation();
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
		if (target.closest(".axxa-overlay-root, .axxa-inspector-view, .axxa-panel, .axxa-floating")) {
			return null;
		}
		return target;
	}

	dispose(): void {
		this.detach();
		this.group.dispose();
	}
}
