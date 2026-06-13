/**
 * CSS Experiment Sandbox & visual-identification data models
 * (Features 4, 5, 12).
 */

/** A named, toggleable block of custom CSS injected at runtime. */
export interface CssExperiment {
	id: string;
	name: string;
	/** Optional grouping label for the sandbox UI. */
	group: string | null;
	css: string;
	enabled: boolean;
	createdAt: number;
	updatedAt: number;
}

/** A saveable/exportable collection of experiments. */
export interface ExperimentPreset {
	id: string;
	name: string;
	description: string;
	experiments: CssExperiment[];
}

/** The visual-identification actions available per selected element (Feature 4). */
export type VisualTestAction =
	| "highlight-red"
	| "highlight-green"
	| "highlight-blue"
	| "pulse"
	| "flash"
	| "outline"
	| "dim-others"
	| "hide"
	| "remove"
	| "isolate"
	| "focus";

/** A currently-active reversible visual test on an element. */
export interface ActiveVisualTest {
	action: VisualTestAction;
	selector: string;
	/** Teardown token id so the action can be individually reverted. */
	revertId: string;
}
