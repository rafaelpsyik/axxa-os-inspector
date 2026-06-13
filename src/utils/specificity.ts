/**
 * CSS specificity calculator (Features 2 & 15).
 *
 * Computes the [inline, id, class, type] tuple for a selector following the
 * W3C cascade rules closely enough for inspector ranking. This is intentionally
 * dependency-free and tokeniser-based rather than a full CSS parser.
 */

import type { SpecificityTuple } from "../types/css";

const ID_RE = /#[\w-]+/g;
const CLASS_RE = /\.[\w-]+/g;
const ATTR_RE = /\[[^\]]+\]/g;
const PSEUDO_CLASS_RE = /:(?!:)[\w-]+(\([^)]*\))?/g;
const PSEUDO_ELEMENT_RE = /::[\w-]+/g;
const TYPE_RE = /(^|[\s>+~(])([a-zA-Z][\w-]*)/g;

/**
 * Compute the specificity tuple for a single selector (no comma lists).
 * Pseudo-elements count as type selectors; the universal selector `*` and
 * combinators contribute nothing, per spec.
 */
export function computeSpecificity(selector: string): SpecificityTuple {
	let working = selector.trim();

	const ids = (working.match(ID_RE) ?? []).length;
	working = working.replace(ID_RE, " ");

	const classes = (working.match(CLASS_RE) ?? []).length;
	const attrs = (working.match(ATTR_RE) ?? []).length;
	const pseudoClasses = (working.match(PSEUDO_CLASS_RE) ?? []).length;
	working = working
		.replace(CLASS_RE, " ")
		.replace(ATTR_RE, " ")
		.replace(PSEUDO_CLASS_RE, " ");

	const pseudoElements = (working.match(PSEUDO_ELEMENT_RE) ?? []).length;
	working = working.replace(PSEUDO_ELEMENT_RE, " ");

	const types = (working.match(TYPE_RE) ?? []).filter(
		(t) => t.trim() !== "*",
	).length;

	return [0, ids, classes + attrs + pseudoClasses, types + pseudoElements];
}

/** Collapse a tuple into a single comparable score (base-256 weighting). */
export function specificityScore(tuple: SpecificityTuple): number {
	const [a, b, c, d] = tuple;
	return a * 0x1000000 + b * 0x10000 + c * 0x100 + d;
}

/** Format a tuple for display, e.g. `(0,1,2,1)`. */
export function formatSpecificity(tuple: SpecificityTuple): string {
	return `(${tuple.join(",")})`;
}
