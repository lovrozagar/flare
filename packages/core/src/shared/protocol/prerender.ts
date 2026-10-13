// The internal channel between `vite build`'s prerender and a built server (bits/12). The built server bundles its own
// copy of this module, so the key is a registry symbol both copies share. No package entry exports it.
export const PRERENDER: unique symbol = Symbol.for("flare.prerender");

// A page prerender may render: an ssg page, or an isr page. `listed` is a `params` function. `auth` is the chain's
// effective auth, and `authorize` whether the chain has one.
export type PrerenderPage = {
	id: string;
	mode: "ssg" | "isr";
	dynamic: boolean;
	listed: boolean;
	auth: { requires: boolean; reads: boolean };
	authorize: boolean;
};

// Every route node, for the sitemap (dx/seo.md). `path` is the public path under the router's base, absent when the
// URL has a param segment. Describing a route loads its chain's modules and runs nothing else.
export type PrerenderRoute = {
	id: string;
	path: string | undefined;
	// When every param segment is optional: the URL with each absent, then one per other configured locale when one of
	// them is the locale param. Empty otherwise (B101, BUGS.md B10).
	bare: string[];
	response: boolean;
	auth: { requires: boolean; reads: boolean };
	authorize: boolean;
};

export type PrerenderParams = Record<string, string | string[]>;

// The entry a stored miss writes: the seed's data, its time, and its tags.
export type PrerenderEntry = { data: unknown; storedAt: number; tags?: readonly string[] };

// The answer's status, the public path it rendered, and the key and entry when the shared render could be stored.
export type PrerenderResult = { status: number; path: string; key?: string; entry?: PrerenderEntry };

// `site` is `createServer({ site })`.
export type Prerenderer = {
	site: string | undefined;
	pages(): Promise<PrerenderPage[]>;
	routes(): Promise<PrerenderRoute[]>;
	params(id: string): Promise<readonly PrerenderParams[]>;
	render(input: { id: string; params: PrerenderParams; env: unknown }): Promise<PrerenderResult>;
};

// The prerenderer of a built module's `server`, when it has one.
export function prerendererOf(server: unknown): Prerenderer | undefined {
	if (typeof server !== "object" || server === null) return undefined;
	const found: unknown = Reflect.get(server, PRERENDER);
	return isPrerenderer(found) ? found : undefined;
}

function isPrerenderer(value: unknown): value is Prerenderer {
	if (typeof value !== "object" || value === null) return false;
	return ["pages", "routes", "params", "render"].every((name) => typeof Reflect.get(value, name) === "function");
}
