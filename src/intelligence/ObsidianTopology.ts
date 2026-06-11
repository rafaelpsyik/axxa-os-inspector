/**
 * Obsidian-Specific Intelligence (Feature 11).
 *
 * Maps raw DOM elements to friendly semantic labels by matching against the
 * well-known Obsidian workspace class structure. This is the difference
 * between showing the user `".status-bar.mod-root"` and `"Status Bar"`.
 *
 * The rules are ordered most-specific-first; the first match wins. Everything
 * is class-based string matching against the public Obsidian DOM contract — no
 * private APIs are touched (Feature 19 security constraint).
 */

interface TopologyRule {
	/** Returns true when `el` is an instance of this Obsidian region. */
	match: (el: HTMLElement) => boolean;
	/** Friendly label shown in breadcrumbs, tree and tooltips. */
	label: string;
	/** Short category used for grouping/icons. */
	category: ObsidianRegionCategory;
}

export type ObsidianRegionCategory =
	| "workspace"
	| "leaf"
	| "view"
	| "sidebar"
	| "chrome"
	| "overlay"
	| "mobile";

const hasClass =
	(...classes: string[]) =>
	(el: HTMLElement): boolean =>
		classes.every((c) => el.classList.contains(c));

const anyClass =
	(...classes: string[]) =>
	(el: HTMLElement): boolean =>
		classes.some((c) => el.classList.contains(c));

/**
 * Ordered recognition rules. More specific structures appear before their
 * generic containers so the most meaningful label is chosen.
 */
const RULES: TopologyRule[] = [
	{ match: anyClass("modal-container"), label: "Modal", category: "overlay" },
	{ match: anyClass("modal"), label: "Modal Window", category: "overlay" },
	{ match: anyClass("prompt"), label: "Command Palette", category: "overlay" },
	{ match: anyClass("suggestion-container"), label: "Suggestions Popover", category: "overlay" },
	{ match: anyClass("menu"), label: "Context Menu", category: "overlay" },
	{ match: anyClass("popover", "hover-popover"), label: "Popover", category: "overlay" },
	{ match: anyClass("tooltip"), label: "Tooltip", category: "overlay" },

	{ match: anyClass("status-bar"), label: "Status Bar", category: "chrome" },
	{ match: anyClass("titlebar"), label: "Title Bar", category: "chrome" },
	{ match: anyClass("workspace-ribbon"), label: "Ribbon", category: "chrome" },

	{ match: hasClass("mod-left-split"), label: "Left Sidebar", category: "sidebar" },
	{ match: hasClass("mod-right-split"), label: "Right Sidebar", category: "sidebar" },
	{ match: anyClass("workspace-drawer"), label: "Mobile Drawer", category: "mobile" },
	{ match: anyClass("mobile-navbar"), label: "Mobile Navigation", category: "mobile" },
	{ match: anyClass("mobile-toolbar"), label: "Mobile Toolbar", category: "mobile" },

	{ match: anyClass("workspace-tab-header-container"), label: "Tab Header Bar", category: "leaf" },
	{ match: anyClass("workspace-tab-header"), label: "Tab Header", category: "leaf" },
	{ match: anyClass("workspace-tabs"), label: "Tab Group", category: "leaf" },
	{ match: anyClass("view-header"), label: "View Header", category: "view" },
	{ match: anyClass("view-content"), label: "View Content", category: "view" },
	{ match: anyClass("workspace-leaf-content"), label: "Leaf Content", category: "leaf" },
	{ match: anyClass("workspace-leaf"), label: "Workspace Leaf", category: "leaf" },
	{ match: anyClass("workspace-split"), label: "Workspace Split", category: "workspace" },
	{ match: hasClass("workspace"), label: "Workspace", category: "workspace" },

	{ match: anyClass("cm-editor"), label: "Editor (CodeMirror)", category: "view" },
	{ match: anyClass("markdown-preview-view"), label: "Reading View", category: "view" },
	{ match: anyClass("markdown-source-view"), label: "Source View", category: "view" },
];

export class ObsidianTopology {
	/** Return the friendly label for `el`, or null when it is not a known region. */
	identify(el: HTMLElement): { label: string; category: ObsidianRegionCategory } | null {
		for (const rule of RULES) {
			if (rule.match(el)) {
				return { label: rule.label, category: rule.category };
			}
		}
		return null;
	}

	/** Return just the label, or null. Convenience for descriptors. */
	labelFor(el: HTMLElement): string | null {
		return this.identify(el)?.label ?? null;
	}

	/**
	 * Walk up from `el` and return the nearest recognised region. Used by the
	 * inspector to contextualise deeply-nested anonymous elements.
	 */
	nearestRegion(el: HTMLElement): { element: HTMLElement; label: string } | null {
		let current: HTMLElement | null = el;
		while (current) {
			const hit = this.identify(current);
			if (hit) return { element: current, label: hit.label };
			current = current.parentElement;
		}
		return null;
	}

	/**
	 * Walk the DOM and return every recognised Obsidian region. Powers the
	 * secret X-Ray reveal — a one-shot architectural map of the whole UI.
	 * Class-based matching only, so it's cheap even across the full body; capped
	 * to keep the reveal responsive.
	 */
	scanRegions(
		root: HTMLElement = document.body,
		limit = 400,
	): { element: HTMLElement; label: string; category: ObsidianRegionCategory }[] {
		const out: { element: HTMLElement; label: string; category: ObsidianRegionCategory }[] = [];
		for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
			if (el.closest(".axxa-overlay-root, .axxa-floating, .axxa-debuglog, .axxa-xray-root, .axxa-inspector-view")) {
				continue;
			}
			const hit = this.identify(el);
			if (hit) {
				out.push({ element: el, label: hit.label, category: hit.category });
				if (out.length >= limit) break;
			}
		}
		return out;
	}
}
