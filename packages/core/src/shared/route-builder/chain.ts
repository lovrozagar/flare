import type { JSX } from "@solidjs/web"
import { withBoundaries, type Located } from "./boundaries.ts"
import type { RouteRecord } from "./page.ts"
import type { BuilderSteps, RouteBuilder, RouteKind, RouteState, TypedRecord } from "./route-types.ts"
import type { Deferred } from "./register.ts"
import type { Validator } from "../validation/index.ts"
import type { CacheConfig, HeadConfig, SecurityConfig } from "./types.ts"

// The cache types live in types.ts. These names stay importable from here.
export type {
	CacheConfig,
	CacheTags,
	CdnCache,
	ClientCache,
	IsrCache,
	ParamsFn,
	PrefetchTrigger,
	RoutePrefetch,
	SsgCache,
	SsrCache,
} from "./types.ts"

// `.input()`: each side's validator receives the raw record, and its output replaces that side for the match's
// later callbacks and render props (dx/builder.md).
// Each side's validator receives that side's raw record (dx/types.md), so it may type its parameter with it.
// At least one side: `.input({})` validates nothing, so it does not type-check and it throws (dx/types.md `input empty`).
export type RouteInput =
	| { params: Validator<RawRecord>; searchParams?: Validator<RawRecord> }
	| { params?: Validator<RawRecord>; searchParams: Validator<RawRecord> }

type RawRecord = Record<string, string | string[]>

export type PreloaderContext = Record<string, unknown>

// What preloader, authorize, and loader receive (dx/types.md). Render does not receive auth. The root's
// preloader and authorize get no preloaderContext; every later callback does.
export type StepContext = {
	auth: unknown
	request: Request
	env: unknown
	params: unknown
	search: unknown
	// A typed route reads its own accumulated shape. The runtime only passes it through.
	preloaderContext?: unknown
}

export type ChainAuth = { mode: true | "optional"; callerData: readonly string[] }

// A callback the chain stores. Method syntax checks its parameter bivariantly, so a typed route's callback, whose
// context is narrower than the runtime one, is stored as it is and is called with the runtime context.
export type Callback<Ctx, Out> = { bivarianceHack(ctx: Ctx): Out }["bivarianceHack"]

type Step = Callback<StepContext, unknown>

type Raw = Record<string, string | string[]>

export type EffectPlace = { hash: string; pathname: string; search: string; params: Raw }

// `effects` on the client (dx/builder.md). Both read the raw records, never a validated search (B31).
export type Effects = {
	loaderDeps?: (ctx: { search: Raw; params: Raw }) => unknown[]
	shouldRefetch?: (ctx: {
		trigger: "initial" | "navigation" | "revalidation"
		location: { current: EffectPlace; next: EffectPlace }
		params: Raw
		search: Raw
	}) => boolean
}

// The loader alone gets `defer` (dx/defer.md).
export type LoaderContext = StepContext & {
	defer: <T>(fn: () => Promise<T>, options?: { key?: string; prerender?: "resolve" | "stream" }) => Deferred<T>
}

// Loader data is an object or nothing. A primitive cannot stay live through the hooks, so it does not
// type-check and throws in dev (dx/builder.md).
// A thenable is excluded, so an async loader's value is checked too: every Promise is an object.
export type LoaderData = (object & { then?: never }) | null | undefined

type Load = Callback<LoaderContext, LoaderData | Promise<LoaderData>>

type Authorize = Callback<StepContext, boolean | Promise<boolean>>

// A .response() page answers with its own Response. It still passes through finalize (dx/builder.md).
export type Respond = Callback<StepContext, Response | Promise<Response>>

// What `.head()`, `.headers()`, and `.security()` read (dx/types.md).
type View = { params: unknown; search: unknown; loaderData: unknown; preloaderContext: unknown }

type Head = Callback<View, HeadConfig>

// Response headers for a match. An undefined value keeps the parent's (dx/builder.md `headers(fn)`).
export type RouteHeaders = Record<string, string | readonly string[] | undefined>

type Headers = Callback<View, RouteHeaders>

// A config, or a function of the four view fields. It gets no nonce: the policy decides the nonce (B68).
export type RouteSecurity = SecurityConfig | Callback<View, SecurityConfig>

// A page gets no children. A layout and the root also get the next slot (dx/types.md).
export type Render = Callback<
	{
		loaderData: unknown
		params: Located["params"]
		search: Located["search"]
		preloaderContext: unknown
		children?: JSX.Element
	},
	JSX.Element
>

// A client navigation from one of `from` opens the target in `InterceptOutlet`. `render` is a label (dx/builder.md).
export type Intercept = { from: readonly string[]; render: string }

export type ChainRecord = {
	intercept?: Intercept
	cache?: CacheConfig
	input?: RouteInput
	auth?: ChainAuth
	authorize?: Authorize
	effects?: Effects
	preloader?: Step
	loader?: Load
	response?: Respond
	head?: Head
	// `.head(fn, options)`. `replace: true` makes the route's head the whole head, no parent merged (dx/head.md).
	headOptions?: HeadOptions
	// `.response(fn, options)`: the methods it answers (dx/builder.md).
	responseOptions?: ResponseOptions
	headers?: Headers
	security?: RouteSecurity
	render?: Render
}

export type HeadOptions = { replace?: boolean }

// The methods a `.response()` page answers besides HEAD, which follows GET. None declared is GET (plan 21 13.5).
export type ResponseMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS"
export type ResponseOptions = { methods?: readonly ResponseMethod[] }

// A step's options ride beside its value, under `<step>Options`.
type StepOptions = HeadOptions | ResponseOptions

export type Chain = {
	intercept: (config: Intercept) => Chain
	cache: (config: CacheConfig) => Chain
	input: (config: RouteInput) => Chain
	authenticate: (...callerData: readonly string[]) => Chain
	authenticateOptional: (...callerData: readonly string[]) => Chain
	authorize: (fn: Authorize) => Chain
	effects: (effects: Effects) => Chain
	preloader: (fn: Step) => Chain
	loader: (fn: Load) => Chain
	response: (fn: Respond, options?: ResponseOptions) => Chain
	head: (fn: Head, options?: HeadOptions) => Chain
	headers: (fn: Headers) => Chain
	security: (config: RouteSecurity) => Chain
	render: (fn: Render) => Chain
	record: () => ChainRecord
}

// The order of dx/builder.md. loader and response share a slot because they are mutually exclusive. The key
// order is not the step order: a page's own `intercept` and `response` come first and `render` last, so the steps
// between them are the ones every typed builder forwards.
const ORDER = {
	intercept: 0,
	response: 8,
	cache: 1,
	input: 2,
	authenticate: 3,
	authenticateOptional: 4,
	authorize: 5,
	effects: 6,
	preloader: 7,
	loader: 8,
	head: 10,
	headers: 11,
	security: 12,
	render: 13,
} as const
type Name = keyof typeof ORDER
const MODES = ["ssr", "isr", "ssg"] as const

type ChainState = { used: Set<Name>; record: ChainRecord; at: number }

function advance(state: ChainState, step: Name): void {
	if (state.used.has(step)) throw new Error(`${step} twice`)
	if (step === "response" && state.used.has("loader")) throw new Error("loader and response are exclusive")
	if (step === "loader" && state.used.has("response")) throw new Error("loader and response are exclusive")
	if (step.startsWith("authenticate") && state.record.auth !== undefined) throw new Error("authenticate twice")
	if (state.at > ORDER[step]) throw new Error(`order: ${step}`)
	state.at = ORDER[step]
	state.used.add(step)
}

export function createChain(_id: string): Chain {
	const state: ChainState = { used: new Set(), record: {}, at: 0 }
	const record = state.record
	// Every step checks its place in the order, then stores one record field under its own name. The two auth
	// steps store `auth`.
	// A step's options, only `.head()`'s so far, ride beside its value: one generic store measured smaller than a
	// head-only one in `createPage` (tests/size, 1111 against 1118).
	const put = <K extends keyof ChainRecord & Name>(step: K, value: ChainRecord[K], options?: StepOptions): Chain => {
		advance(state, step)
		record[step] = value
		if (options) Reflect.set(record, `${step}Options`, options)
		return chain
	}
	const auth = (step: "authenticate" | "authenticateOptional", value: ChainAuth): Chain => {
		advance(state, step)
		record.auth = value
		return chain
	}
	const chain: Chain = {
		intercept(config) {
			if (config.from.length === 0 || typeof config.render !== "string") {
				throw new Error("intercept needs route ids in from and a render label")
			}
			return put("intercept", { from: [...config.from], render: config.render })
		},
		cache(config) {
			if (MODES.filter((key) => Object.hasOwn(config, key)).length > 1) throw new Error("one cache mode")
			return put("cache", config)
		},
		input(config) {
			if (config.params === undefined && config.searchParams === undefined) {
				throw new Error("input needs params or searchParams")
			}
			return put("input", config)
		},
		authenticate(...callerData) {
			if (callerData.includes("optional")) throw new Error("The method is authenticateOptional")
			return auth("authenticate", { mode: true, callerData })
		},
		authenticateOptional: (...callerData) => auth("authenticateOptional", { mode: "optional", callerData }),
		authorize: (fn) => put("authorize", fn),
		effects(effects) {
			if (effects.loaderDeps === undefined && effects.shouldRefetch === undefined) {
				throw new Error("effects needs loaderDeps or shouldRefetch")
			}
			return put("effects", effects)
		},
		preloader: (fn) => put("preloader", fn),
		loader: (fn) => put("loader", fn),
		response: (fn, options) => put("response", fn, options),
		head: (fn, options) => put("head", fn, options),
		headers: (fn) => put("headers", fn),
		security: (config) => put("security", config),
		render: (fn) => put("render", fn),
		record: () => ({ ...record }),
	}
	return chain
}

type Next<K extends RouteKind> = <T extends RouteState>() => RouteBuilder<T, K>

// Every typed step but `render` forwards to the chain and returns the next builder. The names are ORDER's keys
// between a page's own two steps and `render`.
function forwarded<S extends RouteState, K extends RouteKind>(
	chain: Chain,
	next: Next<K>,
): Pick<BuilderSteps<S, K>, Exclude<keyof BuilderSteps<S, K>, "render">>
function forwarded(chain: Chain, next: () => unknown): object {
	return Object.fromEntries(
		Object.keys(ORDER)
			.slice(2, -1)
			.map((name) => [
				name,
				// The chain's steps are closures and never read `this`.
				(...args: unknown[]): unknown => (Reflect.get(chain, name)(...args), next()),
			]),
	)
}

// One chain behind every typed builder. A typed step stores on the chain and returns `next()`, a builder of the new
// state over the same chain, so the type changes without a cast. `finish` builds the record render returns.
export function typedSteps<S extends RouteState, K extends RouteKind>(
	chain: Chain,
	next: Next<K>,
	finish: () => RouteRecord & { readonly _type: K },
): BuilderSteps<S, K> {
	return {
		...forwarded<S, K>(chain, next),
		render(fn) {
			chain.render(fn)
			return withBoundaries<RouteRecord & TypedRecord<S, K>, { params: S["params"]; search: S["search"] }>(finish())
		},
	}
}
