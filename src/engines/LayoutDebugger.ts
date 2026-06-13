import { DisposableGroup, type IDisposable } from "../core/Disposable";

/** The layout-debugging visualisations available (Feature 10). */
export type LayoutOverlayMode =
	| "flex-containers"
	| "grid-containers"
	| "scroll-containers"
	| "sticky-elements"
	| "fixed-elements"
	| "absolute-elements"
	| "overflow-boundaries"
	| "stacking-contexts"
	| "padding-regions"
	| "margins"
	| "safe-areas";

/**
 * Layout Debugging Tools (Feature 10).
 *
 * Scans the document for elements matching a given layout characteristic and
 * tags them with a body-scoped class so `styles.css` can draw the appropriate
 * outline/label. Modes are independently toggleable and fully reversible.
 *
 * This is the workhorse for fullscreen/overlay/mobile layout debugging:
 * highlighting every fixed/sticky/scroll/stacking element at once reveals what
 * is actually driving an overlap or clearance bug.
 */
export class LayoutDebugger implements IDisposable {
	private readonly group = new DisposableGroup();
	private readonly active = new Map<LayoutOverlayMode, () => void>();

	get activeModes(): LayoutOverlayMode[] {
		return Array.from(this.active.keys());
	}

	/** Toggle a layout overlay mode on/off. */
	toggle(mode: LayoutOverlayMode): boolean {
		const existing = this.active.get(mode);
		if (existing) {
			existing();
			this.active.delete(mode);
			return false;
		}
		this.active.set(mode, this.enable(mode));
		return true;
	}

	private enable(mode: LayoutOverlayMode): () => void {
		const cls = `axxa-layout-${mode}`;
		const tagged = this.scan(mode);
		tagged.forEach((el) => el.addClass(cls));
		document.body.addClass(`axxa-layout-active`);
		return () => {
			tagged.forEach((el) => el.removeClass(cls));
			if (this.active.size <= 1) document.body.removeClass("axxa-layout-active");
		};
	}

	/** Find all elements that exhibit the characteristic for `mode`. */
	private scan(mode: LayoutOverlayMode): HTMLElement[] {
		const all = Array.from(document.body.querySelectorAll<HTMLElement>("*"));
		return all.filter((el) => {
			if (el.closest(".axxa-overlay-root, .axxa-inspector-view")) return false;
			const cs = getComputedStyle(el);
			switch (mode) {
				case "flex-containers":
					return cs.display === "flex" || cs.display === "inline-flex";
				case "grid-containers":
					return cs.display === "grid" || cs.display === "inline-grid";
				case "scroll-containers":
					return ["auto", "scroll"].includes(cs.overflowY) || ["auto", "scroll"].includes(cs.overflowX);
				case "sticky-elements":
					return cs.position === "sticky";
				case "fixed-elements":
					return cs.position === "fixed";
				case "absolute-elements":
					return cs.position === "absolute";
				case "overflow-boundaries":
					return cs.overflow !== "visible";
				case "stacking-contexts":
					return createsStackingContext(cs);
				case "padding-regions":
					return parseFloat(cs.paddingTop) > 0 || parseFloat(cs.paddingLeft) > 0;
				case "margins":
					return parseFloat(cs.marginTop) > 0 || parseFloat(cs.marginLeft) > 0;
				case "safe-areas":
					return /env\(safe-area/.test(el.getAttribute("style") ?? "");
			}
		});
	}

	/** Clear every active overlay. */
	clearAll(): void {
		for (const revert of this.active.values()) revert();
		this.active.clear();
		document.body.removeClass("axxa-layout-active");
	}

	dispose(): void {
		this.clearAll();
		this.group.dispose();
	}
}

/** Heuristic: does this computed style establish a new stacking context? */
function createsStackingContext(cs: CSSStyleDeclaration): boolean {
	if (cs.position !== "static" && cs.zIndex !== "auto") return true;
	if (parseFloat(cs.opacity) < 1) return true;
	if (cs.transform !== "none") return true;
	if (cs.filter !== "none") return true;
	if (cs.mixBlendMode !== "normal") return true;
	if (cs.isolation === "isolate") return true;
	if (cs.willChange.includes("transform") || cs.willChange.includes("opacity")) return true;
	return false;
}
