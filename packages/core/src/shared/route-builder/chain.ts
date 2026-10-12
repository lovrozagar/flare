export type SsrCache = {
	ttl: string;
	staleTime?: string;
	tags?: readonly string[];
	defer?: "resolve" | "stream";
};

// When a link prefetches (dx/link.md). A string sets both fields. An object sets the fields it names.
export type PrefetchTrigger = false | "intent" | "viewport" | "render";
export type RoutePrefetch = PrefetchTrigger | { data?: PrefetchTrigger; modules?: PrefetchTrigger };

// The route's in-memory match cache (dx/cache.md). `false` turns it off for that route. Durations are strings.
export type ClientCache =
	| false
	| {
			prefetch?: RoutePrefetch;
			staleTime?: string;
			gcTime?: string;
			prefetchStaleTime?: string;
			prefetchGcTime?: string;
			cacheDeferred?: boolean;
	  };

// The CDN policy (dx/cache.md `cdn`). It reaches the header only for a shared answer of class public. On a
// layout, a root layout, or a segment it is a default for the pages under it.
export type CdnCache = {
	maxAge?: string | undefined;
	swr?: string | undefined;
	private?: boolean | undefined;
	tags?: readonly string[] | ((ctx: { params: Record<string, string | string[]> }) => readonly string[]) | undefined;
	allowCookies?: boolean | undefined;
};

type CacheMode =
	| { ssr: SsrCache; isr?: never; ssg?: never }
	| { isr: true | { revalidate?: string }; ssr?: never; ssg?: never }
	| { ssg: true | { defer?: "resolve" | "stream" }; ssr?: never; isr?: never };

// One mode at most. `cdn` and `client` sit beside it or stand alone.
export type CacheConfig =
	| (CacheMode & { client?: ClientCache | undefined; cdn?: CdnCache | undefined })
	| { client: ClientCache; cdn?: CdnCache | undefined; ssr?: never; isr?: never; ssg?: never }
	| { cdn: CdnCache; client?: ClientCache | undefined; ssr?: never; isr?: never; ssg?: never };

import type { JSX } from "@solidjs/web";
import { withBoundaries, type Located } from "./boundaries.ts";
import type { RouteRecord } from "./page.ts";
import type { BuilderSteps, RouteBuilder, RouteKind, RouteState, TypedRecord } from "./route-types.ts";
import type { Deferred } from "./register.ts";
import type { Validator } from "../validation/index.ts";
import type { HeadConfig } from "./types.ts";

// `.input()`: each side's validator receives the raw record, and its output replaces that side for the match's
// later callbacks and render props (dx/builder.md).
// Each side's validator receives that side's raw record (dx/types.md), so it may type its parameter with it.
export type RouteInput = { params?: Validator<RawRecord>; searchParams?: Validator<RawRecord> };

type RawRecord = Record<string, string | string[]>;

export type PreloaderContext = Record<string, unknown>;

// What preloader, authorize, and loader receive (dx/types.md). Render does not receive auth. The root's
// preloader and authorize get no preloaderContext; every later callback does.
export type StepContext = {
	auth: unknown;
	request: Request;
	env: unknown;
	params: unknown;
	search: unknown;
	// A typed route reads its own accumulated shape. The runtime only passes it through.
	preloaderContext?: unknown;
};

export type ChainAuth = { mode: true | "optional"; callerData: readonly string[] };

// A callback the chain stores. Method syntax checks its parameter bivariantly, so a typed route's callback, whose
// context is narrower than the runtime one, is stored as it is and is called with the runtime context.
export type Callback<Ctx, Out> = { bivarianceHack(ctx: Ctx): Out }["bivarianceHack"];

type Step = Callback<StepContext, unknown>;

type Raw = Record<string, string | string[]>;

export type EffectPlace = { hash: string; pathname: string; search: string; params: Raw };

// `effects` on the client (dx/builder.md). Both read the raw records, never a validated search (B31).
export type Effects = {
	loaderDeps?: (ctx: { search: Raw; params: Raw }) => unknown[];
	shouldRefetch?: (ctx: {
		trigger: "initial" | "navigation" | "revalidation";
		location: { current: EffectPlace; next: EffectPlace };
		params: Raw;
		search: Raw;
	}) => boolean;
};

// The loader alone gets `defer` (dx/defer.md).
export type LoaderContext = StepContext & {
	defer: <T>(fn: () => Promise<T>, options?: { key?: string; prerender?: "resolve" | "stream" }) => Deferred<T>;
};

// Loader data is an object or nothing. A primitive cannot stay live through the hooks, so it does not
// type-check and throws in dev (dx/builder.md).
// A thenable is excluded, so an async loader's value is checked too: every Promise is an object.
export type LoaderData = (object & { then?: never }) | null | undefined;

type Load = Callback<LoaderContext, LoaderData | Promise<LoaderData>>;

type Authorize = Callback<StepContext, boolean | Promise<boolean>>;

// A .response() page answers with its own Response. It still passes through finalize (dx/builder.md).
export type Respond = Callback<StepContext, Response | Promise<Response>>;

type Head = Callback<{ params: unknown; search: unknown; loaderData: unknown; preloaderContext: unknown }, HeadConfig>;

// A page gets no children. A layout and the root also get the next slot (dx/types.md).
export type Render = Callback<
	{
		loaderData: unknown;
		params: Located["params"];
		search: Located["search"];
		preloaderContext: unknown;
		children?: JSX.Element;
	},
	JSX.Element
>;

// A client navigation from one of `from` opens the target in `InterceptOutlet`. `render` is a label (dx/builder.md).
export type Intercept = { from: readonly string[]; render: string };

export type ChainRecord = {
	intercept?: Intercept;
	cache?: CacheConfig;
	input?: RouteInput;
	auth?: ChainAuth;
	authorize?: Authorize;
	effects?: Effects;
	preloader?: Step;
	loader?: Load;
	response?: Respond;
	head?: Head;
	render?: Render;
};

export type Chain = {
	intercept: (config: Intercept) => Chain;
	cache: (config: CacheConfig) => Chain;
	input: (config: RouteInput) => Chain;
	authenticate: (...callerData: readonly string[]) => Chain;
	authenticateOptional: (...callerData: readonly string[]) => Chain;
	authorize: (fn: Authorize) => Chain;
	effects: (effects: Effects) => Chain;
	preloader: (fn: Step) => Chain;
	loader: (fn: Load) => Chain;
	response: (fn: Respond) => Chain;
	head: (fn: Head) => Chain;
	render: (fn: Render) => Chain;
	record: () => ChainRecord;
};

// The order of dx/builder.md. loader and response share a slot because they are mutually exclusive.
const ORDER = {
	intercept: 0,
	cache: 1,
	input: 2,
	authenticate: 3,
	authenticateOptional: 4,
	authorize: 5,
	effects: 6,
	preloader: 7,
	loader: 8,
	response: 8,
	head: 10,
	render: 13,
} as const;
type Name = keyof typeof ORDER;
const MODES = ["ssr", "isr", "ssg"] as const;

type ChainState = { used: Set<Name>; record: ChainRecord; at: number };

function advance(state: ChainState, step: Name): void {
	if (state.used.has(step)) throw new Error(`${step} twice`);
	if (step === "response" && state.used.has("loader")) throw new Error("loader and response are exclusive");
	if (step === "loader" && state.used.has("response")) throw new Error("loader and response are exclusive");
	if (step.startsWith("authenticate") && state.record.auth !== undefined) throw new Error("authenticate twice");
	if (state.at > ORDER[step]) throw new Error(`order: ${step}`);
	state.at = ORDER[step];
	state.used.add(step);
}

export function createChain(_id: string): Chain {
	const state: ChainState = { used: new Set(), record: {}, at: 0 };
	const record = state.record;
	// Every step checks its place in the order, then stores one record field.
	const put = <K extends keyof ChainRecord>(step: Name, key: K, value: ChainRecord[K]): Chain => {
		advance(state, step);
		record[key] = value;
		return chain;
	};
	const chain: Chain = {
		intercept(config) {
			if (config.from.length === 0 || typeof config.render !== "string") {
				throw new Error("intercept needs route ids in from and a render label");
			}
			return put("intercept", "intercept", { from: [...config.from], render: config.render });
		},
		cache(config) {
			if (MODES.filter((key) => Object.hasOwn(config, key)).length > 1) throw new Error("one cache mode");
			return put("cache", "cache", config);
		},
		input(config) {
			if (config.params === undefined && config.searchParams === undefined) {
				throw new Error("input needs params or searchParams");
			}
			return put("input", "input", config);
		},
		authenticate(...callerData) {
			if (callerData.includes("optional")) throw new Error("The method is authenticateOptional");
			return put("authenticate", "auth", { mode: true, callerData });
		},
		authenticateOptional: (...callerData) => put("authenticateOptional", "auth", { mode: "optional", callerData }),
		authorize: (fn) => put("authorize", "authorize", fn),
		effects(effects) {
			if (effects.loaderDeps === undefined && effects.shouldRefetch === undefined) {
				throw new Error("effects needs loaderDeps or shouldRefetch");
			}
			return put("effects", "effects", effects);
		},
		preloader: (fn) => put("preloader", "preloader", fn),
		loader: (fn) => put("loader", "loader", fn),
		response: (fn) => put("response", "response", fn),
		head: (fn) => put("head", "head", fn),
		render: (fn) => put("render", "render", fn),
		record: () => ({ ...record }),
	};
	return chain;
}

type Next<K extends RouteKind> = <T extends RouteState>() => RouteBuilder<T, K>;

// One chain behind every typed builder. A typed step stores on the chain and returns `next()`, a builder of the new
// state over the same chain, so the type changes without a cast. `finish` builds the record render returns.
export function typedSteps<S extends RouteState, K extends RouteKind>(
	chain: Chain,
	next: Next<K>,
	finish: () => RouteRecord & { readonly _type: K },
): BuilderSteps<S, K> {
	return {
		cache(config) {
			chain.cache(config);
			return next();
		},
		input(config) {
			chain.input(config);
			return next();
		},
		authenticate(...callerData) {
			chain.authenticate(...callerData);
			return next();
		},
		authenticateOptional(...callerData: readonly string[]) {
			chain.authenticateOptional(...callerData);
			return next();
		},
		authorize(fn) {
			chain.authorize(fn);
			return next();
		},
		effects(effects) {
			chain.effects(effects);
			return next();
		},
		preloader(fn) {
			chain.preloader(fn);
			return next();
		},
		loader(fn) {
			chain.loader(fn);
			return next();
		},
		head(fn) {
			chain.head(fn);
			return next();
		},
		render(fn) {
			chain.render(fn);
			return withBoundaries<RouteRecord & TypedRecord<S, K>, { params: S["params"]; search: S["search"] }>(finish());
		},
	};
}
