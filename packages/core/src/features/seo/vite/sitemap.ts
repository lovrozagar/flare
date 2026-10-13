import type { PrerenderRoute } from "../../../shared/protocol/prerender.ts";

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

export type SitemapEntry = { loc: string; lastmod?: string; changefreq?: ChangeFreq; priority?: number };

// `flare({ prerender: { sitemap } })` (dx/seo.md). Records are keyed by route id.
export type SitemapOptions = {
	additionalEntries?: readonly SitemapEntry[];
	changefreq?: ChangeFreq | Readonly<Record<string, ChangeFreq>>;
	exclude?: readonly string[];
	priority?: number | Readonly<Record<string, number>>;
	robotsTxt?: boolean | string;
};

type Hint = "requires" | "reads" | "public";

// What the prerender run hands the builder: `site`, every route node, the paths prerender rendered, and codegen's
// hint. `undefined` is a route codegen does not know.
export type SitemapInput = {
	site: string;
	routes: readonly PrerenderRoute[];
	rendered: ReadonlyArray<{ id: string; path: string }>;
	hint: (id: string) => Hint | undefined;
};

export type SitemapFile = { name: "sitemap.xml" | "robots.txt"; body: string };

export type SitemapBuild = { files: SitemapFile[]; errors: string[] };

type Url = { loc: string; lastmod?: string; changefreq?: ChangeFreq; priority?: number };

const FREQUENCIES: readonly string[] = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

function frequencies(value: SitemapOptions["changefreq"]): string[] {
	if (value === undefined) return [];
	return typeof value === "string" ? [value] : Object.values(value);
}

function priorities(value: SitemapOptions["priority"]): number[] {
	if (value === undefined) return [];
	return typeof value === "number" ? [value] : Object.values(value);
}

function checkFrequency(value: string): void {
	if (!FREQUENCIES.includes(value)) {
		throw new Error(`sitemap changefreq ${JSON.stringify(value)} is not one of ${FREQUENCIES.join(", ")}`);
	}
}

function checkPriority(value: number): void {
	if (!(Number.isFinite(value) && value >= 0 && value <= 1)) {
		throw new Error(`sitemap priority ${value} is not a number from 0 to 1`);
	}
}

// An ISO date or instant, as the UTC day it falls on.
function utcDay(value: string): string {
	const time = ISO_DATE.test(value) ? Date.parse(value) : Number.NaN;
	if (Number.isNaN(time)) throw new Error(`sitemap lastmod ${JSON.stringify(value)} is not an ISO date`);
	return new Date(time).toISOString().slice(0, 10);
}

function checked(options: SitemapOptions): void {
	for (const value of frequencies(options.changefreq)) checkFrequency(value);
	for (const value of priorities(options.priority)) checkPriority(value);
	for (const entry of options.additionalEntries ?? []) {
		if (entry.changefreq !== undefined) checkFrequency(entry.changefreq);
		if (entry.priority !== undefined) checkPriority(entry.priority);
		if (entry.lastmod !== undefined) utcDay(entry.lastmod);
	}
}

function keysKnown(name: string, value: unknown, ids: ReadonlySet<string>): void {
	if (typeof value !== "object" || value === null) return;
	for (const key of Object.keys(value)) {
		if (!ids.has(key)) throw new Error(`sitemap ${name} names ${key}, which is not a route id`);
	}
}

function forRoute<T extends string | number>(
	value: T | Readonly<Record<string, T>> | undefined,
	id: string,
): T | undefined {
	return typeof value === "object" ? value[id] : value;
}

function runtimeHint(route: PrerenderRoute): Hint {
	if (route.auth.requires) return "requires";
	return route.auth.reads || route.authorize ? "reads" : "public";
}

// The route's public paths: its own when static, else the ones prerender rendered.
function pathsOf(route: PrerenderRoute, input: SitemapInput): string[] {
	if (route.path !== undefined) return [route.path];
	return input.rendered.filter((item) => item.id === route.id).map((item) => item.path);
}

function routeUrls(options: SitemapOptions, input: SitemapInput, errors: string[]): Url[] {
	const excluded = new Set(options.exclude ?? []);
	const urls: Url[] = [];
	for (const route of input.routes) {
		if (route.response || excluded.has(route.id)) continue;
		const runtime = runtimeHint(route);
		const hint = input.hint(route.id);
		if (hint !== undefined && hint !== runtime) {
			errors.push(`${route.id}: the codegen auth hint says ${hint}, the loaded modules say ${runtime} (B25)`);
			continue;
		}
		if (runtime === "requires") continue;
		const changefreq = forRoute(options.changefreq, route.id);
		const priority = forRoute(options.priority, route.id);
		for (const path of pathsOf(route, input)) {
			urls.push({
				loc: `${input.site}${path}`,
				...(changefreq !== undefined && { changefreq }),
				...(priority !== undefined && { priority }),
			});
		}
	}
	return urls;
}

function extraUrl(entry: SitemapEntry, site: string): Url {
	const url = URL.canParse(entry.loc) ? new URL(entry.loc) : undefined;
	if (url?.protocol !== "https:" || url.origin !== new URL(site).origin) {
		throw new Error(`sitemap additionalEntries loc ${entry.loc} is not https on ${site}`);
	}
	return { ...entry, ...(entry.lastmod !== undefined && { lastmod: utcDay(entry.lastmod) }) };
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function urlXml(url: Url): string {
	const fields = [
		`<loc>${escapeXml(url.loc)}</loc>`,
		url.lastmod === undefined ? "" : `<lastmod>${url.lastmod}</lastmod>`,
		url.changefreq === undefined ? "" : `<changefreq>${url.changefreq}</changefreq>`,
		url.priority === undefined ? "" : `<priority>${url.priority}</priority>`,
	];
	return `<url>${fields.join("")}</url>\n`;
}

function sitemapXml(urls: readonly Url[]): string {
	return (
		'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		`${urls.map(urlXml).join("")}</urlset>\n`
	);
}

// `true` is the one line. A string keeps its other lines, drops every `Sitemap:` line, and ends with `site`'s.
function robots(robotsTxt: true | string, site: string): string {
	const line = `Sitemap: ${site}/sitemap.xml\n`;
	if (robotsTxt === true) return line;
	const kept = robotsTxt.split(/\r?\n/).filter((text) => !/^\s*sitemap\s*:/i.test(text));
	while (kept.at(-1)?.trim() === "") kept.pop();
	return kept.map((text) => `${text}\n`).join("") + line;
}

// Checks the options now, and returns the build step the prerender run calls once every page rendered. A route the
// hint disagrees with is left out and named in `errors`, which fail the build. Entries are unique by `loc`, the first
// kept.
export function sitemap(options: SitemapOptions = {}): (input: SitemapInput) => SitemapBuild {
	checked(options);
	return (input) => {
		const ids = new Set(input.routes.map((route) => route.id));
		keysKnown("changefreq", options.changefreq, ids);
		keysKnown("priority", options.priority, ids);
		const errors: string[] = [];
		const extra = (options.additionalEntries ?? []).map((entry) => extraUrl(entry, input.site));
		const unique = new Map<string, Url>();
		for (const url of [...routeUrls(options, input, errors), ...extra])
			if (!unique.has(url.loc)) unique.set(url.loc, url);
		const files: SitemapFile[] = [{ name: "sitemap.xml", body: sitemapXml([...unique.values()]) }];
		const robotsTxt = options.robotsTxt ?? false;
		if (robotsTxt !== false) files.push({ name: "robots.txt", body: robots(robotsTxt, input.site) });
		return { files, errors };
	};
}
