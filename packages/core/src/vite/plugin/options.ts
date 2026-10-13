import type { PrerenderConfig } from "../prerender/run.ts";

export type FlareOptions = {
	assetsBase?: string;
	entry?: { client?: string; server?: string };
	image?: { widths?: readonly number[]; quality?: number; exclude?: RegExp };
	prerender?: boolean | (PrerenderConfig & { sitemap?: unknown });
	css?: { reset?: boolean };
	broadcast?: boolean;
};

export type ParsedOptions = {
	assetsBase: string;
	prerender: PrerenderConfig | false;
	entry: { client: string; server: string };
	image?: { widths: readonly number[]; quality: number } | undefined;
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

function parseImage(image: FlareOptions["image"]): ParsedOptions["image"] {
	if (image === undefined) return undefined;
	return { widths: WIDTHS, quality: 75 };
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
// `sitemap` is read by bit 13.
function parsePrerender(value: FlareOptions["prerender"]): PrerenderConfig | false {
	if (value === undefined || value === false) return false;
	if (value === true) return {};
	for (const key of Object.keys(value)) if (!PRERENDER_KEYS.has(key)) throw new Error(`prerender.${key}`);
	const checks: Array<[string, unknown, (field: unknown) => boolean]> = [
		["concurrency", value.concurrency, (field) => Number.isInteger(field) && Number(field) >= 1],
		["exclude", value.exclude, (field) => Array.isArray(field) && field.every((id) => typeof id === "string")],
		["env", value.env, (field) => typeof field === "function" || (typeof field === "object" && field !== null)],
	];
	for (const [key, field, valid] of checks)
		if (field !== undefined && !valid(field)) throw new Error(`prerender.${key}`);
	return { ...value };
}

function parseBroadcast(value: boolean | undefined): boolean {
	if (typeof value === "boolean") return value;
	if (value === undefined) return true;
	throw new Error("broadcast");
}
