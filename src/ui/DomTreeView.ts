import { setIcon } from "obsidian";
import { DisposableGroup, type IDisposable } from "../core/Disposable";
import type { ServiceContainer } from "../core/ServiceContainer";
import { Tokens } from "../core/tokens";
import { debounce, type Cancellable } from "../utils/schedule";

type RootMode = "active-view" | "body" | "selection";

/** Per-node child cap so a huge subtree never renders thousands of rows. */
const CHILD_CAP = 200;

/** AXXA's own UI — mutations here must never drive a tree refresh. */
const OWN_UI_SELECTOR = ".axxa-inspector-view, .axxa-floating, .axxa-overlay-root, .axxa-debuglog";

/**
 * Live DOM tree viewer (Feature 6).
 *
 * Renders a collapsible tree of the live document and **keeps it in sync as the
 * DOM is built/changed** via its own debounced MutationObserver (disconnected on
 * dispose). Tapping a node selects it for inspection; nodes that have been
 * edited in the inspector are flagged with a red dot.
 *
 * Rendering is lazy — only expanded nodes render their children — and children
 * are capped, so even `document.body` of a heavy vault stays responsive
 * (performance mandate, Feature 16).
 */
export class DomTreeView implements IDisposable {
	private readonly group = new DisposableGroup();
	private treeEl!: HTMLElement;
	private rootMode: RootMode = "active-view";
	/** Expansion state survives re-renders (keyed by the live element). */
	private readonly expanded = new WeakSet<HTMLElement>();
	/** Row element per rendered node, for cheap selection/edit updates. */
	private rows = new Map<HTMLElement, HTMLElement>();
	private observer: MutationObserver | null = null;
	private readonly scheduleRefresh: Cancellable<() => void>;

	constructor(
		private readonly parent: HTMLElement,
		private readonly container: ServiceContainer,
		private readonly compact = false,
	) {
		this.scheduleRefresh = debounce(() => this.refresh(), 180);
		this.build();
		this.observe();

		const { bus } = this.container;
		this.group.register(bus.on("selection-changed", () => this.markSelection()));
		this.group.register(bus.on("changes-updated", () => this.markEdits()));
		this.group.register(() => this.scheduleRefresh.cancel());
	}

	private build(): void {
		const wrap = this.parent.createDiv({ cls: "axxa-domtree" });
		if (this.compact) wrap.addClass("is-compact");

		// Root selector: which subtree to mirror.
		const modes = wrap.createDiv({ cls: "axxa-domtree-modes" });
		const chip = (label: string, mode: RootMode) => {
			const b = modes.createEl("button", { cls: ["axxa-chip", this.rootMode === mode ? "is-active" : ""] });
			b.setText(label);
			b.onclick = () => {
				this.rootMode = mode;
				modes.findAll(".axxa-chip").forEach((c) => c.removeClass("is-active"));
				b.addClass("is-active");
				this.refresh();
			};
		};
		chip(this.compact ? "View" : "Active view", "active-view");
		chip(this.compact ? "App" : "Whole app", "body");
		chip(this.compact ? "Sel" : "Selection", "selection");

		this.treeEl = wrap.createDiv({ cls: "axxa-domtree-scroll" });
		this.refresh();
	}

	/** Resolve the root element for the current mode. */
	private resolveRoot(): HTMLElement | null {
		switch (this.rootMode) {
			case "body":
				return document.body;
			case "selection":
				return this.container.resolve(Tokens.Inspector).selected ?? document.body;
			case "active-view": {
				const active =
					document.querySelector<HTMLElement>(".workspace-leaf.mod-active .view-content") ??
					document.querySelector<HTMLElement>(".workspace-leaf.mod-active") ??
					document.querySelector<HTMLElement>(".workspace-leaf .view-content");
				return active ?? document.body;
			}
		}
	}

	/** Rebuild the visible tree, preserving expansion + selection markers. */
	private refresh(): void {
		const root = this.resolveRoot();
		this.rows.clear();
		this.treeEl.empty();
		if (!root) {
			this.treeEl.createDiv({ cls: "axxa-muted axxa-empty-row", text: "No root element." });
			return;
		}
		// Root is expanded by default the first time it's seen.
		if (!this.expanded.has(root)) this.expanded.add(root);
		this.renderNode(root, this.treeEl, 0);
		this.markSelection();
	}

	private renderNode(el: HTMLElement, parent: HTMLElement, depth: number): void {
		const dom = this.container.resolve(Tokens.Dom);
		const css = this.container.resolve(Tokens.Css);
		const useSemantic = this.container.resolve(Tokens.Persistence).settings.useSemanticLabels;

		const node = parent.createDiv({ cls: "axxa-domtree-node" });
		const row = node.createDiv({ cls: "axxa-domtree-row" });
		row.style.paddingLeft = `${depth * 12 + 4}px`;
		this.rows.set(el, row);

		const childEls = Array.from(el.children).filter(
			(c): c is HTMLElement => c instanceof HTMLElement && !isOwnUi(c),
		);
		const hasChildren = childEls.length > 0;

		// Expander twisty.
		const twisty = row.createSpan({ cls: "axxa-domtree-twisty" });
		if (hasChildren) {
			setIcon(twisty, this.expanded.has(el) ? "chevron-down" : "chevron-right");
			twisty.onclick = (e) => {
				e.stopPropagation();
				if (this.expanded.has(el)) this.expanded.delete(el);
				else this.expanded.add(el);
				this.refresh();
			};
		} else {
			twisty.addClass("is-leaf");
		}

		// Label (semantic when available, else tag + first class).
		const semantic = useSemantic ? dom.describe(el).semanticLabel : null;
		const label = row.createSpan({ cls: "axxa-domtree-label" });
		label.setText(semantic ?? shortLabel(el));
		if (hasChildren) label.createSpan({ cls: "axxa-muted", text: ` ${childEls.length}` });

		// Red dot when this element has live edits.
		if (css.hasEdits(el)) row.createSpan({ cls: "axxa-domtree-dot", attr: { "aria-label": "edited" } });

		// Tap the row to select for inspection.
		row.onclick = () => this.container.resolve(Tokens.Inspector).select(el);

		// Children (lazy: only when expanded).
		if (hasChildren && this.expanded.has(el)) {
			const childWrap = node.createDiv({ cls: "axxa-domtree-children" });
			const shown = childEls.slice(0, CHILD_CAP);
			for (const child of shown) this.renderNode(child, childWrap, depth + 1);
			if (childEls.length > CHILD_CAP) {
				childWrap
					.createDiv({ cls: "axxa-muted axxa-domtree-more" })
					.setText(`+${childEls.length - CHILD_CAP} more…`);
			}
		}
	}

	/** Highlight the selected node's row and expand its ancestors. */
	private markSelection(): void {
		const selected = this.container.resolve(Tokens.Inspector).selected;
		this.rows.forEach((row, el) => row.toggleClass("is-selected", el === selected));
		if (!selected) return;
		// Ensure ancestors are expanded so the selection is visible.
		let needsRefresh = false;
		let cur: HTMLElement | null = selected.parentElement;
		while (cur) {
			if (!this.expanded.has(cur)) {
				this.expanded.add(cur);
				needsRefresh = true;
			}
			cur = cur.parentElement;
		}
		if (needsRefresh) {
			this.refresh();
		} else {
			this.rows.get(selected)?.scrollIntoView({ block: "nearest" });
		}
	}

	/** Refresh just the red edit-dots without a full rebuild. */
	private markEdits(): void {
		const css = this.container.resolve(Tokens.Css);
		this.rows.forEach((row, el) => {
			const has = css.hasEdits(el);
			const dot = row.querySelector(".axxa-domtree-dot");
			if (has && !dot) row.createSpan({ cls: "axxa-domtree-dot", attr: { "aria-label": "edited" } });
			else if (!has && dot) dot.remove();
		});
	}

	private observe(): void {
		// Ignore mutations originating inside AXXA's own UI, otherwise rebuilding
		// the tree (which mutates the panel) would retrigger the observer forever.
		this.observer = new MutationObserver((records) => {
			for (const r of records) {
				const t = r.target;
				if (t instanceof HTMLElement && !t.closest(OWN_UI_SELECTOR)) {
					this.scheduleRefresh();
					return;
				}
			}
		});
		this.observer.observe(document.body, { subtree: true, childList: true });
		this.group.register(() => {
			this.observer?.disconnect();
			this.observer = null;
		});
	}

	dispose(): void {
		this.group.dispose();
		this.rows.clear();
	}
}

function shortLabel(el: HTMLElement): string {
	let s = el.tagName.toLowerCase();
	if (el.id) s += `#${el.id}`;
	else if (el.classList.length) s += `.${Array.from(el.classList).slice(0, 2).join(".")}`;
	return s;
}

/** Skip AXXA's own UI so the tree never shows its own overlays/panels. */
function isOwnUi(el: HTMLElement): boolean {
	return (
		el.classList.contains("axxa-overlay-root") ||
		el.classList.contains("axxa-floating") ||
		el.classList.contains("axxa-debuglog") ||
		el.classList.contains("axxa-inspector-view") ||
		el.id === "axxa-experiments"
	);
}
