import { RedirectResponse } from "../../src/errors/index.ts";
import type { AuthenticateFn, ResolvedRoute } from "../../src/loader-pipeline/index.ts";
import type { FlareMiddleware } from "../../src/middleware/index.ts";
import { createRouter, type MarkedRouterConfig } from "../../src/router-config/index.ts";
import type { RouteData, TreeNode } from "../../src/router-primitives/index.ts";
import { createTreeNode, insertRoute } from "../../src/router-primitives/index.ts";
import type { HandlerContext, ServerFnHandlerRegistration, ServerFnRegistration } from "../../src/server-fn/index.ts";
import { createServerHandler, type ServerHandler, type ServerHandlerConfig } from "../../src/server-handler/index.ts";

/* ── Route module factory ────────────────────────────────────────────── */

/**
 * Creates a lazy module loader that mimics what the generator produces.
 * Returns `() => Promise<{ default: ResolvedRoute }>`.
 */
function makeRouteModule(
	resolved: Partial<ResolvedRoute> & {
		variablePath: string;
		virtualPath: string;
	},
): () => Promise<{ default: unknown }> {
	return () =>
		Promise.resolve({
			default: { ...resolved },
		});
}

/* ── Route data factory ──────────────────────────────────────────────── */

function makeRouteData(overrides: {
	module: () => Promise<{ default: unknown }>;
	variablePath: string;
	virtualPath: string;
}): RouteData {
	return {
		e: overrides.virtualPath,
		o: {},
		p: overrides.module,
		t: "r" as const,
		v: overrides.variablePath,
		x: overrides.virtualPath,
	};
}

/* ── Route modules ───────────────────────────────────────────────────── */

/**
 * Root layout: wraps everything.
 * Renders: `[root-layout]{children}[/root-layout]`
 */
const rootLayoutModule = makeRouteModule({
	_type: "root-layout",
	render: (props: Record<string, unknown>) => `[root-layout]${String(props.children ?? "")}[/root-layout]`,
	variablePath: "_root_",
	virtualPath: "_root_",
});

/**
 * Home page: no loader, static content.
 * Renders: `[home]`
 */
const homePageModule = makeRouteModule({
	_type: "render",
	render: () => "[home]",
	variablePath: "_root_/home",
	virtualPath: "_root_/home",
});

/**
 * About page: loader + head config.
 * Loader returns `{ title: "About" }`.
 * Head returns `{ title: "About", description: "About us page" }`.
 * Renders: `[about:About]`
 */
const aboutPageModule = makeRouteModule({
	_type: "render",
	head: () => ({ description: "About us page", title: "About" }),
	loader: () => ({ title: "About" }),
	render: (props: Record<string, unknown>) => {
		const data = props.loaderData as { title: string };
		return `[about:${data.title}]`;
	},
	variablePath: "_root_/about",
	virtualPath: "_root_/about",
});

/**
 * User page: parameterized route.
 * Loader reads params.id from location.
 * Renders: `[user:42]`
 */
const userPageModule = makeRouteModule({
	_type: "render",
	loader: (ctx: Record<string, unknown>) => {
		const location = ctx.location as { params: Record<string, string> };
		return { userId: location.params.id ?? "unknown" };
	},
	render: (props: Record<string, unknown>) => {
		const data = props.loaderData as { userId: string };
		return `[user:${data.userId}]`;
	},
	variablePath: "_root_/users/[id]",
	virtualPath: "_root_/users/[id]",
});

/**
 * Dashboard page: requires authentication.
 * `.authenticate()` set → pipeline calls authenticateFn.
 * Loader receives auth object in context.
 * Renders: `[dashboard]`
 */
const dashboardPageModule = makeRouteModule({
	_type: "render",
	authenticate: [],
	loader: (ctx: Record<string, unknown>) => ({ user: ctx.auth }),
	render: (props: Record<string, unknown>) => {
		const data = props.loaderData as { user: unknown };
		return `[dashboard:${JSON.stringify(data.user)}]`;
	},
	variablePath: "_root_/dashboard",
	virtualPath: "_root_/dashboard",
});

/**
 * Broken page: loader throws.
 * Pipeline captures error as match error (status: "error").
 */
const brokenPageModule = makeRouteModule({
	_type: "render",
	loader: () => {
		throw new Error("Loader exploded");
	},
	render: () => "[broken:should-not-render]",
	variablePath: "_root_/broken",
	virtualPath: "_root_/broken",
});

/**
 * Redirect page: loader throws RedirectResponse.
 * Pipeline captures as redirect match → handler returns 302/NDJSON redirect.
 */
const redirectPageModule = makeRouteModule({
	_type: "render",
	loader: () => {
		throw new RedirectResponse({ to: "/about" });
	},
	render: () => "[redirect:should-not-render]",
	variablePath: "_root_/old",
	virtualPath: "_root_/old",
});

/**
 * Blog layout: group-based layout `(blog)`.
 * Renders: `[blog-layout]{children}[/blog-layout]`
 */
const blogLayoutModule = makeRouteModule({
	_type: "layout",
	render: (props: Record<string, unknown>) => `[blog-layout]${String(props.children ?? "")}[/blog-layout]`,
	variablePath: "_root_/(blog)",
	virtualPath: "_root_/(blog)",
});

/**
 * Blog post page: nested under blog layout.
 * Loader returns `{ content: "post body" }`.
 * Head returns `{ title: "Blog Post" }`.
 * Renders: `[post:post body]`
 */
const blogPostPageModule = makeRouteModule({
	_type: "render",
	head: () => ({ title: "Blog Post" }),
	loader: () => ({ content: "post body" }),
	render: (props: Record<string, unknown>) => {
		const data = props.loaderData as { content: string };
		return `[post:${data.content}]`;
	},
	variablePath: "_root_/(blog)/post",
	virtualPath: "_root_/(blog)/post",
});

/**
 * Headers page: sets custom response headers.
 */
const headersPageModule = makeRouteModule({
	_type: "render",
	headers: () => ({ "X-Custom": "test-value" }),
	loader: () => ({ ok: true }),
	render: () => "[headers-page]",
	variablePath: "_root_/with-headers",
	virtualPath: "_root_/with-headers",
});

/**
 * Preloader page: has a preloader that returns context.
 * Loader receives preloaderContext.
 */
const preloaderPageModule = makeRouteModule({
	_type: "render",
	loader: (ctx: Record<string, unknown>) => {
		const pre = ctx.preloaderContext as Record<string, unknown>;
		return { fromPreloader: pre.dbConn };
	},
	preloader: () => ({ dbConn: "pg://localhost" }),
	render: (props: Record<string, unknown>) => {
		const data = props.loaderData as { fromPreloader: string };
		return `[preloader:${data.fromPreloader}]`;
	},
	variablePath: "_root_/preloader-test",
	virtualPath: "_root_/preloader-test",
});

/**
 * Sitemap response route: returns raw XML Response via `.response()`.
 * No render, no SSR — server handler must short-circuit.
 */
const sitemapResponseModule = makeRouteModule({
	_type: "response",
	response: () =>
		new Response(
			[
				`<?xml version="1.0" encoding="UTF-8"?>`,
				`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
				"  <url><loc>https://example.com/</loc></url>",
				"</urlset>",
			].join("\n"),
			{ headers: { "Content-Type": "application/xml" } },
		),
	variablePath: "_root_/sitemap.xml",
	virtualPath: "_root_/sitemap.xml",
});

/* ── Tree builder ────────────────────────────────────────────────────── */

export function buildRouteTree(): TreeNode {
	const tree = createTreeNode();
	const routes: Array<{
		module: () => Promise<{ default: unknown }>;
		path: string;
		v: string;
		x: string;
	}> = [
		{ module: homePageModule, path: "/home", v: "_root_/home", x: "_root_/home" },
		{ module: aboutPageModule, path: "/about", v: "_root_/about", x: "_root_/about" },
		{ module: userPageModule, path: "/users/[id]", v: "_root_/users/[id]", x: "_root_/users/[id]" },
		{
			module: dashboardPageModule,
			path: "/dashboard",
			v: "_root_/dashboard",
			x: "_root_/dashboard",
		},
		{ module: brokenPageModule, path: "/broken", v: "_root_/broken", x: "_root_/broken" },
		{ module: redirectPageModule, path: "/old", v: "_root_/old", x: "_root_/old" },
		{
			module: blogPostPageModule,
			path: "/blog/post",
			v: "_root_/(blog)/post",
			x: "_root_/(blog)/post",
		},
		{
			module: headersPageModule,
			path: "/with-headers",
			v: "_root_/with-headers",
			x: "_root_/with-headers",
		},
		{
			module: preloaderPageModule,
			path: "/preloader-test",
			v: "_root_/preloader-test",
			x: "_root_/preloader-test",
		},
	];
	for (const r of routes) {
		insertRoute(tree, r.path, makeRouteData({ module: r.module, variablePath: r.v, virtualPath: r.x }));
	}

	/* Response-type route: raw Response, no SSR */
	insertRoute(tree, "/sitemap.xml", {
		e: "_root_/sitemap.xml",
		o: {},
		p: sitemapResponseModule,
		t: "x" as const,
		v: "/sitemap.xml",
		x: "_root_/sitemap.xml",
	} satisfies RouteData);

	return tree;
}

export function buildLayouts(): Record<string, () => Promise<{ default: unknown }>> {
	return {
		_root_: rootLayoutModule,
		"_root_/(blog)": blogLayoutModule,
	};
}

export function buildRouter(overrides?: Partial<MarkedRouterConfig>): MarkedRouterConfig {
	return createRouter({
		layouts: buildLayouts(),
		routeTree: buildRouteTree(),
		...overrides,
	});
}

export function buildHandler<TEnv = unknown>(overrides?: Partial<ServerHandlerConfig<TEnv>>): ServerHandler<TEnv> {
	const router = buildRouter();
	return createServerHandler({
		router,
		...overrides,
	} as ServerHandlerConfig<TEnv>);
}

export function makeRequest(path: string, init?: RequestInit): Request {
	return new Request(`http://localhost${path}`, init);
}

export function dataRequest(path: string, extraHeaders?: Record<string, string>): Request {
	return makeRequest(path, {
		headers: { "x-d": "1", ...extraHeaders },
	});
}

/* ── Authenticate helpers ────────────────────────────────────────────── */

export const alwaysAuthFn: AuthenticateFn = () => ({ id: "user-1", role: "admin" });
export const neverAuthFn: AuthenticateFn = () => null;

/* ── NDJSON parser ───────────────────────────────────────────────────── */

export interface NDJSONMessage {
	d?: unknown;
	e?: unknown;
	k?: string;
	m?: string;
	p?: unknown;
	r?: boolean;
	s?: number;
	t: string;
	u?: string;
}

export function parseNDJSON(body: string): NDJSONMessage[] {
	return body
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as NDJSONMessage);
}

/* ── HTML stream reader ──────────────────────────────────────────────── */

export async function readResponseBody(response: Response): Promise<string> {
	return response.text();
}

/* ── FlareState extractor ────────────────────────────────────────────── */

export interface FlareState {
	c: Record<string, unknown>;
	dk?: string[];
	e?: Array<{ message: string; name: string; source: string; stack?: string }>;
	m: Array<{ d: unknown; h?: unknown; i: string; p?: unknown; v: string }>;
	p: string;
	ph?: Array<{ head: unknown; matchId: string }>;
	q?: unknown[];
	r: Record<string, string | string[]>;
	s: Record<string, string>;
}

/**
 * Extract FlareState from HTML body.
 * Looks for `self.flare={...};` script injection.
 */
export function extractFlareState(html: string): FlareState | null {
	const match = html.match(/self\.flare=(\{.*?\});/);
	if (!match || !match[1]) return null;
	return JSON.parse(match[1]) as FlareState;
}

/* ── Exports ─────────────────────────────────────────────────────────── */

export {
	makeRouteData,
	makeRouteModule,
	rootLayoutModule,
	homePageModule,
	aboutPageModule,
	userPageModule,
	dashboardPageModule,
	brokenPageModule,
	redirectPageModule,
	blogLayoutModule,
	blogPostPageModule,
	headersPageModule,
	preloaderPageModule,
	sitemapResponseModule,
};

export type { FlareMiddleware, HandlerContext, ServerFnHandlerRegistration, ServerFnRegistration };
