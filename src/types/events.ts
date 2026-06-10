/**
 * The plugin-wide event contract carried by {@link EventBus}.
 *
 * This single map is the canonical list of cross-module messages. Adding a new
 * inter-engine interaction means adding an entry here, which keeps the
 * communication surface discoverable and type-checked.
 */

import type { MutationEvent } from "./mutation";
import type { CssEdit } from "./css";
import type { VisualTestAction } from "./experiment";

export type AxxaEventMap = {
	/** Inspect mode toggled on/off. */
	"inspect-mode-changed": { active: boolean };
	/** Pointer hovered a new candidate element while inspecting. */
	"hover-element": { element: HTMLElement | null };
	/** Selection frozen on an element (click). */
	"selection-changed": { element: HTMLElement | null };
	/** User navigated the breadcrumb / tree to a new element. */
	"navigate-to-element": { element: HTMLElement };
	/** A live CSS edit was applied. */
	"css-edited": { element: HTMLElement; edit: CssEdit };
	/** Undo/redo history changed (drives button enabled state). */
	"history-changed": { canUndo: boolean; canRedo: boolean };
	/** A new mutation event was recorded. */
	"mutation-recorded": { event: MutationEvent };
	/** A visual test was applied or reverted. */
	"visual-test-changed": { action: VisualTestAction; active: boolean };
	/** Isolation mode entered/exited. */
	"isolation-changed": { active: boolean };
	/** Experiments list changed (added/removed/toggled). */
	"experiments-changed": Record<string, never>;
	/** A non-fatal notice the UI may surface. */
	notice: { message: string; level: "info" | "warn" | "error" };
};
