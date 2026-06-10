import { setIcon } from "obsidian";
import { DisposableGroup, type IDisposable } from "../core/Disposable";
import type { ServiceContainer } from "../core/ServiceContainer";

/**
 * On-screen debug log (mobile-first diagnostics).
 *
 * Mobile Obsidian has no easy DevTools, so this floating, scrollable console
 * mirrors plugin events, selections, edits and uncaught errors right on the
 * screen. It is opt-in (toggled by command), capped to a small ring buffer, and
 * fully torn down on dispose.
 */
export class DebugLog implements IDisposable {
	private readonly group = new DisposableGroup();
	private root: HTMLElement;
	private listEl!: HTMLElement;
	private readonly lines: { t: number; level: string; msg: string }[] = [];
	private readonly max = 60;
	private visible = false;

	constructor(private readonly container: ServiceContainer) {
		this.root = document.body.createDiv({ cls: "axxa-debuglog axxa-floating" });
		this.group.register(() => this.root.remove());
		this.buildChrome();
		this.subscribe();
		this.hide();
	}

	toggle(): void {
		this.visible ? this.hide() : this.show();
	}
	show(): void {
		this.visible = true;
		this.root.style.display = "flex";
		this.render();
	}
	hide(): void {
		this.visible = false;
		this.root.style.display = "none";
	}

	private buildChrome(): void {
		const head = this.root.createDiv({ cls: "axxa-floating-handle" });
		head.createSpan({ text: "AXXA · Debug log" });
		const actions = head.createDiv({ cls: "axxa-debuglog-actions" });
		const clear = actions.createEl("button", { cls: "axxa-floating-x" });
		setIcon(clear, "trash-2");
		clear.setAttr("aria-label", "Clear log");
		clear.onclick = () => {
			this.lines.length = 0;
			this.render();
		};
		const close = actions.createEl("button", { cls: "axxa-floating-x" });
		setIcon(close, "x");
		close.setAttr("aria-label", "Hide log");
		close.onclick = () => this.hide();
		this.listEl = this.root.createDiv({ cls: "axxa-debuglog-list" });
	}

	private subscribe(): void {
		const { bus } = this.container;
		this.group.register(bus.on("inspect-mode-changed", (p) => this.push("inspect", `inspect ${p.active ? "ON" : "off"}`)));
		this.group.register(bus.on("selection-changed", (p) => this.push("select", p.element ? `selected ${p.element.tagName.toLowerCase()}` : "cleared")));
		this.group.register(bus.on("css-edited", (p) => this.push("edit", `${p.edit.property} = ${p.edit.newValue || "(reset)"}`)));
		this.group.register(bus.on("changes-updated", (p) => this.push("changes", `${p.count} element(s) edited`)));
		this.group.register(bus.on("visual-test-changed", (p) => this.push("visual", `${p.action} ${p.active ? "on" : "off"}`)));
		this.group.register(bus.on("isolation-changed", (p) => this.push("isolate", p.active ? "isolated" : "exited")));
		this.group.register(bus.on("notice", (p) => this.push(p.level, p.message)));

		const onError = (e: ErrorEvent) => this.push("error", e.message);
		const onRejection = (e: PromiseRejectionEvent) => this.push("error", String(e.reason));
		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onRejection);
		this.group.register(() => {
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onRejection);
		});
	}

	private push(level: string, msg: string): void {
		this.lines.push({ t: Date.now(), level, msg });
		if (this.lines.length > this.max) this.lines.shift();
		if (this.visible) this.render();
	}

	private render(): void {
		this.listEl.empty();
		for (const line of this.lines.slice().reverse()) {
			const row = this.listEl.createDiv({ cls: `axxa-debug-line axxa-debug-${line.level}` });
			row.createSpan({ cls: "axxa-debug-time", text: new Date(line.t).toLocaleTimeString().slice(0, 8) });
			row.createSpan({ cls: "axxa-debug-level", text: line.level });
			row.createSpan({ cls: "axxa-debug-msg", text: line.msg });
		}
		if (!this.lines.length) {
			this.listEl.createDiv({ cls: "axxa-muted", text: "No events yet." });
		}
	}

	dispose(): void {
		this.group.dispose();
	}
}
