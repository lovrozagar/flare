import type { Typed, TypesOf } from "./types.ts";

// The app's generated file and its own augmentation fill this (dx/types.md). The package declares no field, because
// a merged interface cannot redeclare a field with another type, so every reader below infers the field.
export interface FlareRegister {}

// One field of the register, or `unknown` when the app did not declare it.
export type RegisterField<R, K extends string> = R extends { [P in K]: infer V } ? V : unknown;

export type RegisteredAuth<R extends FlareRegister> =
	unknown extends RegisterField<R, "auth"> ? null : RegisterField<R, "auth">;

export type RegisteredEnv<R extends FlareRegister> = RegisterField<R, "env">;

// The query client type. The `./query` entry fills it by module augmentation, so core never names TanStack.
export interface QueryClientRegister {}

// A loader's `ctx.queryClient`, present when codegen found an import of `@lovrozagar/flare/query` (dx/types.md).
export type QueryClientField<R extends FlareRegister> = R extends { hasQueryClient: true }
	? { queryClient: QueryClientRegister extends { client: infer C } ? C : unknown }
	: {};

export type RegisteredServerContext<R extends FlareRegister> =
	unknown extends RegisterField<R, "serverContext"> ? Record<string, unknown> : RegisterField<R, "serverContext">;

type RootMarker<Part extends string> = Part extends `_${infer Body}_` ? (Body extends "" ? false : true) : false;

type SegmentParams<Part extends string> = Part extends `[[...${infer Name}]]`
	? { [K in Name]: string[] | undefined }
	: Part extends `[[${infer Name}]]`
		? { [K in Name]: string | undefined }
		: Part extends `[...${infer Name}]`
			? { [K in Name]: string[] }
			: Part extends `[_]${string}]`
				? {}
				: Part extends `[${infer Name}]`
					? { [K in Name]: string }
					: {};

type Parts<Id extends string> = Id extends `${infer Head}/${infer Tail}` ? [Head, ...Parts<Tail>] : [Id];

type ParamsOfParts<P extends readonly string[]> = P extends readonly [
	infer Head extends string,
	...infer Tail extends readonly string[],
]
	? RootMarker<Head> extends true
		? ParamsOfParts<Tail>
		: SegmentParams<Head> & ParamsOfParts<Tail>
	: {};

export type ExtractPathParams<Id extends string> = ParamsOfParts<Parts<Id>>;

export type RawSearch = Record<string, string | string[]>;

export type InferParams<R extends FlareRegister, Id extends string> = R extends {
	routeParams: infer Map extends object;
}
	? Id extends keyof Map
		? Map[Id]
		: ExtractPathParams<Id>
	: ExtractPathParams<Id>;

export type InferSearch<R extends FlareRegister, Id extends string> = R extends {
	routeSearchParams: infer Map extends object;
}
	? Id extends keyof Map
		? Map[Id]
		: RawSearch
	: RawSearch;

type Modules<R extends FlareRegister> = R extends { routeModules: infer M extends object } ? M : {};

// An app whose generated file filled `routeModules`. Before that, every route type stays loose (dx/types.md
// `unregistered fallback`).
export type Registered<R extends FlareRegister> = [keyof Modules<R>] extends [never] ? false : true;

type PageIds<R extends FlareRegister> = {
	[Id in keyof Modules<R> & string]: Modules<R>[Id] extends { _type: "page" } ? Id : never;
}[keyof Modules<R> & string];

// The generated `pageIds` names the page targets without reading a module's type, so a loader that throws `redirect()`
// does not loop through its own module (BUGS.md 105). A register written before it derives them from the modules.
export type To<R extends FlareRegister> = R extends { pageIds: infer Ids extends string }
	? Ids
	: [keyof Modules<R>] extends [never]
		? string
		: PageIds<R>;

export type From<R extends FlareRegister> = [keyof Modules<R>] extends [never] ? string : keyof Modules<R> & string;

type Empty<T> = keyof T extends never ? true : false;

// A required key makes `search` required. An all-optional object and the raw record stay optional.
type RequiredKeys<T> = {
	[K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

type SearchField<T> = [keyof T] extends [never]
	? { search?: never }
	: [RequiredKeys<T>] extends [never]
		? { search?: T }
		: { search: T };

type Checked<R extends FlareRegister, Id extends string> = (Empty<InferParams<R, Id>> extends true
	? { params?: never }
	: { params: InferParams<R, Id> }) &
	SearchField<InferSearch<R, Id>>;

// What `Link`, `navigate`, and `redirect` aim at: a page id with its params and search (dx/types.md). Unregistered,
// `to` is any string, params are not checked, and search is the raw record.
export type RouteTarget<R extends FlareRegister, Id extends To<R>> = (Registered<R> extends true
	? Checked<R, Id & string>
	: { params?: Readonly<Record<string, unknown>>; search?: RawSearch }) & {
	to: Id;
	hash?: string | undefined;
	replace?: boolean | undefined;
};

// What the data hooks return for `from`. Unregistered, the values are not known.
export type LoaderDataFrom<R extends FlareRegister, Id extends From<R>> =
	Registered<R> extends true ? (Id extends keyof Modules<R> ? LoaderDataOf<Modules<R>[Id]> : never) : unknown;

export type ParamsFrom<R extends FlareRegister, Id extends From<R>> =
	Registered<R> extends true ? InferParams<R, Id> : unknown;

export type SearchFrom<R extends FlareRegister, Id extends From<R>> =
	Registered<R> extends true ? InferSearch<R, Id> : unknown;

// `hole` marks a stored `"stream"` value the render did not run. useDeferred reads it as a client source, and a fill
// request brings the value (dx/defer.md).
export type Deferred<T> = {
	readonly __deferred: true;
	readonly key: string;
	readonly promise: Promise<T>;
	readonly hole?: true;
};

export type PropagationApp = FlareRegister & {
	auth: { userId: string };
	env: { site: string };
	serverContext: { requestId: string };
	routeModules: {
		_root_: { _type: "root" } & Typed<{ preloader: { requestId: string } }>;
		"_root_/about": { _type: "page" } & Typed<{ loaderData: { title: string }; preloader: { role: "admin"; n: 1 } }>;
		"_root_/users/[id]": { _type: "page" } & Typed<{ loaderData: { user: { name: string } } }>;
		"_root_/files/[...path]": { _type: "page" };
		"_root_/[[locale]]": { _type: "page" };
		"_root_/[[...rest]]": { _type: "page" };
		"_root_/[_]id]": { _type: "page" };
		"_root_/(blog)/post": { _type: "page" };
		"[locale]/_root_/about": { _type: "page" };
		"_root_/layout": { _type: "layout" } & Typed<{
			loaderData: { section: string };
			preloader: { role: "admin" | "editor"; theme: string };
		}>;
		"_root_/seg": { _type: "segment" };
		"_root_/echo": { _type: "page" };
		"_root_/clash": { _type: "page" } & Typed<{ preloader: { theme: number } }>;
		"_root_/orphan": { _type: "page" };
	};
	routeParents: {
		"_root_/layout": ["_root_"];
		"_root_/about": ["_root_", "_root_/layout"];
		"_root_/users/[id]": ["_root_"];
		"_root_/clash": ["_root_", "_root_/layout"];
		"_root_/orphan": ["_root_", "_root_/gone"];
	};
	routeParams: { "_root_/users/[id]": { id: number } };
	routeSearchParams: { "_root_/about": { page: number } };
	authModes: { "_root_/about": "optional" };
	hasQueryClient: true;
	routes: {
		"/about": { params: {} };
		"/users/[id]": { params: { id: string } };
		"/files/[...path]": { params: { path: string[] } };
		"/[[locale]]": { params: { locale: string | undefined } };
		"/[[...rest]]": { params: { rest: string[] | undefined } };
		"/[_]id]": { params: {} };
		"/post": { params: {} };
		"/[locale]/about": { params: { locale: string } };
		"/clash": { params: {} };
		"/orphan": { params: {} };
	};
};

export type ResolvedAuth<R extends FlareRegister, Mode extends true | "optional" | false> = Mode extends true
	? RegisteredAuth<R>
	: Mode extends "optional"
		? RegisteredAuth<R> | null
		: null;

// The validated search a route's `.input()` recorded, or the raw record (dx/types.md). The generated register names
// `routeSearchParams` with it, so no type is derived from text.
export type SearchOutput<Route> = TypesOf<Route> extends { search: infer S } ? S : RawSearch;

// The validated params a route's `.input()` recorded, or `never` when that file does not validate params.
export type ParamsOutput<Route> = TypesOf<Route> extends { params: infer P } ? P : never;

// The awaited data a route's `.loader()` recorded, or `void` when it has none.
export type LoaderDataOf<Route> = TypesOf<Route> extends { loaderData: infer D } ? D : void;
