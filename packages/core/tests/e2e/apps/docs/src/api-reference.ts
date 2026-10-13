// The API reference: one entry per public export, keyed by its catch-all path.
export type ApiEntry = { path: string; name: string; from: string; signature: string; note: string };

export const apiEntries: readonly ApiEntry[] = [
	{
		path: "server/create-server",
		name: "createServer",
		from: "@lovrozagar/flare/server",
		signature: "createServer({ router, site?, authenticate?, locale?, middleware?, mounts?, store?, static? })",
		note: "The production fetch handler. One per process.",
	},
	{
		path: "server/create-middleware",
		name: "createMiddleware",
		from: "@lovrozagar/flare/server",
		signature: "createMiddleware((ctx) => ctx.next())",
		note: "Types a middleware. The filter is set where it is listed.",
	},
	{
		path: "router/create-router",
		name: "createRouter",
		from: "@lovrozagar/flare",
		signature: "createRouter({ layouts, routeTree, notFoundMode?, viewTransitions?, theme?, locale? })",
		note: "The isomorphic router both graphs import.",
	},
	{
		path: "routes/create-page",
		name: "createPage",
		from: "@lovrozagar/flare",
		signature: "createPage(id).cache().input().authenticate().preloader().loader().head().render()",
		note: "Each method once, in order.",
	},
	{
		path: "server-fn/create-server-fn",
		name: "createServerFn",
		from: "@lovrozagar/flare/server-fn",
		signature: "createServerFn({ method? }).input().authorize().handler()",
		note: "A typed RPC. The client chunk holds only the stub.",
	},
];

export function apiEntryOf(path: readonly string[]): ApiEntry | undefined {
	const joined = path.join("/");
	return apiEntries.find((entry) => entry.path === joined);
}
