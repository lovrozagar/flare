import { getDirectionScript, type DirectionConfig } from "../direction/index.tsx";
import { getLocaleScript, type LocaleConfig } from "../locale/index.tsx";
import type { ModulePreloads } from "../module-graph/index.ts";
import type { HeadConfig } from "../route-builder/types.ts";
import { getThemeScript, type ThemeConfig } from "../theme/index.tsx";

function escapeAttr(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colorSchemeCss(attribute: string): string {
	const attr = attribute.replace(/[^\w-]/g, "") || "data-theme";
	return `html{color-scheme:light}html[${attr}=dark]{color-scheme:dark}`;
}

export interface HeadPrefixOptions {
	direction?: DirectionConfig;
	locale?: LocaleConfig;
	modulePreloads?: ModulePreloads;
	nonce: string;
	resolvedHead: HeadConfig;
	theme?: ThemeConfig;
}

/**
 * Blocking head prefix. Order is first-paint critical:
 *   1. CSP nonce meta
 *   2. viewport (if the app did not set one)
 *   3. theme / direction / locale inline scripts — before any CSS or modulepreload
 *   4. modulepreload + stylesheets
 *
 * Theme must run before stylesheets or first paint is unthemed until refresh
 * (CSS cache + later ThemeProvider). Modulepreloads stay after the scripts so
 * Chrome can still mark them isLinkPreload when CSP has no 'strict-dynamic'.
 */
export function buildHeadPrefix(options: HeadPrefixOptions): string {
	const escapedNonce = escapeAttr(options.nonce);
	let prefix = `<meta name="csp-nonce" nonce="${escapedNonce}">`;
	if (options.resolvedHead.meta?.viewport === undefined) {
		prefix += `<meta name="viewport" content="width=device-width, initial-scale=1">`;
	}

	const nonceAttr = ` nonce="${escapedNonce}"`;
	const themeAttr = options.theme?.attribute ?? "data-theme";
	prefix += `<script${nonceAttr}>${getThemeScript(options.theme)}</script>`;
	prefix += `<style${nonceAttr}>${colorSchemeCss(themeAttr)}</style>`;

	if (options.direction) {
		prefix += `<script${nonceAttr}>${getDirectionScript(options.direction)}</script>`;
	}
	if (options.locale) {
		prefix += `<script${nonceAttr}>${getLocaleScript(options.locale)}</script>`;
	}

	if (options.modulePreloads) {
		for (const href of options.modulePreloads.js) {
			prefix += `<link rel="modulepreload" href="${escapeAttr(href)}"/>`;
		}
		for (const href of options.modulePreloads.css) {
			prefix += `<link rel="stylesheet" href="${escapeAttr(href)}"/>`;
		}
	}

	return prefix;
}
