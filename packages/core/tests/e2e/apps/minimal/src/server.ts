import {
	createAssetsStore,
	createMemoryStore,
	createMiddleware,
	createServer,
	type FlareStore,
} from "@lovrozagar/flare/server"
import { fileURLToPath } from "node:url"
import { fileAssets } from "@lovrozagar/flare/stores/fs"
import { serverFns } from "./_gen/server-fns.gen.ts"
import { router } from "./router.ts"

// One store for the process, built outside any request (dx/store.md). Only /stored has a cache mode. `site` is an
// https placeholder: a shared render never fetches it.
const store = createMemoryStore()

// The prerendered seeds (dx/store.md). On Workers the ASSETS binding serves the client output. On Node and Bun the
// files sit beside the built server, in `<outDir>/client`. `vite dev` has none, so an ssg page renders live there.
function seeds(env: unknown): FlareStore {
	const binding: unknown = typeof env === "object" && env !== null ? Reflect.get(env, "ASSETS") : undefined
	if (typeof binding === "object" && binding !== null && "fetch" in binding && typeof binding.fetch === "function") {
		const fetch = binding.fetch.bind(binding)
		return createAssetsStore((path) => fetch(new URL(path, "http://assets")))
	}
	return createAssetsStore(fileAssets(fileURLToPath(new URL("../client", import.meta.url))))
}

// The runtime that rendered the response, as its user agent names it: `Node.js/…`, `Bun/…`, or `Cloudflare-Workers`.
// boot.test asserts it, so a dev or prod boot cannot answer from another runtime unnoticed (BUGS.md 76).
const runtime = createMiddleware(async (ctx) => {
	const response = await ctx.next()
	response.headers.set("x-runtime", navigator.userAgent)
})

// An old build's service worker, as v0 registered one: it serves every page from itself. minimal.test registers it at
// /legacy-sw.js while its cookie is set, then drops the cookie, so the worker's next update check gets the one
// `retireServiceWorker` answers there (plan 21 16.1).
const STAND_IN = `self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", (event) => {
	if (event.request.mode !== "navigate") return
	const page = '<!doctype html><p id="old-build">old build</p>'
	event.respondWith(new Response(page, { headers: { "content-type": "text/html" } }))
})
`

const standIn = createMiddleware((ctx) => {
	if (new URL(ctx.request.url).pathname !== "/legacy-sw.js") return undefined
	if (!(ctx.request.headers.get("cookie") ?? "").includes("stand-in=1")) return undefined
	return new Response(STAND_IN, { headers: { "content-type": "text/javascript", "cache-control": "no-store" } })
})

export const server = createServer({
	router,
	serverFns,
	site: "https://flare.test",
	store,
	static: seeds,
	middleware: [runtime, standIn],
	retireServiceWorker: "/legacy-sw.js",
})
