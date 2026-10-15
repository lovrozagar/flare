import { defined } from "../../shared/errors/index.ts";
import { parseDuration } from "../../shared/duration/index.ts";
import { BUILD_HEADER } from "../../shared/protocol/index.ts";
import type { PrefetchTrigger, RoutePrefetch } from "../../shared/route-builder/index.ts";
import type { ModuleRef, Router } from "../../shared/router/create-router.ts";
import { loadChain, loadedModule } from "../../shared/router/load-chain.ts";
import type { Location } from "../../shared/url/index.ts";
import { clientOf } from "../router/match-cache.ts";
import { framesOf, landFrames, type Landed, type LandOptions } from "./frames.ts";
import { resolveUrl, type Target } from "./target.ts";

// The browser surface prefetch uses, passed in so a test can observe it. `network` is the object that may carry
// `connection` (the browser's navigator).
export type PrefetchEnv = {
	network: object;
	observe: (element: Element, run: () => void) => () => void;
	idle: (run: () => void) => void;
	head: HTMLElement;
	now: () => number;
};

export type PrefetchDeps = {
	router: Router;
	origin: string;
	current: () => Location;
	fetch: (url: string, init: RequestInit) => Promise<Response>;
	build: string;
	land: LandOptions;
	env: PrefetchEnv;
};

export type Prefetcher = {
	all: () => void;
	watch: (element: HTMLElement, href: string, input?: RoutePrefetch) => () => void;
	prefetched: (dataUrl: string) => Promise<Landed | undefined> | undefined;
};

type DataTarget = Extract<Target, { kind: "data" }>;

type Binding = { trigger: Exclude<PrefetchTrigger, false>; env: PrefetchEnv; run: () => void };

// A prefetched landing waits here, by data URL, until a navigation takes it or its own clock runs out.
type Held = { landing: Promise<Landed | undefined>; at?: number; keep: number };

const INTENT = ["pointerenter", "focus", "touchstart"] as const;

const PREFETCH_STALE = "30s";

// `modules` loads route code and does no server work. `data` runs the loaders with `_flare=prefetch`, loads the
// modules too, and never commits (B64). A navigation to that URL takes the landing whole while it is fresh, and
// from then on it is a normal cache entry (dx/cache.md).
export function createPrefetcher(deps: PrefetchDeps): Prefetcher {
	const held = new Map<string, Held>();
	const expired = (entry: Held): boolean => entry.at !== undefined && deps.env.now() - entry.at > entry.keep;
	const data = (target: DataTarget): void => {
		const entry = held.get(target.dataUrl);
		if (entry !== undefined && !expired(entry)) return;
		const client = clientOf(target.match.client);
		const keep = Math.min(
			parseDuration(client.prefetchStaleTime ?? PREFETCH_STALE),
			client.prefetchGcTime === undefined ? Number.POSITIVE_INFINITY : parseDuration(client.prefetchGcTime),
		);
		const next: Held = { landing: request(deps, target), keep };
		held.delete(target.dataUrl);
		held.set(target.dataUrl, next);
		if (held.size > deps.router.routeCacheMaxEntries)
			held.delete(defined(held.keys().next().value, "the oldest prefetch"));
		void next.landing.then((landing) => {
			if (landing !== undefined) next.at = deps.env.now();
			else if (held.get(target.dataUrl) === next) held.delete(target.dataUrl);
		});
	};
	// A trigger fires for modules, data, or both. Data always loads the modules too.
	const run = (target: DataTarget, withData: boolean): void => {
		void loadChain(target.match.chain).catch(() => undefined);
		if (withData) data(target);
	};
	return {
		all() {
			if (lowData(deps.env.network)) return;
			for (const href of unloadedChunks(deps.router)) deps.env.head.append(prefetchLink(href));
		},
		watch(element, href, input) {
			const target = local(href, deps);
			if (target?.kind !== "data") return () => undefined;
			const fields = fieldsOf(input, clientOf(target.match.client).prefetch, deps.router.prefetch);
			const modules = fields.modules === "all" ? lowData(deps.env.network) && "viewport" : fields.modules;
			const triggers = new Set([modules, fields.data].filter((trigger) => trigger !== false));
			const stops = [...triggers].map((trigger) =>
				bind(element, {
					trigger,
					env: deps.env,
					run: () => run(target, fields.data === trigger),
				}),
			);
			return () => {
				for (const stop of stops) stop();
			};
		},
		prefetched(dataUrl) {
			const entry = held.get(dataUrl);
			held.delete(dataUrl);
			return entry === undefined || expired(entry) ? undefined : entry.landing;
		},
	};
}

// Every route chunk file the client has not imported. A file one of whose modules is loaded is in the module map
// already, and a prefetch would fetch it again (BUGS.md 80).
function unloadedChunks(router: Router): Set<string> {
	const modules = new Map<string, ModuleRef>(Object.entries(router.layouts));
	for (const node of router.routeTree) modules.set(node.id, node.module);
	const entries = Object.entries(router.chunks);
	const loaded = new Set(
		entries
			.filter(([id]) => {
				const ref = modules.get(id);
				return ref !== undefined && loadedModule(ref) !== undefined;
			})
			.map(([, href]) => href),
	);
	return new Set(entries.map(([, href]) => href).filter((href) => !loaded.has(href)));
}

// Only a same-origin route prefetches. Another origin, or a URL that does not parse, does not (dx/link.md).
function local(href: string, deps: PrefetchDeps): Target | undefined {
	if (!sameOrigin(href, deps.origin)) return undefined;
	return resolveUrl(href, { router: deps.router, origin: deps.origin, current: deps.current() });
}

// `URL.canParse` is Chrome 120 and Safari 17, above the client's browser floor (decision B123), so a URL that does not
// parse is the constructor's throw.
function sameOrigin(href: string, origin: string): boolean {
	try {
		return new URL(href, origin).origin === origin;
	} catch {
		return false;
	}
}

// The browser's viewport trigger: `run` once, the first time the element is in view.
export function observeViewport(element: Element, run: () => void): () => void {
	const observer = new IntersectionObserver((entries) => {
		if (!entries.some((entry) => entry.isIntersecting)) return;
		observer.disconnect();
		run();
	});
	observer.observe(element);
	return () => observer.disconnect();
}

// Per field: the link, then the route, then the router (B64).
function fieldsOf(link: RoutePrefetch | undefined, route: RoutePrefetch | undefined, router: Router["prefetch"]) {
	const [mine, theirs] = [split(link), split(route)];
	return { modules: mine.modules ?? theirs.modules ?? router.modules, data: mine.data ?? theirs.data ?? router.data };
}

// A string sets both fields.
function split(value: RoutePrefetch | undefined): { data?: PrefetchTrigger; modules?: PrefetchTrigger } {
	if (typeof value === "object") return value;
	return value === undefined ? {} : { data: value, modules: value };
}

function bind(element: HTMLElement, { trigger, env, run }: Binding): () => void {
	if (trigger === "viewport") return env.observe(element, run);
	if (trigger === "render") {
		let live = true;
		env.idle(() => live && run());
		return () => void (live = false);
	}
	for (const event of INTENT) element.addEventListener(event, run, { passive: true });
	return () => {
		for (const event of INTENT) element.removeEventListener(event, run);
	};
}

// A failed or mismatched prefetch is dropped. The navigation then makes its own request and handles it.
async function request(deps: PrefetchDeps, target: DataTarget): Promise<Landed | undefined> {
	// target.ts writes the kind param last.
	const url = `${target.dataUrl.slice(0, -"data".length)}prefetch`;
	try {
		const response = await deps.fetch(url, {});
		const build = response.headers.get(BUILD_HEADER) ?? "";
		if (build !== "" && deps.build !== "" && build !== deps.build) return undefined;
		if (response.status !== 200 || response.body === null) return undefined;
		return await landFrames(framesOf(response.body), deps.land);
	} catch {
		return undefined;
	}
}

// Data Saver and 2G skip `"all"` and fall back to viewport module prefetch (dx/link.md).
function lowData(network: object): boolean {
	if (!("connection" in network) || typeof network.connection !== "object" || network.connection === null) {
		return false;
	}
	const connection = network.connection;
	if ("saveData" in connection && connection.saveData === true) return true;
	return "effectiveType" in connection && (connection.effectiveType === "2g" || connection.effectiveType === "slow-2g");
}

function prefetchLink(href: string): HTMLLinkElement {
	const link = document.createElement("link");
	const attributes: ReadonlyArray<readonly [string, string]> = [
		["rel", "prefetch"],
		["as", "script"],
		["crossorigin", ""],
		["href", href],
	];
	for (const [name, value] of attributes) link.setAttribute(name, value);
	return link;
}
