// The raw params a `tags` or `params` function reads, the values the store key uses (B32).
export type RawParamsOf = Record<string, string | string[]>;

// A list of tags, or a function of the raw params. The argument is `params` only (dx/cache.md).
export type CacheTags = readonly string[] | ((ctx: { params: RawParamsOf }) => readonly string[]);

type DeferMode = "resolve" | "stream";

// The slugs a static or build-time ISR route renders. `ctx.params` holds the parent params.
export type ParamsFn = (ctx: { params: RawParamsOf }) => readonly RawParamsOf[] | Promise<readonly RawParamsOf[]>;

export type SsrCache = {
	ttl: string;
	staleTime?: string;
	tags?: CacheTags;
	defer?: DeferMode;
};

// `true` and `{}` are on demand. A set `revalidate` stores for twice that, capped at 24h (B47).
export type IsrCache = true | { revalidate?: string; defer?: DeferMode; params?: ParamsFn; dynamicParams?: boolean };

// A function is shorthand for `{ params }`.
export type SsgCache = true | { defer?: DeferMode } | ParamsFn | { params: ParamsFn; defer?: DeferMode };

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
	tags?: CacheTags | undefined;
	allowCookies?: boolean | undefined;
};

type CacheMode =
	| { ssr: SsrCache; isr?: never; ssg?: never }
	| { isr: IsrCache; ssr?: never; ssg?: never }
	| { ssg: SsgCache; ssr?: never; isr?: never };

// One mode at most. `cdn` and `client` sit beside it or stand alone.
export type CacheConfig =
	| (CacheMode & { client?: ClientCache | undefined; cdn?: CdnCache | undefined })
	| { client: ClientCache; cdn?: CdnCache | undefined; ssr?: never; isr?: never; ssg?: never }
	| { cdn: CdnCache; client?: ClientCache | undefined; ssr?: never; isr?: never; ssg?: never };

export type AuthenticateMode = true | "optional";

// The CSP source-list directives (dx/server.md CSP directives). One the object names replaces that directive; the rest
// keep their defaults.
export type CspDirectiveName =
	| "default-src"
	| "script-src"
	| "style-src"
	| "style-src-elem"
	| "style-src-attr"
	| "base-uri"
	| "object-src"
	| "img-src"
	| "font-src"
	| "connect-src"
	| "worker-src"
	| "frame-src"
	| "frame-ancestors"
	| "form-action"
	| "media-src";

export type CspDirectives = { readonly [Name in CspDirectiveName]?: readonly string[] } & {
	readonly "upgrade-insecure-requests"?: boolean;
	readonly "block-all-mixed-content"?: boolean;
};

// The Permissions-Policy features flare writes, each `false` (denied) by default (dx/server.md Permissions-Policy).
export type PermissionFeature =
	| "accelerometer"
	| "browsing-topics"
	| "camera"
	| "geolocation"
	| "gyroscope"
	| "interest-cohort"
	| "magnetometer"
	| "microphone"
	| "payment"
	| "usb";

export type PermissionsPolicy = { readonly [Feature in PermissionFeature]?: false | "self" | true | readonly string[] };

// The security headers a server or a route sets (dx/server.md SecurityConfig). Omission keeps the default, `false`
// removes the header, and a string replaces its value. A string CSP sends no nonce (B68).
export type SecurityConfig = {
	readonly "Content-Security-Policy"?: CspDirectives | string | false;
	readonly "Strict-Transport-Security"?: string | false;
	readonly "X-Content-Type-Options"?: string | false;
	readonly "Referrer-Policy"?: string | false;
	readonly "X-Frame-Options"?: string | false;
	readonly "Cross-Origin-Opener-Policy"?: string | false;
	readonly "Cross-Origin-Resource-Policy"?: string | false;
	readonly "Permissions-Policy"?: PermissionsPolicy | string | false;
	readonly "X-Powered-By"?: string | false;
};

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

// The favicons the head writes, one `<link>` each (dx/head.md favicons). Another key was accepted and dropped.
export type Favicons = {
	ico?: string | undefined;
	svg?: string | undefined;
	appleTouchIcon?: string | undefined;
	"96x96"?: string | undefined;
	"192x192"?: string | undefined;
	"512x512"?: string | undefined;
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
	favicons?: Favicons | undefined;
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
