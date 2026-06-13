/**
 * Mutation-tracking data models (Feature 7).
 */

export type MutationKind =
	| "element-added"
	| "element-removed"
	| "class-modified"
	| "attribute-changed"
	| "style-changed";

/** A single timeline event produced by the Mutation Tracking Engine. */
export interface MutationEvent {
	id: string;
	kind: MutationKind;
	timestamp: number;
	/** Selector of the affected element (best-effort, may be stale). */
	targetSelector: string;
	/** Short human description for the timeline row. */
	summary: string;
	/** Old/new values for attribute, class and style changes. */
	previousValue?: string;
	newValue?: string;
}

/** A recorded mutation session (Feature 7 + export). */
export interface MutationRecording {
	id: string;
	name: string;
	startedAt: number;
	endedAt: number | null;
	events: MutationEvent[];
}
