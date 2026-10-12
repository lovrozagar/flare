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

type CacheMode =
	| { ssr: SsrCache; isr?: never; ssg?: never }
	| { isr: true | { revalidate?: string }; ssr?: never; ssg?: never }
	| { ssg: true | { defer?: "resolve" | "stream" }; ssr?: never; isr?: never };

export type CacheConfig =
	| (CacheMode & { client?: ClientCache })
	| { client: ClientCache; ssr?: never; isr?: never; ssg?: never };

import type { JSX } from "@solidjs/web";
import type { Located } from "./boundaries.ts";
import type { Deferred } from "./register.ts";
import type { Validator } from "../validation/index.ts";
import type { HeadConfig } from "./types.ts";

// `.input()`: each side's validator receives the raw record, and its output replaces that side for the match's
// later callbacks and render props (dx/builder.md).
export type RouteInput = { params?: Validator; searchParams?: Validator };

export type PreloaderContext = Record<string, unknown>;

// What preloader, authorize, and loader receive (dx/types.md). Render does not receive auth. The root's
// preloader and authorize get no preloaderContext; every later callback does.
export type StepContext = {
	auth: unknown;
	request: Request;
	env: unknown;
	params: unknown;
	search: unknown;
	preloaderContext?: PreloaderContext | undefined;
};

export type ChainAuth = { mode: true | "optional"; callerData: readonly string[] };

type Step = (ctx: StepContext) => unknown;

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

type Load = (ctx: LoaderContext) => LoaderData | Promise<LoaderData>;

type Authorize = (ctx: StepContext) => boolean | Promise<boolean>;

// A .response() page answers with its own Response. It still passes through finalize (dx/builder.md).
export type Respond = (ctx: StepContext) => Response | Promise<Response>;

type Head = (ctx: {
	params: unknown;
	search: unknown;
	loaderData: unknown;
	preloaderContext: PreloaderContext;
}) => HeadConfig;

// A page gets no children. A layout and the root also get the next slot (dx/types.md).
export type Render = (props: {
	loaderData: unknown;
	params: Located["params"];
	search: Located["search"];
	preloaderContext: Record<string, unknown>;
	children?: JSX.Element;
}) => JSX.Element;

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

// The steps every builder shares. `.input()` and `.loader()` change the builder's type, so each builder types them.
export type Steps<B> = {
	cache: (config: CacheConfig) => B;
	authenticate: (...callerData: readonly string[]) => B;
	authenticateOptional: (...callerData: readonly string[]) => B;
	authorize: (fn: Authorize) => B;
	effects: (effects: Effects) => B;
	preloader: (fn: Step) => B;
	head: (fn: Head) => B;
};

// The methods a page, a layout, and a root layout share. Each stores on the chain and returns the builder.
export function chainSteps<B>(chain: Chain, self: () => B): Steps<B> {
	return {
		cache(config) {
			chain.cache(config);
			return self();
		},
		authenticate(...callerData) {
			chain.authenticate(...callerData);
			return self();
		},
		authenticateOptional(...callerData) {
			chain.authenticateOptional(...callerData);
			return self();
		},
		authorize(fn) {
			chain.authorize(fn);
			return self();
		},
		effects(effects) {
			chain.effects(effects);
			return self();
		},
		preloader(fn) {
			chain.preloader(fn);
			return self();
		},
		head(fn) {
			chain.head(fn);
			return self();
		},
	};
}
