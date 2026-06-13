import type { IDisposable } from "../core/Disposable";
import { debounce, type Cancellable } from "../utils/schedule";
import { createDefaultData, SCHEMA_VERSION } from "../settings/defaults";
import type {
	AxxaPluginData,
	AxxaSettings,
	ProductivityState,
} from "../types/settings";
import type { CssExperiment, ExperimentPreset } from "../types/experiment";
import type { MutationRecording } from "../types/mutation";

/** Decoupled storage adapter so the layer never imports the Obsidian Plugin. */
export interface StorageAdapter {
	load(): Promise<unknown>;
	save(data: AxxaPluginData): Promise<void>;
}

/**
 * Persistence Layer (Feature 14).
 *
 * Owns the in-memory copy of {@link AxxaPluginData}, mediates all reads/writes,
 * runs forward migrations on load, and **debounces** writes so rapid edits
 * (e.g. dragging a colour slider) don't hammer disk. Saves go through Obsidian's
 * own `Plugin.saveData` via the injected {@link StorageAdapter}, never to
 * arbitrary files (Feature 19).
 */
export class PersistenceLayer implements IDisposable {
	private data: AxxaPluginData = createDefaultData();
	private readonly scheduleSave: Cancellable<() => void>;

	constructor(private readonly storage: StorageAdapter) {
		this.scheduleSave = debounce(() => void this.flush(), 400);
	}

	/** Load persisted data and run migrations. Call once on plugin load. */
	async init(): Promise<void> {
		const raw = (await this.storage.load()) as Partial<AxxaPluginData> | null;
		this.data = migrate(raw);
	}

	get settings(): AxxaSettings {
		return this.data.settings;
	}
	get productivity(): ProductivityState {
		return this.data.productivity;
	}
	get experiments(): CssExperiment[] {
		return this.data.experiments;
	}
	get presets(): ExperimentPreset[] {
		return this.data.presets;
	}
	get recordings(): MutationRecording[] {
		return this.data.recordings;
	}
	get lastSelection(): string | null {
		return this.data.lastSelection;
	}

	/** Patch settings and schedule a debounced save. */
	updateSettings(patch: Partial<AxxaSettings>): void {
		this.data.settings = { ...this.data.settings, ...patch };
		this.scheduleSave();
	}

	/** Replace a top-level collection (experiments, recordings, etc.). */
	set<K extends keyof AxxaPluginData>(key: K, value: AxxaPluginData[K]): void {
		this.data[key] = value;
		this.scheduleSave();
	}

	/** Force an immediate write (called on plugin unload). */
	async flush(): Promise<void> {
		await this.storage.save(this.data);
	}

	dispose(): void {
		this.scheduleSave.cancel();
		// Best-effort final flush; failures are logged, never thrown on unload.
		void this.flush().catch((e) => console.error("[AXXA Inspector] save failed", e));
	}
}

/** Forward-migrate an arbitrary persisted blob to the current schema. */
function migrate(raw: Partial<AxxaPluginData> | null): AxxaPluginData {
	const base = createDefaultData();
	if (!raw || typeof raw !== "object") return base;

	// Merge known fields defensively; unknown/old fields are dropped.
	const merged: AxxaPluginData = {
		schemaVersion: SCHEMA_VERSION,
		settings: { ...base.settings, ...(raw.settings ?? {}) },
		productivity: { ...base.productivity, ...(raw.productivity ?? {}) },
		experiments: raw.experiments ?? [],
		presets: raw.presets ?? [],
		recordings: raw.recordings ?? [],
		lastSelection: raw.lastSelection ?? null,
	};
	// Future: switch on raw.schemaVersion for breaking migrations.
	return merged;
}
