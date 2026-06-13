import { describe, it, expect } from "vitest";
import { ExportEngine } from "../src/engines/ExportEngine";
import type { CssVariable, MatchedRule } from "../src/types/css";
import type { MutationEvent } from "../src/types/mutation";

const engine = new ExportEngine();

const vars: CssVariable[] = [
	{ name: "--background-primary", value: "#fff", computedValue: "#fff", origin: "theme", sourceName: "theme.css", usageCount: 12 },
	{ name: "--text-normal", value: "#222", computedValue: "#222", origin: "theme", sourceName: "theme.css", usageCount: 30 },
];

describe("ExportEngine variables", () => {
	it("emits valid :root CSS", () => {
		const out = engine.exportVariables(vars, "css");
		expect(out.content).toContain(":root {");
		expect(out.content).toContain("--background-primary: #fff;");
		expect(out.mimeType).toBe("text/css");
	});

	it("emits a typed const for TypeScript", () => {
		const out = engine.exportVariables(vars, "typescript");
		expect(out.content).toContain("export const cssVariables");
		expect(out.filename.endsWith(".ts")).toBe(true);
	});

	it("escapes CSV cells containing commas", () => {
		const tricky: CssVariable[] = [
			{ name: "--shadow", value: "0 1px 2px, 0 2px 4px", computedValue: "x", origin: "snippet", sourceName: "s", usageCount: 1 },
		];
		const out = engine.exportVariables(tricky, "csv");
		expect(out.content).toContain('"0 1px 2px, 0 2px 4px"');
	});
});

describe("ExportEngine mutations", () => {
	it("renders a markdown table", () => {
		const events: MutationEvent[] = [
			{ id: "1", kind: "element-added", timestamp: 0, targetSelector: "div", summary: "Added <div>" },
		];
		const out = engine.exportMutations(events, "markdown");
		expect(out.content).toContain("| Time | Kind | Target | Summary |");
		expect(out.content).toContain("element-added");
	});
});

describe("ExportEngine element css", () => {
	it("includes specificity + origin comments in CSS output", () => {
		const rules: MatchedRule[] = [
			{
				selector: ".status-bar",
				origin: "theme",
				sourceName: "Minimal.css",
				specificity: [0, 0, 1, 0],
				specificityScore: 256,
				order: 0,
				declarations: [{ property: "color", value: "red", important: false, overridden: false }],
			},
		];
		const out = engine.exportElementCss(
			{ tag: "div", id: null, classes: [], dataset: {}, selector: ".status-bar", childCount: 0, visible: true, rect: {} as never, semanticLabel: "Status Bar", textPreview: "" },
			rules,
			"css",
		);
		expect(out.content).toContain(".status-bar {");
		expect(out.content).toContain("Minimal.css (theme)");
		expect(out.content).toContain("color: red;");
	});
});
