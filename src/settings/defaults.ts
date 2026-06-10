import type { AxxaPluginData, AxxaSettings } from "../types/settings";

/** Current persisted-schema version. Bump when the shape changes. */
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: AxxaSettings = {
	persistEdits: false,
	maxHistorySize: 100,
	hoverThrottleMs: 16,
	domSyncDebounceMs: 120,
	showBoxModelOverlay: true,
	showHoverTooltip: true,
	useSemanticLabels: true,
	highContrast: false,
	uiScale: 1,
	highlightColors: {
		content: "#4c8bf5",
		padding: "#7bc86c",
		margin: "#f2a23c",
		border: "#3b6fd4",
		text: "#ffffff",
	},
	maxMutationEvents: 500,
	mobileGracefulDegrade: true,
};

/** A fresh, empty persisted payload. */
export function createDefaultData(): AxxaPluginData {
	return {
		schemaVersion: SCHEMA_VERSION,
		settings: { ...DEFAULT_SETTINGS, highlightColors: { ...DEFAULT_SETTINGS.highlightColors } },
		productivity: {
			favoriteSelectors: [],
			pinnedSelectors: [],
			recentInspections: [],
			savedSelectors: [],
		},
		experiments: [],
		presets: [],
		recordings: [],
		lastSelection: null,
	};
}
