import { DisposableGroup, type IDisposable } from "../core/Disposable";
import { EventBus } from "../core/EventBus";
import type { AxxaEventMap } from "../types/events";
import {
	computeSpecificity,
	specificityScore,
} from "../utils/specificity";
import { buildUniqueSelector } from "../utils/selector";
import type {
	ComputedStyleGroup,
	MatchedRule,
	CssDeclaration,
	CssVariable,
	StylesheetInfo,
	StyleOrigin,
	CssEdit,
} from "../types/css";

/** Property groupings for the computed-styles panel (Feature 2). */
const STYLE_GROUPS: { label: string; props: string[] }[] = [
	{ label: "Layout", props: ["display", "position", "z-index", "overflow", "float", "clear"] },
	{ label: "Box Model", props: ["width", "height", "min-width", "min-height", "max-width", "max-height", "margin", "padding", "border", "box-sizing"] },
	{ label: "Flex / Grid", props: ["flex", "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "gap", "grid-template-columns", "grid-template-rows", "grid-area"] },
	{ label: "Visual", props: ["opacity", "background", "box-shadow", "outline", "filter", "backdrop-filter", "mix-blend-mode"] },
	{ label: "Typography", props: ["color", "font-size", "font-weight", "font-family", "line-height", "letter-spacing", "text-align"] },
	{ label: "Motion", props: ["transform", "transition", "animation", "will-change"] },
];

/**
 * CSS Engine — the analytical heart of the inspector.
 *
 * Responsibilities (Features 2, 3, 8, 9):
 *  - Read grouped computed styles for the selected element.
 *  - Enumerate the CSS rules that match an element, with origin + specificity.
 *  - Apply, track and revert live inline edits with full undo/redo history.
 *  - Discover CSS custom properties (theme variables).
 *  - Analyse loaded stylesheets.
 *
 * Live edits are applied as *inline styles only* — never by rewriting author
 * stylesheets — which keeps changes fully reversible and within the security
 * boundary (Feature 19).
 */
export class CSSEngine implements IDisposable {
	private readonly group = new DisposableGroup();
	/** Per-element edit map keyed by a WeakRef-friendly token. */
	private readonly edits = new WeakMap<HTMLElement, Map<string, CssEdit>>();
	/** Enumerable, ordered registry of edited elements (drives the Changes
	 * list + snippet export — WeakMap alone isn't iterable). */
	private readonly editedOrder: HTMLElement[] = [];
	/** Undo / redo stacks of (element, edit) pairs. */
	private readonly undoStack: { el: HTMLElement; edit: CssEdit }[] = [];
	private readonly redoStack: { el: HTMLElement; edit: CssEdit }[] = [];

	constructor(
		private readonly bus: EventBus<AxxaEventMap>,
		private readonly maxHistorySize: number,
	) {}

	// ── Feature 2: computed styles ────────────────────────────────────────────

	/** Grouped computed styles for the selected element. */
	getComputedStyleGroups(el: HTMLElement): ComputedStyleGroup[] {
		const cs = getComputedStyle(el);
		const userEdits = this.edits.get(el);
		return STYLE_GROUPS.map((group) => ({
			label: group.label,
			properties: group.props.map((property) => {
				const value = cs.getPropertyValue(property).trim();
				return {
					property,
					value: value || "—",
					isModified: value !== "" && !isInitialValue(property, value),
					isUserEdited: userEdits?.has(property) ?? false,
				};
			}),
		}));
	}

	// ── Feature 2: matched rules with origin + specificity ─────────────────────

	/**
	 * Enumerate author rules that match `el`, ordered by cascade priority, with
	 * declaration-level override detection. Cross-origin sheets are skipped
	 * gracefully (accessing `.cssRules` throws a SecurityError for them).
	 */
	getMatchedRules(el: HTMLElement): MatchedRule[] {
		const matched: MatchedRule[] = [];
		let order = 0;

		for (const sheet of Array.from(document.styleSheets)) {
			let rules: CSSRuleList;
			try {
				rules = sheet.cssRules;
			} catch {
				continue; // cross-origin / inaccessible
			}
			const origin = classifyOrigin(sheet);
			const sourceName = sheetName(sheet);
			this.collectMatching(el, rules, origin, sourceName, matched, () => order++);
		}

		// Sort by specificity then source order (higher wins).
		matched.sort(
			(a, b) =>
				b.specificityScore - a.specificityScore || b.order - a.order,
		);
		this.markOverrides(matched);
		return matched;
	}

	private collectMatching(
		el: HTMLElement,
		rules: CSSRuleList,
		origin: StyleOrigin,
		sourceName: string,
		out: MatchedRule[],
		nextOrder: () => number,
	): void {
		for (const rule of Array.from(rules)) {
			if (rule instanceof CSSStyleRule) {
				let isMatch = false;
				try {
					isMatch = el.matches(rule.selectorText);
				} catch {
					continue;
				}
				if (!isMatch) continue;
				const tuple = computeSpecificity(rule.selectorText);
				out.push({
					selector: rule.selectorText,
					origin,
					sourceName,
					specificity: tuple,
					specificityScore: specificityScore(tuple),
					order: nextOrder(),
					declarations: readDeclarations(rule.style),
				});
			} else if (rule instanceof CSSMediaRule && matchMedia(rule.conditionText).matches) {
				this.collectMatching(el, rule.cssRules, origin, sourceName, out, nextOrder);
			} else if (rule instanceof CSSSupportsRule) {
				this.collectMatching(el, rule.cssRules, origin, sourceName, out, nextOrder);
			}
		}
	}

	/** Flag declarations shadowed by a higher-priority rule (Feature 2). */
	private markOverrides(rules: MatchedRule[]): void {
		const seen = new Set<string>();
		for (const rule of rules) {
			for (const decl of rule.declarations) {
				if (seen.has(decl.property)) decl.overridden = true;
				else seen.add(decl.property);
			}
		}
	}

	// ── Feature 3: live editing + undo/redo ────────────────────────────────────

	/**
	 * Apply a live inline edit and push it onto the undo stack. An empty
	 * `newValue` clears the inline override (back to the cascade default).
	 */
	applyEdit(el: HTMLElement, property: string, newValue: string): void {
		const previousValue = el.style.getPropertyValue(property);
		if (newValue === "") el.style.removeProperty(property);
		else el.style.setProperty(property, newValue);

		const edit: CssEdit = { property, previousValue, newValue, timestamp: Date.now() };
		const map = this.mapFor(el);
		if (newValue === "") map.delete(property);
		else map.set(property, edit);
		this.reconcile(el);

		this.undoStack.push({ el, edit });
		if (this.undoStack.length > this.maxHistorySize) this.undoStack.shift();
		this.redoStack.length = 0;

		this.bus.emit("css-edited", { element: el, edit });
		this.emitHistory();
	}

	/** Reset a single property to its pre-edit value (Feature 3). */
	resetProperty(el: HTMLElement, property: string): void {
		const map = this.edits.get(el);
		const edit = map?.get(property);
		if (!edit) return;
		if (edit.previousValue) el.style.setProperty(property, edit.previousValue);
		else el.style.removeProperty(property);
		map!.delete(property);
		this.reconcile(el);
		this.emitHistory();
	}

	/** Reset every live edit on a single element (Feature 3). */
	resetElement(el: HTMLElement): void {
		const map = this.edits.get(el);
		if (!map) return;
		for (const [property, edit] of map) {
			if (edit.previousValue) el.style.setProperty(property, edit.previousValue);
			else el.style.removeProperty(property);
		}
		this.edits.delete(el);
		this.reconcile(el);
		this.emitHistory();
	}

	/** Reset every live edit on every element (Feature 3: Reset All). */
	resetAll(): void {
		for (const el of [...this.editedOrder]) this.resetElement(el);
		this.undoStack.length = 0;
		this.redoStack.length = 0;
		this.emitHistory();
	}

	/** Undo the most recent edit (Feature 3). */
	undo(): void {
		const last = this.undoStack.pop();
		if (!last) return;
		const { el, edit } = last;
		if (edit.previousValue) el.style.setProperty(edit.property, edit.previousValue);
		else el.style.removeProperty(edit.property);
		this.redoStack.push(last);
		this.edits.get(el)?.delete(edit.property);
		this.reconcile(el);
		this.emitHistory();
	}

	/** Redo the most recently undone edit (Feature 3). */
	redo(): void {
		const next = this.redoStack.pop();
		if (!next) return;
		const { el, edit } = next;
		if (edit.newValue === "") el.style.removeProperty(edit.property);
		else el.style.setProperty(edit.property, edit.newValue);
		this.undoStack.push(next);
		const map = this.mapFor(el);
		if (edit.newValue === "") map.delete(edit.property);
		else map.set(edit.property, edit);
		this.reconcile(el);
		this.emitHistory();
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}
	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	// ── Feature 3 + 13: changed-element registry & snippet export ───────────────

	/** Current inline edits on an element (most recent value per property). */
	getEdits(el: HTMLElement): CssEdit[] {
		return Array.from(this.edits.get(el)?.values() ?? []);
	}

	/** Whether an element currently carries any live edit (drives the tree dot). */
	hasEdits(el: HTMLElement): boolean {
		return (this.edits.get(el)?.size ?? 0) > 0;
	}

	/** Every element with live edits, newest first, pruning detached nodes. */
	getEditedElements(): { element: HTMLElement; selector: string; edits: CssEdit[] }[] {
		this.pruneDetached();
		return [...this.editedOrder]
			.reverse()
			.map((element) => ({
				element,
				selector: safeSelector(element),
				edits: this.getEdits(element),
			}))
			.filter((e) => e.edits.length > 0);
	}

	get changeCount(): number {
		this.pruneDetached();
		return this.editedOrder.length;
	}

	/**
	 * Build a ready-to-use CSS snippet from every current edit — the
	 * "export what's changed" deliverable. Each edited element becomes a rule
	 * keyed by its generated selector.
	 */
	exportCurrentSnippet(): string {
		const header =
			"/* AXXA Inspector — exported live edits\n" +
			`   ${new Date().toLocaleString()} · ${this.changeCount} element(s) */\n\n`;
		const blocks = this.getEditedElements().map(({ selector, edits }) => {
			const decls = edits.map((e) => `\t${e.property}: ${e.newValue};`).join("\n");
			return `${selector} {\n${decls}\n}`;
		});
		return header + (blocks.join("\n\n") || "/* no live edits yet */");
	}

	private mapFor(el: HTMLElement): Map<string, CssEdit> {
		let map = this.edits.get(el);
		if (!map) {
			map = new Map();
			this.edits.set(el, map);
		}
		return map;
	}

	/** Keep editedOrder membership consistent with the per-element map size. */
	private reconcile(el: HTMLElement): void {
		const size = this.edits.get(el)?.size ?? 0;
		const idx = this.editedOrder.indexOf(el);
		if (size > 0 && idx === -1) this.editedOrder.push(el);
		else if (size === 0 && idx !== -1) this.editedOrder.splice(idx, 1);
		this.emitChanges();
	}

	private pruneDetached(): void {
		for (let i = this.editedOrder.length - 1; i >= 0; i--) {
			if (!this.editedOrder[i].isConnected) this.editedOrder.splice(i, 1);
		}
	}

	private emitChanges(): void {
		this.bus.emit("changes-updated", { count: this.editedOrder.length });
	}

	private emitHistory(): void {
		this.bus.emit("history-changed", { canUndo: this.canUndo, canRedo: this.canRedo });
	}

	// ── Feature 8: CSS variables ───────────────────────────────────────────────

	/** Discover CSS custom properties declared across all accessible sheets. */
	getVariables(scope: HTMLElement = document.body): CssVariable[] {
		const found = new Map<string, CssVariable>();
		const usage = new Map<string, number>();
		const rootStyle = getComputedStyle(scope);

		for (const sheet of Array.from(document.styleSheets)) {
			let rules: CSSRuleList;
			try {
				rules = sheet.cssRules;
			} catch {
				continue;
			}
			const origin = classifyOrigin(sheet);
			const sourceName = sheetName(sheet);
			for (const rule of Array.from(rules)) {
				if (!(rule instanceof CSSStyleRule)) continue;
				for (let i = 0; i < rule.style.length; i++) {
					const prop = rule.style[i];
					const declValue = rule.style.getPropertyValue(prop).trim();
					// Count references like var(--foo).
					const refs = declValue.match(/var\(\s*(--[\w-]+)/g);
					refs?.forEach((r) => {
						const name = r.replace(/var\(\s*/, "");
						usage.set(name, (usage.get(name) ?? 0) + 1);
					});
					if (!prop.startsWith("--")) continue;
					if (!found.has(prop)) {
						found.set(prop, {
							name: prop,
							value: declValue,
							computedValue: rootStyle.getPropertyValue(prop).trim() || declValue,
							origin,
							sourceName,
							usageCount: 0,
						});
					}
				}
			}
		}
		for (const v of found.values()) v.usageCount = usage.get(v.name) ?? 0;
		return Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name));
	}

	/** Live-edit a variable on a scope element (Feature 8). */
	setVariable(name: string, value: string, scope: HTMLElement = document.body): void {
		scope.style.setProperty(name, value);
	}

	// ── Feature 9: stylesheet analysis ─────────────────────────────────────────

	/** Summarise every accessible stylesheet. */
	getStylesheets(): StylesheetInfo[] {
		const infos: StylesheetInfo[] = [];
		Array.from(document.styleSheets).forEach((sheet, index) => {
			let rules: CSSRuleList;
			try {
				rules = sheet.cssRules;
			} catch {
				infos.push({
					id: `sheet-${index}`,
					sourceName: sheetName(sheet),
					origin: "unknown",
					ruleCount: 0,
					selectorCount: 0,
					unusedSelectors: [],
					disabled: sheet.disabled,
				});
				return;
			}
			let selectorCount = 0;
			const unused: string[] = [];
			for (const rule of Array.from(rules)) {
				if (rule instanceof CSSStyleRule) {
					const selectors = rule.selectorText.split(",");
					selectorCount += selectors.length;
					// Best-effort unused detection (capped to keep it cheap).
					if (unused.length < 50) {
						try {
							if (!document.querySelector(rule.selectorText)) {
								unused.push(rule.selectorText);
							}
						} catch {
							/* unparsable selector — ignore */
						}
					}
				}
			}
			infos.push({
				id: `sheet-${index}`,
				sourceName: sheetName(sheet),
				origin: classifyOrigin(sheet),
				ruleCount: rules.length,
				selectorCount,
				unusedSelectors: unused,
				disabled: sheet.disabled,
			});
		});
		return infos;
	}

	dispose(): void {
		this.group.dispose();
		this.undoStack.length = 0;
		this.redoStack.length = 0;
	}
}

// ── module-private helpers ───────────────────────────────────────────────────

function safeSelector(el: HTMLElement): string {
	try {
		return buildUniqueSelector(el);
	} catch {
		return el.tagName.toLowerCase();
	}
}

function readDeclarations(style: CSSStyleDeclaration): CssDeclaration[] {
	const decls: CssDeclaration[] = [];
	for (let i = 0; i < style.length; i++) {
		const property = style[i];
		decls.push({
			property,
			value: style.getPropertyValue(property).trim(),
			important: style.getPropertyPriority(property) === "important",
			overridden: false,
		});
	}
	return decls;
}

/** Classify a stylesheet's origin from its owner node + href (Feature 2). */
function classifyOrigin(sheet: CSSStyleSheet): StyleOrigin {
	const owner = sheet.ownerNode as HTMLElement | null;
	const href = sheet.href ?? "";
	if (owner?.id === "axxa-experiments") return "user-experiment";
	if (href.includes("/themes/") || owner?.classList.contains("theme")) return "theme";
	if (href.includes("/snippets/")) return "snippet";
	if (href.includes("/plugins/") || owner?.dataset?.pluginId) return "plugin";
	if (owner?.tagName === "STYLE" && !owner.id) return "obsidian-core";
	if (!owner) return "inline";
	return "obsidian-core";
}

/** Best-effort human-readable source name for a stylesheet. */
function sheetName(sheet: CSSStyleSheet): string {
	if (sheet.href) {
		const parts = sheet.href.split("/");
		return decodeURIComponent(parts[parts.length - 1]) || sheet.href;
	}
	const owner = sheet.ownerNode as HTMLElement | null;
	if (owner?.id) return `<style#${owner.id}>`;
	if (owner?.dataset?.pluginId) return `plugin:${owner.dataset.pluginId}`;
	return owner?.title || "<inline style>";
}

/** Cheap heuristic for whether a computed value differs from CSS initial. */
function isInitialValue(property: string, value: string): boolean {
	const INITIALS: Record<string, string> = {
		opacity: "1",
		"z-index": "auto",
		transform: "none",
		filter: "none",
		"backdrop-filter": "none",
		"box-shadow": "none",
		float: "none",
	};
	return INITIALS[property] === value;
}
