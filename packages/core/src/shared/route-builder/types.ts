export type { CacheConfig } from "./chain.ts";

export type AuthenticateMode = true | "optional";

export type SeoImage = { url: string; alt?: string; width?: number; height?: number; type?: string };
export type HeadScript = { src?: string; children?: string; async?: boolean; extra?: Record<string, string> };
type Bag = Record<string, unknown>;

export type HeadConfig = {
	title?: string | undefined;
	description?: string | undefined;
	canonical?: string | undefined;
	keywords?: string | undefined;
	css?: string | readonly string[] | undefined;
	languages?: Record<string, string> | undefined;
	jsonLd?: ReadonlyArray<Record<string, unknown>> | undefined;
	images?: readonly SeoImage[] | undefined;
	favicons?: Record<string, string> | undefined;
	robots?: Bag | undefined;
	openGraph?: Bag | undefined;
	twitter?: Bag | undefined;
	meta?: (Bag & { viewport?: string | false }) | undefined;
	custom?: {
		links?: ReadonlyArray<Record<string, string>>;
		meta?: ReadonlyArray<Record<string, string>> | undefined;
		scripts?: readonly HeadScript[];
		styles?: ReadonlyArray<{ children: string }>;
	};
};

// The key of the type-only field a route record carries. Nothing at runtime holds it.
declare const ROUTE_TYPES: unique symbol;

// What a typed step recorded: the `.input()` outputs and the `.loader()` data (dx/types.md). The record never holds
// it at runtime. `SearchOutput`, `ParamsOutput`, and the generated register read it.
export type RouteTypes = { params?: unknown; search?: unknown; loaderData?: unknown };

export type Typed<T extends RouteTypes> = { readonly [ROUTE_TYPES]?: T };

// A Standard Schema names its output on `types`, else on what `validate` resolves to.
type StandardOutput<S> =
	NonNullable<S extends { types?: infer T } ? T : undefined> extends { output: infer O }
		? O
		: S extends { validate: (value: never) => infer R }
			? Awaited<R> extends { value: infer O }
				? O
				: unknown
			: unknown;

// The output of a Standard Schema, a `{ parse }`, or a function. A promise is awaited, as the runner awaits it.
export type ValidatorOutput<V> = V extends { "~standard": infer S }
	? StandardOutput<S>
	: V extends { parse: (value: never) => infer O }
		? Awaited<O>
		: V extends (value: never) => infer O
			? Awaited<O>
			: unknown;

// Each side `.input()` validates replaces that side. The other keeps its default.
export type InputTypes<I> = (I extends { params: infer P } ? { params: ValidatorOutput<P> } : {}) &
	(I extends { searchParams: infer S } ? { search: ValidatorOutput<S> } : {});

// What a typed route record recorded, or nothing.
export type TypesOf<R> = R extends Typed<infer T> ? NonNullable<T> : {};
