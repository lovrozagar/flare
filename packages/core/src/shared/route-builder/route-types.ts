import type { JSX } from "@solidjs/web";
import type { Bounded } from "./boundaries.ts";
import type { CacheConfig, Effects, Intercept, LoaderContext, LoaderData, RouteInput } from "./chain.ts";
import type { RouteRecord } from "./page.ts";
import type { HeadConfig } from "./types.ts";
import type {
	Deferred,
	ExtractPathParams,
	FlareRegister,
	From,
	RawSearch,
	Registered,
	RegisteredEnv,
	ResolvedAuth,
} from "./register.ts";
import type { InputTypes, Typed, TypesOf, ValidatorOutput } from "./types.ts";

// The auth a route resolves to: required, optional, or none (dx/types.md).
export type AuthMode = true | "optional" | false;

// What a typed builder knows so far. `preloader` is this route's own return. The parents' come from the register,
// so a route's type never reads its own entry there.
export type RouteState = {
	id: string;
	root: boolean;
	auth: AuthMode;
	params: unknown;
	search: unknown;
	// What `.input()` validated, so the record names only a validated side.
	input: object;
	preloader: object;
	loaderData: unknown;
};

// A route before any step: bracket params, the raw search, and the auth its parents seed.
export type InitialState<Id extends string, Root extends boolean> = {
	id: Id;
	root: Root;
	auth: Root extends true ? false : ParentAuth<FlareRegister, Id>;
	params: ExtractPathParams<Id>;
	search: RawSearch;
	input: {};
	preloader: {};
	loaderData: void;
};

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
				: S[P];
};

// One field of the state replaced.
export type With<S extends RouteState, K extends keyof RouteState, V> = {
	[P in keyof RouteState]: P extends K ? V : S[P];
};

type Parents<R, Id> = R extends { routeParents: infer Map }
	? Id extends keyof Map
		? Map[Id] extends readonly string[]
			? Map[Id]
			: []
		: []
	: [];

type ModeOf<R, Id> = R extends { authModes: infer Map } ? (Id extends keyof Map ? Map[Id] : false) : false;

// The strictest mode on the path: `true` beats `"optional"` beats `false` (dx/types.md).
type Strictest<Modes> = true extends Modes ? true : "optional" extends Modes ? "optional" : false;

export type ParentAuth<R, Id> = Strictest<{ [K in keyof Parents<R, Id>]: ModeOf<R, Parents<R, Id>[K]> }[number]>;

// A parent's own preloader return. A parent the register does not list makes the context `never`, not `{}`.
type OwnPreloader<R, Id> = R extends { routeModules: infer Map }
	? Id extends keyof Map
		? TypesOf<Map[Id]> extends { preloader: infer P }
			? P
			: {}
		: never
	: {};

type Intersect<R, List> = List extends readonly [infer Head, ...infer Tail]
	? OwnPreloader<R, Head> & Intersect<R, Tail>
	: {};

// Every parent's return, outside-in. The same key narrows, and incompatible types make that key `never`.
export type ParentContext<R, Id> = Intersect<R, Parents<R, Id>>;

// What `usePreloaderContext({ from })` reads: the parents, then that route's own return. Unregistered, a record.
export type PreloaderFrom<R extends FlareRegister, Id extends From<R>> =
	Registered<R> extends true ? ParentContext<R, Id> & OwnPreloader<R, Id> : Record<string, unknown>;

// Parents, then this route's own return. The root has no parent, so its own return replaces `{}`.
export type Accumulated<S extends RouteState> = S["root"] extends true
	? S["preloader"]
	: ParentContext<FlareRegister, S["id"]> & S["preloader"];

type Shared<S extends RouteState> = {
	auth: ResolvedAuth<FlareRegister, S["auth"]>;
	request: Request;
	env: RegisteredEnv<FlareRegister>;
	params: S["params"];
	search: S["search"];
};

// What preloader and `authorize` read: the parents' context only. The root's has no `preloaderContext`.
export type GuardContext<S extends RouteState> = Shared<S> &
	(S["root"] extends true ? {} : { preloaderContext: ParentContext<FlareRegister, S["id"]> });

// What the loader reads: the accumulated context and `defer`.
export type LoaderStepContext<S extends RouteState> = Shared<S> & {
	preloaderContext: Accumulated<S>;
	defer: <T>(fn: () => Promise<T>, options?: Parameters<LoaderContext["defer"]>[1]) => Deferred<T>;
};

// What `.response()` reads: no loader data and no `defer`.
export type ResponseContext<S extends RouteState> = Shared<S> & { preloaderContext: Accumulated<S> };

// What `.head()` and render read: no auth, env, or request (dx/types.md).
export type ViewContext<S extends RouteState> = {
	params: S["params"];
	search: S["search"];
	loaderData: S["loaderData"];
	preloaderContext: Accumulated<S>;
};

// A layout and the root also render the next slot.
export type RenderProps<S extends RouteState, Kind extends "page" | "layout" | "root"> = Kind extends "page"
	? ViewContext<S>
	: ViewContext<S> & { children: JSX.Element };

// The record a typed route exports. `_type` names its kind, and the type-only field carries what its steps recorded.
export type TypedRecord<S extends RouteState, Kind extends string> = {
	readonly _type: Kind;
} & Typed<S["input"] & { loaderData: S["loaderData"]; preloader: S["preloader"] }>;

export type RouteKind = "page" | "layout" | "root";

// The params and search a route's boundaries read.
type Located<S extends RouteState> = { params: S["params"]; search: S["search"] };

// The steps every route builder has. A typed step returns a builder of the new state. `.authenticateOptional()` on a
// route whose parents already require auth takes an argument it can never get, so it does not type-check (dx/types.md).
export type BuilderSteps<S extends RouteState, K extends RouteKind> = {
	cache(config: CacheConfig): RouteBuilder<S, K>;
	input<I extends RouteInput>(config: I): RouteBuilder<WithInput<S, I>, K>;
	authenticate(...callerData: readonly string[]): RouteBuilder<With<S, "auth", true>, K>;
	authenticateOptional(
		...callerData: S["auth"] extends true ? [never] : readonly string[]
	): RouteBuilder<With<S, "auth", "optional">, K>;
	authorize(
		fn: (ctx: GuardContext<S>) => boolean | Promise<boolean>,
	): RouteBuilder<S["auth"] extends false ? With<S, "auth", "optional"> : S, K>;
	effects(effects: Effects): RouteBuilder<S, K>;
	preloader<P>(
		fn: (ctx: GuardContext<S>) => P | Promise<P>,
	): RouteBuilder<With<S, "preloader", P extends object ? P : {}>, K>;
	loader<L extends LoaderData>(
		fn: (ctx: LoaderStepContext<S>) => L | Promise<L>,
	): RouteBuilder<With<S, "loaderData", L>, K>;
	head(fn: (ctx: ViewContext<S>) => HeadConfig): RouteBuilder<S, K>;
	render(fn: (props: RenderProps<S, K>) => JSX.Element): Bounded<RouteRecord & TypedRecord<S, K>, Located<S>>;
};

// Only a page intercepts and answers with `.response()`.
export type PageSteps<S extends RouteState> = {
	intercept(config: Intercept): RouteBuilder<S, "page">;
	response(fn: (ctx: ResponseContext<S>) => Response | Promise<Response>): RouteRecord & TypedRecord<S, "page">;
};

export type RouteBuilder<S extends RouteState, K extends RouteKind> = BuilderSteps<S, K> &
	(K extends "page" ? PageSteps<S> : {});
