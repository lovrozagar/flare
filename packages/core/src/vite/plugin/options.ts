import { sitemap } from "../../features/seo/vite/index.ts";
import type { PrerenderConfig } from "../prerender/run.ts";

export type FlareOptions = {
	assetsBase?: string;
	entry?: { client?: string; server?: string };
	image?: { widths?: readonly number[]; quality?: number; exclude?: RegExp };
	prerender?: boolean | PrerenderConfig;
	css?: { reset?: boolean };
	broadcast?: boolean;
};

export type ParsedOptions = {
	assetsBase: string;
	prerender: PrerenderConfig | false;
	entry: { client: string; server: string };
	image?: { widths: readonly number[]; quality: number; exclude?: RegExp } | undefined;
	css: { reset: boolean };
	broadcast: boolean;
};

const KNOWN = new Set(["assetsBase", "entry", "image", "prerender", "css", "broadcast"]);
const WIDTHS = [640, 750, 828, 1080, 1200, 1920];
const ENTRY = { client: "src/client.tsx", server: "src/server.ts" };

export function parseOptions(input?: FlareOptions): ParsedOptions {
	const options = input ?? {};
	for (const key of Object.keys(options)) {
		if (!KNOWN.has(key)) throw new Error(key);
	}
	return {
		assetsBase: parseAssetsBase(options.assetsBase),
		prerender: parsePrerender(options.prerender),
		entry: {
			client: entryPath(options.entry, "client"),
			server: entryPath(options.entry, "server"),
		},
		image: parseImage(options.image),
		css: parseCss(options.css),
		broadcast: parseBroadcast(options.broadcast),
	};
}

function parseAssetsBase(value: string | undefined): string {
	if (value === undefined) return "/assets";
	// "/" is the only legal base that ends with a slash.
	if (value === "/") return "/";
	if (!value.startsWith("/")) throw new Error(value);
	if (value.endsWith("/")) throw new Error(value);
	if (value.includes("?")) throw new Error(value);
	if (value.includes("#")) throw new Error(value);
	return value;
}

function entryPath(entry: FlareOptions["entry"], key: "client" | "server"): string {
	if (entry === undefined) return ENTRY[key];
	const value = entry[key];
	return value === undefined ? ENTRY[key] : value;
}

// Unique integer widths from 1 to 4096, an integer quality from 1 to 100, and a RegExp to exclude (dx/plugin.md image).
function parseImage(image: FlareOptions["image"]): ParsedOptions["image"] {
	if (image === undefined) return undefined;
	const widths = image.widths ?? WIDTHS;
	const whole = widths.every((width) => Number.isInteger(width) && width >= 1 && width <= 4096);
	if (!whole || new Set(widths).size !== widths.length) throw new Error("image.widths");
	const quality = image.quality ?? 75;
	if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("image.quality");
	if (image.exclude !== undefined && !(image.exclude instanceof RegExp)) throw new Error("image.exclude");
	return { widths, quality, ...(image.exclude && { exclude: image.exclude }) };
}

// Omission, `{}`, and `reset: false` are the same: no preflight.
function parseCss(css: FlareOptions["css"]): ParsedOptions["css"] {
	if (css === undefined) return { reset: false };
	for (const key of Object.keys(css)) {
		if (key !== "reset") throw new Error(key);
	}
	return { reset: Boolean(css.reset) };
}

const PRERENDER_KEYS = new Set(["concurrency", "env", "exclude", "sitemap"]);

// Omitted and `false` are off. `true` is every default. An object is checked key by key (dx/plugin.md prerender).
// `sitemap` is checked by its own builder now, so a bad value fails before the build starts.
function parsePrerender(value: FlareOptions["prerender"]): PrerenderConfig | false {
	if (value === undefined || value === false) return false;
	if (value === true) return {};
	for (const key of Object.keys(value)) if (!PRERENDER_KEYS.has(key)) throw new Error(`prerender.${key}`);
	const checks: Array<[string, unknown, (field: unknown) => boolean]> = [
		["concurrency", value.concurrency, (field) => Number.isInteger(field) && Number(field) >= 1],
		["exclude", value.exclude, (field) => Array.isArray(field) && field.every((id) => typeof id === "string")],
		["env", value.env, (field) => typeof field === "function" || (typeof field === "object" && field !== null)],
		["sitemap", value.sitemap, (field) => typeof field === "object" && field !== null && !Array.isArray(field)],
	];
	for (const [key, field, valid] of checks)
		if (field !== undefined && !valid(field)) throw new Error(`prerender.${key}`);
	if (value.sitemap !== undefined) sitemap(value.sitemap);
	return { ...value };
}

function parseBroadcast(value: boolean | undefined): boolean {
	if (typeof value === "boolean") return value;
	if (value === undefined) return true;
	throw new Error("broadcast");
}
