export type SsrCache = {
	ttl: string;
	staleTime?: string;
	tags?: readonly string[];
	defer?: "resolve" | "stream";
};

export type CacheConfig =
	| { ssr: SsrCache; isr?: never; ssg?: never }
	| { isr: true | { revalidate?: string }; ssr?: never; ssg?: never }
	| { ssg: true | { defer?: "resolve" | "stream" }; ssr?: never; isr?: never };

import type { JSX } from "@solidjs/web";
import type { HeadConfig } from "./types.ts";

export type PreloaderContext = Record<string, unknown>;

// What preloader, authorize, and loader receive (dx/types.md). Render does not receive auth. The root's
// preloader and authorize get no preloaderContext; every later callback does.
export type StepContext = { auth: unknown; request: Request; env: unknown; preloaderContext?: PreloaderContext };

export type ChainAuth = { mode: true | "optional"; callerData: readonly string[] };

type Step = (ctx: StepContext) => unknown;

type Authorize = (ctx: StepContext) => boolean | Promise<boolean>;

// A .response() page answers with its own Response. It still passes through finalize (dx/builder.md).
export type Respond = (ctx: StepContext) => Response | Promise<Response>;

type Head = (ctx: { loaderData: unknown; preloaderContext: PreloaderContext }) => HeadConfig;

export type Render = (props: { loaderData: unknown; children?: JSX.Element }) => JSX.Element;

export type ChainRecord = {
	cache?: CacheConfig;
	auth?: ChainAuth;
	authorize?: Authorize;
	preloader?: Step;
	loader?: Step;
	response?: Respond;
	head?: Head;
	render?: Render;
};

export type Chain = {
	cache: (config: CacheConfig) => Chain;
	authenticate: (...callerData: readonly string[]) => Chain;
	authenticateOptional: (...callerData: readonly string[]) => Chain;
	authorize: (fn: Authorize) => Chain;
	preloader: (fn: Step) => Chain;
	loader: (fn: Step) => Chain;
	response: (fn: Respond) => Chain;
	head: (fn: Head) => Chain;
	render: (fn: Render) => Chain;
	record: () => ChainRecord;
};

// The order of dx/builder.md. loader and response share a slot because they are mutually exclusive.
const ORDER = {
	cache: 1,
	authenticate: 3,
	authenticateOptional: 4,
	authorize: 5,
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

export function createChain(id: string): Chain {
	void id;
	const state: ChainState = { used: new Set(), record: {}, at: 0 };
	const record = state.record;
	const chain: Chain = {
		cache(config) {
			const modes = MODES.filter((key) => Object.hasOwn(config, key));
			if (modes.length > 1) throw new Error("one cache mode");
			advance(state, "cache");
			record.cache = config;
			return chain;
		},
		authenticate(...callerData) {
			if (callerData.includes("optional")) throw new Error("The method is authenticateOptional");
			advance(state, "authenticate");
			record.auth = { mode: true, callerData };
			return chain;
		},
		authenticateOptional(...callerData) {
			advance(state, "authenticateOptional");
			record.auth = { mode: "optional", callerData };
			return chain;
		},
		authorize(fn) {
			advance(state, "authorize");
			record.authorize = fn;
			return chain;
		},
		preloader(fn) {
			advance(state, "preloader");
			record.preloader = fn;
			return chain;
		},
		loader(fn) {
			advance(state, "loader");
			record.loader = fn;
			return chain;
		},
		response(fn) {
			advance(state, "response");
			record.response = fn;
			return chain;
		},
		head(fn) {
			advance(state, "head");
			record.head = fn;
			return chain;
		},
		render(fn) {
			advance(state, "render");
			record.render = fn;
			return chain;
		},
		record: () => ({ ...record }),
	};
	return chain;
}

export type Steps<B> = {
	cache: (config: CacheConfig) => B;
	authenticate: (...callerData: readonly string[]) => B;
	authenticateOptional: (...callerData: readonly string[]) => B;
	authorize: (fn: Authorize) => B;
	preloader: (fn: Step) => B;
	loader: (fn: Step) => B;
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
		preloader(fn) {
			chain.preloader(fn);
			return self();
		},
		loader(fn) {
			chain.loader(fn);
			return self();
		},
		head(fn) {
			chain.head(fn);
			return self();
		},
	};
}
