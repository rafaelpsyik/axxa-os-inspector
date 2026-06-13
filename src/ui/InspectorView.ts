import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type { ServiceContainer } from "../core/ServiceContainer";
import { Tokens } from "../core/tokens";
import { DisposableGroup } from "../core/Disposable";
import { buildUniqueSelector, buildXPath, buildDomPath } from "../utils/selector";
import { copyToClipboard } from "../utils/clipboard";
import { computeBoxModel } from "../utils/dom";
import { formatSpecificity } from "../utils/specificity";
import type { VisualTestAction } from "../types/experiment";
import type { ExportFormat } from "../types/export";
import { renderStyleEditor } from "./StyleEditor";
import { renderCappedList } from "./list";
import { DomTreeView } from "./DomTreeView";
import { saveSnippet } from "../utils/snippet";

export const AXXA_VIEW_TYPE = "axxa-inspector-view";

type TabId =
	| "inspect"
	| "styles"
	| "changes"
	| "dom"
	| "variables"
	| "stylesheets"
	| "mutations"
	| "experiments"
	| "layout";

const TABS: { id: TabId; label: string; icon: string }[] = [
	{ id: "inspect", label: "Inspect", icon: "mouse-pointer-click" },
	{ id: "styles", label: "Styles", icon: "paintbrush" },
	{ id: "changes", label: "Changes", icon: "history" },
	{ id: "dom", label: "DOM", icon: "list-tree" },
	{ id: "variables", label: "Variables", icon: "variable" },
	{ id: "stylesheets", label: "Sheets", icon: "file-code" },
	{ id: "mutations", label: "Mutations", icon: "activity" },
	{ id: "experiments", label: "Sandbox", icon: "flask-conical" },
	{ id: "layout", label: "Layout", icon: "layout-dashboard" },
];

/**
 * The AXXA Inspector panel — a single Obsidian {@link ItemView} hosting a tabbed
 * developer surface. It owns no engine logic: it subscribes to the
 * {@link EventBus}, reads from the engines on demand, and forwards user actions
 * back to them. All listeners and timers register on a {@link DisposableGroup}
 * scoped to the view's lifetime.
 */
export class InspectorView extends ItemView {
	private readonly group = new DisposableGroup();
	private activeTab: TabId = "inspect";
	private headerEl!: HTMLElement;
	private breadcrumbEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private changesBadge: HTMLElement | null = null;
	private selected: HTMLElement | null = null;
	/** Live DOM tree viewer — owns a MutationObserver, so it must be disposed
	 * whenever the body is re-rendered or the view closes. */
	private domTree: DomTreeView | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly container: ServiceContainer,
	) {
		super(leaf);
	}

	getViewType(): string {
		return AXXA_VIEW_TYPE;
	}
	getDisplayText(): string {
		return "AXXA Inspector";
	}
	getIcon(): string {
		return "scan-search";
	}

	protected async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("axxa-inspector-view");

		this.headerEl = root.createDiv({ cls: "axxa-header" });
		this.renderToolbar();
		this.breadcrumbEl = root.createDiv({ cls: "axxa-breadcrumb" });
		this.renderTabs(root);
		this.bodyEl = root.createDiv({ cls: "axxa-body" });

		// React to engine events.
		const { bus } = this.container;
		this.group.register(
			bus.on("selection-changed", ({ element }) => {
				this.selected = element;
				this.renderBreadcrumb();
				this.renderBody();
			}),
		);
		this.group.register(
			bus.on("inspect-mode-changed", () => this.renderToolbar()),
		);
		this.group.register(bus.on("history-changed", () => this.renderBody()));
		this.group.register(bus.on("mutation-recorded", () => {
			if (this.activeTab === "mutations") this.renderBody();
		}));
		this.group.register(bus.on("changes-updated", () => {
			this.updateChangesBadge();
			if (this.activeTab === "changes") this.renderBody();
		}));

		this.renderBreadcrumb();
		this.updateChangesBadge();
		this.renderBody();
	}

	protected async onClose(): Promise<void> {
		this.domTree?.dispose();
		this.domTree = null;
		this.group.dispose();
	}

	// ── Toolbar ─────────────────────────────────────────────────────────────────

	private renderToolbar(): void {
		this.headerEl.empty();
		const inspector = this.container.resolve(Tokens.Inspector);

		const toggle = this.headerEl.createEl("button", {
			cls: ["axxa-btn", inspector.isActive ? "is-active" : ""],
		});
		setIcon(toggle, "mouse-pointer-click");
		toggle.createSpan({ text: inspector.isActive ? "Inspecting…" : "Inspect" });
		toggle.setAttr("aria-pressed", String(inspector.isActive));
		toggle.onclick = () => inspector.setActive(!inspector.isActive);

		const isolate = this.headerEl.createEl("button", { cls: "axxa-btn" });
		setIcon(isolate, "focus");
		isolate.setAttr("aria-label", "Toggle isolation of the selected element");
		isolate.onclick = () => this.withSelection((el) => this.container.resolve(Tokens.VisualTest).isolate(el));

		const clearIsolate = this.headerEl.createEl("button", { cls: "axxa-btn" });
		setIcon(clearIsolate, "x-circle");
		clearIsolate.setAttr("aria-label", "Exit isolation");
		clearIsolate.onclick = () => this.container.resolve(Tokens.VisualTest).exitIsolation();
	}

	// ── Tabs ─────────────────────────────────────────────────────────────────────

	private renderTabs(root: HTMLElement): void {
		const strip = root.createDiv({ cls: "axxa-tabs" });
		strip.setAttr("role", "tablist");
		for (const tab of TABS) {
			const btn = strip.createEl("button", { cls: "axxa-tab" });
			btn.setAttr("role", "tab");
			btn.dataset.tab = tab.id;
			setIcon(btn.createSpan({ cls: "axxa-tab-icon" }), tab.icon);
			btn.createSpan({ text: tab.label });
			if (tab.id === "changes") {
				this.changesBadge = btn.createSpan({ cls: "axxa-badge is-hidden" });
			}
			const active = this.activeTab === tab.id;
			btn.toggleClass("is-active", active);
			btn.setAttr("aria-selected", String(active));
			btn.onclick = () => {
				this.activeTab = tab.id;
				strip.findAll(".axxa-tab").forEach((b) => b.removeClass("is-active"));
				btn.addClass("is-active");
				this.renderBody();
			};
		}
	}

	private updateChangesBadge(): void {
		if (!this.changesBadge) return;
		const count = this.container.resolve(Tokens.Css).changeCount;
		this.changesBadge.setText(String(count));
		this.changesBadge.toggleClass("is-hidden", count === 0);
	}

	// ── Breadcrumb (Feature 1) ────────────────────────────────────────────────────

	private renderBreadcrumb(): void {
		this.breadcrumbEl.empty();
		if (!this.selected) {
			this.breadcrumbEl.createSpan({ text: "No element selected", cls: "axxa-muted" });
			return;
		}
		const dom = this.container.resolve(Tokens.Dom);
		const crumbs = dom.breadcrumb(this.selected);
		const useSemantic = this.container.resolve(Tokens.Persistence).settings.useSemanticLabels;
		crumbs.forEach((crumb, i) => {
			if (i > 0) this.breadcrumbEl.createSpan({ text: " › ", cls: "axxa-muted" });
			const label = (useSemantic && crumb.semanticLabel) || crumb.label;
			const chip = this.breadcrumbEl.createEl("button", { cls: "axxa-crumb", text: label });
			chip.onclick = () => {
				const el = document.querySelector<HTMLElement>(crumb.selector);
				if (el) this.container.resolve(Tokens.Inspector).select(el);
			};
		});
	}

	// ── Body dispatcher ────────────────────────────────────────────────────────────

	private renderBody(): void {
		// Tear down the live tree (and its observer) before discarding the DOM.
		this.domTree?.dispose();
		this.domTree = null;
		this.bodyEl.empty();
		switch (this.activeTab) {
			case "inspect":
				return this.renderInspectTab();
			case "styles":
				return this.renderStylesTab();
			case "changes":
				return this.renderChangesTab();
			case "dom":
				return this.renderDomTab();
			case "variables":
				return this.renderVariablesTab();
			case "stylesheets":
				return this.renderStylesheetsTab();
			case "mutations":
				return this.renderMutationsTab();
			case "experiments":
				return this.renderExperimentsTab();
			case "layout":
				return this.renderLayoutTab();
		}
	}

	// ── Inspect tab: box model + visual tests + copy actions (Features 1, 4, 15) ──

	private renderInspectTab(): void {
		if (!this.requireSelection()) return;
		const el = this.selected!;
		const box = computeBoxModel(el);

		const card = this.bodyEl.createDiv({ cls: "axxa-card" });
		card.createEl("h4", { text: "Box model" });
		const grid = card.createDiv({ cls: "axxa-boxmodel" });
		grid.createDiv({ text: `content ${Math.round(box.content.width)}×${Math.round(box.content.height)}` });
		grid.createDiv({ text: `padding ${spacing(box.padding)}` });
		grid.createDiv({ text: `border ${spacing(box.border)}` });
		grid.createDiv({ text: `margin ${spacing(box.margin)}` });
		grid.createDiv({ text: `z-index ${box.zIndex}` });

		const actions: { action: VisualTestAction; label: string }[] = [
			{ action: "highlight-red", label: "Red" },
			{ action: "highlight-green", label: "Green" },
			{ action: "highlight-blue", label: "Blue" },
			{ action: "pulse", label: "Pulse" },
			{ action: "flash", label: "Flash" },
			{ action: "outline", label: "Outline" },
			{ action: "dim-others", label: "Dim others" },
			{ action: "hide", label: "Hide" },
			{ action: "remove", label: "Remove" },
			{ action: "isolate", label: "Isolate" },
			{ action: "focus", label: "Focus" },
		];
		const vt = this.container.resolve(Tokens.VisualTest);
		const testCard = this.bodyEl.createDiv({ cls: "axxa-card" });
		testCard.createEl("h4", { text: "Visual identification" });
		const btns = testCard.createDiv({ cls: "axxa-btn-row" });
		for (const a of actions) {
			const b = btns.createEl("button", { cls: "axxa-btn", text: a.label });
			b.onclick = () => {
				vt.apply(el, a.action);
				b.toggleClass("is-active", true);
			};
		}
		const revert = testCard.createEl("button", { cls: "axxa-btn mod-warning", text: "Revert all on element" });
		revert.onclick = () => {
			vt.revertElement(el);
			this.renderBody();
		};

		// Copy actions (Feature 15)
		const copyCard = this.bodyEl.createDiv({ cls: "axxa-card" });
		copyCard.createEl("h4", { text: "Copy" });
		const copyRow = copyCard.createDiv({ cls: "axxa-btn-row" });
		this.copyButton(copyRow, "Selector", () => buildUniqueSelector(el));
		this.copyButton(copyRow, "XPath", () => buildXPath(el));
		this.copyButton(copyRow, "DOM path", () => buildDomPath(el));
		this.addFavoriteButton(copyRow, el);
	}

	// ── Styles tab: computed + matched rules + live edit (Features 2, 3) ──────────

	private renderStylesTab(): void {
		if (!this.requireSelection()) return;
		const el = this.selected!;
		const css = this.container.resolve(Tokens.Css);

		// Undo / redo / reset bar (Feature 3)
		const bar = this.bodyEl.createDiv({ cls: "axxa-btn-row" });
		const undo = bar.createEl("button", { cls: "axxa-btn", text: "Undo" });
		undo.disabled = !css.canUndo;
		undo.onclick = () => css.undo();
		const redo = bar.createEl("button", { cls: "axxa-btn", text: "Redo" });
		redo.disabled = !css.canRedo;
		redo.onclick = () => css.redo();
		const resetEl = bar.createEl("button", { cls: "axxa-btn mod-warning", text: "Reset element" });
		resetEl.onclick = () => {
			css.resetElement(el);
			this.renderBody();
		};

		// List-driven visual style editor (dropdowns + colour swatches + quick
		// toggles) — shared with the floating mobile controls.
		const editorCard = this.bodyEl.createDiv({ cls: "axxa-card" });
		editorCard.createEl("h4", { text: "Edit styles" });
		// The editor refreshes itself in place — no host rebuild (scroll-safe).
		renderStyleEditor(editorCard.createDiv(), { element: el, css });

		// Matched rules with origin + specificity (capped list for performance)
		const rules = css.getMatchedRules(el);
		const rulesCard = this.bodyEl.createDiv({ cls: "axxa-card" });
		rulesCard.createEl("h4", { text: `Matched rules (${rules.length})` });
		renderCappedList(rulesCard.createDiv(), {
			items: rules,
			pageSize: 20,
			emptyText: "No author rules match this element.",
			renderItem: (rule, listEl) => {
				const r = listEl.createDiv({ cls: "axxa-rule" });
				const head = r.createDiv({ cls: "axxa-rule-head" });
				head.createSpan({ cls: `axxa-origin axxa-origin-${rule.origin}`, text: rule.origin });
				head.createSpan({ cls: "axxa-rule-selector", text: rule.selector });
				head.createSpan({ cls: "axxa-muted", text: `${rule.sourceName} ${formatSpecificity(rule.specificity)}` });
				for (const d of rule.declarations) {
					const dl = r.createDiv({ cls: "axxa-decl" });
					dl.toggleClass("is-overridden", d.overridden);
					dl.setText(`${d.property}: ${d.value}${d.important ? " !important" : ""}`);
				}
			},
		});

		this.renderExportRow(this.bodyEl, "element-css", (format) => {
			const descriptor = this.container.resolve(Tokens.Dom).describe(el);
			return this.container.resolve(Tokens.Export).exportElementCss(descriptor, rules, format);
		});
	}

	// ── Changes tab: list of edited elements + snippet export (Features 3, 13) ────

	private renderChangesTab(): void {
		const css = this.container.resolve(Tokens.Css);
		const changes = css.getEditedElements();

		// Snippet actions (the "export what's currently changed" deliverable).
		const actions = this.bodyEl.createDiv({ cls: "axxa-card" });
		actions.createEl("h4", { text: `Live edits · ${changes.length} element(s)` });
		const row = actions.createDiv({ cls: "axxa-btn-row" });

		const copy = row.createEl("button", { cls: "axxa-btn mod-cta", text: "Copy snippet" });
		copy.onclick = () => void copyToClipboard(css.exportCurrentSnippet(), "CSS snippet");

		const save = row.createEl("button", { cls: "axxa-btn", text: "Save as snippet" });
		save.onclick = () => void saveSnippet(this.app, "axxa-inspector", css.exportCurrentSnippet());

		const resetAll = row.createEl("button", { cls: "axxa-btn mod-warning", text: "Reset all" });
		resetAll.disabled = changes.length === 0;
		resetAll.onclick = () => {
			css.resetAll();
			this.renderBody();
		};

		// Changed-elements list (small/capped for mobile).
		const listCard = this.bodyEl.createDiv({ cls: "axxa-card" });
		renderCappedList(listCard, {
			items: changes,
			pageSize: 20,
			emptyText: "No live edits yet. Edit styles to see them tracked here.",
			renderItem: (change, listEl) => {
				const item = listEl.createDiv({ cls: "axxa-change" });
				const head = item.createDiv({ cls: "axxa-change-head" });
				const dom = this.container.resolve(Tokens.Dom);
				const label = dom.describe(change.element).semanticLabel;
				const jump = head.createEl("button", { cls: "axxa-change-jump" });
				jump.createSpan({ cls: "axxa-change-label", text: label ?? change.selector });
				jump.createSpan({ cls: "axxa-badge", text: String(change.edits.length) });
				jump.onclick = () => this.container.resolve(Tokens.Inspector).select(change.element);

				const reset = head.createEl("button", { cls: "axxa-icon-btn", attr: { "aria-label": "Reset element" } });
				setIcon(reset, "rotate-ccw");
				reset.onclick = () => {
					css.resetElement(change.element);
					this.renderBody();
				};

				for (const edit of change.edits) {
					item.createDiv({
						cls: "axxa-decl",
						text: `${edit.property}: ${edit.newValue}`,
					});
				}
			},
		});
	}

	// ── DOM explorer tab (Feature 6) ──────────────────────────────────────────────

	private renderDomTab(): void {
		const dom = this.container.resolve(Tokens.Dom);
		const search = this.bodyEl.createDiv({ cls: "axxa-card" });
		search.createEl("h4", { text: "Search DOM" });
		const input = search.createEl("input", { cls: "axxa-search" });
		input.placeholder = "tag, .class, #id or text…";
		const results = this.bodyEl.createDiv({ cls: "axxa-card axxa-tree" });

		const run = () => {
			results.empty();
			const q = input.value.trim();
			if (!q) {
				results.createSpan({ cls: "axxa-muted", text: "Type to search the live DOM." });
				return;
			}
			const query =
				q.startsWith(".")
					? { className: q.slice(1) }
					: q.startsWith("#")
						? { id: q.slice(1) }
						: /^[a-z]+$/i.test(q)
							? { tag: q }
							: { text: q };
			const hits = dom.search(query);
			renderCappedList(results, {
				items: hits,
				pageSize: 30,
				emptyText: "No matches.",
				renderItem: (el, listEl) => {
					const node = listEl.createEl("button", { cls: "axxa-tree-node" });
					const desc = dom.describe(el);
					node.setText(desc.semanticLabel ? `${desc.semanticLabel} · ${desc.selector}` : desc.selector);
					node.onclick = () => this.container.resolve(Tokens.Inspector).select(el);
				},
			});
		};
		input.oninput = run;
		run();

		// Live DOM tree viewer — updates as the document is built, tap to select,
		// red dot on edited elements.
		const treeCard = this.bodyEl.createDiv({ cls: "axxa-card" });
		treeCard.createEl("h4", { text: "Live DOM tree" });
		this.domTree = new DomTreeView(treeCard, this.container);

		if (this.selected) {
			const tree = dom.buildTree(this.selected, 4, 300);
			this.renderExportRow(this.bodyEl, "dom-tree", (format) =>
				this.container.resolve(Tokens.Export).exportDomTree(tree, format),
			);
		}
	}

	// ── Variables tab (Feature 8) ──────────────────────────────────────────────────

	private renderVariablesTab(): void {
		const css = this.container.resolve(Tokens.Css);
		const vars = css.getVariables();
		const card = this.bodyEl.createDiv({ cls: "axxa-card" });
		card.createEl("h4", { text: `CSS variables (${vars.length})` });
		const filter = card.createEl("input", { cls: "axxa-search" });
		filter.placeholder = "Filter variables…";
		const list = card.createDiv();

		const draw = () => {
			const term = filter.value.toLowerCase();
			const matches = vars.filter((v) => v.name.toLowerCase().includes(term));
			renderCappedList(list, {
				items: matches,
				pageSize: 40,
				emptyText: "No variables match.",
				renderItem: (v, listEl) => {
					const row = listEl.createDiv({ cls: "axxa-prop-row" });
					const key = row.createSpan({ cls: "axxa-prop-key", text: v.name });
					const swatch = key.createSpan({ cls: "axxa-style-swatch" });
					swatch.style.background = v.computedValue || "transparent";
					const input = row.createEl("input", { cls: "axxa-prop-val" });
					input.value = v.value;
					input.onchange = () => css.setVariable(v.name, input.value);
					row.createSpan({ cls: "axxa-muted", text: `${v.usageCount}×` });
				},
			});
		};
		filter.oninput = draw;
		draw();

		this.renderExportRow(this.bodyEl, "variables", (format) =>
			this.container.resolve(Tokens.Export).exportVariables(vars, format),
		);
	}

	// ── Stylesheets tab (Feature 9) ──────────────────────────────────────────────

	private renderStylesheetsTab(): void {
		const css = this.container.resolve(Tokens.Css);
		const sheets = css.getStylesheets();
		const card = this.bodyEl.createDiv({ cls: "axxa-card" });
		card.createEl("h4", { text: `Stylesheets (${sheets.length})` });
		for (const s of sheets) {
			const row = card.createDiv({ cls: "axxa-rule" });
			const head = row.createDiv({ cls: "axxa-rule-head" });
			head.createSpan({ cls: `axxa-origin axxa-origin-${s.origin}`, text: s.origin });
			head.createSpan({ cls: "axxa-rule-selector", text: s.sourceName });
			row.createSpan({
				cls: "axxa-muted",
				text: `${s.ruleCount} rules · ${s.selectorCount} selectors · ${s.unusedSelectors.length} likely unused`,
			});
		}
		this.renderExportRow(this.bodyEl, "stylesheet-analysis", (format) =>
			this.container.resolve(Tokens.Export).exportStylesheets(sheets, format),
		);
	}

	// ── Mutations tab (Feature 7) ──────────────────────────────────────────────────

	private renderMutationsTab(): void {
		const mut = this.container.resolve(Tokens.Mutation);
		const bar = this.bodyEl.createDiv({ cls: "axxa-btn-row" });
		const rec = bar.createEl("button", {
			cls: ["axxa-btn", mut.isRecording ? "is-active" : ""],
			text: mut.isRecording ? "Stop recording" : "Record",
		});
		rec.onclick = () => {
			if (mut.isRecording) {
				const done = mut.stopRecording();
				if (done) {
					const persistence = this.container.resolve(Tokens.Persistence);
					persistence.set("recordings", [...persistence.recordings, done]);
				}
			} else {
				mut.startRecording(`Session ${new Date().toLocaleTimeString()}`);
			}
			this.renderBody();
		};
		const clear = bar.createEl("button", { cls: "axxa-btn", text: "Clear" });
		clear.onclick = () => {
			mut.clear();
			this.renderBody();
		};

		const card = this.bodyEl.createDiv({ cls: "axxa-card axxa-timeline" });
		const events = mut.events;
		card.createEl("h4", { text: `Timeline (${events.length})` });
		renderCappedList(card.createDiv(), {
			items: [...events].reverse(),
			pageSize: 40,
			emptyText: "No mutations captured. Press Record and interact with Obsidian.",
			renderItem: (e, listEl) => {
				const row = listEl.createDiv({ cls: `axxa-mut axxa-mut-${e.kind}` });
				row.createSpan({ cls: "axxa-muted", text: new Date(e.timestamp).toLocaleTimeString() });
				row.createSpan({ text: e.summary });
			},
		});

		this.renderExportRow(this.bodyEl, "mutation-log", (format) =>
			this.container.resolve(Tokens.Export).exportMutations(events, format),
		);
	}

	// ── Experiments / sandbox tab (Feature 12) ────────────────────────────────────

	private renderExperimentsTab(): void {
		const sandbox = this.container.resolve(Tokens.Sandbox);
		const bar = this.bodyEl.createDiv({ cls: "axxa-btn-row" });
		const add = bar.createEl("button", { cls: "axxa-btn", text: "New experiment" });
		add.onclick = () => {
			sandbox.add(`Experiment ${sandbox.list().length + 1}`, "/* write CSS here */\n");
			this.persistExperiments();
			this.renderBody();
		};

		for (const exp of sandbox.list()) {
			const card = this.bodyEl.createDiv({ cls: "axxa-card" });
			const head = card.createDiv({ cls: "axxa-rule-head" });
			const name = head.createEl("input", { cls: "axxa-prop-val" });
			name.value = exp.name;
			name.onchange = () => {
				sandbox.update(exp.id, { name: name.value });
				this.persistExperiments();
			};
			const toggle = head.createEl("button", {
				cls: ["axxa-btn", exp.enabled ? "is-active" : ""],
				text: exp.enabled ? "On" : "Off",
			});
			toggle.onclick = () => {
				sandbox.toggle(exp.id);
				this.persistExperiments();
				this.renderBody();
			};
			const del = head.createEl("button", { cls: "axxa-btn mod-warning", text: "Delete" });
			del.onclick = () => {
				sandbox.remove(exp.id);
				this.persistExperiments();
				this.renderBody();
			};
			const ta = card.createEl("textarea", { cls: "axxa-css-editor" });
			ta.value = exp.css;
			ta.oninput = () => {
				sandbox.update(exp.id, { css: ta.value });
				this.persistExperiments();
			};
		}

		this.renderExportRow(this.bodyEl, "experiments", (format) =>
			this.container.resolve(Tokens.Export).exportExperiments(sandbox.list(), format),
		);
	}

	// ── Layout debugging tab (Feature 10) ─────────────────────────────────────────

	private renderLayoutTab(): void {
		const layout = this.container.resolve(Tokens.Layout);
		const card = this.bodyEl.createDiv({ cls: "axxa-card" });
		card.createEl("h4", { text: "Layout overlays" });
		const modes: { mode: Parameters<typeof layout.toggle>[0]; label: string }[] = [
			{ mode: "flex-containers", label: "Flex" },
			{ mode: "grid-containers", label: "Grid" },
			{ mode: "scroll-containers", label: "Scroll" },
			{ mode: "sticky-elements", label: "Sticky" },
			{ mode: "fixed-elements", label: "Fixed" },
			{ mode: "absolute-elements", label: "Absolute" },
			{ mode: "overflow-boundaries", label: "Overflow" },
			{ mode: "stacking-contexts", label: "Stacking" },
			{ mode: "padding-regions", label: "Padding" },
			{ mode: "margins", label: "Margins" },
			{ mode: "safe-areas", label: "Safe areas" },
		];
		const row = card.createDiv({ cls: "axxa-btn-row" });
		for (const m of modes) {
			const b = row.createEl("button", {
				cls: ["axxa-btn", layout.activeModes.includes(m.mode) ? "is-active" : ""],
				text: m.label,
			});
			b.onclick = () => {
				const on = layout.toggle(m.mode);
				b.toggleClass("is-active", on);
			};
		}
		const clear = card.createEl("button", { cls: "axxa-btn mod-warning", text: "Clear all overlays" });
		clear.onclick = () => {
			layout.clearAll();
			this.renderBody();
		};
	}

	// ── shared helpers ──────────────────────────────────────────────────────────────

	private renderExportRow(
		parent: HTMLElement,
		_subject: string,
		build: (format: ExportFormat) => { content: string; filename: string },
	): void {
		const card = parent.createDiv({ cls: "axxa-card" });
		card.createEl("h4", { text: "Export" });
		const row = card.createDiv({ cls: "axxa-btn-row" });
		const formats: ExportFormat[] = ["json", "css", "markdown", "typescript", "csv"];
		for (const format of formats) {
			const b = row.createEl("button", { cls: "axxa-btn", text: format.toUpperCase() });
			b.onclick = () => {
				const result = build(format);
				void copyToClipboard(result.content, `${format.toUpperCase()} export`);
			};
		}
	}

	private copyButton(parent: HTMLElement, label: string, build: () => string): void {
		const b = parent.createEl("button", { cls: "axxa-btn", text: `Copy ${label}` });
		b.onclick = () => void copyToClipboard(build(), label);
	}

	private addFavoriteButton(parent: HTMLElement, el: HTMLElement): void {
		const persistence = this.container.resolve(Tokens.Persistence);
		const b = parent.createEl("button", { cls: "axxa-btn", text: "★ Favourite" });
		b.onclick = () => {
			const selector = buildUniqueSelector(el);
			const favs = persistence.productivity.favoriteSelectors;
			if (!favs.includes(selector)) {
				persistence.set("productivity", {
					...persistence.productivity,
					favoriteSelectors: [...favs, selector],
				});
			}
		};
	}

	private persistExperiments(): void {
		const persistence = this.container.resolve(Tokens.Persistence);
		persistence.set("experiments", this.container.resolve(Tokens.Sandbox).list());
	}

	private withSelection(fn: (el: HTMLElement) => void): void {
		if (this.selected) fn(this.selected);
	}

	private requireSelection(): boolean {
		if (this.selected) return true;
		this.bodyEl.createDiv({ cls: "axxa-empty", text: "Select an element with Inspect mode to begin." });
		return false;
	}
}

function spacing(s: { top: number; right: number; bottom: number; left: number }): string {
	return `${s.top} ${s.right} ${s.bottom} ${s.left}`;
}
