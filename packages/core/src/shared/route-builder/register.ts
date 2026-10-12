import type { TypesOf } from "./types.ts";

export interface FlareRegister {
	auth?: unknown;
	env?: unknown;
	serverContext?: unknown;
	routes?: object;
	routeModules?: object;
	routeParents?: object;
	authModes?: object;
	routeParams?: object;
	routeSearchParams?: object;
	hasQueryClient?: true;
}

export type RegisteredAuth<R extends FlareRegister> = R["auth"] extends infer Auth
	? unknown extends Auth
		? null
		: Auth
	: null;

export type RegisteredEnv<R extends FlareRegister> = unknown extends R["env"] ? unknown : R["env"];

export type RegisteredServerContext<R extends FlareRegister> = unknown extends R["serverContext"]
	? Record<string, unknown>
	: R["serverContext"];

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

type PageIds<R extends FlareRegister> = {
	[Id in keyof Modules<R> & string]: Modules<R>[Id] extends { _type: "page" } ? Id : never;
}[keyof Modules<R> & string];

export type To<R extends FlareRegister> = [keyof Modules<R>] extends [never] ? string : PageIds<R>;

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

export type LinkProps<R extends FlareRegister, Id extends To<R>> = (Empty<InferParams<R, Id & string>> extends true
	? { params?: never }
	: { params: InferParams<R, Id & string> }) &
	SearchField<InferSearch<R, Id & string>> & {
		to: Id;
		hash?: string;
		replace?: boolean;
	};

export type Deferred<T> = { readonly __deferred: true; readonly key: string; readonly promise: Promise<T> };

export type PropagationApp = FlareRegister & {
	auth: { userId: string };
	env: { site: string };
	serverContext: { requestId: string };
	routeModules: {
		_root_: { _type: "root" };
		"_root_/about": { _type: "page" };
		"_root_/users/[id]": { _type: "page" };
		"_root_/files/[...path]": { _type: "page" };
		"_root_/[[locale]]": { _type: "page" };
		"_root_/[[...rest]]": { _type: "page" };
		"_root_/[_]id]": { _type: "page" };
		"_root_/(blog)/post": { _type: "page" };
		"[locale]/_root_/about": { _type: "page" };
		"_root_/layout": { _type: "layout" };
		"_root_/seg": { _type: "segment" };
		"_root_/echo": { _type: "page" };
	};
	routeParents: { "_root_/about": ["_root_"] };
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
