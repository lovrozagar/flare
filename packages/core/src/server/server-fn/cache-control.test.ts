import { expect, it } from "vitest"
import { fnCacheControl, setCacheControl } from "./cache-control.ts"

const post: Parameters<typeof fnCacheControl>[0] = { method: "post", authenticate: false }

it("default", () => {
	expect(fnCacheControl(post)).toBe("private, no-store")
	expect(fnCacheControl({ method: "get", authenticate: false })).toBe("private, no-store")
})

it("pass through", () => {
	const response = new Response(null, { headers: { "cache-control": "public, max-age=60", "x-kept": "1" } })
	setCacheControl(response.headers, post)
	expect(response.headers.get("cache-control")).toBe("private, no-store")
	expect(response.headers.get("x-kept")).toBe("1")
})

it("opt in", () => {
	expect(fnCacheControl({ method: "get", authenticate: false, cache: { maxAge: "60s" } })).toBe("public, max-age=60")
	expect(fnCacheControl({ method: "get", authenticate: true, cache: { maxAge: "60s" } })).toBe("private, no-store")
	expect(fnCacheControl({ method: "get", authenticate: false, authorize: () => true, cache: { maxAge: "60s" } })).toBe(
		"private, no-store",
	)
	expect(fnCacheControl({ method: "post", authenticate: false, cache: { maxAge: "60s" } })).toBe("private, no-store")
})

it("duration", () => {
	expect(fnCacheControl({ method: "get", authenticate: false, cache: { maxAge: "1m30s" } })).toBe("public, max-age=90")
	expect(fnCacheControl({ method: "get", authenticate: false, cache: { maxAge: "1500ms" } })).toBe("public, max-age=1")
})
