import { DisposableGroup, type IDisposable } from "../core/Disposable";
import { computeBoxModel } from "../utils/dom";
import { rafThrottle, type Cancellable } from "../utils/schedule";
import type { HighlightColors } from "../types/settings";

/**
 * Overlay Manager — owns every pixel AXXA draws on top of Obsidian.
 *
 * It renders the DevTools-style highlight (Feature 1): a content box, padding
 * and margin bands, and a metrics tooltip (size + z-index). All overlay nodes
 * live in a single fixed, pointer-events:none container appended to
 * `document.body`, so they never interfere with Obsidian's own layout or
 * hit-testing and are trivially removed on unload.
 *
 * Positioning is driven through {@link rafThrottle} so repositioning happens in
 * lockstep with paint and never thrashes layout (Feature 16).
 */
export class OverlayManager implements IDisposable {
	private readonly group = new DisposableGroup();
	private root: HTMLElement;
	private marginBox: HTMLElement;
	private paddingBox: HTMLElement;
	private contentBox: HTMLElement;
	private tooltip: HTMLElement;
	private currentTarget: HTMLElement | null = null;
	private colors: HighlightColors;
	private highContrast = false;
	private readonly reposition: Cancellable<() => void>;

	constructor(colors: HighlightColors) {
		this.colors = colors;
		this.root = document.createElement("div");
		this.root.addClass("axxa-overlay-root");
		this.root.setAttr("aria-hidden", "true");

		this.marginBox = this.root.createDiv({ cls: "axxa-overlay-margin" });
		this.paddingBox = this.root.createDiv({ cls: "axxa-overlay-padding" });
		this.contentBox = this.root.createDiv({ cls: "axxa-overlay-content" });
		this.tooltip = this.root.createDiv({ cls: "axxa-overlay-tooltip" });

		document.body.appendChild(this.root);
		this.group.register(() => this.root.remove());

		this.applyColors();
		this.hide();

		// Keep the overlay glued to its target during scroll/resize.
		this.reposition = rafThrottle(() => this.draw());
		this.group.register(() => this.reposition.cancel());
		this.group.registerDomEvent(window, "scroll", () => this.reposition(), true);
		this.group.registerDomEvent(window, "resize", () => this.reposition());
	}

	/** Highlight a target element with full box-model visualisation. */
	highlight(el: HTMLElement): void {
		this.currentTarget = el;
		this.root.style.display = "block";
		this.draw();
	}

	/** Hide the overlay without tearing it down. */
	hide(): void {
		this.currentTarget = null;
		this.root.style.display = "none";
	}

	/** Update overlay colours (settings / high-contrast changes). */
	setColors(colors: HighlightColors, highContrast: boolean): void {
		this.colors = colors;
		this.highContrast = highContrast;
		this.applyColors();
		if (this.currentTarget) this.draw();
	}

	/** Re-measure and redraw the overlay for the current target. */
	private draw(): void {
		const el = this.currentTarget;
		if (!el || !el.isConnected) {
			this.hide();
			return;
		}
		const box = computeBoxModel(el);
		const { content, padding, margin, border } = box;

		// Margin band (outermost): expand outward by margins.
		setBox(
			this.marginBox,
			content.left - margin.left,
			content.top - margin.top,
			content.width + margin.left + margin.right,
			content.height + margin.top + margin.bottom,
		);
		// Content + border box.
		setBox(this.contentBox, content.left, content.top, content.width, content.height);
		// Padding band sits just inside the border.
		setBox(
			this.paddingBox,
			content.left + border.left,
			content.top + border.top,
			content.width - border.left - border.right,
			content.height - border.top - border.bottom,
		);
		this.contentBox.style.borderWidth = `${border.top}px ${border.right}px ${border.bottom}px ${border.left}px`;
		this.paddingBox.style.borderWidth = `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`;

		this.drawTooltip(el, content, box.zIndex);
	}

	private drawTooltip(el: HTMLElement, content: BoxLike, zIndex: string): void {
		const w = Math.round(content.width);
		const h = Math.round(content.height);
		const z = zIndex === "auto" ? "auto" : zIndex;
		this.tooltip.setText(`${el.tagName.toLowerCase()} · ${w}×${h} · z:${z}`);

		// Prefer placing the tooltip above the element; fall back to below.
		const above = content.top > 28;
		this.tooltip.style.left = `${Math.max(4, content.left)}px`;
		this.tooltip.style.top = above
			? `${content.top - 26}px`
			: `${content.bottom + 4}px`;
	}

	private applyColors(): void {
		const c = this.colors;
		this.contentBox.style.backgroundColor = withAlpha(c.content, this.highContrast ? 0.35 : 0.2);
		this.contentBox.style.outlineColor = c.border;
		this.paddingBox.style.borderColor = withAlpha(c.padding, 0.45);
		this.marginBox.style.borderColor = withAlpha(c.margin, 0.4);
		this.tooltip.style.color = c.text;
	}

	dispose(): void {
		this.group.dispose();
	}
}

interface BoxLike {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

function setBox(el: HTMLElement, left: number, top: number, w: number, h: number): void {
	el.style.transform = `translate(${left}px, ${top}px)`;
	el.style.width = `${Math.max(0, w)}px`;
	el.style.height = `${Math.max(0, h)}px`;
}

/** Apply an alpha channel to a hex/named colour via color-mix-safe rgba. */
function withAlpha(color: string, alpha: number): string {
	// Defer to CSS color-mix when the input is not plain hex; otherwise parse.
	if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
		const hex =
			color.length === 4
				? color
						.slice(1)
						.split("")
						.map((ch) => ch + ch)
						.join("")
				: color.slice(1);
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}
	return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}
