/**
 * Curated catalogue of CSS properties and their *common* values, used to drive
 * the visual style editor (Feature 3) entirely through dropdowns + swatches —
 * no free-text typing. Mobile-first: pick from a list, never type a value.
 */

/** A single editable property and the list of values offered for it. */
export interface StyleProperty {
	property: string;
	label: string;
	/** "value" → plain dropdown · "color" → colour dropdown + swatches. */
	kind: "value" | "color";
	/** Offered values. The empty string "" is rendered as the reset option. */
	values: string[];
}

export interface StyleGroup {
	label: string;
	properties: StyleProperty[];
}

/** Common length/size choices reused by several box properties. */
const SIZES = ["", "auto", "0", "2px", "4px", "8px", "12px", "16px", "24px", "32px", "48px", "25%", "50%", "75%", "100%"];

/** Common CSS colours + Obsidian theme variables, offered as a list. */
export const COMMON_COLORS: string[] = [
	"",
	"transparent",
	"currentColor",
	"black",
	"white",
	"red",
	"green",
	"blue",
	"yellow",
	"orange",
	"purple",
	"pink",
	"teal",
	"gray",
	"lightgray",
	"darkgray",
	"var(--interactive-accent)",
	"var(--background-primary)",
	"var(--background-secondary)",
	"var(--background-modifier-border)",
	"var(--text-normal)",
	"var(--text-muted)",
	"var(--text-faint)",
	"var(--text-accent)",
	"var(--text-error)",
];

/** Quick one-tap toggles available above the property list. */
export interface QuickToggle {
	id: string;
	label: string;
	icon: string;
	property: string;
	/** Value applied when toggled on; toggling off removes the inline edit. */
	value: string;
}

export const QUICK_TOGGLES: QuickToggle[] = [
	{ id: "hide", label: "Hide", icon: "eye-off", property: "display", value: "none" },
	{ id: "invisible", label: "Invisible", icon: "ghost", property: "visibility", value: "hidden" },
	{ id: "disable", label: "Disable", icon: "ban", property: "pointer-events", value: "none" },
	{ id: "outline", label: "Outline", icon: "square", property: "outline", value: "2px solid red" },
	{ id: "dim", label: "Dim", icon: "sun-dim", property: "opacity", value: "0.3" },
	{ id: "raise", label: "Raise z", icon: "layers", property: "z-index", value: "9999" },
];

export const STYLE_GROUPS: StyleGroup[] = [
	{
		label: "Layout",
		properties: [
			{ property: "display", label: "display", kind: "value", values: ["", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents", "none"] },
			{ property: "position", label: "position", kind: "value", values: ["", "static", "relative", "absolute", "fixed", "sticky"] },
			{ property: "visibility", label: "visibility", kind: "value", values: ["", "visible", "hidden", "collapse"] },
			{ property: "overflow", label: "overflow", kind: "value", values: ["", "visible", "hidden", "scroll", "auto", "clip"] },
			{ property: "z-index", label: "z-index", kind: "value", values: ["", "auto", "0", "1", "10", "100", "999", "9999"] },
			{ property: "pointer-events", label: "pointer-events", kind: "value", values: ["", "auto", "none"] },
		],
	},
	{
		label: "Box",
		properties: [
			{ property: "width", label: "width", kind: "value", values: [...SIZES, "fit-content", "max-content", "100vw"] },
			{ property: "height", label: "height", kind: "value", values: [...SIZES, "fit-content", "max-content", "100vh"] },
			{ property: "padding", label: "padding", kind: "value", values: SIZES },
			{ property: "margin", label: "margin", kind: "value", values: SIZES },
		],
	},
	{
		label: "Flex / Grid",
		properties: [
			{ property: "flex-direction", label: "flex-direction", kind: "value", values: ["", "row", "row-reverse", "column", "column-reverse"] },
			{ property: "justify-content", label: "justify-content", kind: "value", values: ["", "flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] },
			{ property: "align-items", label: "align-items", kind: "value", values: ["", "stretch", "flex-start", "center", "flex-end", "baseline"] },
			{ property: "gap", label: "gap", kind: "value", values: ["", "0", "4px", "8px", "12px", "16px", "24px", "32px"] },
		],
	},
	{
		label: "Text",
		properties: [
			{ property: "color", label: "color", kind: "color", values: COMMON_COLORS },
			{ property: "font-size", label: "font-size", kind: "value", values: ["", "10px", "12px", "14px", "16px", "18px", "20px", "24px", "32px", "1em", "1.2em", "1.5em"] },
			{ property: "font-weight", label: "font-weight", kind: "value", values: ["", "normal", "bold", "100", "300", "400", "500", "600", "700", "800", "900"] },
			{ property: "text-align", label: "text-align", kind: "value", values: ["", "left", "center", "right", "justify"] },
			{ property: "line-height", label: "line-height", kind: "value", values: ["", "1", "1.2", "1.4", "1.5", "1.6", "2", "normal"] },
		],
	},
	{
		label: "Background & effects",
		properties: [
			{ property: "background-color", label: "background-color", kind: "color", values: COMMON_COLORS },
			{ property: "opacity", label: "opacity", kind: "value", values: ["", "0", "0.1", "0.25", "0.5", "0.75", "0.9", "1"] },
			{ property: "box-shadow", label: "box-shadow", kind: "value", values: ["", "none", "0 1px 2px rgba(0,0,0,.2)", "0 2px 8px rgba(0,0,0,.3)", "0 4px 16px rgba(0,0,0,.4)", "inset 0 0 0 2px red"] },
			{ property: "transform", label: "transform", kind: "value", values: ["", "none", "scale(1.1)", "scale(0.9)", "rotate(5deg)", "translateY(-4px)", "translateX(8px)"] },
			{ property: "filter", label: "filter", kind: "value", values: ["", "none", "blur(2px)", "brightness(1.2)", "grayscale(1)", "invert(1)"] },
		],
	},
	{
		label: "Border",
		properties: [
			{ property: "border-width", label: "border-width", kind: "value", values: ["", "0", "1px", "2px", "3px", "4px", "8px"] },
			{ property: "border-style", label: "border-style", kind: "value", values: ["", "none", "solid", "dashed", "dotted", "double"] },
			{ property: "border-color", label: "border-color", kind: "color", values: COMMON_COLORS },
			{ property: "border-radius", label: "border-radius", kind: "value", values: ["", "0", "2px", "4px", "8px", "12px", "16px", "24px", "50%", "9999px"] },
		],
	},
];

/** Flat list of every property in the catalogue. */
export const ALL_PROPERTIES: string[] = STYLE_GROUPS.flatMap((g) =>
	g.properties.map((p) => p.property),
);

/** The lean default set shown in the compact floating editor. */
export const ESSENTIAL_PROPERTIES: string[] = [
	"display",
	"visibility",
	"position",
	"z-index",
	"opacity",
	"color",
	"background-color",
	"width",
	"height",
	"padding",
	"margin",
];

/** Look up a single property descriptor by name. */
export function findProperty(property: string): StyleProperty | undefined {
	for (const g of STYLE_GROUPS) {
		const hit = g.properties.find((p) => p.property === property);
		if (hit) return hit;
	}
	return undefined;
}
