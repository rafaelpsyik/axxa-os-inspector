import { App, PluginSettingTab, Setting } from "obsidian";
import type AxxaInspectorPlugin from "../main";
import type { AxxaSettings } from "../types/settings";

/**
 * Settings tab (Feature 14 + 17 accessibility).
 *
 * Each control writes through {@link PersistenceLayer.updateSettings} (debounced
 * save) and then calls `plugin.applySettings()` so live changes — throttle
 * intervals, overlay colours, high contrast, UI scale — take effect immediately
 * without a reload.
 */
export class AxxaSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: AxxaInspectorPlugin,
	) {
		super(app, plugin);
	}

	private get settings(): AxxaSettings {
		return this.plugin.persistence.settings;
	}

	private patch(patch: Partial<AxxaSettings>): void {
		this.plugin.persistence.updateSettings(patch);
		this.plugin.applySettings();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("axxa-settings");

		containerEl.createEl("h2", { text: "AXXA Inspector" });

		// ── Inspection ──────────────────────────────────────────────────────────
		containerEl.createEl("h3", { text: "Inspection" });

		new Setting(containerEl)
			.setName("Show box-model overlay")
			.setDesc("Visualise content, padding and margin while inspecting.")
			.addToggle((t) =>
				t.setValue(this.settings.showBoxModelOverlay).onChange((v) => this.patch({ showBoxModelOverlay: v })),
			);

		new Setting(containerEl)
			.setName("Show hover tooltip")
			.setDesc("Display size and z-index next to the hovered element.")
			.addToggle((t) =>
				t.setValue(this.settings.showHoverTooltip).onChange((v) => this.patch({ showHoverTooltip: v })),
			);

		new Setting(containerEl)
			.setName("Use semantic Obsidian labels")
			.setDesc('Show "Status Bar" instead of ".status-bar.mod-root".')
			.addToggle((t) =>
				t.setValue(this.settings.useSemanticLabels).onChange((v) => this.patch({ useSemanticLabels: v })),
			);

		new Setting(containerEl)
			.setName("Hover throttle (ms)")
			.setDesc("Lower = snappier highlight, higher = cheaper. Default 16 (~60fps).")
			.addSlider((s) =>
				s
					.setLimits(0, 100, 4)
					.setValue(this.settings.hoverThrottleMs)
					.setDynamicTooltip()
					.onChange((v) => this.patch({ hoverThrottleMs: v })),
			);

		// ── Editing ──────────────────────────────────────────────────────────────
		containerEl.createEl("h3", { text: "Live editing" });

		new Setting(containerEl)
			.setName("Persist live CSS edits")
			.setDesc("Keep inline edits after reloading Obsidian. Off = session-only (safer).")
			.addToggle((t) =>
				t.setValue(this.settings.persistEdits).onChange((v) => this.patch({ persistEdits: v })),
			);

		new Setting(containerEl)
			.setName("Undo history size")
			.setDesc("Maximum number of edits kept in the undo/redo stack.")
			.addSlider((s) =>
				s
					.setLimits(10, 500, 10)
					.setValue(this.settings.maxHistorySize)
					.setDynamicTooltip()
					.onChange((v) => this.patch({ maxHistorySize: v })),
			);

		// ── Mutation tracking ─────────────────────────────────────────────────────
		containerEl.createEl("h3", { text: "Mutation tracking" });

		new Setting(containerEl)
			.setName("Max mutation events")
			.setDesc("Cap on events retained in memory per recording.")
			.addSlider((s) =>
				s
					.setLimits(100, 5000, 100)
					.setValue(this.settings.maxMutationEvents)
					.setDynamicTooltip()
					.onChange((v) => this.patch({ maxMutationEvents: v })),
			);

		// ── Accessibility ──────────────────────────────────────────────────────────
		containerEl.createEl("h3", { text: "Accessibility" });

		new Setting(containerEl)
			.setName("High contrast overlay")
			.setDesc("Stronger overlay colours and outlines for low-vision use.")
			.addToggle((t) =>
				t.setValue(this.settings.highContrast).onChange((v) => this.patch({ highContrast: v })),
			);

		new Setting(containerEl)
			.setName("Panel UI scale")
			.setDesc("Scale the inspector panel text and controls.")
			.addSlider((s) =>
				s
					.setLimits(0.8, 1.6, 0.1)
					.setValue(this.settings.uiScale)
					.setDynamicTooltip()
					.onChange((v) => this.patch({ uiScale: v })),
			);

		(["content", "padding", "margin", "border"] as const).forEach((key) => {
			new Setting(containerEl)
				.setName(`Highlight colour — ${key}`)
				.addColorPicker((c) =>
					c.setValue(this.settings.highlightColors[key]).onChange((v) =>
						this.patch({ highlightColors: { ...this.settings.highlightColors, [key]: v } }),
					),
				);
		});

		// ── Mobile ───────────────────────────────────────────────────────────────
		containerEl.createEl("h3", { text: "Mobile" });

		new Setting(containerEl)
			.setName("Graceful degradation")
			.setDesc("Disable desktop-only tools automatically on mobile devices.")
			.addToggle((t) =>
				t.setValue(this.settings.mobileGracefulDegrade).onChange((v) => this.patch({ mobileGracefulDegrade: v })),
			);
	}
}
