import { Notice } from "obsidian";

/**
 * Copy text to the clipboard with graceful fallback and a user-facing notice.
 * Used by every "Copy …" action (Feature 15) and the export system (Feature 13).
 */
export async function copyToClipboard(text: string, label = "Copied"): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		new Notice(`${label} to clipboard`);
	} catch {
		// Fallback for environments without the async clipboard API (older mobile).
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.select();
		try {
			document.execCommand("copy");
			new Notice(`${label} to clipboard`);
		} catch {
			new Notice("Copy failed — clipboard unavailable");
		} finally {
			ta.remove();
		}
	}
}
