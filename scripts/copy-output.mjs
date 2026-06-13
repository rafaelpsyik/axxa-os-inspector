import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

/**
 * Copies the three install artefacts (manifest.json, main.js, styles.css) into
 * output/axxa-inspector/ — the ready-to-drop-in plugin folder.
 *
 * Run after a production build (see the `package` npm script). Fails loudly if
 * main.js is missing so a commit can never ship a stale/empty bundle.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = resolve(root, "output/axxa-inspector");
const files = ["manifest.json", "main.js", "styles.css"];

mkdirSync(dest, { recursive: true });

for (const file of files) {
	const from = resolve(root, file);
	if (!existsSync(from)) {
		console.error(`[package] missing build artefact: ${file} — run "npm run build" first.`);
		process.exit(1);
	}
	copyFileSync(from, resolve(dest, file));
	console.log(`[package] output/axxa-inspector/${file}`);
}
console.log("[package] install bundle is up to date.");
