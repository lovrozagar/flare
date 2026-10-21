import type { PrerenderRoute } from "../../../shared/protocol/prerender.ts"

export type ChangeFreq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"

export type SitemapEntry = { loc: string; lastmod?: string; changefreq?: ChangeFreq; priority?: number }

// `flare({ prerender: { sitemap } })` (dx/seo.md). Records are keyed by route id.
export type SitemapOptions = {
	additionalEntries?: readonly SitemapEntry[]
	changefreq?: ChangeFreq | Readonly<Record<string, ChangeFreq>>
	exclude?: readonly string[]
	priority?: number | Readonly<Record<string, number>>
	robotsTxt?: boolean | string
}

type Hint = "requires" | "reads" | "public"

// What the prerender run hands the builder: `site`, every route node, the paths prerender rendered, and codegen's
// hint. `undefined` is a route codegen does not know.
export type SitemapInput = {
	site: string
	routes: readonly PrerenderRoute[]
	rendered: ReadonlyArray<{ id: string; path: string }>
	hint: (id: string) => Hint | undefined
}

export type SitemapFile = { name: "sitemap.xml" | "robots.txt"; body: string }

export type SitemapBuild = { files: SitemapFile[]; errors: string[] }

type Url = { loc: string; lastmod?: string; changefreq?: ChangeFreq; priority?: number }

const FREQUENCIES: readonly string[] = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]
// A W3C Datetime as the sitemap protocol takes it: a date, or a date and `hh:mm`, an optional `:ss` and fraction, and
// its zone, `Z` or `±hh:mm`. The ranges are checked here, not by an engine's Date.parse, so every runtime agrees.
const DATETIME =
	/^(\d{4})-(\d{2})-(\d{2})(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/
const NO_OFFSET = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/

function frequencies(value: SitemapOptions["changefreq"]): string[] {
	if (value === undefined) return []
	return typeof value === "string" ? [value] : Object.values(value)
}

function priorities(value: SitemapOptions["priority"]): number[] {
	if (value === undefined) return []
	return typeof value === "number" ? [value] : Object.values(value)
}

function checkFrequency(value: string): void {
	if (!FREQUENCIES.includes(value)) {
		throw new Error(`sitemap changefreq ${JSON.stringify(value)} is not one of ${FREQUENCIES.join(", ")}`)
	}
}

function checkPriority(value: number): void {
	if (!(Number.isFinite(value) && value >= 0 && value <= 1)) {
		throw new Error(`sitemap priority ${value} is not a number from 0 to 1`)
	}
}

// A lastmod is written as given once it is a W3C Datetime: its offset, and so its author's day, is kept. A time needs
// its offset, or its day would be the reader's guess (BUGS.md 466), and the date must be one the calendar has, not
// `2026-02-30` (BUGS.md 467). Each error names the entry's loc.
function checkLastmod(value: string, loc: string): void {
	const text = `sitemap lastmod ${JSON.stringify(value)} of ${loc}`
	if (NO_OFFSET.test(value)) throw new Error(`${text} has a time but no offset (Z or ±hh:mm)`)
	const parts = DATETIME.exec(value)
	if (parts === null) {
		throw new Error(`${text} is not a W3C datetime: YYYY-MM-DD, or YYYY-MM-DDThh:mm[:ss[.s]] and Z or ±hh:mm`)
	}
	const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
	const calendar = new Date(Date.UTC(year, month - 1, day))
	if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
		throw new Error(`${text} is not a calendar date`)
	}
}

// Every option a build would refuse is refused when the plugin is made, not after every page rendered (BUGS.md 469).
function checked(options: SitemapOptions): void {
	for (const value of frequencies(options.changefreq)) checkFrequency(value)
	for (const value of priorities(options.priority)) checkPriority(value)
	const robotsTxt: unknown = options.robotsTxt
	if (robotsTxt !== undefined && typeof robotsTxt !== "boolean" && typeof robotsTxt !== "string") {
		throw new Error("sitemap robotsTxt is true, false, or the file's text")
	}
	for (const entry of options.additionalEntries ?? []) {
		if (!URL.canParse(entry.loc) || new URL(entry.loc).protocol !== "https:") {
			throw new Error(`sitemap additionalEntries loc ${entry.loc} is not an absolute https URL`)
		}
		if (entry.changefreq !== undefined) checkFrequency(entry.changefreq)
		if (entry.priority !== undefined) checkPriority(entry.priority)
		if (entry.lastmod !== undefined) checkLastmod(entry.lastmod, entry.loc)
	}
}

function keysKnown(name: string, value: unknown, ids: ReadonlySet<string>): void {
	if (typeof value !== "object" || value === null) return
	for (const key of Object.keys(value)) {
		if (!ids.has(key)) throw new Error(`sitemap ${name} names ${key}, which is not a route id`)
	}
}

function forRoute<T extends string | number>(
	value: T | Readonly<Record<string, T>> | undefined,
	id: string,
): T | undefined {
	return typeof value === "object" ? value[id] : value
}

function runtimeHint(route: PrerenderRoute): Hint {
	if (route.auth.requires) return "requires"
	return route.auth.reads || route.authorize ? "reads" : "public"
}

// The route's public paths: its own when static, else the ones prerender rendered and its bare URLs, each once
// (B101, BUGS.md B10).
function pathsOf(route: PrerenderRoute, input: SitemapInput): string[] {
	if (route.path !== undefined) return [route.path]
	const rendered = input.rendered.filter((item) => item.id === route.id).map((item) => item.path)
	return [...new Set([...rendered, ...route.bare])]
}

function routeUrls(options: SitemapOptions, input: SitemapInput, errors: string[]): Url[] {
	const excluded = new Set(options.exclude ?? [])
	const urls: Url[] = []
	for (const route of input.routes) {
		if (route.response || excluded.has(route.id)) continue
		const runtime = runtimeHint(route)
		const hint = input.hint(route.id)
		if (hint !== undefined && hint !== runtime) {
			errors.push(`${route.id}: the codegen auth hint says ${hint}, the loaded modules say ${runtime} (B25)`)
			continue
		}
		// `authorize` gates who may see the page, so a crawler could get 403 (dx/seo.md).
		if (runtime === "requires" || route.authorize) continue
		const changefreq = forRoute(options.changefreq, route.id)
		const priority = forRoute(options.priority, route.id)
		for (const path of pathsOf(route, input)) {
			urls.push({
				loc: `${origin(input.site)}${bracketsEncoded(path)}`,
				...(changefreq !== undefined && { changefreq }),
				...(priority !== undefined && { priority }),
			})
		}
	}
	return urls
}

function extraUrl(entry: SitemapEntry, site: string): Url {
	// checked() made sure the loc is absolute https; only the origin waits for `site`.
	if (new URL(entry.loc).origin !== new URL(site).origin) {
		throw new Error(`sitemap additionalEntries loc ${entry.loc} is not https on ${site}`)
	}
	return { ...entry, loc: pathEncoded(entry.loc) }
}

// `[` and `]` are not URL code points in a path (RFC 3986), so a loc carries them percent-encoded: a literal-bracket
// folder's URL, and an extra entry's path, are one form (BUGS.md 465).
function bracketsEncoded(path: string): string {
	return path.replaceAll("[", "%5B").replaceAll("]", "%5D")
}

// The path of an absolute URL, from the slash after its host (a bracketed IPv6 host stays) to its query or fragment.
function pathEncoded(loc: string): string {
	const start = loc.indexOf("/", loc.indexOf("://") + 3)
	if (start === -1) return loc
	const tail = loc.slice(start).search(/[?#]/)
	const end = tail === -1 ? loc.length : start + tail
	return `${loc.slice(0, start)}${bracketsEncoded(loc.slice(start, end))}${loc.slice(end)}`
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
}

// `site` as the URLs' prefix: its trailing slashes dropped, so no path starts `//` (BUGS.md 465).
function origin(site: string): string {
	return site.replace(/\/+$/, "")
}

// A priority as the schema's decimal: at most four places, and never exponent form (BUGS.md 468).
function decimal(value: number): string {
	return String(Number(value.toFixed(4)))
}

function urlXml(url: Url): string {
	const fields = [
		`<loc>${escapeXml(url.loc)}</loc>`,
		url.lastmod === undefined ? "" : `<lastmod>${url.lastmod}</lastmod>`,
		url.changefreq === undefined ? "" : `<changefreq>${url.changefreq}</changefreq>`,
		url.priority === undefined ? "" : `<priority>${decimal(url.priority)}</priority>`,
	]
	return `<url>${fields.join("")}</url>\n`
}

function sitemapXml(urls: readonly Url[]): string {
	return (
		'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
		`${urls.map(urlXml).join("")}</urlset>\n`
	)
}

// `true` is the one line. A string keeps its other lines, drops every `Sitemap:` line, and ends with `site`'s.
function robots(robotsTxt: true | string, site: string): string {
	const line = `Sitemap: ${origin(site)}/sitemap.xml\n`
	if (robotsTxt === true) return line
	const kept = robotsTxt.split(/\r?\n/).filter((text) => !/^\s*sitemap\s*:/i.test(text))
	while (kept.at(-1)?.trim() === "") kept.pop()
	return kept.map((text) => `${text}\n`).join("") + line
}

// Checks the options now, and returns the build step the prerender run calls once every page rendered. A route the
// hint disagrees with is left out and named in `errors`, which fail the build. Entries are unique by `loc`, the first
// kept.
export function sitemap(options: SitemapOptions = {}): (input: SitemapInput) => SitemapBuild {
	checked(options)
	return (input) => {
		const ids = new Set(input.routes.map((route) => route.id))
		keysKnown("changefreq", options.changefreq, ids)
		keysKnown("priority", options.priority, ids)
		const errors: string[] = []
		const extra = (options.additionalEntries ?? []).map((entry) => extraUrl(entry, input.site))
		const unique = new Map<string, Url>()
		for (const url of [...routeUrls(options, input, errors), ...extra])
			if (!unique.has(url.loc)) unique.set(url.loc, url)
		const files: SitemapFile[] = [{ name: "sitemap.xml", body: sitemapXml([...unique.values()]) }]
		const robotsTxt = options.robotsTxt ?? false
		if (robotsTxt !== false) files.push({ name: "robots.txt", body: robots(robotsTxt, input.site) })
		return { files, errors }
	}
}
