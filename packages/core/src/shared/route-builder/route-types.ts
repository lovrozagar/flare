import type { JSX } from "@solidjs/web"
import type { Bounded } from "./boundaries.ts"
import type {
	CacheConfig,
	Effects,
	HeadOptions,
	Intercept,
	LoaderContext,
	LoaderData,
	ResponseOptions,
	RouteHeaders,
	RouteInput,
} from "./chain.ts"
import type { RouteRecord } from "./page.ts"
import type { HeadConfig, SecurityConfig } from "./types.ts"
import type {
	Deferred,
	ExtractPathParams,
	FlareRegister,
	From,
	QueryClientField,
	RawSearch,
	Registered,
	RegisteredEnv,
	ResolvedAuth,
} from "./register.ts"
import type { InputTypes, Typed, TypesOf, ValidatorOutput } from "./types.ts"

// The auth a route resolves to: required, optional, or none (dx/types.md).
export type AuthMode = true | "optional" | false

// What a typed builder knows so far. `preloader` is this route's own return. The parents' come from the register,
// so a route's type never reads its own entry there.
export type RouteState = {
	id: string
	root: boolean
	auth: AuthMode
	params: unknown
	search: unknown
	// What `.input()` validated, so the record names only a validated side.
	input: object
	preloader: object
	loaderData: unknown
}

// A route before any step: bracket params, the raw search, and the auth its parents seed.
export type InitialState<Id extends string, Root extends boolean> = {
	id: Id
	root: Root
	auth: Root extends true ? false : ParentAuth<FlareRegister, Id>
	params: ExtractPathParams<Id>
	search: RawSearch
	input: {}
	preloader: {}
	loaderData: void
}

// `.input()` replaces each side it validates. The other keeps its default (dx/types.md).
export type WithInput<S extends RouteState, I> = {
	[P in keyof RouteState]: P extends "params"
		? I extends { params: infer V }
			? ValidatorOutput<V>
			: S["params"]
		: P extends "search"
			? I extends { searchParams: infer V }
				? ValidatorOutput<V>
				: S["search"]
			: P extends "input"
				? S["input"] & InputTypes<I>
				: S[P]
}

// One field of the state replaced.
export type With<S extends RouteState, K extends keyof RouteState, V> = {
	[P in keyof RouteState]: P extends K ? V : S[P]
}

type Parents<R, Id> = R extends { routeParents: infer Map }
	? Id extends keyof Map
		? Map[Id] extends readonly string[]
			? Map[Id]
			: []
		: []
	: []

type ModeOf<R, Id> = R extends { authModes: infer Map } ? (Id extends keyof Map ? Map[Id] : false) : false

// The strictest mode on the path: `true` beats `"optional"` beats `false` (dx/types.md).
type Strictest<Modes> = true extends Modes ? true : "optional" extends Modes ? "optional" : false

export type ParentAuth<R, Id> = Strictest<{ [K in keyof Parents<R, Id>]: ModeOf<R, Parents<R, Id>[K]> }[number]>

// A parent's own preloader return. A parent the register does not list makes the context `never`, not `{}`.
type OwnPreloader<R, Id> = R extends { routeModules: infer Map }
	? Id extends keyof Map
		? TypesOf<Map[Id]> extends { preloader: infer P }
			? P
			: {}
		: never
	: {}

// Two returns key by key: a key both set takes both types, so an incompatible pair makes that key `never` and leaves
// the rest as they are, where `&` of two conflicting literals would collapse the whole object (plan 21 11.2). A
// `never` side stays `never`. Each member of a union merges on its own, so a discriminated return still narrows, and a
// key keeps its `?` (BUGS.md 275).
type Merged<A, B> = [A] extends [never]
	? never
	: [B] extends [never]
		? never
		: A extends unknown
			? B extends unknown
				? Flat<Omit<A, keyof B> & Omit<B, keyof A> & BothSet<A, B>>
				: never
			: never

// The keys both set: optional when both make it optional.
type BothSet<A, B> = {
	[K in keyof A & keyof B as OptionalIn<A, K> extends true ? (OptionalIn<B, K> extends true ? never : K) : K]: A[K] &
		B[K]
} & {
	[
		K in keyof A & keyof B as OptionalIn<A, K> extends true ? (OptionalIn<B, K> extends true ? K : never) : never
	]?: A[K] & B[K]
}

type OptionalIn<T, K extends keyof T> = {} extends Pick<T, K> ? true : false

type Flat<T> = { [K in keyof T]: T[K] }

type Intersect<R, List> = List extends readonly [infer Head, ...infer Tail]
	? Merged<OwnPreloader<R, Head>, Intersect<R, Tail>>
	: {}

// Every parent's return, outside-in. The same key narrows, and incompatible types make that key `never`.
export type ParentContext<R, Id> = Intersect<R, Parents<R, Id>>

// What `usePreloaderContext({ from })` reads: the parents, then that route's own return. Unregistered, a record.
export type PreloaderFrom<R extends FlareRegister, Id extends From<R>> =
	Registered<R> extends true ? Merged<ParentContext<R, Id>, OwnPreloader<R, Id>> : Record<string, unknown>

// Parents, then this route's own return. The root has no parent, so its own return replaces `{}`.
export type Accumulated<S extends RouteState> = S["root"] extends true
	? S["preloader"]
	: Merged<ParentContext<FlareRegister, S["id"]>, S["preloader"]>

type Shared<S extends RouteState> = {
	auth: ResolvedAuth<FlareRegister, S["auth"]>
	request: Request
	env: RegisteredEnv<FlareRegister>
	params: S["params"]
	search: S["search"]
}

// What preloader and `authorize` read: the parents' context only. The root's has no `preloaderContext`.
export type GuardContext<S extends RouteState> = Shared<S> &
	(S["root"] extends true ? {} : { preloaderContext: ParentContext<FlareRegister, S["id"]> })

// What the loader reads: the accumulated context and `defer`.
export type LoaderStepContext<S extends RouteState> = Shared<S> &
	QueryClientField<FlareRegister> & {
		preloaderContext: Accumulated<S>
		defer: <T>(fn: () => Promise<T>, options?: Parameters<LoaderContext["defer"]>[1]) => Deferred<T>
	}

// What `.response()` reads: no loader data and no `defer`.
export type ResponseContext<S extends RouteState> = Shared<S> & { preloaderContext: Accumulated<S> }

// What `.head()` and render read: no auth, env, or request (dx/types.md).
export type ViewContext<S extends RouteState> = {
	params: S["params"]
	search: S["search"]
	loaderData: S["loaderData"]
	preloaderContext: Accumulated<S>
}

// A layout and the root also render the next slot.
export type RenderProps<S extends RouteState, Kind extends "page" | "layout" | "root"> = Kind extends "page"
	? ViewContext<S>
	: ViewContext<S> & { children: JSX.Element }

// The record a typed route exports. `_type` names its kind, and the type-only field carries what its steps recorded.
export type TypedRecord<S extends RouteState, Kind extends string> = {
	readonly _type: Kind
} & Typed<S["input"] & { loaderData: S["loaderData"]; preloader: S["preloader"] }>

export type RouteKind = "page" | "layout" | "root"

// The params and search a route's boundaries read.
type Located<S extends RouteState> = { params: S["params"]; search: S["search"] }

// After `.authorize()`: a public route reads the registered session or `null`. A stricter seed stays (dx/types.md).
type Authorized<S extends RouteState> = S["auth"] extends false ? With<S, "auth", "optional"> : S

// The steps in their order (dx/builder.md, chain.ts ORDER). A step removes itself and every step before it, so a
// method called too early is absent from the type as it throws at runtime (BUGS.md B9). The loader and `.response()`
// exclude each other, and a route has one authenticate step.
type Sequence = [
	"intercept",
	"cache",
	"input",
	"authenticate",
	"authenticateOptional",
	"authorize",
	"effects",
	"preloader",
	"loader",
	"head",
	"headers",
	"security",
]

type Through<Step, Steps, Gone extends string = never> = Steps extends [infer First extends string, ...infer Rest]
	? First extends Step
		? Gone | First
		: Through<Step, Rest, Gone | First>
	: Gone

// `.response()` sits at the loader's place, before the view steps, so the loader and every step after it take it away,
// as the runtime refuses it with `order: response` (BUGS.md 355).
export type StepsGone<Step extends string> =
	| Through<Step, Sequence>
	| ("loader" extends Through<Step, Sequence> ? "response" : never)
	| (Step extends "authenticate" ? "authenticateOptional" : never)

// The steps every route builder has. A typed step returns a builder of the new state. `G` is the steps already gone.
export type BuilderSteps<S extends RouteState, K extends RouteKind, G extends string = never> = {
	cache(config: CacheConfig): RouteBuilder<S, K, G | StepsGone<"cache">>
	input<I extends RouteInput>(config: I): RouteBuilder<WithInput<S, I>, K, G | StepsGone<"input">>
	// `"optional"` is a method of its own, so a caller named that does not type-check (dx/types.md).
	authenticate<const C extends readonly string[]>(
		...callerData: [Extract<C[number], "optional">] extends [never] ? C : never
	): RouteBuilder<With<S, "auth", true>, K, G | StepsGone<"authenticate">>
	authenticateOptional(
		...callerData: readonly string[]
	): RouteBuilder<With<S, "auth", "optional">, K, G | StepsGone<"authenticateOptional">>
	// On a public route, `authorize` makes the chain read the session, so its own context already has it (B26).
	authorize(
		fn: (ctx: GuardContext<Authorized<S>>) => boolean | Promise<boolean>,
	): RouteBuilder<Authorized<S>, K, G | StepsGone<"authorize">>
	effects(effects: Effects): RouteBuilder<S, K, G | StepsGone<"effects">>
	preloader<P>(
		fn: (ctx: GuardContext<S>) => P | Promise<P>,
	): RouteBuilder<With<S, "preloader", P extends object ? P : {}>, K, G | StepsGone<"preloader">>
	loader<L extends LoaderData>(
		fn: (ctx: LoaderStepContext<S>) => L | Promise<L>,
	): RouteBuilder<With<S, "loaderData", L>, K, G | StepsGone<"loader">>
	head(fn: (ctx: ViewContext<S>) => HeadConfig, options?: HeadOptions): RouteBuilder<S, K, G | StepsGone<"head">>
	headers(fn: (ctx: ViewContext<S>) => RouteHeaders): RouteBuilder<S, K, G | StepsGone<"headers">>
	security(
		config: SecurityConfig | ((ctx: ViewContext<S>) => SecurityConfig),
	): RouteBuilder<S, K, G | StepsGone<"security">>
	render(fn: (props: RenderProps<S, K>) => JSX.Element): Bounded<RouteRecord & TypedRecord<S, K>, Located<S>>
}

// Only a page intercepts and answers with `.response()`.
export type PageSteps<S extends RouteState, G extends string = never> = {
	intercept(config: Intercept): RouteBuilder<S, "page", G | StepsGone<"intercept">>
	response(
		fn: (ctx: ResponseContext<S>) => Response | Promise<Response>,
		options?: ResponseOptions,
	): RouteRecord & TypedRecord<S, "page">
}

export type RouteBuilder<S extends RouteState, K extends RouteKind, G extends string = never> = Omit<
	BuilderSteps<S, K, G> & (K extends "page" ? PageSteps<S, G> : {}),
	G
>

// A route whose parents already require auth starts with `.authenticateOptional()` gone: it cannot loosen to optional
// (dx/types.md `cannot loosen`, BUGS.md 354). The seed is known when the builder is made, so the steps carry it on in
// `G` as a called step's removal is.
export type SeedGone<Id extends string, R = FlareRegister> =
	ParentAuth<R, Id> extends true ? "authenticateOptional" : never
