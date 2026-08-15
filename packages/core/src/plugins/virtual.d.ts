// oxlint-disable-next-line typescript-eslint/triple-slash-reference
/// <reference path="solid-jsx.d.ts" />
// oxlint-disable-next-line typescript-eslint/triple-slash-reference
/// <reference path="sx.d.ts" />

interface ImportMeta {
	readonly env: {
		readonly DEV: boolean;
		readonly PROD: boolean;
		readonly MODE: string;
		readonly BASE_URL: string;
		readonly SSR: boolean;
		[key: string]: unknown;
	};
}

declare module "virtual:flare-server-fn-map" {
	import type { ServerFnRegistration } from "@lovrozagar/flare/server";
	const map: Map<string, ServerFnRegistration>;
	export default map;
}

declare module "virtual:flare-is-dev" {
	const isDev: boolean;
	export default isDev;
}

declare module "virtual:flare-log-level" {
	const level: "error" | "silent" | "verbose" | "warn";
	export default level;
}

declare module "virtual:flare-config" {
	const config: Record<string, unknown>;
	export default config;
}

declare module "virtual:flare-client-entry" {
	const entry: string;
	export default entry;
}

declare module "virtual:flare-generated" {
	export const layoutModuleIds: Record<string, string>;
	export const routeTree: unknown;
	export const layouts: unknown;
}

declare module "virtual:flare-module-preloads" {
	export const clientManifest: Record<string, unknown> | null;
	export const entryPreloads: { css: string[]; js: string[] };
}

declare module "virtual:flare-sx-manifest" {
	import type { SxCssManifest } from "../ssr/critical-css";
	export const sxManifest: SxCssManifest | null;
}

declare module "virtual:flare-sx-dev-css" {
	/** Returns the current accumulated sx CSS string. Re-imported each SSR request to pick up HMR additions. */
	export function getDevSxCss(): string;
	/** Returns the current accumulated class-name list. Seeded into window state so client module injects dedupe against SSR-emitted classes. */
	export function getDevSxClasses(): string[];
}

declare module "virtual:flare-server-fn-secret" {
	const secret: string;
	export default secret;
}

declare module "virtual:flare-sw-config" {
	const config: { enabled: false } | { enabled: true; path: string; scope: string };
	export default config;
}

declare module "*.avif" {
	import type { StaticImageData } from "../image.ts";
	const data: StaticImageData;
	export default data;
}

declare module "*.jpg" {
	import type { StaticImageData } from "../image.ts";
	const data: StaticImageData;
	export default data;
}

declare module "*.jpeg" {
	import type { StaticImageData } from "../image.ts";
	const data: StaticImageData;
	export default data;
}

declare module "*.png" {
	import type { StaticImageData } from "../image.ts";
	const data: StaticImageData;
	export default data;
}

declare module "*.tiff" {
	import type { StaticImageData } from "../image.ts";
	const data: StaticImageData;
	export default data;
}

declare module "*.webp" {
	import type { StaticImageData } from "../image.ts";
	const data: StaticImageData;
	export default data;
}
