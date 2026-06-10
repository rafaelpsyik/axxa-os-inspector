/**
 * Selector / path generators (Features 1, 6, 15).
 *
 * Produces a *unique, re-resolvable* CSS selector for any element, plus an
 * XPath and a readable DOM path. The CSS generator walks up the tree only as
 * far as needed to disambiguate, preferring ids, then stable class
 * combinations, then `:nth-of-type` as a last resort.
 */

/** Build a unique CSS selector that resolves back to exactly `el`. */
export function buildUniqueSelector(el: Element): string {
	if (el.id && document.querySelectorAll(cssEscapeId(el.id)).length === 1) {
		return cssEscapeId(el.id);
	}

	const parts: string[] = [];
	let current: Element | null = el;

	while (current && current.nodeType === Node.ELEMENT_NODE) {
		let part = current.tagName.toLowerCase();

		if (current.id) {
			part = cssEscapeId(current.id);
			parts.unshift(part);
			break; // an id is unique enough to anchor the selector
		}

		const stableClasses = Array.from(current.classList)
			.filter((c) => !isVolatileClass(c))
			.slice(0, 3)
			.map((c) => `.${CSS.escape(c)}`)
			.join("");
		part += stableClasses;

		// Disambiguate among siblings with the same tag+classes.
		const parentEl: Element | null = current.parentElement;
		if (parentEl) {
			const sameTag = Array.from(parentEl.children).filter(
				(c: Element) => c.tagName === current!.tagName,
			);
			if (sameTag.length > 1) {
				const index = sameTag.indexOf(current) + 1;
				part += `:nth-of-type(${index})`;
			}
		}

		parts.unshift(part);

		// Stop early once the partial selector is already unique.
		const candidate = parts.join(" > ");
		try {
			if (document.querySelectorAll(candidate).length === 1) break;
		} catch {
			/* invalid intermediate selector — keep climbing */
		}
		current = parentEl;
	}

	return parts.join(" > ");
}

/** Build an absolute XPath for an element (Feature 15: Copy XPath). */
export function buildXPath(el: Element): string {
	const segments: string[] = [];
	let current: Element | null = el;
	while (current && current.nodeType === Node.ELEMENT_NODE) {
		let index = 1;
		let sibling = current.previousElementSibling;
		while (sibling) {
			if (sibling.tagName === current.tagName) index++;
			sibling = sibling.previousElementSibling;
		}
		const tag = current.tagName.toLowerCase();
		segments.unshift(`${tag}[${index}]`);
		current = current.parentElement;
	}
	return "/" + segments.join("/");
}

/** Build a readable DOM path, e.g. `body › div.workspace › div.status-bar`. */
export function buildDomPath(el: Element): string {
	const parts: string[] = [];
	let current: Element | null = el;
	while (current && current.nodeType === Node.ELEMENT_NODE) {
		let label = current.tagName.toLowerCase();
		if (current.id) label += `#${current.id}`;
		else if (current.classList.length) {
			label += `.${Array.from(current.classList).slice(0, 2).join(".")}`;
		}
		parts.unshift(label);
		current = current.parentElement;
	}
	return parts.join(" › ");
}

/** Classes that change frequently and would make selectors brittle. */
const VOLATILE_CLASS_PATTERNS = [
	/^is-/,
	/^mod-active$/,
	/^has-focus$/,
	/^is-hover$/,
	/hover/,
	/active/,
	/selected/,
];

function isVolatileClass(cls: string): boolean {
	return VOLATILE_CLASS_PATTERNS.some((re) => re.test(cls));
}

function cssEscapeId(id: string): string {
	return `#${CSS.escape(id)}`;
}
