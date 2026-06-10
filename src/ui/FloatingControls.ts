import { setIcon } from "obsidian";
import { DisposableGroup, type IDisposable } from "../core/Disposable";
import type { ServiceContainer } from "../core/ServiceContainer";
import { Tokens } from "../core/tokens";
import { buildUniqueSelector } from "../utils/selector";
import { copyToClipboard } from "../utils/clipboard";
import { renderStyleEditor } from "./StyleEditor";

/**
 * Floating, always-on-top inspector controls.
 *
 * On mobile the full inspector panel covers the whole screen, so you can't see
 * the workspace *and* the inspector at once. This compact widget floats over the
 * real UI and provides the two things needed to inspect hands-on:
 *
 *  - a **Freeze** toggle that locks the current screen — while frozen, taps are
 *    intercepted and only *select* the element under the finger (they never fire
 *    Obsidian commands), so the layout can't shift out from under you;
 *  - **navigation arrows** (parent / child / previous / next sibling) to walk
 *    the DOM precisely once an element is selected.
 *
 * It renders into `document.body` with its own pointer-events surface, is
 * draggable, and is excluded from inspection via the `.axxa-floating` class.
 */
export class FloatingControls implements IDisposable {
	private readonly group = new DisposableGroup();
	private root: HTMLElement;
	private labelEl!: HTMLElement;
	private metaEl!: HTMLElement;
	private freezeBtn!: HTMLButtonElement;
	private navButtons: Record<"parent" | "child" | "previous" | "next", HTMLButtonElement> =
		{} as never;
	private stylesToggle!: HTMLButtonElement;
	private stylesEl!: HTMLElement;
	private snippetBtn!: HTMLButtonElement;
	private stylesOpen = false;
	private visible = false;

	constructor(
		private readonly container: ServiceContainer,
		private readonly openPanel: () => void,
	) {
		this.root = document.body.createDiv({ cls: "axxa-floating" });
		this.root.setAttr("role", "toolbar");
		this.root.setAttr("aria-label", "AXXA inspector controls");
		this.group.register(() => this.root.remove());

		this.buildHeader();
		this.buildPrimaryRow();
		this.buildLabel();
		this.buildNav();
		this.buildStyles();

		// Reflect engine state in the widget.
		const { bus } = this.container;
		this.group.register(
			bus.on("inspect-mode-changed", ({ active }) => this.syncFreeze(active)),
		);
		this.group.register(
			bus.on("selection-changed", ({ element }) => this.syncSelection(element)),
		);

		this.hide();
		this.syncFreeze(this.container.resolve(Tokens.Inspector).isActive);
		this.syncSelection(this.container.resolve(Tokens.Inspector).selected);
	}

	// ── public API ────────────────────────────────────────────────────────────

	show(): void {
		this.visible = true;
		this.root.style.display = "flex";
	}
	hide(): void {
		this.visible = false;
		this.root.style.display = "none";
	}
	toggle(): void {
		this.visible ? this.hide() : this.show();
	}

	// ── construction ──────────────────────────────────────────────────────────

	/** Draggable handle so the widget can be moved off whatever it's covering. */
	private buildHeader(): void {
		const handle = this.root.createDiv({ cls: "axxa-floating-handle" });
		handle.createSpan({ text: "AXXA Inspector" });
		const close = handle.createEl("button", { cls: "axxa-floating-x" });
		setIcon(close, "x");
		close.setAttr("aria-label", "Hide controls");
		close.onclick = () => this.hide();

		this.makeDraggable(handle);
	}

	private buildPrimaryRow(): void {
		const row = this.root.createDiv({ cls: "axxa-floating-row" });

		this.freezeBtn = row.createEl("button", { cls: "axxa-floating-btn axxa-freeze" });
		this.freezeBtn.onclick = () => {
			const inspector = this.container.resolve(Tokens.Inspector);
			inspector.setActive(!inspector.isActive);
		};

		const panelBtn = row.createEl("button", { cls: "axxa-floating-btn" });
		setIcon(panelBtn.createSpan(), "panel-right");
		panelBtn.createSpan({ text: "Panel" });
		panelBtn.setAttr("aria-label", "Open full inspector panel");
		panelBtn.onclick = () => this.openPanel();

		// Snippet export of everything currently edited, with a live count badge.
		const snippetRow = this.root.createDiv({ cls: "axxa-floating-row" });
		this.snippetBtn = snippetRow.createEl("button", { cls: "axxa-floating-btn" });
		setIcon(this.snippetBtn.createSpan(), "clipboard-copy");
		this.snippetBtn.createSpan({ text: "Copy snippet" });
		this.snippetBtn.createSpan({ cls: "axxa-badge is-hidden" });
		this.snippetBtn.onclick = () =>
			void copyToClipboard(this.container.resolve(Tokens.Css).exportCurrentSnippet(), "CSS snippet");
		this.group.register(
			this.container.bus.on("changes-updated", ({ count }) => this.syncChanges(count)),
		);
	}

	private syncChanges(count: number): void {
		const badge = this.snippetBtn?.querySelector(".axxa-badge");
		if (!(badge instanceof HTMLElement)) return;
		badge.setText(String(count));
		badge.toggleClass("is-hidden", count === 0);
	}

	/** Textual feedback — guarantees a readout even if the overlay is subtle. */
	private buildLabel(): void {
		const box = this.root.createDiv({ cls: "axxa-floating-readout" });
		this.labelEl = box.createDiv({ cls: "axxa-floating-label", text: "No element selected" });
		this.metaEl = box.createDiv({ cls: "axxa-floating-meta", text: "Freeze the screen and tap an element" });
	}

	/** Parent ↑ · child ↓ · previous ← · next → navigation pad. */
	private buildNav(): void {
		const pad = this.root.createDiv({ cls: "axxa-floating-nav" });

		this.navButtons.parent = this.navBtn(pad, "chevron-up", "parent", "Select parent");
		const mid = pad.createDiv({ cls: "axxa-floating-nav-row" });
		this.navButtons.previous = this.navBtn(mid, "chevron-left", "previous", "Previous sibling");
		const dot = mid.createDiv({ cls: "axxa-floating-dot" });
		setIcon(dot, "scan-search");
		this.navButtons.next = this.navBtn(mid, "chevron-right", "next", "Next sibling");
		this.navButtons.child = this.navBtn(pad, "chevron-down", "child", "Select first child");
	}

	private navBtn(
		parent: HTMLElement,
		icon: string,
		direction: "parent" | "child" | "previous" | "next",
		label: string,
	): HTMLButtonElement {
		const btn = parent.createEl("button", { cls: "axxa-floating-nav-btn" });
		setIcon(btn, icon);
		btn.setAttr("aria-label", label);
		btn.onclick = () => this.container.resolve(Tokens.Inspector).navigate(direction);
		return btn;
	}

	/** Expandable list-driven style editor (dropdowns + colour swatches). */
	private buildStyles(): void {
		this.stylesToggle = this.root.createEl("button", { cls: "axxa-floating-btn axxa-styles-toggle" });
		setIcon(this.stylesToggle.createSpan(), "sliders-horizontal");
		this.stylesToggle.createSpan({ text: "Styles" });
		this.stylesToggle.onclick = () => {
			this.stylesOpen = !this.stylesOpen;
			this.root.toggleClass("axxa-floating-wide", this.stylesOpen);
			this.renderStyles();
		};
		this.stylesEl = this.root.createDiv({ cls: "axxa-floating-styles" });
		this.stylesEl.style.display = "none";
	}

	/** (Re)render the style editor for the current selection when expanded. */
	private renderStyles(): void {
		const el = this.container.resolve(Tokens.Inspector).selected;
		this.stylesToggle.toggleClass("is-active", this.stylesOpen);
		if (!this.stylesOpen || !el) {
			this.stylesEl.style.display = "none";
			this.stylesEl.empty();
			return;
		}
		this.stylesEl.style.display = "block";
		renderStyleEditor(this.stylesEl, {
			element: el,
			css: this.container.resolve(Tokens.Css),
			// After a change the swatch/edited markers must refresh.
			onChange: () => this.renderStyles(),
		});
	}

	// ── state sync ──────────────────────────────────────────────────────────────

	private syncFreeze(active: boolean): void {
		this.freezeBtn.empty();
		setIcon(this.freezeBtn.createSpan(), active ? "lock" : "lock-open");
		this.freezeBtn.createSpan({ text: active ? "Frozen" : "Freeze" });
		this.freezeBtn.toggleClass("is-active", active);
		this.freezeBtn.setAttr("aria-pressed", String(active));
		// Whole-screen frozen indicator (visual feedback the user was missing).
		// The class is cleared in dispose(); no per-toggle teardown needed.
		document.body.toggleClass("axxa-frozen", active);
	}

	private syncSelection(el: HTMLElement | null): void {
		const enable = (b: HTMLButtonElement, on: boolean) => {
			b.disabled = !on;
		};
		if (!el) {
			this.labelEl.setText("No element selected");
			this.metaEl.setText("Freeze the screen and tap an element");
			Object.values(this.navButtons).forEach((b) => enable(b, false));
			return;
		}
		const dom = this.container.resolve(Tokens.Dom);
		const useSemantic = this.container.resolve(Tokens.Persistence).settings.useSemanticLabels;
		const semantic = useSemantic ? dom.describe(el).semanticLabel : null;
		const rect = el.getBoundingClientRect();
		this.labelEl.setText(semantic ?? shortSelector(el));
		this.metaEl.setText(`${el.tagName.toLowerCase()} · ${Math.round(rect.width)}×${Math.round(rect.height)}`);

		// Enable arrows only where a target exists.
		enable(this.navButtons.parent, !!el.parentElement);
		enable(this.navButtons.child, !!el.firstElementChild);
		enable(this.navButtons.previous, !!el.previousElementSibling);
		enable(this.navButtons.next, !!el.nextElementSibling);

		// Keep the expanded style editor pointed at the new selection.
		if (this.stylesOpen) this.renderStyles();
	}

	// ── dragging ──────────────────────────────────────────────────────────────

	private makeDraggable(handle: HTMLElement): void {
		let startX = 0;
		let startY = 0;
		let originLeft = 0;
		let originTop = 0;
		let dragging = false;

		const onDown = (e: PointerEvent) => {
			if ((e.target as HTMLElement).closest(".axxa-floating-x")) return;
			dragging = true;
			const rect = this.root.getBoundingClientRect();
			originLeft = rect.left;
			originTop = rect.top;
			startX = e.clientX;
			startY = e.clientY;
			handle.setPointerCapture(e.pointerId);
			e.stopPropagation();
		};
		const onMove = (e: PointerEvent) => {
			if (!dragging) return;
			const left = clamp(originLeft + (e.clientX - startX), 0, window.innerWidth - 60);
			const top = clamp(originTop + (e.clientY - startY), 0, window.innerHeight - 40);
			this.root.style.left = `${left}px`;
			this.root.style.top = `${top}px`;
			this.root.style.right = "auto";
			this.root.style.bottom = "auto";
		};
		const onUp = () => {
			dragging = false;
		};

		handle.addEventListener("pointerdown", onDown);
		handle.addEventListener("pointermove", onMove);
		handle.addEventListener("pointerup", onUp);
		this.group.register(() => {
			handle.removeEventListener("pointerdown", onDown);
			handle.removeEventListener("pointermove", onMove);
			handle.removeEventListener("pointerup", onUp);
		});
	}

	dispose(): void {
		document.body.removeClass("axxa-frozen");
		this.group.dispose();
	}
}

function shortSelector(el: HTMLElement): string {
	try {
		const sel = buildUniqueSelector(el);
		return sel.length > 48 ? "…" + sel.slice(-46) : sel;
	} catch {
		return el.tagName.toLowerCase();
	}
}

function clamp(v: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, v));
}
