import { Notice } from "obsidian";
import { DisposableGroup, type IDisposable } from "../core/Disposable";
import type { ServiceContainer } from "../core/ServiceContainer";
import { Tokens } from "../core/tokens";
import { rafThrottle, type Cancellable } from "../utils/schedule";
import type { ObsidianRegionCategory } from "../intelligence/ObsidianTopology";

/**
 * ✶ AXXA X-Ray — the secret "Reveal the Architecture" mode.
 *
 * The signature flourish of AXXA Inspector: with one incantation it scans the
 * entire Obsidian UI and overlays *every* recognised region at once — each
 * outlined and labelled with its semantic name and colour-coded by category.
 * It turns the invisible workspace skeleton into a readable map, which is both
 * a genuinely useful "understand the whole UI" tool and a bit of theatre.
 *
 * Reversible, performant (rAF-coalesced repositioning), and self-cleaning.
 * Region tags are tappable to jump straight into inspection.
 */
const CATEGORY_COLORS: Record<ObsidianRegionCategory, string> = {
	workspace: "#7c5cff",
	leaf: "#2dd4bf",
	view: "#4c8bf5",
	sidebar: "#f2a23c",
	chrome: "#e5484d",
	overlay: "#d946ef",
	mobile: "#22c55e",
};

interface XRayRegion {
	element: HTMLElement;
	box: HTMLElement;
	tag: HTMLElement;
}

export class XRayMode implements IDisposable {
	/** Recreated on deactivate so scroll/resize listeners are cleanly scoped. */
	private group = new DisposableGroup();
	private layer: HTMLElement | null = null;
	private legend: HTMLElement | null = null;
	private regions: XRayRegion[] = [];
	private active = false;
	private reposition: Cancellable<() => void> | null = null;

	constructor(private readonly container: ServiceContainer) {}

	get isActive(): boolean {
		return this.active;
	}

	toggle(): void {
		this.active ? this.deactivate() : this.activate();
	}

	private activate(): void {
		if (this.active) return;
		this.active = true;

		this.layer = document.body.createDiv({ cls: "axxa-xray-root" });
		this.layer.setAttr("aria-hidden", "true");

		const topology = this.container.resolve(Tokens.Topology);
		const found = topology.scanRegions();
		const counts = new Map<ObsidianRegionCategory, number>();

		for (const region of found) {
			const color = CATEGORY_COLORS[region.category];
			counts.set(region.category, (counts.get(region.category) ?? 0) + 1);

			const box = this.layer.createDiv({ cls: "axxa-xray-box" });
			box.style.outlineColor = color;
			box.style.backgroundColor = `color-mix(in srgb, ${color} 8%, transparent)`;

			const tag = this.layer.createDiv({ cls: "axxa-xray-tag" });
			tag.style.backgroundColor = color;
			tag.setText(region.label);
			// Tags are the one interactive layer: tap to inspect that region.
			tag.onclick = () => {
				this.container.resolve(Tokens.Inspector).select(region.element);
			};

			this.regions.push({ element: region.element, box, tag });
		}

		this.buildLegend(counts, found.length);

		this.reposition = rafThrottle(() => this.draw());
		this.group.register(() => this.reposition?.cancel());
		this.group.registerDomEvent(window, "scroll", () => this.reposition?.(), true);
		this.group.registerDomEvent(window, "resize", () => this.reposition?.());
		this.draw();

		this.container.bus.emit("notice", { message: `✶ X-Ray: ${found.length} regions revealed`, level: "info" });
		new Notice(`✶ AXXA X-Ray — ${found.length} regions revealed`, 4000);
	}

	private buildLegend(counts: Map<ObsidianRegionCategory, number>, total: number): void {
		this.legend = document.body.createDiv({ cls: "axxa-xray-legend axxa-floating" });
		const head = this.legend.createDiv({ cls: "axxa-floating-handle" });
		head.createSpan({ text: `✶ Architecture · ${total}` });
		const close = head.createEl("button", { cls: "axxa-floating-x", text: "✕" });
		close.onclick = () => this.deactivate();

		const list = this.legend.createDiv({ cls: "axxa-xray-legend-list" });
		for (const [category, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
			const row = list.createDiv({ cls: "axxa-xray-legend-row" });
			const dot = row.createSpan({ cls: "axxa-xray-legend-dot" });
			dot.style.backgroundColor = CATEGORY_COLORS[category];
			row.createSpan({ text: category });
			row.createSpan({ cls: "axxa-badge", text: String(count) });
		}
		// The maker's mark.
		this.legend.createDiv({ cls: "axxa-xray-sigil", text: "✶ crafted by Mythos · AXXA" });
	}

	/** Reposition every region box/tag to its element's current rect. */
	private draw(): void {
		for (let i = this.regions.length - 1; i >= 0; i--) {
			const r = this.regions[i];
			if (!r.element.isConnected) {
				r.box.remove();
				r.tag.remove();
				this.regions.splice(i, 1);
				continue;
			}
			const rect = r.element.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) {
				r.box.style.display = "none";
				r.tag.style.display = "none";
				continue;
			}
			r.box.style.display = "block";
			r.tag.style.display = "block";
			r.box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
			r.box.style.width = `${rect.width}px`;
			r.box.style.height = `${rect.height}px`;
			r.tag.style.transform = `translate(${rect.left}px, ${Math.max(0, rect.top)}px)`;
		}
	}

	private deactivate(): void {
		if (!this.active) return;
		this.active = false;
		this.reposition?.cancel();
		this.reposition = null;
		this.regions = [];
		this.layer?.remove();
		this.layer = null;
		this.legend?.remove();
		this.legend = null;
		// Drop the scroll/resize listeners registered during activate.
		this.group.dispose();
		this.group = new DisposableGroup();
	}

	dispose(): void {
		this.deactivate();
		this.group.dispose();
	}
}
