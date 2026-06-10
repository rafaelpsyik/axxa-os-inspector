/**
 * CSS-level data models — computed styles, matched rules, specificity,
 * variables and stylesheet analysis (Features 2, 3, 8, 9).
 */

/** Categorised computed style values for the CSS inspector panel. */
export interface ComputedStyleGroup {
	/** Group label, e.g. "Box Model", "Visual", "Flex". */
	label: string;
	properties: ComputedStyleEntry[];
}

export interface ComputedStyleEntry {
	property: string;
	value: string;
	/** True when this value differs from the CSS initial/default value. */
	isModified: boolean;
	/** True when the user has live-edited this property in the session. */
	isUserEdited: boolean;
}

/** Where a CSS rule originated — drives the "Origin" column (Feature 2). */
export type StyleOrigin =
	| "theme"
	| "snippet"
	| "plugin"
	| "obsidian-core"
	| "inline"
	| "user-experiment"
	| "unknown";

/** A single CSS rule that matched the selected element. */
export interface MatchedRule {
	selector: string;
	origin: StyleOrigin;
	/** Best-effort human source name, e.g. "Minimal.css" or "my-snippet". */
	sourceName: string;
	/** Specificity as an [inline, id, class, type] tuple. */
	specificity: SpecificityTuple;
	/** Numeric specificity score for sorting. */
	specificityScore: number;
	declarations: CssDeclaration[];
	/** Index in the cascade (higher wins ties). */
	order: number;
}

export interface CssDeclaration {
	property: string;
	value: string;
	important: boolean;
	/** True when this declaration is overridden by a higher-priority rule. */
	overridden: boolean;
}

/** Specificity tuple: [inline-style, IDs, classes/attrs/pseudo-classes, types]. */
export type SpecificityTuple = [number, number, number, number];

/** A CSS custom property discovered by the Theme Variable Explorer (Feature 8). */
export interface CssVariable {
	name: string;
	value: string;
	computedValue: string;
	origin: StyleOrigin;
	sourceName: string;
	/** Approximate count of rules referencing this variable. */
	usageCount: number;
}

/** A loaded stylesheet analysed by the Stylesheet Explorer (Feature 9). */
export interface StylesheetInfo {
	id: string;
	sourceName: string;
	origin: StyleOrigin;
	ruleCount: number;
	selectorCount: number;
	/** Selectors that matched no element at scan time (best-effort). */
	unusedSelectors: string[];
	disabled: boolean;
}

/** A live CSS edit applied to a single element (Feature 3). */
export interface CssEdit {
	property: string;
	previousValue: string;
	newValue: string;
	timestamp: number;
}
