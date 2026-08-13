import { describe, expect, it, vi } from "vitest"
import {
	apiJsonError,
	buildMountRequest,
	dispatchMount,
	isFlareMount,
	type MountConfig,
	type MountFetchHandler,
	matchMount,
	proxy,
} from "../../../src/mount/index.ts"

/* ── matchMount ────────────────────────────────────────────────────────── */

describe("matchMount", () => {
	const mounts: MountConfig[] = [
		{ fetch: () => new Response("api"), prefix: "/api" },
		{ fetch: () => new Response("admin"), prefix: "/admin" },
	]

	it("matches exact prefix", () => {
		const result = matchMount(mounts, "/api")
		expect(result).toBe(mounts[0])
	})

	it("matches sub-path under prefix", () => {
		const result = matchMount(mounts, "/api/users/123")
		expect(result).toBe(mounts[0])
	})

	it("returns undefined on no match", () => {
		expect(matchMount(mounts, "/dashboard")).toBeUndefined()
	})

	it("does not match partial prefix overlap", () => {
		expect(matchMount(mounts, "/api-docs")).toBeUndefined()
	})

	it("first match wins when multiple prefixes overlap", () => {
		const overlapping: MountConfig[] = [
			{ fetch: () => new Response("first"), prefix: "/api" },
			{ fetch: () => new Response("second"), prefix: "/api/v2" },
		]
		expect(matchMount(overlapping, "/api/v2/users")).toBe(overlapping[0])
	})

	it("returns undefined for empty mounts array", () => {
		expect(matchMount([], "/api")).toBeUndefined()
	})

	it("matches prefix with trailing content after /", () => {
		const result = matchMount(mounts, "/admin/settings")
		expect(result).toBe(mounts[1])
	})
})

/* ── buildMountRequest ─────────────────────────────────────────────────── */

describe("buildMountRequest", () => {
	const mount: MountConfig = { fetch: () => new Response(), prefix: "/api" }

	it("strips prefix from pathname", () => {
		const original = new Request("http://localhost/api/users")
		const url = new URL(original.url)
		const built = buildMountRequest(original, mount, url)
		expect(new URL(built.url).pathname).toBe("/users")
	})

	it("root path when pathname equals prefix", () => {
		const original = new Request("http://localhost/api")
		const url = new URL(original.url)
		const built = buildMountRequest(original, mount, url)
		expect(new URL(built.url).pathname).toBe("/")
	})

	it("preserves query string", () => {
		const original = new Request("http://localhost/api/search?q=hello&page=2")
		const url = new URL(original.url)
		const built = buildMountRequest(original, mount, url)
		const builtUrl = new URL(built.url)
		expect(builtUrl.search).toBe("?q=hello&page=2")
	})

	it("preserves hash", () => {
		const original = new Request("http://localhost/api/docs#section")
		const url = new URL(original.url)
		const built = buildMountRequest(original, mount, url)
		expect(new URL(built.url).hash).toBe("#section")
	})

	it("preserves HTTP method", () => {
		const original = new Request("http://localhost/api/users", { method: "POST" })
		const url = new URL(original.url)
		const built = buildMountRequest(original, mount, url)
		expect(built.method).toBe("POST")
	})

	it("preserves headers", () => {
		const original = new Request("http://localhost/api/users", {
			headers: { Authorization: "Bearer xyz", "Content-Type": "application/json" },
		})
		const url = new URL(original.url)
		const built = buildMountRequest(original, mount, url)
		expect(built.headers.get("Authorization")).toBe("Bearer xyz")
		expect(built.headers.get("Content-Type")).toBe("application/json")
	})

	it("preserves body on POST", async () => {
		const body = JSON.stringify({ name: "test" })
		const original = new Request("http://localhost/api/users", {
			body,
			headers: { "Content-Type": "application/json" },
			method: "POST",
		})
		const url = new URL(original.url)
		const built = buildMountRequest(original, mount, url)
		expect(await built.text()).toBe(body)
	})
})

/* ── dispatchMount ─────────────────────────────────────────────────────── */

describe("dispatchMount", () => {
	it("calls handler with stripped request, env, and waitUntil ctx", async () => {
		const handler = vi.fn<MountFetchHandler>(() => new Response("ok"))
		const mount: MountConfig = { fetch: handler, prefix: "/api" }
		const request = new Request("http://localhost/api/users")
		const url = new URL(request.url)
		const env = { SECRET: "abc" }
		const waitUntil = vi.fn()

		const response = await dispatchMount(request, env, mount, url, { waitUntil })

		expect(handler).toHaveBeenCalledOnce()
		const [calledReq, calledEnv, calledCtx] = handler.mock.calls[0] as [
			Request,
			unknown,
			{ waitUntil: (p: Promise<unknown>) => void },
		]
		expect(new URL(calledReq.url).pathname).toBe("/users")
		expect(calledEnv).toBe(env)
		expect(typeof calledCtx.waitUntil).toBe("function")
		expect(response.status).toBe(200)
		expect(await response.text()).toBe("ok")
	})

	it("catches handler errors and returns JSON 500", async () => {
		const mount: MountConfig = {
			fetch: () => {
				throw new Error("boom")
			},
			prefix: "/api",
		}
		const request = new Request("http://localhost/api/fail")
		const url = new URL(request.url)

		const response = await dispatchMount(request, {}, mount, url, {})
		expect(response.status).toBe(500)
		const json = (await response.json()) as { error: string; status: number }
		expect(json.error).toBe("Internal Server Error")
		expect(json.status).toBe(500)
	})

	it("catches async handler errors and returns JSON 500", async () => {
		const mount: MountConfig = {
			fetch: async () => {
				throw new Error("async boom")
			},
			prefix: "/api",
		}
		const request = new Request("http://localhost/api/fail")
		const url = new URL(request.url)

		const response = await dispatchMount(request, {}, mount, url, {})
		expect(response.status).toBe(500)
		const json = (await response.json()) as { error: string; status: number }
		expect(json.error).toBe("Internal Server Error")
	})

	it("applies API security headers (nosniff, HSTS, referrer-policy)", async () => {
		const mount: MountConfig = { fetch: () => new Response("ok"), prefix: "/api" }
		const request = new Request("http://localhost/api/test")
		const url = new URL(request.url)

		const response = await dispatchMount(request, {}, mount, url, {})
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
		expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=63072000")
		expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
	})

	it("does NOT apply CSP header", async () => {
		const mount: MountConfig = { fetch: () => new Response("ok"), prefix: "/api" }
		const request = new Request("http://localhost/api/test")
		const url = new URL(request.url)

		const response = await dispatchMount(request, {}, mount, url, {})
		expect(response.headers.has("Content-Security-Policy")).toBe(false)
	})

	it("does NOT apply X-Frame-Options", async () => {
		const mount: MountConfig = { fetch: () => new Response("ok"), prefix: "/api" }
		const request = new Request("http://localhost/api/test")
		const url = new URL(request.url)

		const response = await dispatchMount(request, {}, mount, url, {})
		expect(response.headers.has("X-Frame-Options")).toBe(false)
	})

	it("passes waitUntil through to handler ctx", async () => {
		const waitUntil = vi.fn()
		let capturedCtx: { waitUntil: (p: Promise<unknown>) => void } | undefined
		const mount: MountConfig = {
			fetch: (_req, _env, ctx) => {
				capturedCtx = ctx
				return new Response("ok")
			},
			prefix: "/api",
		}
		const request = new Request("http://localhost/api/test")
		const url = new URL(request.url)

		await dispatchMount(request, {}, mount, url, { waitUntil })
		expect(capturedCtx).toBeDefined()
		const p = Promise.resolve()
		capturedCtx?.waitUntil(p)
		expect(waitUntil).toHaveBeenCalledWith(p)
	})

	it("provides noop waitUntil when none given", async () => {
		let capturedCtx: { waitUntil: (p: Promise<unknown>) => void } | undefined
		const mount: MountConfig = {
			fetch: (_req, _env, ctx) => {
				capturedCtx = ctx
				return new Response("ok")
			},
			prefix: "/api",
		}
		const request = new Request("http://localhost/api/test")
		const url = new URL(request.url)

		await dispatchMount(request, {}, mount, url, {})
		expect(capturedCtx).toBeDefined()
		/* should not throw */
		capturedCtx?.waitUntil(Promise.resolve())
	})
})

/* ── proxy (URL mode) ──────────────────────────────────────────────────── */

describe("proxy(url)", () => {
	it("forwards to base URL with stripped path", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("proxied"))
		const handler = proxy("https://api.shoes.com")
		const request = new Request("http://localhost/users?active=true", { method: "GET" })

		const response = await handler(request, {}, { waitUntil: vi.fn() })

		expect(fetchSpy).toHaveBeenCalledOnce()
		const outgoing = fetchSpy.mock.calls[0]?.[0] as Request
		const outUrl = new URL(outgoing.url)
		expect(outUrl.origin).toBe("https://api.shoes.com")
		expect(outUrl.pathname).toBe("/users")
		expect(outUrl.search).toBe("?active=true")
		expect(outgoing.headers.get("Host")).toBe("api.shoes.com")
		expect(await response.text()).toBe("proxied")

		fetchSpy.mockRestore()
	})

	it("preserves HTTP method and body", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))
		const handler = proxy("https://api.shoes.com")
		const body = JSON.stringify({ size: 42 })
		const request = new Request("http://localhost/orders", {
			body,
			headers: { "Content-Type": "application/json" },
			method: "POST",
		})

		await handler(request, {}, { waitUntil: vi.fn() })

		const outgoing = fetchSpy.mock.calls[0]?.[0] as Request
		expect(outgoing.method).toBe("POST")
		expect(await outgoing.text()).toBe(body)

		fetchSpy.mockRestore()
	})

	it("preserves original headers (except Host)", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))
		const handler = proxy("https://api.shoes.com")
		const request = new Request("http://localhost/test", {
			headers: { Authorization: "Bearer token", "X-Custom": "value" },
		})

		await handler(request, {}, { waitUntil: vi.fn() })

		const outgoing = fetchSpy.mock.calls[0]?.[0] as Request
		expect(outgoing.headers.get("Authorization")).toBe("Bearer token")
		expect(outgoing.headers.get("X-Custom")).toBe("value")
		expect(outgoing.headers.get("Host")).toBe("api.shoes.com")

		fetchSpy.mockRestore()
	})
})

/* ── proxy (dynamic URL from env) ──────────────────────────────────────── */

describe("proxy(fn => string)", () => {
	it("resolves URL from env at runtime", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))
		const handler = proxy((env: { API_URL: string }) => env.API_URL)
		const request = new Request("http://localhost/data")
		const env = { API_URL: "https://dynamic.api.com" }

		await handler(request, env, { waitUntil: vi.fn() })

		const outgoing = fetchSpy.mock.calls[0]?.[0] as Request
		expect(new URL(outgoing.url).origin).toBe("https://dynamic.api.com")

		fetchSpy.mockRestore()
	})
})

/* ── proxy (custom Request mode) ───────────────────────────────────────── */

describe("proxy(fn => Request)", () => {
	it("uses the returned Request for fetch()", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("custom"))
		const handler = proxy<undefined>(
			(req, _env) => new Request(`https://api.shoes.com/v2${new URL(req.url).pathname}`, req),
		)
		const request = new Request("http://localhost/products")

		const response = await handler(request, undefined, { waitUntil: vi.fn() })

		const outgoing = fetchSpy.mock.calls[0]?.[0] as Request
		expect(new URL(outgoing.url).pathname).toBe("/v2/products")
		expect(await response.text()).toBe("custom")

		fetchSpy.mockRestore()
	})

	it("differentiates string vs Request return", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"))

		/* 2-arg fn that returns string → URL mode */
		const urlHandler = proxy<{ URL: string }>((_req, env) => env.URL)
		const req1 = new Request("http://localhost/test")
		await urlHandler(req1, { URL: "https://string-mode.com" }, { waitUntil: vi.fn() })
		const out1 = fetchSpy.mock.calls[0]?.[0] as Request
		expect(new URL(out1.url).origin).toBe("https://string-mode.com")

		fetchSpy.mockClear()

		/* 2-arg fn that returns Request → custom mode */
		const reqHandler = proxy<undefined>(
			(req, _env) => new Request("https://custom-mode.com/x", req),
		)
		const req2 = new Request("http://localhost/test")
		await reqHandler(req2, undefined, { waitUntil: vi.fn() })
		const out2 = fetchSpy.mock.calls[0]?.[0] as Request
		expect(new URL(out2.url).origin).toBe("https://custom-mode.com")

		fetchSpy.mockRestore()
	})
})

/* ── apiJsonError ──────────────────────────────────────────────────────── */

describe("apiJsonError", () => {
	it("returns JSON response with status and error", async () => {
		const response = apiJsonError(400, "Bad request")
		expect(response.status).toBe(400)
		expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8")
		const json = (await response.json()) as { error: string; status: number }
		expect(json.error).toBe("Bad request")
		expect(json.status).toBe(400)
	})

	it("returns 500 for server errors", async () => {
		const response = apiJsonError(500, "Internal Server Error")
		expect(response.status).toBe(500)
	})
})

/* ── isFlareMount brand ────────────────────────────────────────────────── */

describe("isFlareMount", () => {
	it("returns true for branded mount config", () => {
		const mount: MountConfig = { fetch: () => new Response(), prefix: "/api" }
		/* proxy() should produce branded handlers — test the guard itself */
		expect(isFlareMount(mount)).toBe(true)
	})

	it("returns false for plain object without brand", () => {
		expect(isFlareMount({ random: true })).toBe(false)
		expect(isFlareMount(null)).toBe(false)
		expect(isFlareMount(undefined)).toBe(false)
		expect(isFlareMount(42)).toBe(false)
	})
})
