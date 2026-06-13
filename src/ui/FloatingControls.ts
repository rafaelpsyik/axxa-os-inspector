import { setIcon, Notice } from "obsidian";
import { DisposableGroup, type IDisposable } from "../core/Disposable";
import type { ServiceContainer } from "../core/ServiceContainer";
import { Tokens } from "../core/tokens";
import { buildUniqueSelector } from "../utils/selector";
import { copyToClipboard } from "../utils/clipboard";
import { debounce, type Cancellable } from "../utils/schedule";
import { renderStyleEditor } from "./StyleEditor";
import { ALL_PROPERTIES } from "./styleCatalog";
import { attachCodeEditor } from "./CodeEditor";
import { DomTreeView } from "./DomTreeView";

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
	private styleBodyEl: HTMLElement | null = null;
	private snippetBtn!: HTMLButtonElement;
	private codeToggle!: HTMLButtonElement;
	private codeEl!: HTMLElement;
	private treeToggle!: HTMLButtonElement;
	private treeEl!: HTMLElement;
	private treeView: DomTreeView | null = null;
	private scratchId: string | null = null;
	private pushCode!: Cancellable<(css: string) => void>;
	private stylesOpen = false;
	private codeOpen = false;
	private treeOpen = false;
	private visible = false;

	constructor(
		private readonly container: ServiceContainer,
		private readonly openPanel: () => void,
	) {
		this.root = document.body.createDiv({ cls: "axxa-floating" });
		this.root.setAttr("role", "toolbar");
		this.root.setAttr("aria-label", "AXXA inspector controls");
		this.group.register(() => this.root.remove());

		// Debounced live-apply so typing in the code editor stays smooth.
		this.pushCode = debounce((css: string) => this.commitCode(css), 250);
		this.group.register(() => this.pushCode.cancel());

		this.buildHeader();
		this.buildPrimaryRow();
		this.buildLabel();
		this.buildNav();
		this.buildSections();
		this.buildResizeGrip();
		this.applyPersistedSize();

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
		const title = handle.createSpan({ text: "AXXA Inspector" });
		const close = handle.createEl("button", { cls: "axxa-floating-x" });
		setIcon(close, "x");
		close.setAttr("aria-label", "Hide controls");
		close.onclick = () => this.hide();

		// ✶ Secret, mobile-friendly: tap the title 7× quickly to reveal X-Ray
		// (no keyboard needed — works on touch).
		this.wireSecretTaps(title);

		this.makeDraggable(handle);
	}

	/** Count rapid taps on the title; 7 within the window reveals X-Ray. */
	private wireSecretTaps(title: HTMLElement): void {
		const NEEDED = 7;
		const WINDOW = 700; // ms between taps before the streak resets
		let count = 0;
		let last = 0;
		title.onclick = () => {
			const now = Date.now();
			count = now - last < WINDOW ? count + 1 : 1;
			last = now;
			const remaining = NEEDED - count;
			if (count >= NEEDED) {
				count = 0;
				this.container.bus.emit("reveal-architecture", {});
			} else if (remaining <= 3) {
				new Notice(`✶ ${remaining} more…`, 900);
			}
		};
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

	/** Build the three collapsible sections: Styles · DOM tree · Code editor. */
	private buildSections(): void {
		this.stylesToggle = this.sectionToggle("Styles", "sliders-horizontal", () => {
			this.stylesOpen = !this.stylesOpen;
			this.renderStyles();
		});
		this.stylesEl = this.root.createDiv({ cls: "axxa-floating-styles axxa-floating-section" });
		this.stylesEl.style.display = "none";

		this.treeToggle = this.sectionToggle("DOM tree", "list-tree", () => {
			this.treeOpen = !this.treeOpen;
			this.renderTree();
		});
		this.treeEl = this.root.createDiv({ cls: "axxa-floating-tree axxa-floating-section" });
		this.treeEl.style.display = "none";

		this.codeToggle = this.sectionToggle("Code editor", "code", () => {
			this.codeOpen = !this.codeOpen;
			this.renderCode();
		});
		this.codeEl = this.root.createDiv({ cls: "axxa-floating-code axxa-floating-section" });
		this.codeEl.style.display = "none";
	}

	private sectionToggle(label: string, icon: string, onClick: () => void): HTMLButtonElement {
		const btn = this.root.createEl("button", { cls: "axxa-floating-btn axxa-section-toggle" });
		setIcon(btn.createSpan(), icon);
		btn.createSpan({ text: label });
		btn.onclick = onClick;
		return btn;
	}

	/** The widget widens whenever any rich section is open. */
	private setWide(): void {
		this.root.toggleClass("axxa-floating-wide", this.stylesOpen || this.codeOpen || this.treeOpen);
	}

	// ── Styles section (compact, field-selectable) ────────────────────────────

	/** (Re)render the compact style editor + the field chooser chrome. */
	private renderStyles(): void {
		this.stylesToggle.toggleClass("is-active", this.stylesOpen);
		this.setWide();
		this.stylesEl.empty();
		if (!this.stylesOpen) {
			this.stylesEl.style.display = "none";
			return;
		}
		this.stylesEl.style.display = "block";

		// Toolbar: a "Fields" chooser to pick exactly which properties show.
		const bar = this.stylesEl.createDiv({ cls: "axxa-code-bar" });
		const chooser = bar.createEl("button", { cls: "axxa-chip" });
		setIcon(chooser.createSpan({ cls: "axxa-chip-icon" }), "list-checks");
		chooser.createSpan({ text: "Fields" });
		const fieldsEl = this.stylesEl.createDiv({ cls: "axxa-fab-fields" });
		fieldsEl.style.display = "none";
		chooser.onclick = () => {
			const open = fieldsEl.style.display === "none";
			fieldsEl.style.display = open ? "flex" : "none";
			chooser.toggleClass("is-active", open);
			if (open) this.renderFieldChooser(fieldsEl);
			else fieldsEl.empty();
		};

		this.styleBodyEl = this.stylesEl.createDiv();
		this.renderStyleBody();
	}

	/** Re-render only the editor body — keeps chooser open + scroll intact. */
	private renderStyleBody(): void {
		if (!this.styleBodyEl) return;
		const el = this.container.resolve(Tokens.Inspector).selected;
		this.styleBodyEl.empty();
		if (!el) {
			this.styleBodyEl.createDiv({ cls: "axxa-muted axxa-empty-row", text: "Tap an element to edit it." });
			return;
		}
		renderStyleEditor(this.styleBodyEl, {
			element: el,
			css: this.container.resolve(Tokens.Css),
			compact: true,
			properties: this.container.resolve(Tokens.Persistence).settings.fabStyleProps,
			// No host rebuild — the editor refreshes itself in place (scroll-safe).
		});
	}

	/** Chips to pick which properties appear in the compact editor (persisted). */
	private renderFieldChooser(parent: HTMLElement): void {
		parent.empty();
		const persistence = this.container.resolve(Tokens.Persistence);
		const selected = new Set(persistence.settings.fabStyleProps);
		for (const prop of ALL_PROPERTIES) {
			const chip = parent.createEl("button", {
				cls: ["axxa-chip", "axxa-field-chip", selected.has(prop) ? "is-active" : ""],
				text: prop,
			});
			chip.onclick = () => {
				if (selected.has(prop)) selected.delete(prop);
				else selected.add(prop);
				chip.toggleClass("is-active", selected.has(prop));
				persistence.updateSettings({ fabStyleProps: ALL_PROPERTIES.filter((p) => selected.has(p)) });
				this.renderStyleBody(); // refresh editor only — chooser stays open
			};
		}
	}

	// ── DOM tree section (compact, mobile) ─────────────────────────────────────

	private renderTree(): void {
		this.treeToggle.toggleClass("is-active", this.treeOpen);
		this.setWide();
		if (!this.treeOpen) {
			this.treeEl.style.display = "none";
			this.treeView?.dispose();
			this.treeView = null;
			this.treeEl.empty();
			return;
		}
		this.treeEl.style.display = "block";
		this.treeEl.empty();
		this.treeView = new DomTreeView(this.treeEl, this.container, true);
	}

	// ── Code editor section ────────────────────────────────────────────────────

	private renderCode(): void {
		this.codeToggle.toggleClass("is-active", this.codeOpen);
		this.setWide();
		if (!this.codeOpen) {
			this.codeEl.style.display = "none";
			this.codeEl.empty();
			return;
		}
		this.codeEl.style.display = "block";
		this.codeEl.empty();

		const sandbox = this.container.resolve(Tokens.Sandbox);
		const scratch = sandbox.ensureScratch();
		this.scratchId = scratch.id;

		// Toolbar: activate toggle + paste + clear.
		const bar = this.codeEl.createDiv({ cls: "axxa-code-bar" });
		const activate = bar.createEl("button", {
			cls: ["axxa-chip", scratch.enabled ? "is-active" : ""],
		});
		setIcon(activate.createSpan({ cls: "axxa-chip-icon" }), scratch.enabled ? "zap" : "zap-off");
		activate.createSpan({ text: scratch.enabled ? "Active" : "Inactive" });
		activate.onclick = () => {
			sandbox.update(scratch.id, { enabled: !scratch.enabled });
			this.persistExperiments();
			this.renderCode();
		};

		const paste = bar.createEl("button", { cls: "axxa-chip" });
		setIcon(paste.createSpan({ cls: "axxa-chip-icon" }), "clipboard-paste");
		paste.createSpan({ text: "Paste" });
		paste.onclick = async () => {
			try {
				const text = await navigator.clipboard.readText();
				if (text) {
					editor.setValue(joinCss(editor.getValue(), text));
					this.pushCode(editor.getValue());
				}
			} catch {
				this.container.bus.emit("notice", { message: "Clipboard read blocked", level: "warn" });
			}
		};

		const clear = bar.createEl("button", { cls: "axxa-chip mod-warning" });
		setIcon(clear.createSpan({ cls: "axxa-chip-icon" }), "eraser");
		clear.createSpan({ text: "Clear" });
		clear.onclick = () => {
			editor.setValue("");
			this.commitCode("");
		};

		// The code editor itself.
		const editor = attachCodeEditor(this.codeEl, {
			value: scratch.css,
			placeholder: "/* paste or write CSS here */\n.status-bar {\n\tdisplay: none;\n}",
			onInput: (css) => this.pushCode(css),
		});
	}

	private commitCode(css: string): void {
		if (!this.scratchId) return;
		this.container.resolve(Tokens.Sandbox).update(this.scratchId, { css });
		this.persistExperiments();
	}

	private persistExperiments(): void {
		const persistence = this.container.resolve(Tokens.Persistence);
		persistence.set("experiments", this.container.resolve(Tokens.Sandbox).list());
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

		// Re-point the open editor at the new selection (body only — keeps the
		// field chooser open and the scroll position intact).
		if (this.stylesOpen) this.renderStyleBody();
	}

	// ── resize + dragging ──────────────────────────────────────────────────────

	/** A corner grip to resize the widget: width + open-section height. */
	private buildResizeGrip(): void {
		const grip = this.root.createDiv({ cls: "axxa-floating-grip" });
		setIcon(grip, "move-diagonal-2");
		grip.setAttr("aria-label", "Resize");

		let sx = 0;
		let sy = 0;
		let sw = 0;
		let sh = 0;
		let resizing = false;
		const onDown = (e: PointerEvent) => {
			resizing = true;
			sw = this.root.getBoundingClientRect().width;
			sh = this.currentSectionHeight();
			sx = e.clientX;
			sy = e.clientY;
			grip.setPointerCapture(e.pointerId);
			e.stopPropagation();
			e.preventDefault();
		};
		const onMove = (e: PointerEvent) => {
			if (!resizing) return;
			const w = clamp(sw + (e.clientX - sx), 190, window.innerWidth - 16);
			const h = clamp(sh + (e.clientY - sy), 120, window.innerHeight - 120);
			this.root.style.width = `${w}px`;
			this.root.style.setProperty("--axxa-fab-section-maxh", `${h}px`);
		};
		const onUp = () => {
			if (!resizing) return;
			resizing = false;
			this.persistSize();
		};
		grip.addEventListener("pointerdown", onDown);
		grip.addEventListener("pointermove", onMove);
		grip.addEventListener("pointerup", onUp);
		this.group.register(() => {
			grip.removeEventListener("pointerdown", onDown);
			grip.removeEventListener("pointermove", onMove);
			grip.removeEventListener("pointerup", onUp);
		});
	}

	private currentSectionHeight(): number {
		const v = parseFloat(this.root.style.getPropertyValue("--axxa-fab-section-maxh"));
		return Number.isFinite(v) ? v : Math.round(window.innerHeight * 0.42);
	}

	private applyPersistedSize(): void {
		const s = this.container.resolve(Tokens.Persistence).settings;
		if (s.fabWidth) this.root.style.width = `${s.fabWidth}px`;
		if (s.fabHeight) this.root.style.setProperty("--axxa-fab-section-maxh", `${s.fabHeight}px`);
	}

	private persistSize(): void {
		this.container.resolve(Tokens.Persistence).updateSettings({
			fabWidth: Math.round(this.root.getBoundingClientRect().width),
			fabHeight: Math.round(this.currentSectionHeight()),
		});
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
		this.treeView?.dispose();
		this.treeView = null;
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

/** Append pasted CSS to the existing buffer, separating with a blank line. */
function joinCss(existing: string, pasted: string): string {
	const a = existing.trimEnd();
	const b = pasted.trim();
	if (!a) return b;
	return `${a}\n\n${b}`;
}
