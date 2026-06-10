import { Plugin, WorkspaceLeaf } from "obsidian";
import { ServiceContainer } from "./core/ServiceContainer";
import { Tokens } from "./core/tokens";
import { ObsidianTopology } from "./intelligence/ObsidianTopology";
import { OverlayManager } from "./engines/OverlayManager";
import { DOMAnalysisEngine } from "./engines/DOMAnalysisEngine";
import { CSSEngine } from "./engines/CSSEngine";
import { InspectorEngine } from "./engines/InspectorEngine";
import { VisualTestEngine } from "./engines/VisualTestEngine";
import { MutationTrackingEngine } from "./engines/MutationTrackingEngine";
import { PerformanceMonitor } from "./engines/PerformanceMonitor";
import { PersistenceLayer } from "./engines/PersistenceLayer";
import { ExportEngine } from "./engines/ExportEngine";
import { ExperimentSandbox } from "./engines/ExperimentSandbox";
import { LayoutDebugger } from "./engines/LayoutDebugger";
import { InspectorView, AXXA_VIEW_TYPE } from "./ui/InspectorView";
import { FloatingControls } from "./ui/FloatingControls";
import { DebugLog } from "./ui/DebugLog";
import { AxxaSettingsTab } from "./settings/SettingsTab";
import { isMobile } from "./utils/platform";
import { copyToClipboard } from "./utils/clipboard";
import type { AxxaPluginData } from "./types/settings";

/**
 * AXXA Inspector — plugin entry point.
 *
 * `onload` builds the {@link ServiceContainer}, registers every engine as a
 * lazy singleton, restores persisted state, and wires the Obsidian surfaces
 * (view, ribbon, commands, settings). `onunload` disposes the container, which
 * cascades teardown through every engine's {@link DisposableGroup} — guaranteeing
 * no overlays, observers, listeners or injected styles survive (Features 16 & 19).
 */
export default class AxxaInspectorPlugin extends Plugin {
	private container!: ServiceContainer;
	private floating!: FloatingControls;
	private debugLog!: DebugLog;
	persistence!: PersistenceLayer;

	async onload(): Promise<void> {
		this.container = new ServiceContainer(this.app);

		// Persistence first — other engines read settings from it.
		this.persistence = new PersistenceLayer({
			load: () => this.loadData(),
			save: (data: AxxaPluginData) => this.saveData(data),
		});
		await this.persistence.init();
		this.container.register(Tokens.Persistence, () => this.persistence);
		const settings = this.persistence.settings;

		// Register engines as lazy singletons (dependency injection).
		this.container.register(Tokens.Topology, () => new ObsidianTopology());
		this.container.register(
			Tokens.Overlay,
			() => new OverlayManager(settings.highlightColors),
		);
		this.container.register(
			Tokens.Dom,
			(c) => new DOMAnalysisEngine(c.resolve(Tokens.Topology)),
		);
		this.container.register(
			Tokens.Css,
			(c) => new CSSEngine(c.bus, c.resolve(Tokens.Persistence).settings.maxHistorySize),
		);
		this.container.register(
			Tokens.Inspector,
			(c) =>
				new InspectorEngine(
					c.bus,
					c.resolve(Tokens.Overlay),
					c.resolve(Tokens.Persistence).settings.hoverThrottleMs,
				),
		);
		this.container.register(Tokens.VisualTest, (c) => new VisualTestEngine(c.bus));
		this.container.register(
			Tokens.Mutation,
			(c) => new MutationTrackingEngine(c.bus, c.resolve(Tokens.Persistence).settings.maxMutationEvents),
		);
		this.container.register(Tokens.Performance, () => new PerformanceMonitor());
		this.container.register(Tokens.Export, () => new ExportEngine());
		this.container.register(Tokens.Sandbox, (c) => new ExperimentSandbox(c.bus));
		this.container.register(Tokens.Layout, () => new LayoutDebugger());

		// Restore persisted experiments into the sandbox.
		this.container.resolve(Tokens.Sandbox).hydrate(this.persistence.experiments);

		// Keep inspect-active state mirrored into the perf monitor.
		this.container.bus.on("inspect-mode-changed", ({ active }) =>
			this.container.resolve(Tokens.Performance).setInspectActive(active),
		);

		this.registerSurfaces();
		this.applySettings();
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(AXXA_VIEW_TYPE);
		this.floating?.dispose();
		this.debugLog?.dispose();
		this.container?.dispose();
	}

	/** Re-apply mutable settings to live engines (called by the settings tab). */
	applySettings(): void {
		const s = this.persistence.settings;
		document.body.toggleClass("axxa-high-contrast", s.highContrast);
		document.body.style.setProperty("--axxa-ui-scale", String(s.uiScale));
		this.container.resolve(Tokens.Overlay).setColors(s.highlightColors, s.highContrast);
	}

	private registerSurfaces(): void {
		// The inspector panel view.
		this.registerView(
			AXXA_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new InspectorView(leaf, this.container),
		);

		// Floating, always-on-top controls (Freeze + DOM navigation arrows).
		// Created here so it exists before any command/ribbon can reveal it.
		this.floating = new FloatingControls(this.container, () => void this.activateView());
		// On-screen debug console for mobile (no DevTools).
		this.debugLog = new DebugLog(this.container);

		// Ribbon icons.
		this.addRibbonIcon("scan-search", "Open AXXA Inspector", () => void this.activateView());
		this.addRibbonIcon("move", "AXXA: floating inspector controls", () => {
			this.floating.show();
			// Showing the controls without inspect mode is useless, so arm it.
			this.container.resolve(Tokens.Inspector).setActive(true);
		});

		this.addSettingTab(new AxxaSettingsTab(this.app, this));

		// Commands (Feature 15: keyboard shortcuts).
		this.addCommand({
			id: "open-inspector",
			name: "Open inspector panel",
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: "toggle-inspect-mode",
			name: "Toggle inspect mode",
			callback: () => {
				const inspector = this.container.resolve(Tokens.Inspector);
				inspector.setActive(!inspector.isActive);
				void this.activateView();
			},
		});
		this.addCommand({
			id: "toggle-floating-controls",
			name: "Toggle floating controls (Freeze + arrows)",
			callback: () => this.floating.toggle(),
		});
		this.addCommand({
			id: "toggle-debug-log",
			name: "Toggle on-screen debug log",
			callback: () => this.debugLog.toggle(),
		});
		this.addCommand({
			id: "copy-changes-snippet",
			name: "Copy snippet of current edits",
			callback: () => {
				const css = this.container.resolve(Tokens.Css).exportCurrentSnippet();
				void copyToClipboard(css, "CSS snippet");
			},
		});
		this.addCommand({
			id: "exit-isolation",
			name: "Exit isolation mode",
			callback: () => this.container.resolve(Tokens.VisualTest).exitIsolation(),
		});
		this.addCommand({
			id: "undo-css-edit",
			name: "Undo CSS edit",
			callback: () => this.container.resolve(Tokens.Css).undo(),
		});
		this.addCommand({
			id: "redo-css-edit",
			name: "Redo CSS edit",
			callback: () => this.container.resolve(Tokens.Css).redo(),
		});

		// Disable known-heavy desktop-only affordances on mobile (Feature 18).
		if (isMobile() && this.persistence.settings.mobileGracefulDegrade) {
			document.body.addClass("axxa-mobile");
		}
	}

	/** Reveal (or create) the inspector view in the right sidebar. */
	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(AXXA_VIEW_TYPE)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
			await leaf.setViewState({ type: AXXA_VIEW_TYPE, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}
