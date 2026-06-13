/**
 * DOM-level data models.
 *
 * These are plain, serialisable snapshots — never live `Element` references in
 * persisted data — so they can be exported to JSON/CSV and survive a session
 * restart. Live elements are tracked separately via WeakRef inside the engines.
 */

/** A stable, human-friendly description of a single DOM node. */
export interface NodeDescriptor {
	/** Lowercased tag name, e.g. `div`. */
	tag: string;
	/** Element id attribute, if any. */
	id: string | null;
	/** Ordered list of class names. */
	classes: string[];
	/** Selected `data-*` attributes (key without the `data-` prefix). */
	dataset: Record<string, string>;
	/** Generated unique CSS selector that round-trips back to this element. */
	selector: string;
	/** Number of element children. */
	childCount: number;
	/** Whether the element is currently rendered (offsetParent / display). */
	visible: boolean;
	/** Current bounding box at snapshot time. */
	rect: BoxRect;
	/** Semantic Obsidian label when recognised (see ObsidianTopology). */
	semanticLabel: string | null;
	/** Trimmed text content preview (first ~60 chars). */
	textPreview: string;
}

/** A serialisable DOMRect. */
export interface BoxRect {
	x: number;
	y: number;
	width: number;
	height: number;
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** The four-sided box-model spacing used by overlays. */
export interface BoxSpacing {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** Full box-model metrics for the overlay (Feature 1) and layout tools. */
export interface BoxModel {
	content: BoxRect;
	padding: BoxSpacing;
	border: BoxSpacing;
	margin: BoxSpacing;
	zIndex: string;
}

/** A node within an exportable DOM tree (Feature 6 & 13). */
export interface DomTreeNode extends NodeDescriptor {
	children: DomTreeNode[];
	depth: number;
}

/** A breadcrumb entry (Feature 1 navigation). */
export interface BreadcrumbEntry {
	selector: string;
	label: string;
	semanticLabel: string | null;
}
