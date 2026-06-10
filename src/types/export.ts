/**
 * Export System data models (Feature 13).
 */

/** Supported export targets. */
export type ExportFormat = "json" | "css" | "markdown" | "typescript" | "csv";

/** The kinds of payload the Export Engine can serialise. */
export type ExportSubject =
	| "element-css"
	| "dom-tree"
	| "mutation-log"
	| "variables"
	| "stylesheet-analysis"
	| "experiments";

/** Result of an export operation. */
export interface ExportResult {
	format: ExportFormat;
	subject: ExportSubject;
	/** Suggested filename including extension. */
	filename: string;
	/** Serialised text content, ready for clipboard or file write. */
	content: string;
	/** MIME type for clipboard/file APIs. */
	mimeType: string;
}
