// The docs route map's pages (B94): each one's document status. `logs` are the flare errors the page's server logs on
// purpose, and `shows` the element that proves the page rendered the value that logs. docs-smoke loads each in every
// project; docs-a11y scans each with axe.
export const PAGES: readonly { path: string; status: number; logs?: readonly string[]; shows?: string }[] = [
	{ path: "/", status: 200 },
	{ path: "/hr", status: 200 },
	{ path: "/ar", status: 200 },
	{ path: "/docs/routing", status: 200 },
	{ path: "/docs/media", status: 200 },
	{ path: "/hr/docs/caching", status: 200 },
	{ path: "/api/server/create-server", status: 200 },
	{ path: "/examples", status: 200 },
	{ path: "/examples/a/b?tab=data", status: 200 },
	{ path: "/search?q=route", status: 200 },
	{ path: "/changelog", status: 200, logs: ["The stats service is down"], shows: "#broken-error" },
	{ path: "/playground", status: 200 },
	{ path: "/login", status: 200 },
	{ path: "/[flare]", status: 200 },
	{ path: "/docs/zzz/qq", status: 404 },
	{ path: "/admin", status: 401 },
]
