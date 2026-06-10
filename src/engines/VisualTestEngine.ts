import { DisposableGroup, type IDisposable } from "../core/Disposable";
import { EventBus } from "../core/EventBus";
import type { AxxaEventMap } from "../types/events";
import { uid } from "../utils/id";
import type { VisualTestAction } from "../types/experiment";

/**
 * Visual Identification + Isolation Engine (Features 4 & 5).
 *
 * Every action is *reversible*: applying an action returns a teardown that
 * restores the exact prior state. Internally each tweak is stored as a small
 * revert closure so "reset element" / "exit isolation" can unwind precisely,
 * with no leftover inline styles.
 *
 * All effects are pure CSS class toggles or inline-style writes — nothing here
 * mutates Obsidian internals (Feature 19).
 */
export class VisualTestEngine implements IDisposable {
	private readonly group = new DisposableGroup();
	/** Active reverts keyed by element, so we can stack/clear them. */
	private readonly active = new WeakMap<HTMLElement, Map<VisualTestAction, () => void>>();
	private isolationRevert: (() => void) | null = null;

	constructor(private readonly bus: EventBus<AxxaEventMap>) {}

	/**
	 * Apply a reversible visual test to `el`. Re-applying the same action acts
	 * as a toggle (revert + clear). Returns a revert-id token.
	 */
	apply(el: HTMLElement, action: VisualTestAction): string {
		const existing = this.active.get(el)?.get(action);
		if (existing) {
			existing();
			this.active.get(el)?.delete(action);
			this.bus.emit("visual-test-changed", { action, active: false });
			return "";
		}

		const revert = this.run(el, action);
		let map = this.active.get(el);
		if (!map) {
			map = new Map();
			this.active.set(el, map);
		}
		map.set(action, revert);
		this.bus.emit("visual-test-changed", { action, active: true });
		return uid("vt");
	}

	/** Revert every active visual test on a single element. */
	revertElement(el: HTMLElement): void {
		const map = this.active.get(el);
		if (!map) return;
		for (const revert of map.values()) revert();
		this.active.delete(el);
	}

	// ── Feature 5: Isolation Mode ──────────────────────────────────────────────

	/**
	 * Hide every element except `el`, its ancestors, and its descendants. The
	 * ancestor chain stays visible so the isolated subtree keeps its layout
	 * context (parent preservation requirement).
	 */
	isolate(el: HTMLElement): void {
		this.exitIsolation();
		const keep = new Set<HTMLElement>();
		// Preserve ancestor chain to the root.
		let current: HTMLElement | null = el;
		while (current) {
			keep.add(current);
			current = current.parentElement;
		}
		// Hide every sibling along the ancestor chain that is not on the path.
		const hidden: HTMLElement[] = [];
		let node: HTMLElement | null = el;
		while (node && node.parentElement) {
			for (const sibling of Array.from(node.parentElement.children)) {
				if (!keep.has(sibling as HTMLElement) && !sibling.classList.contains("axxa-overlay-root")) {
					(sibling as HTMLElement).addClass("axxa-isolation-hidden");
					hidden.push(sibling as HTMLElement);
				}
			}
			node = node.parentElement;
		}
		document.body.addClass("axxa-isolation-active");
		this.isolationRevert = () => {
			hidden.forEach((h) => h.removeClass("axxa-isolation-hidden"));
			document.body.removeClass("axxa-isolation-active");
		};
		this.bus.emit("isolation-changed", { active: true });
	}

	exitIsolation(): void {
		if (!this.isolationRevert) return;
		this.isolationRevert();
		this.isolationRevert = null;
		this.bus.emit("isolation-changed", { active: false });
	}

	get isIsolating(): boolean {
		return this.isolationRevert !== null;
	}

	// ── action implementations ─────────────────────────────────────────────────

	private run(el: HTMLElement, action: VisualTestAction): () => void {
		switch (action) {
			case "highlight-red":
				return this.applyClass(el, "axxa-vt-red");
			case "highlight-green":
				return this.applyClass(el, "axxa-vt-green");
			case "highlight-blue":
				return this.applyClass(el, "axxa-vt-blue");
			case "pulse":
				return this.applyClass(el, "axxa-vt-pulse");
			case "outline":
				return this.applyClass(el, "axxa-vt-outline");
			case "flash":
				return this.flash(el);
			case "hide":
				return this.applyClass(el, "axxa-vt-hidden");
			case "remove":
				return this.remove(el);
			case "dim-others":
				return this.dimOthers(el);
			case "focus":
				return this.focus(el);
			case "isolate":
				this.isolate(el);
				return () => this.exitIsolation();
		}
	}

	private applyClass(el: HTMLElement, cls: string): () => void {
		el.addClass(cls);
		return () => el.removeClass(cls);
	}

	/** One-shot flash that auto-reverts after the animation. */
	private flash(el: HTMLElement): () => void {
		el.addClass("axxa-vt-flash");
		const timer = window.setTimeout(() => el.removeClass("axxa-vt-flash"), 600);
		return () => {
			window.clearTimeout(timer);
			el.removeClass("axxa-vt-flash");
		};
	}

	/** Detach the element but keep a handle so it can be re-inserted. */
	private remove(el: HTMLElement): () => void {
		const parent = el.parentElement;
		const next = el.nextElementSibling;
		el.remove();
		return () => {
			if (!parent) return;
			if (next && next.parentElement === parent) parent.insertBefore(el, next);
			else parent.appendChild(el);
		};
	}

	/** Dim everything except the element's ancestor chain + subtree. */
	private dimOthers(el: HTMLElement): () => void {
		document.body.addClass("axxa-dim-active");
		const lit: HTMLElement[] = [];
		let current: HTMLElement | null = el;
		while (current) {
			current.addClass("axxa-dim-keep");
			lit.push(current);
			current = current.parentElement;
		}
		el.querySelectorAll<HTMLElement>("*").forEach((d) => {
			d.addClass("axxa-dim-keep");
			lit.push(d);
		});
		return () => {
			document.body.removeClass("axxa-dim-active");
			lit.forEach((l) => l.removeClass("axxa-dim-keep"));
		};
	}

	/** Center + emphasise the element (non-destructive transform). */
	private focus(el: HTMLElement): () => void {
		el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
		el.addClass("axxa-vt-focus");
		return () => el.removeClass("axxa-vt-focus");
	}

	dispose(): void {
		this.exitIsolation();
		this.group.dispose();
	}
}
