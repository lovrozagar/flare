export type { CacheConfig } from "./chain.ts";

export type AuthenticateMode = true | "optional";

export type SeoImage = { url: string; alt?: string; width?: number; height?: number; type?: string };
export type HeadScript = { src?: string; children?: string; async?: boolean; extra?: Record<string, string> };

// An `og:audio` entry. A video adds its size (dx/head.md).
export type OgAudio = { url: string; type?: string | undefined; secureUrl?: string | undefined };
export type OgVideo = OgAudio & { width?: number | undefined; height?: number | undefined };

// The record shapes of dx/head.md, so a typo or a wrong value fails in the route, not as a missing tag.
export type OpenGraph = {
	type?: "website" | "article" | "profile" | "product" | undefined;
	title?: string | undefined;
	description?: string | undefined;
	url?: string | undefined;
	siteName?: string | undefined;
	locale?: string | undefined;
	alternateLocale?: readonly string[] | undefined;
	images?: readonly SeoImage[] | undefined;
	audio?: readonly OgAudio[] | undefined;
	videos?: readonly OgVideo[] | undefined;
};

export type TwitterCard = {
	card?: "summary" | "summary_large_image" | "player" | "app" | undefined;
	site?: string | undefined;
	creator?: string | undefined;
	title?: string | undefined;
	description?: string | undefined;
	images?: ReadonlyArray<{ url: string; alt?: string | undefined }> | undefined;
};

export type Robots = {
	index?: boolean | undefined;
	follow?: boolean | undefined;
	noarchive?: boolean | undefined;
	noimageindex?: boolean | undefined;
	"max-image-preview"?: "none" | "standard" | "large" | undefined;
	"max-snippet"?: number | undefined;
	"max-video-preview"?: number | undefined;
};

type YesNo = "yes" | "no" | undefined;

export type HeadMeta = {
	charset?: string | undefined;
	// `false` removes a parent viewport (B83).
	viewport?: string | false | undefined;
	applicationName?: string | undefined;
	author?: string | undefined;
	creator?: string | undefined;
	publisher?: string | undefined;
	generator?: string | undefined;
	manifest?: string | undefined;
	appleMobileWebAppCapable?: YesNo;
	appleMobileWebAppTitle?: string | undefined;
	appleMobileWebAppStatusBarStyle?: "default" | "black" | "black-translucent" | undefined;
	mobileWebAppCapable?: YesNo;
};

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
	robots?: Robots | undefined;
	openGraph?: OpenGraph | undefined;
	twitter?: TwitterCard | undefined;
	meta?: HeadMeta | undefined;
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
export type RouteTypes = { params?: unknown; search?: unknown; loaderData?: unknown; preloader?: unknown };

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

type StandardInput<S> =
	NonNullable<S extends { types?: infer T } ? T : undefined> extends { input: infer I } ? I : unknown;

// What a validator accepts: a Standard Schema's `types.input`, or the parameter of `parse` or of the function. A
// server function's caller passes this, because the validator runs on the server (dx/server-fn.md).
export type ValidatorInput<V> = V extends { "~standard": infer S }
	? StandardInput<S>
	: V extends { parse: (value: infer I) => unknown }
		? Known<I>
		: V extends (value: infer I) => unknown
			? Known<I>
			: unknown;

// An unannotated parameter is `never` from its constraint, and it accepts anything.
type Known<I> = [I] extends [never] ? unknown : I;

// Each side `.input()` validates replaces that side. The other keeps its default.
export type InputTypes<I> = (I extends { params: infer P } ? { params: ValidatorOutput<P> } : {}) &
	(I extends { searchParams: infer S } ? { search: ValidatorOutput<S> } : {});

// What a typed route record recorded, or nothing.
export type TypesOf<R> = R extends Typed<infer T> ? NonNullable<T> : {};
