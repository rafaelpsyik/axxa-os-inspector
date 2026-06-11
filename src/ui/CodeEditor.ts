/**
 * A lightweight, dependency-free code editor (Feature 12).
 *
 * Deliberately *not* a full CodeMirror instance — that keeps the bundle small
 * and works identically on desktop and mobile. It is a styled `<textarea>` with
 * a synced line-number gutter, tab-to-indent, and a paste-friendly API. Good
 * enough for editing a CSS snippet live from the floating controls.
 */
export interface CodeEditorOptions {
	value?: string;
	placeholder?: string;
	onInput?: (value: string) => void;
}

export interface CodeEditorHandle {
	getValue(): string;
	setValue(value: string): void;
	focus(): void;
}

export function attachCodeEditor(parent: HTMLElement, opts: CodeEditorOptions): CodeEditorHandle {
	const wrap = parent.createDiv({ cls: "axxa-code" });
	const gutter = wrap.createDiv({ cls: "axxa-code-gutter" });
	const area = wrap.createEl("textarea", { cls: "axxa-code-area" });
	area.value = opts.value ?? "";
	area.placeholder = opts.placeholder ?? "";
	area.spellcheck = false;
	area.setAttr("autocapitalize", "off");
	area.setAttr("autocorrect", "off");
	area.setAttr("autocomplete", "off");
	area.setAttr("aria-label", "CSS snippet editor");

	const syncGutter = () => {
		const lines = area.value.split("\n").length || 1;
		gutter.empty();
		for (let i = 1; i <= lines; i++) gutter.createDiv({ text: String(i) });
		gutter.scrollTop = area.scrollTop;
	};

	area.addEventListener("input", () => {
		syncGutter();
		opts.onInput?.(area.value);
	});
	area.addEventListener("scroll", () => {
		gutter.scrollTop = area.scrollTop;
	});

	// Tab inserts an indent instead of moving focus out of the editor.
	area.addEventListener("keydown", (e: KeyboardEvent) => {
		if (e.key !== "Tab") return;
		e.preventDefault();
		const start = area.selectionStart;
		const end = area.selectionEnd;
		const indent = "\t";
		area.value = area.value.slice(0, start) + indent + area.value.slice(end);
		area.selectionStart = area.selectionEnd = start + indent.length;
		syncGutter();
		opts.onInput?.(area.value);
	});

	syncGutter();

	return {
		getValue: () => area.value,
		setValue: (value: string) => {
			area.value = value;
			syncGutter();
		},
		focus: () => area.focus(),
	};
}
