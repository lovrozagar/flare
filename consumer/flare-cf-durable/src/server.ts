import type { FlareMiddleware } from "flare/middleware"
import { createServer } from "flare/server"
import { router } from "./router"

const timingMiddleware: FlareMiddleware = (ctx) => {
	const start = Date.now()
	ctx.onResponse((response) => {
		const headers = new Headers(response.headers)
		headers.set("server-timing", `total;dur=${Date.now() - start}`)
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

/* Adds path-based header — tests middleware reading request URL */
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

export default createServer(router)
	.use(timingMiddleware, markerMiddleware, pathMiddleware)
	.serverContext(({ request }) => {
		const url = new URL(request.url)
		const now = Date.now()
		return {
			isoTimestamp: new Date(now).toISOString(),
			origin: url.origin,
			pathname: url.pathname,
			requestId: crypto.randomUUID(),
			timestamp: now,
			userAgent: request.headers.get("user-agent") ?? "unknown",
		}
	})
