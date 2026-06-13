/**
 * Settings & persisted session data models (Features 14, 17).
 *
 * The entire persisted blob is a single {@link AxxaPluginData} object stored via
 * Obsidian's `Plugin.saveData`. It is versioned so future migrations are safe.
 */

import type { CssExperiment, ExperimentPreset } from "./experiment";
import type { MutationRecording } from "./mutation";

/** Highlight colour configuration for the overlay (accessibility, Feature 17). */
export interface HighlightColors {
	content: string;
	padding: string;
	margin: string;
	border: string;
	text: string;
}

export interface AxxaSettings {
	/** Persist live CSS edits across reloads (Feature 3 / 14). */
	persistEdits: boolean;
	/** Maximum entries kept in the undo/redo stack (Feature 3). */
	maxHistorySize: number;
	/** Throttle interval (ms) for hover highlighting (Feature 16). */
	hoverThrottleMs: number;
	/** Debounce interval (ms) for the DOM explorer re-sync (Feature 16). */
	domSyncDebounceMs: number;
	/** Show the box-model spacing overlay while inspecting. */
	showBoxModelOverlay: boolean;
	/** Show size + z-index tooltip while hovering. */
	showHoverTooltip: boolean;
	/** Use semantic Obsidian labels instead of raw selectors (Feature 11). */
	useSemanticLabels: boolean;
	/** Accessibility: high-contrast overlay palette. */
	highContrast: boolean;
	/** Accessibility: UI scale multiplier for the inspector panel. */
	uiScale: number;
	/** Customisable overlay colours. */
	highlightColors: HighlightColors;
	/** Cap on mutation events retained in memory per recording. */
	maxMutationEvents: number;
	/** Disable known desktop-only features automatically on mobile (Feature 18). */
	mobileGracefulDegrade: boolean;
	/** Which CSS properties show in the floating editor (compact, user-picked). */
	fabStyleProps: string[];
	/** Persisted floating-widget size (null = auto). */
	fabWidth: number | null;
	fabHeight: number | null;
}

/** Productivity data: favourites, pins, recents, saved selectors (Feature 15). */
export interface ProductivityState {
	favoriteSelectors: string[];
	pinnedSelectors: string[];
	recentInspections: string[];
	savedSelectors: SavedSelector[];
}

export interface SavedSelector {
	selector: string;
	label: string;
	createdAt: number;
}

/** The complete persisted plugin payload. */
export interface AxxaPluginData {
	/** Schema version for migrations. */
	schemaVersion: number;
	settings: AxxaSettings;
	productivity: ProductivityState;
	experiments: CssExperiment[];
	presets: ExperimentPreset[];
	recordings: MutationRecording[];
	/** Selector of the element pinned when the session ended, for restore. */
	lastSelection: string | null;
}
