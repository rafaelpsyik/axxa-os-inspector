import type { IDisposable } from "../core/Disposable";
import type { ExportFormat, ExportResult, ExportSubject } from "../types/export";
import type { DomTreeNode, NodeDescriptor } from "../types/dom";
import type { MatchedRule, CssVariable, StylesheetInfo } from "../types/css";
import type { MutationEvent } from "../types/mutation";
import type { CssExperiment } from "../types/experiment";

const MIME: Record<ExportFormat, string> = {
	json: "application/json",
	css: "text/css",
	markdown: "text/markdown",
	typescript: "text/x-typescript",
	csv: "text/csv",
};

/**
 * Export Engine (Feature 13).
 *
 * Serialises inspector artefacts into JSON / CSS / Markdown / TypeScript / CSV.
 * Pure functions only — given the same input it always yields the same text,
 * which makes the matrix of (subject × format) trivially unit-testable. The
 * caller is responsible for clipboard/file delivery (see ExportActions in UI).
 */
export class ExportEngine implements IDisposable {
	// ── Element CSS ────────────────────────────────────────────────────────────

	exportElementCss(
		descriptor: NodeDescriptor,
		rules: MatchedRule[],
		format: ExportFormat,
	): ExportResult {
		let content: string;
		switch (format) {
			case "css":
				content = rules
					.map(
						(r) =>
							`${r.selector} { /* ${r.sourceName} (${r.origin}) spec=${r.specificity.join(",")} */\n` +
							r.declarations
								.map((d) => `  ${d.property}: ${d.value}${d.important ? " !important" : ""};${d.overridden ? " /* overridden */" : ""}`)
								.join("\n") +
							"\n}",
					)
					.join("\n\n");
				break;
			case "json":
				content = json({ element: descriptor, rules });
				break;
			case "markdown":
				content =
					`# CSS for \`${descriptor.selector}\`\n\n` +
					rules
						.map(
							(r) =>
								`## \`${r.selector}\`\n- Origin: **${r.origin}** (${r.sourceName})\n- Specificity: \`${r.specificity.join(",")}\`\n\n\`\`\`css\n` +
								r.declarations.map((d) => `${d.property}: ${d.value};`).join("\n") +
								"\n```",
						)
						.join("\n\n");
				break;
			case "typescript":
				content = this.toTsInterface("ElementStyle", flattenDeclarations(rules));
				break;
			case "csv":
				content = toCsv(
					["selector", "origin", "source", "specificity", "property", "value", "overridden"],
					rules.flatMap((r) =>
						r.declarations.map((d) => [
							r.selector,
							r.origin,
							r.sourceName,
							r.specificity.join("|"),
							d.property,
							d.value,
							String(d.overridden),
						]),
					),
				);
				break;
		}
		return this.result(format, "element-css", `element-css`, content);
	}

	// ── DOM tree ────────────────────────────────────────────────────────────────

	exportDomTree(tree: DomTreeNode, format: ExportFormat): ExportResult {
		let content: string;
		switch (format) {
			case "json":
				content = json(tree);
				break;
			case "markdown":
				content = domTreeToMarkdown(tree);
				break;
			case "csv":
				content = toCsv(
					["depth", "selector", "tag", "classes", "visible", "childCount"],
					flattenTree(tree).map((n) => [
						String(n.depth),
						n.selector,
						n.tag,
						n.classes.join(" "),
						String(n.visible),
						String(n.childCount),
					]),
				);
				break;
			case "typescript":
				content = `// DOM tree snapshot\nexport const domTree = ${json(tree)} as const;`;
				break;
			case "css":
				content = flattenTree(tree)
					.map((n) => `${n.selector} {}`)
					.join("\n");
				break;
		}
		return this.result(format, "dom-tree", "dom-tree", content);
	}

	// ── Mutation log ──────────────────────────────────────────────────────────

	exportMutations(events: readonly MutationEvent[], format: ExportFormat): ExportResult {
		let content: string;
		switch (format) {
			case "json":
				content = json(events);
				break;
			case "csv":
				content = toCsv(
					["timestamp", "kind", "target", "summary", "previous", "new"],
					events.map((e) => [
						new Date(e.timestamp).toISOString(),
						e.kind,
						e.targetSelector,
						e.summary,
						e.previousValue ?? "",
						e.newValue ?? "",
					]),
				);
				break;
			case "markdown":
				content =
					"| Time | Kind | Target | Summary |\n|---|---|---|---|\n" +
					events
						.map(
							(e) =>
								`| ${new Date(e.timestamp).toLocaleTimeString()} | ${e.kind} | \`${e.targetSelector}\` | ${e.summary} |`,
						)
						.join("\n");
				break;
			case "typescript":
				content = `export const mutations = ${json(events)} as const;`;
				break;
			case "css":
				content = "/* mutation logs cannot be represented as CSS */";
				break;
		}
		return this.result(format, "mutation-log", "mutations", content);
	}

	// ── Variables ─────────────────────────────────────────────────────────────

	exportVariables(vars: CssVariable[], format: ExportFormat): ExportResult {
		let content: string;
		switch (format) {
			case "css":
				content = ":root {\n" + vars.map((v) => `  ${v.name}: ${v.value};`).join("\n") + "\n}";
				break;
			case "json":
				content = json(vars);
				break;
			case "csv":
				content = toCsv(
					["name", "value", "computed", "origin", "source", "usage"],
					vars.map((v) => [v.name, v.value, v.computedValue, v.origin, v.sourceName, String(v.usageCount)]),
				);
				break;
			case "markdown":
				content =
					"| Variable | Value | Origin | Usage |\n|---|---|---|---|\n" +
					vars.map((v) => `| \`${v.name}\` | \`${v.value}\` | ${v.origin} | ${v.usageCount} |`).join("\n");
				break;
			case "typescript":
				content =
					"export const cssVariables = {\n" +
					vars.map((v) => `  ${JSON.stringify(v.name)}: ${JSON.stringify(v.value)},`).join("\n") +
					"\n} as const;";
				break;
		}
		return this.result(format, "variables", "variables", content);
	}

	// ── Stylesheets ─────────────────────────────────────────────────────────────

	exportStylesheets(sheets: StylesheetInfo[], format: ExportFormat): ExportResult {
		const content =
			format === "csv"
				? toCsv(
						["source", "origin", "rules", "selectors", "unused", "disabled"],
						sheets.map((s) => [
							s.sourceName,
							s.origin,
							String(s.ruleCount),
							String(s.selectorCount),
							String(s.unusedSelectors.length),
							String(s.disabled),
						]),
					)
				: json(sheets);
		return this.result(format === "csv" ? "csv" : "json", "stylesheet-analysis", "stylesheets", content);
	}

	// ── Experiments ─────────────────────────────────────────────────────────────

	exportExperiments(experiments: CssExperiment[], format: ExportFormat): ExportResult {
		const content =
			format === "css"
				? experiments
						.filter((e) => e.enabled)
						.map((e) => `/* === ${e.name} === */\n${e.css}`)
						.join("\n\n")
				: json(experiments);
		return this.result(format === "css" ? "css" : "json", "experiments", "experiments", content);
	}

	// ── helpers ─────────────────────────────────────────────────────────────────

	private toTsInterface(name: string, props: Record<string, string>): string {
		const body = Object.entries(props)
			.map(([k, v]) => `  ${JSON.stringify(toCamel(k))}: string; // ${v}`)
			.join("\n");
		return `export interface ${name} {\n${body}\n}`;
	}

	private result(
		format: ExportFormat,
		subject: ExportSubject,
		base: string,
		content: string,
	): ExportResult {
		const ext = format === "typescript" ? "ts" : format;
		return {
			format,
			subject,
			filename: `axxa-${base}-${Date.now()}.${ext}`,
			content,
			mimeType: MIME[format],
		};
	}

	dispose(): void {
		/* stateless */
	}
}

// ── module-private serialisation helpers ─────────────────────────────────────

function json(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function toCsv(headers: string[], rows: string[][]): string {
	const escape = (cell: string) =>
		/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
	return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

function flattenTree(node: DomTreeNode): DomTreeNode[] {
	return [node, ...node.children.flatMap(flattenTree)];
}

function domTreeToMarkdown(node: DomTreeNode): string {
	const label = node.semanticLabel ? `**${node.semanticLabel}** \`${node.selector}\`` : `\`${node.selector}\``;
	const line = `${"  ".repeat(node.depth)}- ${label}`;
	return [line, ...node.children.map(domTreeToMarkdown)].join("\n");
}

function flattenDeclarations(rules: MatchedRule[]): Record<string, string> {
	const out: Record<string, string> = {};
	// Highest-priority rule wins (rules are pre-sorted by the CSS engine).
	for (let i = rules.length - 1; i >= 0; i--) {
		for (const d of rules[i].declarations) out[d.property] = d.value;
	}
	return out;
}

function toCamel(prop: string): string {
	return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
