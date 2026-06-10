import { setIcon } from "obsidian";
import type { CSSEngine } from "../engines/CSSEngine";
import {
	STYLE_GROUPS,
	QUICK_TOGGLES,
	type StyleProperty,
} from "./styleCatalog";

/**
 * Reusable, list-driven visual style editor (Feature 3).
 *
 * Renders the curated style catalogue as **dropdowns and colour swatches** — the
 * user picks values from lists instead of typing them — plus a row of one-tap
 * quick toggles (Hide / Invisible / Disable / Outline / Dim / Raise z). Every
 * change is applied as a reversible inline edit through the {@link CSSEngine},
 * so it lands in the undo/redo history and never touches author stylesheets.
 *
 * Used by both the floating mobile controls and the desktop panel, so the two
 * surfaces stay in lockstep.
 */
export interface StyleEditorOptions {
	element: HTMLElement;
	css: CSSEngine;
	/** Called after any change so the host can refresh dependent UI. */
	onChange?: () => void;
}

export function renderStyleEditor(container: HTMLElement, opts: StyleEditorOptions): void {
	const { element: el, css, onChange } = opts;
	container.empty();
	container.addClass("axxa-style-editor");

	// ── Quick toggles ──────────────────────────────────────────────────────────
	const toggles = container.createDiv({ cls: "axxa-style-toggles" });
	for (const t of QUICK_TOGGLES) {
		const active = el.style.getPropertyValue(t.property) === t.value;
		const btn = toggles.createEl("button", { cls: ["axxa-chip", active ? "is-active" : ""] });
		setIcon(btn.createSpan({ cls: "axxa-chip-icon" }), t.icon);
		btn.createSpan({ text: t.label });
		btn.setAttr("aria-pressed", String(active));
		btn.onclick = () => {
			const isOn = el.style.getPropertyValue(t.property) === t.value;
			css.applyEdit(el, t.property, isOn ? "" : t.value);
			onChange?.();
		};
	}
	const reset = toggles.createEl("button", { cls: "axxa-chip mod-warning" });
	setIcon(reset.createSpan({ cls: "axxa-chip-icon" }), "rotate-ccw");
	reset.createSpan({ text: "Reset" });
	reset.setAttr("aria-label", "Reset all edits on this element");
	reset.onclick = () => {
		css.resetElement(el);
		onChange?.();
	};

	// ── Property dropdowns by group ──────────────────────────────────────────────
	const cs = getComputedStyle(el);
	for (const group of STYLE_GROUPS) {
		const section = container.createDiv({ cls: "axxa-style-group" });
		section.createDiv({ cls: "axxa-style-group-label", text: group.label });
		for (const prop of group.properties) {
			renderRow(section, prop, el, css, cs, onChange);
		}
	}
}

function renderRow(
	parent: HTMLElement,
	prop: StyleProperty,
	el: HTMLElement,
	css: CSSEngine,
	cs: CSSStyleDeclaration,
	onChange?: () => void,
): void {
	const row = parent.createDiv({ cls: "axxa-style-row" });
	const inlineValue = el.style.getPropertyValue(prop.property);
	const current = (inlineValue || cs.getPropertyValue(prop.property)).trim();
	row.toggleClass("is-edited", inlineValue !== "");

	const key = row.createSpan({ cls: "axxa-style-key", text: prop.label });
	if (prop.kind === "color") {
		// Live swatch reflecting the current colour.
		const swatch = key.createSpan({ cls: "axxa-style-swatch" });
		swatch.style.background = current || "transparent";
	}

	const select = row.createEl("select", { cls: "axxa-style-select" });
	select.setAttr("aria-label", prop.label);

	// Ensure the current value is selectable even if it isn't a catalogue value.
	const values = [...prop.values];
	if (current && !values.includes(current)) values.splice(1, 0, current);

	for (const v of values) {
		const opt = select.createEl("option");
		opt.value = v;
		opt.text = v === "" ? "—" : v === current ? `${v}  ·  atual` : v;
		if (v === current) opt.selected = true;
	}

	select.onchange = () => {
		css.applyEdit(el, prop.property, select.value);
		onChange?.();
	};
}
