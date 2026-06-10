import { DisposableGroup, type IDisposable } from "../core/Disposable";
import { EventBus } from "../core/EventBus";
import type { AxxaEventMap } from "../types/events";
import { uid } from "../utils/id";
import type { CssExperiment, ExperimentPreset } from "../types/experiment";

/**
 * CSS Experiment Sandbox (Feature 12).
 *
 * Maintains a list of named, groupable CSS experiments and injects the enabled
 * ones into a single dedicated `<style id="axxa-experiments">` node. Toggling an
 * experiment simply re-renders that one node — no Obsidian restart, no author
 * stylesheet mutation. Presets bundle experiments for save/import/export.
 *
 * The injected CSS is plain text inside a `<style>` element: it cannot execute
 * JavaScript and is fully removed on unload (Feature 19).
 */
export class ExperimentSandbox implements IDisposable {
	private readonly group = new DisposableGroup();
	private styleEl: HTMLStyleElement;
	private experiments: CssExperiment[] = [];

	constructor(private readonly bus: EventBus<AxxaEventMap>) {
		this.styleEl = document.createElement("style");
		this.styleEl.id = "axxa-experiments";
		document.head.appendChild(this.styleEl);
		this.group.register(() => this.styleEl.remove());
	}

	/** Load persisted experiments and render. */
	hydrate(experiments: CssExperiment[]): void {
		this.experiments = experiments.map((e) => ({ ...e }));
		this.render();
	}

	list(): CssExperiment[] {
		return this.experiments.map((e) => ({ ...e }));
	}

	add(name: string, css = "", group: string | null = null): CssExperiment {
		const exp: CssExperiment = {
			id: uid("exp"),
			name,
			group,
			css,
			enabled: true,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		this.experiments.push(exp);
		this.render();
		this.changed();
		return exp;
	}

	update(id: string, patch: Partial<Pick<CssExperiment, "name" | "css" | "group" | "enabled">>): void {
		const exp = this.experiments.find((e) => e.id === id);
		if (!exp) return;
		Object.assign(exp, patch, { updatedAt: Date.now() });
		this.render();
		this.changed();
	}

	toggle(id: string): void {
		const exp = this.experiments.find((e) => e.id === id);
		if (!exp) return;
		exp.enabled = !exp.enabled;
		exp.updatedAt = Date.now();
		this.render();
		this.changed();
	}

	remove(id: string): void {
		this.experiments = this.experiments.filter((e) => e.id !== id);
		this.render();
		this.changed();
	}

	/** Bundle the current experiments into a named preset. */
	toPreset(name: string, description = ""): ExperimentPreset {
		return {
			id: uid("preset"),
			name,
			description,
			experiments: this.list(),
		};
	}

	/** Import a preset, replacing the working set. */
	applyPreset(preset: ExperimentPreset): void {
		this.experiments = preset.experiments.map((e) => ({ ...e, id: uid("exp") }));
		this.render();
		this.changed();
	}

	/** Re-write the injected style node from the enabled experiments. */
	private render(): void {
		const css = this.experiments
			.filter((e) => e.enabled && e.css.trim())
			.map((e) => `/* AXXA experiment: ${e.name} */\n${e.css}`)
			.join("\n\n");
		this.styleEl.textContent = css;
	}

	private changed(): void {
		this.bus.emit("experiments-changed", {});
	}

	dispose(): void {
		this.group.dispose();
	}
}
