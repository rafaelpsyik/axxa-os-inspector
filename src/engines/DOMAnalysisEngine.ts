import type { IDisposable } from "../core/Disposable";
import type { ObsidianTopology } from "../intelligence/ObsidianTopology";
import { buildUniqueSelector } from "../utils/selector";
import { toBoxRect, isVisible } from "../utils/dom";
import type { NodeDescriptor, DomTreeNode, BreadcrumbEntry } from "../types/dom";

/** Criteria accepted by {@link DOMAnalysisEngine.search} (Feature 6). */
export interface DomSearchQuery {
	tag?: string;
	className?: string;
	id?: string;
	text?: string;
	dataAttribute?: string;
}

/**
 * DOM Analysis Engine — turns live elements into the serialisable descriptors
 * and trees the UI renders (Feature 6) and exports (Feature 13).
 *
 * It is deliberately stateless: every method takes an element and returns a
 * fresh snapshot, which keeps it pure and easy to test. Bounded traversal
 * (`maxNodes`, `maxDepth`) protects against pathological DOM sizes (Feature 16).
 */
export class DOMAnalysisEngine implements IDisposable {
	constructor(private readonly topology: ObsidianTopology) {}

	/** Build a flat descriptor for a single element. */
	describe(el: HTMLElement): NodeDescriptor {
		return {
			tag: el.tagName.toLowerCase(),
			id: el.id || null,
			classes: Array.from(el.classList),
			dataset: { ...el.dataset } as Record<string, string>,
			selector: buildUniqueSelector(el),
			childCount: el.childElementCount,
			visible: isVisible(el),
			rect: toBoxRect(el.getBoundingClientRect()),
			semanticLabel: this.topology.labelFor(el),
			textPreview: (el.textContent ?? "").trim().slice(0, 60),
		};
	}

	/**
	 * Build a bounded tree rooted at `el`. Depth-first, capped so even the full
	 * `document.body` of a heavy vault stays responsive.
	 */
	buildTree(el: HTMLElement, maxDepth = 12, maxNodes = 2000): DomTreeNode {
		let budget = maxNodes;
		const walk = (node: HTMLElement, depth: number): DomTreeNode => {
			const descriptor = this.describe(node);
			const treeNode: DomTreeNode = { ...descriptor, depth, children: [] };
			if (depth >= maxDepth || budget <= 0) return treeNode;
			for (const child of Array.from(node.children)) {
				if (budget <= 0) break;
				budget--;
				treeNode.children.push(walk(child as HTMLElement, depth + 1));
			}
			return treeNode;
		};
		return walk(el, 0);
	}

	/** Build the ancestor breadcrumb path for an element (Feature 1). */
	breadcrumb(el: HTMLElement): BreadcrumbEntry[] {
		const chain: BreadcrumbEntry[] = [];
		let current: HTMLElement | null = el;
		while (current && current.nodeType === Node.ELEMENT_NODE) {
			const semantic = this.topology.labelFor(current);
			chain.unshift({
				selector: buildUniqueSelector(current),
				label: this.shortLabel(current),
				semanticLabel: semantic,
			});
			current = current.parentElement;
		}
		return chain;
	}

	/** Direct element children as descriptors (tree navigation, Feature 1). */
	childrenOf(el: HTMLElement): NodeDescriptor[] {
		return Array.from(el.children).map((c) => this.describe(c as HTMLElement));
	}

	/**
	 * Search the DOM for elements matching the query (Feature 6). Results are
	 * capped to keep the UI snappy; callers can refine the query for more.
	 */
	search(query: DomSearchQuery, root: HTMLElement = document.body, limit = 200): HTMLElement[] {
		const selectorParts: string[] = [];
		if (query.tag) selectorParts.push(query.tag);
		if (query.id) selectorParts.push(`#${CSS.escape(query.id)}`);
		if (query.className) selectorParts.push(`.${CSS.escape(query.className)}`);
		if (query.dataAttribute) selectorParts.push(`[data-${CSS.escape(query.dataAttribute)}]`);
		const selector = selectorParts.join("") || "*";

		const results: HTMLElement[] = [];
		let candidates: HTMLElement[];
		try {
			candidates = Array.from(root.querySelectorAll<HTMLElement>(selector));
		} catch {
			return [];
		}
		for (const el of candidates) {
			if (query.text) {
				const text = (el.textContent ?? "").toLowerCase();
				if (!text.includes(query.text.toLowerCase())) continue;
			}
			results.push(el);
			if (results.length >= limit) break;
		}
		return results;
	}

	private shortLabel(el: HTMLElement): string {
		if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
		const cls = Array.from(el.classList).slice(0, 1)[0];
		return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
	}

	dispose(): void {
		/* stateless — nothing to release */
	}
}
