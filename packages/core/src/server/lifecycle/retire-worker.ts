import { finalize } from "./finalize.ts"

// The worker a retired path answers. A browser that still has a worker registered at that path, v0's
// `/service-worker.js` say, checks it for an update on each visit and installs this in its place: it clears every
// cache the old one kept, unregisters, and reloads each page it controlled, so the next load comes from the network
// and nothing is registered any more (plan 21 16.1, dx/server.md Migrating from v0).
export const RETIRE_SCRIPT = `self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys()
			await Promise.all(names.map((name) => caches.delete(name)))
			await self.registration.unregister()
			const pages = await self.clients.matchAll({ type: "window" })
			await Promise.all(pages.map((page) => page.navigate(page.url).catch(() => undefined)))
		})(),
	)
})
`

export type RetireOption = string | readonly string[] | undefined

// The paths `createServer({ retireServiceWorker })` names, checked at startup: each a pathname of its own, with no
// query, fragment, or empty segment, as a browser asks for a registered worker's script.
export function checkRetired(option: RetireOption): void {
	for (const path of [option ?? []].flat()) {
		if (
			typeof path !== "string" ||
			!/^\/[^?#\s]*$/.test(path) ||
			path.includes("//") ||
			path.endsWith("/") ||
			!parsed(path)
		) {
			throw new Error(`createServer: retireServiceWorker takes pathnames such as "/service-worker.js", not ${path}`)
		}
	}
}

// A request's pathname is parsed, so a path its parse would spell otherwise, a dot segment raw or escaped, never matches
// (BUGS.md 328).
function parsed(path: string): boolean {
	return new URL(path, "http://flare.invalid").pathname === path
}

// Whether this request pathname is a retired worker's.
export function isRetired(option: RetireOption, pathname: string): boolean {
	return [option ?? []].flat().includes(pathname)
}

// A GET or HEAD for a retired path: the script, never stored, with the security set.
export function retiredWorker(headers: Headers, method: string): Response | undefined {
	if (method !== "GET" && method !== "HEAD") return undefined
	const typed = new Headers(headers)
	typed.set("content-type", "text/javascript; charset=utf-8")
	return finalize({ status: 200, body: method === "HEAD" ? "" : RETIRE_SCRIPT, headers: typed })
}
