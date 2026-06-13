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
 * Properties are edited through **dropdowns and colour swatches** — never typed.
 *
 * Critically, it **updates itself in place**: changing a value patches only the
 * affected row (and the quick-toggle states) instead of rebuilding the DOM, so
 * the surrounding scroll position is never lost. (Earlier the host re-rendered
 * the whole editor on every change, which reset the scroll and made the
 * floating editor unusable.)
 */
export interface StyleEditorOptions {
	element: HTMLElement;
	css: CSSEngine;
	/** Restrict to this subset of property names (compact view). */
	properties?: string[];
	/** Denser layout + fewer quick toggles for the floating widget. */
	compact?: boolean;
	/** Notification hook (no rebuild — the editor refreshes itself). */
	onChange?: () => void;
}

export function renderStyleEditor(container: HTMLElement, opts: StyleEditorOptions): void {
	const { element: el, css, properties, compact, onChange } = opts;
	container.empty();
	container.addClass("axxa-style-editor");
	if (compact) container.addClass("is-compact");

	const rowRefreshers: (() => void)[] = [];
	const toggleRefreshers: (() => void)[] = [];
	const refreshAll = () => {
		rowRefreshers.forEach((r) => r());
		toggleRefreshers.forEach((r) => r());
		onChange?.();
	};

	// ── Quick toggles ──────────────────────────────────────────────────────────
	const toggleList = compact ? QUICK_TOGGLES.slice(0, 4) : QUICK_TOGGLES;
	const toggles = container.createDiv({ cls: "axxa-style-toggles" });
	for (const t of toggleList) {
		const btn = toggles.createEl("button", { cls: "axxa-chip" });
		setIcon(btn.createSpan({ cls: "axxa-chip-icon" }), t.icon);
		btn.createSpan({ text: t.label });
		const refresh = () => {
			const active = el.style.getPropertyValue(t.property) === t.value;
			btn.toggleClass("is-active", active);
			btn.setAttr("aria-pressed", String(active));
		};
		refresh();
		toggleRefreshers.push(refresh);
		btn.onclick = () => {
			const isOn = el.style.getPropertyValue(t.property) === t.value;
			css.applyEdit(el, t.property, isOn ? "" : t.value);
			refreshAll();
		};
	}
	const reset = toggles.createEl("button", { cls: "axxa-chip mod-warning" });
	setIcon(reset.createSpan({ cls: "axxa-chip-icon" }), "rotate-ccw");
	reset.createSpan({ text: "Reset" });
	reset.setAttr("aria-label", "Reset all edits on this element");
	reset.onclick = () => {
		css.resetElement(el);
		refreshAll();
	};

	// ── Property dropdowns ──────────────────────────────────────────────────────
	const allow = properties ? new Set(properties) : null;
	for (const group of STYLE_GROUPS) {
		const props = group.properties.filter((p) => !allow || allow.has(p.property));
		if (props.length === 0) continue;
		const section = container.createDiv({ cls: "axxa-style-group" });
		if (!compact) section.createDiv({ cls: "axxa-style-group-label", text: group.label });
		for (const prop of props) {
			rowRefreshers.push(renderRow(section, prop, el, css, refreshAll));
		}
	}

	if (rowRefreshers.length === 0) {
		container.createDiv({ cls: "axxa-muted axxa-empty-row", text: "No properties selected." });
	}
}

/** Build one property row; returns a function that refreshes it in place. */
function renderRow(
	parent: HTMLElement,
	prop: StyleProperty,
	el: HTMLElement,
	css: CSSEngine,
	onChange: () => void,
): () => void {
	const row = parent.createDiv({ cls: "axxa-style-row" });
	const key = row.createSpan({ cls: "axxa-style-key", text: prop.label });
	const swatch = prop.kind === "color" ? key.createSpan({ cls: "axxa-style-swatch" }) : null;
	const select = row.createEl("select", { cls: "axxa-style-select" });
	select.setAttr("aria-label", prop.label);

	const read = () => {
		const inline = el.style.getPropertyValue(prop.property);
		const current = (inline || getComputedStyle(el).getPropertyValue(prop.property)).trim();
		return { inline, current };
	};

	const buildOptions = (current: string) => {
		select.empty();
		const values = [...prop.values];
		if (current && !values.includes(current)) values.splice(1, 0, current);
		for (const v of values) {
			const opt = select.createEl("option");
			opt.value = v;
			opt.text = v === "" ? "—" : v === current ? `${v}  ·  atual` : v;
			if (v === current) opt.selected = true;
		}
	};

	const refresh = () => {
		const { inline, current } = read();
		row.toggleClass("is-edited", inline !== "");
		if (swatch) swatch.style.background = current || "transparent";
		// Only rebuild options if the current value isn't already an option.
		if (!Array.from(select.options).some((o) => o.value === current)) buildOptions(current);
		else select.value = current;
	};

	buildOptions(read().current);
	refresh();

	select.onchange = () => {
		css.applyEdit(el, prop.property, select.value);
		onChange();
	};
	return refresh;
}
