import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { FlareMiddleware } from "flare/middleware"
import { onPage, virtualPath } from "flare/middleware"
import { apiProxy } from "flare/middleware/api-proxy"
import { cdnProxy } from "flare/middleware/cdn-proxy"
import { i18n } from "flare/middleware/i18n"
import { markdownNegotiation } from "flare/middleware/markdown-negotiation"
import { loadPrerenderArtifacts } from "flare/prerender"
import type { CdnPurgeAdapter } from "flare/server"
import { createServer } from "flare/server"
import type { FlareStore, FlareStoreEntry } from "flare/store"
import { router } from "./router"

const kvStore = new Map<string, { entry: FlareStoreEntry; expiresAt?: number }>()

const store: FlareStore = {
	delete(key: string) {
		kvStore.delete(key)
		return Promise.resolve()
	},
	deleteByTags(tags: string[]) {
		for (const [key, item] of kvStore) {
			if (item.entry.tags?.some((t) => tags.includes(t))) {
				kvStore.delete(key)
			}
		}
		return Promise.resolve()
	},
	get(key: string) {
		const item = kvStore.get(key)
		if (!item) return Promise.resolve(null)
		if (item.expiresAt !== undefined && Date.now() > item.expiresAt) {
			kvStore.delete(key)
			return Promise.resolve(null)
		}
		return Promise.resolve(item.entry)
	},
	set(key: string, entry: FlareStoreEntry, ttl?: number) {
		kvStore.set(key, {
			entry,
			expiresAt: ttl !== undefined ? Date.now() + ttl * 1000 : undefined,
		})
		return Promise.resolve()
	},
}

const serverDir = dirname(fileURLToPath(import.meta.url))
loadPrerenderArtifacts(join(serverDir, "../static"), store)

const cdnPurgedTags = new Set<string>()
const cdnPurgeAdapter: CdnPurgeAdapter = {
	purgeByKeys(keys: string[]) {
		for (const key of keys) cdnPurgedTags.add(`key:${key}`)
		return Promise.resolve()
	},
	purgeByTags(tags: string[]) {
		for (const tag of tags) cdnPurgedTags.add(tag)
		return Promise.resolve()
	},
}

const timingMiddleware: FlareMiddleware = (ctx) => {
	const start = Date.now()
	const requestId = `req-${start}-${Math.random().toString(36).slice(2, 8)}`
	ctx.onResponse((response) => {
		const headers = new Headers(response.headers)
		headers.set("x-request-id", requestId)
		headers.set("x-timing", `${Date.now() - start}ms`)
		return new Response(response.body, {
			headers,
			status: response.status,
			statusText: response.statusText,
		})
	})
	return ctx.next()
}

const markerMiddleware: FlareMiddleware = (ctx) => {
	ctx.onResponse((response) => {
		const headers = new Headers(response.headers)
		headers.set("x-middleware-ran", "true")
		return new Response(response.body, {
			headers,
			status: response.status,
			statusText: response.statusText,
		})
	})
	return ctx.next()
}

const pathMiddleware: FlareMiddleware = (ctx) => {
	const url = new URL(ctx.request.url)
	ctx.onResponse((response) => {
		const headers = new Headers(response.headers)
		headers.set("x-matched-path", url.pathname)
		headers.set("x-has-query", url.search.length > 1 ? "true" : "false")
		return new Response(response.body, {
			headers,
			status: response.status,
			statusText: response.statusText,
		})
	})
	return ctx.next()
}

const dashScopedMiddleware: FlareMiddleware = (ctx) => {
	ctx.onResponse((response) => {
		const headers = new Headers(response.headers)
		headers.set("x-dash-scoped", "true")
		return new Response(response.body, {
			headers,
			status: response.status,
			statusText: response.statusText,
		})
	})
	return ctx.next()
}

const virtualScopedMiddleware: FlareMiddleware = (ctx) => {
	ctx.onResponse((response) => {
		const headers = new Headers(response.headers)
		headers.set("x-virtual-matched", "true")
		return new Response(response.body, {
			headers,
			status: response.status,
			statusText: response.statusText,
		})
	})
	return ctx.next()
}

const routeOnlyMiddleware: FlareMiddleware = onPage((ctx) => {
	ctx.onResponse((response) => {
		const headers = new Headers(response.headers)
		headers.set("x-route-only", "true")
		headers.set("x-request-type", ctx.requestType)
		return new Response(response.body, {
			headers,
			status: response.status,
			statusText: response.statusText,
		})
	})
	return ctx.next()
})

const testApi = async (request: Request) => {
	const url = new URL(request.url)
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			headers: { "Content-Type": "application/json" },
			status,
		})

	if (url.pathname === "/health") {
		return json({ ok: true, path: url.pathname })
	}
	if (url.pathname === "/echo") {
		if (request.method === "POST") {
			const body = await request.json()
			return json({ body, method: "POST" })
		}
		return json({ method: "GET", msg: url.searchParams.get("msg") })
	}
	if (url.pathname === "/data.json") {
		return json({ format: "json" })
	}
	if (url.pathname === "/feed.xml") {
		return new Response("<feed/>", {
			headers: { "Content-Type": "application/xml" },
		})
	}
	if (url.pathname === "/download/test.csv") {
		return new Response("id,name\n1,Alice\n2,Bob\n", {
			headers: {
				"Content-Disposition": 'attachment; filename="test.csv"',
				"Content-Type": "text/csv",
			},
		})
	}
	if (url.pathname === "/retry-reset") {
		const { resetRetryCounter } = await import("./routes/retry-test")
		resetRetryCounter()
		return json({ reset: true })
	}
	if (url.pathname === "/error") {
		throw new Error("test mount error")
	}
	return json({ error: "Not found", status: 404 }, 404)
}

const cdnObjects = new Set(["hello.txt"])

const proxyTarget = {
	fetch(request: Request) {
		const url = new URL(request.url)
		return Promise.resolve(
			new Response(JSON.stringify({ proxied: true, path: url.pathname }), {
				headers: { "Content-Type": "application/json" },
			}),
		)
	},
}

export const handler = createServer(router)
	.mount("/api", testApi)
	.use(
		cdnProxy({
			bucket: () => ({
				get(key: string) {
					if (!cdnObjects.has(key)) return Promise.resolve(null)
					return Promise.resolve({
						body: new ReadableStream({
							start(controller) {
								controller.enqueue(new TextEncoder().encode("cdn-hello"))
								controller.close()
							},
						}),
						etag: '"cdn-hello"',
						httpMetadata: { contentType: "text/plain" },
						size: 9,
					})
				},
			}),
			pathPrefix: "/cdn",
		}),
	)
	.use(
		apiProxy({
			pathPrefix: "/proxy",
			target: () => proxyTarget,
		}),
	)
	.use(markdownNegotiation())
	.use(i18n({ skip: ["/api", "/cdn", "/proxy"] }))
	.use(timingMiddleware, markerMiddleware, pathMiddleware)
	.use("/dashboard/*", dashScopedMiddleware)
	.use(virtualPath("/users/[id]"), virtualScopedMiddleware)
	.use(routeOnlyMiddleware)
	.authenticateFn(({ callerData, request }) => {
		const auth = request.headers.get("x-test-auth")
		if (auth) {
			return {
				callerData: callerData ?? [],
				userId: auth,
			}
		}
		return null
	})
	.serverContext(({ request }) => ({
		requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
		userAgent: request.headers.get("user-agent") ?? "unknown",
	}))
	.cache({
		cdn: cdnPurgeAdapter,
		headers: true,
		revalidateSecret: "e2e-test-secret",
		store,
	})
	.keepalive({ interval: 5_000 })
	.sitemap({
		engines: {
			google: {
				credentials: {
					clientEmail: "test@test.iam.gserviceaccount.com",
					privateKey: "fake-key",
				},
				siteUrl: "http://localhost:4101",
			},
		},
		secret: "e2e-sitemap-secret",
		sitemapUrl: "http://localhost:4101/sitemap.xml",
	})

export default handler
