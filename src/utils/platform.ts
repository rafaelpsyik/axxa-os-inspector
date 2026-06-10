import { Platform } from "obsidian";

/**
 * Mobile / platform detection helpers (Feature 18).
 *
 * Centralising these means feature gates read clearly (`if (canUseDevtools())`)
 * and the desktop-only paths degrade gracefully on phones/tablets.
 */
export const isMobile = (): boolean => Platform.isMobile;
export const isDesktop = (): boolean => Platform.isDesktopApp;

/** Pointer-coarse devices need larger hit targets and tap-based inspection. */
export const isTouchPrimary = (): boolean =>
	Platform.isMobile || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches);
