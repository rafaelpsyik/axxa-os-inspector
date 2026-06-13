/** Minimal Obsidian API stubs so engine units can be imported under Node. */
export class Notice {
	constructor(public message: string) {}
}
export const Platform = { isMobile: false, isDesktopApp: true };
export class Plugin {}
export class ItemView {}
export class PluginSettingTab {}
export class Setting {}
export class WorkspaceLeaf {}
export const setIcon = (): void => {};
