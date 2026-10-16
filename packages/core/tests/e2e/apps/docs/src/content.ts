// The docs prose. One short entry per feature area. Each names the page of this site that runs the feature.
export type Doc = {
	slug: string
	title: string
	summary: string
	demo?: { label: string; path: string }
	sections: readonly { id: string; title: string; body: string }[]
	// A link to a section of another doc, by its slug and the section's id.
	see?: { slug: string; hash: string; label: string }
	code: string
}

export const docs: readonly Doc[] = [
	{
		slug: "routing",
		title: "Routing",
		summary: "Routes are folders under src/routes. The folder path is the route id, and brackets make params.",
		demo: { label: "Optional catch-all", path: "/examples/a/b" },
		sections: [
			{
				id: "files",
				title: "Files",
				body: "A page is name.page.tsx. A layout wraps the pages below it. A group folder adds no URL segment.",
			},
			{
				id: "params",
				title: "Params",
				body: "[id], [...path], [[locale]], and [[...rest]] are params. [_]flare] is the literal segment [flare].",
			},
		],
		code: 'export const route = createPage("_root_/users/[id]")\n  .loader(({ params }) => ({ id: params.id }))\n  .render((props) => <h1>{props.loaderData.id}</h1>);',
	},
	{
		slug: "data-loading",
		title: "Data loading",
		summary: "Preloaders build context outside in. Loaders run in parallel after auth and return the page's data.",
		sections: [
			{
				id: "preloader",
				title: "Preloader context",
				body: "Each level's preloader return merges into the context its children see. A child key wins.",
			},
			{
				id: "hooks",
				title: "Hooks",
				body: "useLoaderData, useParams, useSearch, useMatch, and usePreloaderContext read any route by id.",
			},
		],
		see: { slug: "routing", hash: "params", label: "Route params" },
		code: 'createLayout("_root_/(guide)")\n  .preloader(() => ({ section: "guide" }))\n  .loader(() => ({ nav: readNav() }));',
	},
	{
		slug: "defer",
		title: "Deferred data",
		summary: "ctx.defer streams a slow value after the shell. useDeferred reads it under a Solid <Loading> boundary.",
		demo: { label: "Changelog", path: "/changelog" },
		sections: [
			{
				id: "modes",
				title: "Resolve and stream",
				body: "A stored page awaits a resolve defer before it is written. A stream defer stays a hole and fills after hydrate.",
			},
			{
				id: "errors",
				title: "Errors",
				body: "A rejected defer is caught by the nearest <Errored>. The rest of the page stays.",
			},
		],
		code: "const stats = useDeferred(() => props.loaderData.stats);\n<Loading fallback={<Skeleton />}>{stats().views}</Loading>",
	},
	{
		slug: "server-functions",
		title: "Server functions",
		summary: "createServerFn runs authenticate, input, authorize, then the handler. The client gets a typed stub.",
		demo: { label: "Playground", path: "/playground" },
		sections: [
			{ id: "wire", title: "Wire", body: "GET input rides ?_i, POST input is the JSON body. A stream yields NDJSON." },
			{
				id: "errors",
				title: "Errors",
				body: "Production hides a thrown message behind a digest. markSafeError keeps a message you chose to show.",
			},
		],
		code: "export const echo = createServerFn()\n  .input({ parse: (v: { text: string }) => v })\n  .handler(({ input }) => input.text);",
	},
	{
		slug: "caching",
		title: "Caching",
		summary: "One mode per page: ssg at build, isr on demand, or a shared ssr render. cdn sets the public header.",
		demo: { label: "API reference", path: "/api/server/create-server" },
		sections: [
			{
				id: "modes",
				title: "Modes",
				body: "SSG reads the prerendered seeds. ISR stores on the first request. Shared SSR stores a live render for its ttl.",
			},
			{
				id: "purge",
				title: "Purge",
				body: "revalidate({ tags }) bumps a tag epoch, and the next request renders again.",
			},
		],
		code: 'createPage("_root_/api/[...path]")\n  .cache({ ssr: { ttl: "10m", tags: ["api"] }, cdn: { maxAge: "1m" } })',
	},
	{
		slug: "navigation",
		title: "Navigation",
		summary: "Link and navigate fetch loader data as NDJSON and commit before the history push.",
		sections: [
			{
				id: "prefetch",
				title: "Prefetch",
				body: "modules: all after idle by default. A link may prefetch on intent, in the viewport, or not at all.",
			},
			{
				id: "intercept",
				title: "Intercepts",
				body: "Open search from any page and it renders as a modal over the page you were on.",
			},
		],
		code: '<Link to="[[locale]]/_root_/search" prefetch="intent">Search</Link>',
	},
	{
		slug: "auth",
		title: "Auth",
		summary: "createServer({ authenticate }) runs once per request. Routes require, read, or authorize the session.",
		demo: { label: "Admin", path: "/admin" },
		sections: [
			{
				id: "modes",
				title: "Modes",
				body: ".authenticate() requires a session. .authenticateOptional() reads it. .authorize() decides 403.",
			},
			{
				id: "boundaries",
				title: "Boundaries",
				body: "401 and 403 paint the nearest unauthenticatedRender or unauthorizedRender.",
			},
		],
		code: 'createPage("_admin_/admin")\n  .authenticate("admin")\n  .authorize(({ auth }) => auth.role === "admin")',
	},
	{
		slug: "middleware",
		title: "Middleware and mounts",
		summary: "Middleware wraps the router in list order. A mount hands a prefix to another fetch app.",
		demo: { label: "Health mount", path: "/healthz" },
		sections: [
			{
				id: "filters",
				title: "Filters",
				body: "exact, prefix, and kind pick which requests enter. respond and bypass answer without the router.",
			},
			{
				id: "mounts",
				title: "Mounts",
				body: "A mount sees the path with its prefix removed. Finalize still adds the security headers.",
			},
		],
		code: 'mounts: [mount("/healthz", () => Response.json({ ok: true }))]',
	},
	{
		slug: "styling",
		title: "Styling",
		summary: "Tailwind is the app's own Vite plugin. Flare ships one stylesheet and inlines the critical rules.",
		sections: [
			{
				id: "sheet",
				title: "One sheet",
				body: "Production preloads the sheet and swaps it in, so it never blocks the first paint.",
			},
			{
				id: "modules",
				title: "CSS modules",
				body: "Component styles are Vite CSS modules. The code block on this page is one.",
			},
		],
		code: 'import styles from "./code-block.module.css";\n<pre class={styles.block}>…</pre>',
	},
	{
		slug: "i18n",
		title: "Locales, theme, direction",
		summary:
			"An optional [[locale]] segment picks the language. Theme and direction persist per browser and sync tabs.",
		sections: [
			{
				id: "locale",
				title: "Locale",
				body: "The path wins, then the cookie, then Accept-Language. The default locale has no segment.",
			},
			{
				id: "sync",
				title: "Cross-tab",
				body: "setTheme, setDirection, and setLocale tell your other tabs over one BroadcastChannel.",
			},
		],
		code: 'const { locale, setLocale } = useLocale();\nsetLocale("hr");',
	},
	{
		slug: "seo",
		title: "Head and SEO",
		summary:
			".head() merges from the root down. The build writes sitemap.xml and robots.txt from the routes it rendered.",
		demo: { label: "sitemap.xml", path: "/sitemap.xml" },
		sections: [
			{
				id: "head",
				title: "Head",
				body: "title, canonical, hreflang, JSON-LD, Open Graph, Twitter, favicons, and robots in one object.",
			},
			{
				id: "llms",
				title: "Text routes",
				body: "/llms.txt is a .response() page. It returns a Response and renders nothing.",
			},
		],
		code: '.head(() => ({ title: "Flare docs", openGraph: { siteName: "Flare" } }))',
	},
	{
		slug: "media",
		title: "Images and fonts",
		summary: "Image serves webp widths from a ?image import. Fonts come from the registry or your own file.",
		sections: [
			{
				id: "image",
				title: "Image",
				body: "Responsive, fixed, and fill modes, a blur placeholder, and priority for the hero.",
			},
			{
				id: "fonts",
				title: "Fonts",
				body: "Inter is a registry font. The code font is createFont over a local woff2 with fallback metrics.",
			},
		],
		code: 'import hero from "./hero.jpg?image";\n<Image src={hero} alt="" priority placeholder="blur" blurDataURL={blur} />',
	},
]

export function docOf(slug: string): Doc | undefined {
	return docs.find((doc) => doc.slug === slug)
}
