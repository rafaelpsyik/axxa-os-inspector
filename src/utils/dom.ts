/**
 * Low-level DOM helpers shared across engines.
 */

import type { BoxRect, BoxSpacing, BoxModel } from "../types/dom";

/** Convert a live DOMRect into a serialisable {@link BoxRect}. */
export function toBoxRect(rect: DOMRect): BoxRect {
	return {
		x: round(rect.x),
		y: round(rect.y),
		width: round(rect.width),
		height: round(rect.height),
		top: round(rect.top),
		right: round(rect.right),
		bottom: round(rect.bottom),
		left: round(rect.left),
	};
}

/** Read the four-sided spacing for a CSS box property prefix. */
export function readSpacing(
	cs: CSSStyleDeclaration,
	prefix: "margin" | "padding",
): BoxSpacing {
	return {
		top: px(cs.getPropertyValue(`${prefix}-top`)),
		right: px(cs.getPropertyValue(`${prefix}-right`)),
		bottom: px(cs.getPropertyValue(`${prefix}-bottom`)),
		left: px(cs.getPropertyValue(`${prefix}-left`)),
	};
}

/** Compute the full box model for the overlay + layout tools. */
export function computeBoxModel(el: HTMLElement): BoxModel {
	const cs = getComputedStyle(el);
	return {
		content: toBoxRect(el.getBoundingClientRect()),
		padding: readSpacing(cs, "padding"),
		margin: readSpacing(cs, "margin"),
		border: {
			top: px(cs.borderTopWidth),
			right: px(cs.borderRightWidth),
			bottom: px(cs.borderBottomWidth),
			left: px(cs.borderLeftWidth),
		},
		zIndex: cs.zIndex,
	};
}

/** Whether an element is currently visible (rendered and non-zero size). */
export function isVisible(el: HTMLElement): boolean {
	if (!el.isConnected) return false;
	const cs = getComputedStyle(el);
	if (cs.display === "none" || cs.visibility === "hidden") return false;
	if (parseFloat(cs.opacity) === 0) return false;
	const rect = el.getBoundingClientRect();
	return rect.width > 0 || rect.height > 0 || el.offsetParent !== null;
}

/** First ancestor (inclusive) matching `predicate`, else null. */
export function closestMatching(
	el: HTMLElement | null,
	predicate: (e: HTMLElement) => boolean,
): HTMLElement | null {
	let current = el;
	while (current) {
		if (predicate(current)) return current;
		current = current.parentElement;
	}
	return null;
}

function px(value: string): number {
	const n = parseFloat(value);
	return Number.isFinite(n) ? round(n) : 0;
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}
