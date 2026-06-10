import { App, Notice, normalizePath } from "obsidian";

/**
 * Save a CSS snippet into the vault's snippets folder
 * (`<configDir>/snippets/<name>.css`) so theme/plugin authors can persist their
 * live edits as a real Obsidian snippet in one tap (Feature 13).
 *
 * This is an *explicit, non-destructive* user action — it only ever writes a
 * single named snippet file, never touches author stylesheets, and surfaces a
 * notice telling the user to enable it under Appearance → CSS snippets. It stays
 * within Obsidian's documented vault adapter (no internal APIs, Feature 19).
 */
export async function saveSnippet(app: App, name: string, css: string): Promise<string> {
	const dir = normalizePath(`${app.vault.configDir}/snippets`);
	const path = normalizePath(`${dir}/${name}.css`);
	const adapter = app.vault.adapter;

	if (!(await adapter.exists(dir))) {
		await adapter.mkdir(dir);
	}
	await adapter.write(path, css);

	new Notice(`Snippet saved: ${name}.css\nEnable it in Appearance → CSS snippets.`, 6000);
	return path;
}
