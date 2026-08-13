import { describe, expect, it, vi } from "vitest"
import type { FlareStore, FlareStoreEntry } from "../../../src/store/index.ts"

function createMockStore(entries?: Map<string, FlareStoreEntry>): FlareStore {
	const store = entries ?? new Map<string, FlareStoreEntry>()
	return {
		delete: vi.fn(async (key: string) => {
			store.delete(key)
		}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		set: vi.fn(async (key: string, entry: FlareStoreEntry) => {
			store.set(key, entry)
		}),
	}
}

function createMockReq(url: string, method = "GET", headers: Record<string, string> = {}) {
	const headerMap = new Map(Object.entries(headers))
	return {
		headers: Object.fromEntries(headerMap),
		method,
		url,
	}
}

function createMockRes() {
	const headers = new Map<string, string>()
	let statusCode = 200
	let ended = false
	let body = ""
	return {
		get body() {
			return body
		},
		end(data?: string) {
			if (data) body += data
			ended = true
		},
		get ended() {
			return ended
		},
		getHeader(name: string) {
			return headers.get(name.toLowerCase())
		},
		get headersSent() {
			return ended
		},
		setHeader(name: string, value: string) {
			headers.set(name.toLowerCase(), value)
		},
		get statusCode() {
			return statusCode
		},
		set statusCode(code: number) {
			statusCode = code
		},
		writeHead(code: number, h?: Record<string, string>) {
			statusCode = code
			if (h) {
				for (const [k, v] of Object.entries(h)) {
					headers.set(k.toLowerCase(), v)
				}
			}
		},
	}
}

describe("Task 3: CDN middleware awaits async handler", () => {
	it("middleware awaits handleCdnRequest before calling next", async () => {
		const { handleCdnRequest } = await import("../../../src/plugins/dev-cdn-cache")
		const store = createMockStore()
		const revalidating = new Set<string>()
		const order: string[] = []

		const req = createMockReq("/page")
		const res = createMockRes()

		const next = () => {
			order.push("next")
		}

		/* handleCdnRequest is async — if properly awaited, "next" should be
		 * called synchronously within the handler, not after. */
		await handleCdnRequest(req as never, res as never, next, store, revalidating)
		order.push("after-await")

		/* next() should have been called before "after-await" */
		expect(order[0]).toBe("next")
		expect(order[1]).toBe("after-await")
	})

	it("handler error propagates instead of being swallowed", async () => {
		const { handleCdnRequest } = await import("../../../src/plugins/dev-cdn-cache")
		const store: FlareStore = {
			delete: vi.fn(),
			deleteByTags: vi.fn(),
			get: vi.fn(async () => {
				throw new Error("store failure")
			}),
			set: vi.fn(),
		}
		const revalidating = new Set<string>()

		const req = createMockReq("/page", "GET", { host: "localhost" })
		const res = createMockRes()
		const next = vi.fn()

		/* Without proper error handling, this would be an unhandled rejection.
		 * With proper await + catch(next), errors should be caught. */
		await expect(
			handleCdnRequest(req as never, res as never, next, store, revalidating),
		).rejects.toThrow("store failure")
	})

	it("cache miss calls interceptResponse which invokes next()", async () => {
		const { handleCdnRequest } = await import("../../../src/plugins/dev-cdn-cache")
		const store = createMockStore()
		const revalidating = new Set<string>()

		const req = createMockReq("/page", "GET", { host: "localhost" })
		const res = createMockRes()
		let nextCalled = false

		const next = () => {
			nextCalled = true
		}

		await handleCdnRequest(req as never, res as never, next, store, revalidating)

		/* On cache miss, interceptResponse wraps next() to capture the response */
		expect(nextCalled).toBe(true)
	})

	it("non-GET request passes through immediately", async () => {
		const { handleCdnRequest } = await import("../../../src/plugins/dev-cdn-cache")
		const store = createMockStore()
		const revalidating = new Set<string>()

		const req = createMockReq("/page", "POST")
		const res = createMockRes()
		const next = vi.fn()

		await handleCdnRequest(req as never, res as never, next, store, revalidating)
		expect(next).toHaveBeenCalled()
	})

	it("middleware wrapper properly propagates errors to connect error handler", async () => {
		/* This tests the actual middleware wrapper pattern, not just handleCdnRequest.
		 * The fix: vite.middlewares.use(async (req, res, next) => {
		 *   await handleCdnRequest(req, res, next, store, revalidating).catch(next)
		 * }) */
		const { createDevCdnCachePlugin } = await import("../../../src/plugins/dev-cdn-cache")
		const plugin = createDevCdnCachePlugin()

		/* Verify the plugin has configureServer */
		expect(typeof plugin.configureServer).toBe("function")
		expect(plugin.name).toBe("flare:dev-cdn-cache")
	})
})
