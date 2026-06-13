/**
 * Render a long list incrementally so mobile never pays to build thousands of
 * DOM nodes at once (performance mandate, Feature 16). Shows `pageSize` rows and
 * a "Load more" button that reveals the next page on demand.
 */
export interface CappedListOptions<T> {
	items: T[];
	renderItem: (item: T, parent: HTMLElement, index: number) => void;
	pageSize?: number;
	/** Optional empty-state text. */
	emptyText?: string;
}

export function renderCappedList<T>(parent: HTMLElement, opts: CappedListOptions<T>): void {
	const { items, renderItem, pageSize = 30, emptyText = "Nothing to show." } = opts;
	parent.empty();

	if (items.length === 0) {
		parent.createDiv({ cls: "axxa-muted axxa-empty-row", text: emptyText });
		return;
	}

	const listEl = parent.createDiv({ cls: "axxa-list" });
	let shown = 0;

	const renderPage = () => {
		const next = Math.min(shown + pageSize, items.length);
		for (let i = shown; i < next; i++) renderItem(items[i], listEl, i);
		shown = next;
		footer.setText(`${shown} / ${items.length}`);
		moreBtn.toggleClass("is-hidden", shown >= items.length);
	};

	const bar = parent.createDiv({ cls: "axxa-list-bar" });
	const moreBtn = bar.createEl("button", { cls: "axxa-btn axxa-load-more", text: `Load more (+${pageSize})` });
	const footer = bar.createSpan({ cls: "axxa-muted" });
	moreBtn.onclick = () => renderPage();

	renderPage();
}
