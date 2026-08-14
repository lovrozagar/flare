/** @vitest-environment node */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	buildCdnCacheKey,
	type CdnCacheEntry,
	cdnEntryToStoreEntry,
	handleCdnRequest,
	type IncomingLike,
	type OutgoingLike,
} from "../../../src/plugins/dev-cdn-cache.ts"
import type { FlareStore } from "../../../src/store/index.ts"
import { createFileSystemStore } from "../../../src/store/filesystem.ts"

/* ── Test helpers ────────────────────────────────────────────────────── */

let cacheDir: string
let store: FlareStore

beforeEach(() => {
	cacheDir = mkdtempSync(join(tmpdir(), "flare-cdn-mw-"))
	store = createFileSystemStore({ cacheDir })
})

afterEach(() => {
	rmSync(cacheDir, { force: true, recursive: true })
})

function makeReq(overrides?: Partial<IncomingLike>): IncomingLike {
	return {
		headers: { host: "localhost:3000" },
		method: "GET",
		url: "/about",
		...overrides,
	}
}

interface MockRes extends OutgoingLike {
	body: string
	headers: Record<string, string | string[]>
	status: number
}

function makeRes(): MockRes {
	const res: MockRes = {
		body: "",
		end(body?: string) {
			if (typeof body === "string") res.body = body
		},
		headers: {},
		status: 200,
		writeHead(status: number, headers?: Record<string, string | string[]>) {
			res.status = status
			if (headers) {
				for (const [key, val] of Object.entries(headers)) {
					res.headers[key] = val
				}
			}
		},
	}
	return res
}

function makeCdnEntry(overrides?: Partial<CdnCacheEntry>): CdnCacheEntry {
	return {
		body: "<html><body>cached</body></html>",
		headers: {
			"cache-control": "public, s-maxage=3600",
			"content-type": "text/html",
			vary: "x-d",
		},
		status: 200,
		storedAt: Date.now(),
		surrogateKeys: [],
		varyHeaders: ["x-d"],
		...overrides,
	}
}

/**
 * Seed cache with proper probe + varied keys.
 * When entry has varyHeaders, seeds both the probe key (for discovery)
 * and the varied key (for actual lookup).
 */
async function seedCache(
	probeKey: string,
	entry: CdnCacheEntry,
	reqHeaders?: Record<string, string | undefined>,
): Promise<void> {
	await store.set(probeKey, cdnEntryToStoreEntry(entry))
	if (entry.varyHeaders.length > 0) {
		const method = probeKey.split(":")[1] ?? "GET"
		const pathname = probeKey.split(":").slice(2).join(":") || "/"
		const variedKey = buildCdnCacheKey(method, pathname, entry.varyHeaders, reqHeaders ?? {})
		await store.set(variedKey, cdnEntryToStoreEntry(entry))
	}
}

/* ── Middleware: skip conditions ──────────────────────────────────────── */

describe("handleCdnRequest — skip conditions", () => {
	it("skips POST requests", async () => {
		const req = makeReq({ method: "POST" })
		const res = makeRes()
		let nextCalled = false
		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)
		expect(nextCalled).toBe(true)
	})

	it("skips PUT requests", async () => {
		const req = makeReq({ method: "PUT" })
		const res = makeRes()
		let nextCalled = false
		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)
		expect(nextCalled).toBe(true)
	})

	it("skips when url is undefined", async () => {
		const req = makeReq({ url: undefined })
		const res = makeRes()
		let nextCalled = false
		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)
		expect(nextCalled).toBe(true)
	})

	it("skips static asset paths (.js)", async () => {
		const req = makeReq({ url: "/assets/app.js" })
		const res = makeRes()
		let nextCalled = false
		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)
		expect(nextCalled).toBe(true)
	})

	it("skips static asset paths (.css)", async () => {
		const req = makeReq({ url: "/styles/main.css" })
		const res = makeRes()
		let nextCalled = false
		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)
		expect(nextCalled).toBe(true)
	})

	it("does NOT skip paths ending with /", async () => {
		const req = makeReq({ url: "/blog/" })
		const res = makeRes()
		let nextCalled = false
		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)
		expect(nextCalled).toBe(true) /* next called = cache miss, falls through */
	})
})

/* ── Middleware: cache miss → intercept + store ──────────────────────── */

describe("handleCdnRequest — cache miss + response interception", () => {
	it("first request passes through and caches the response", async () => {
		const req = makeReq()
		const res = makeRes()

		await handleCdnRequest(
			req,
			res,
			() => {
				/* Simulate downstream (Flare SSR) writing response */
				res.writeHead(200, {
					"cache-control": "public, s-maxage=3600",
					"content-type": "text/html",
					vary: "x-d",
				})
				res.end("<html>hello</html>")
			},
			store,
			new Set(),
		)

		/* Response was served */
		expect(res.status).toBe(200)
		expect(res.body).toBe("<html>hello</html>")

		/* Entry was cached */
		const cached = await store.get("cdn:GET:/about:x-d=")
		expect(cached).not.toBeNull()
	})

	it("no-store response is NOT cached", async () => {
		const req = makeReq()
		const res = makeRes()

		await handleCdnRequest(
			req,
			res,
			() => {
				res.writeHead(200, {
					"cache-control": "no-store",
					"content-type": "text/html",
				})
				res.end("<html>private</html>")
			},
			store,
			new Set(),
		)

		const cached = await store.get("cdn:GET:/about")
		expect(cached).toBeNull()
	})

	it("private response is NOT cached", async () => {
		const req = makeReq()
		const res = makeRes()

		await handleCdnRequest(
			req,
			res,
			() => {
				res.writeHead(200, {
					"cache-control": "private, max-age=60",
					"content-type": "text/html",
				})
				res.end("<html>user-specific</html>")
			},
			store,
			new Set(),
		)

		const cached = await store.get("cdn:GET:/about")
		expect(cached).toBeNull()
	})

	it("500 response is NOT cached", async () => {
		const req = makeReq()
		const res = makeRes()

		await handleCdnRequest(
			req,
			res,
			() => {
				res.writeHead(500, {
					"cache-control": "public, max-age=60",
					"content-type": "text/html",
				})
				res.end("<html>error</html>")
			},
			store,
			new Set(),
		)

		const cached = await store.get("cdn:GET:/about")
		expect(cached).toBeNull()
	})

	it("no Cache-Control header → NOT cached", async () => {
		const req = makeReq()
		const res = makeRes()

		await handleCdnRequest(
			req,
			res,
			() => {
				res.writeHead(200, { "content-type": "text/html" })
				res.end("<html>no-cache</html>")
			},
			store,
			new Set(),
		)

		const cached = await store.get("cdn:GET:/about")
		expect(cached).toBeNull()
	})
})

/* ── Middleware: cache hit → serve from cache ─────────────────────────── */

describe("handleCdnRequest — cache hit", () => {
	it("fresh entry → serve with flare-cdn: HIT + Age header", async () => {
		const entry = makeCdnEntry({ storedAt: Date.now() - 5000 })
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({ headers: { host: "localhost:3000" } })
		const res = makeRes()
		let nextCalled = false

		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)

		expect(nextCalled).toBe(false)
		expect(res.status).toBe(200)
		expect(res.body).toBe("<html><body>cached</body></html>")
		expect(res.headers["flare-cdn"]).toBe("HIT")
		expect(res.headers.age).toBeDefined()
	})

	it("html-proxy body is treated as a miss (Vite virtual ids are not cacheable)", async () => {
		const entry = makeCdnEntry({
			body: '<html><body><script type="module" src="/@id/__x00__/index.html?html-proxy&index=0.js"></script></body></html>',
			storedAt: Date.now() - 5000,
		})
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({ headers: { host: "localhost:3000" } })
		const res = makeRes()
		let nextCalled = false

		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
				res.writeHead(200, { "cache-control": "public, s-maxage=3600", "content-type": "text/html" })
				res.end("<html><body>fresh</body></html>")
			},
			store,
			new Set(),
		)

		expect(nextCalled).toBe(true)
		expect(res.body).toBe("<html><body>fresh</body></html>")
	})

	it("Surrogate-Key tags stored on cache entry", async () => {
		const req = makeReq()
		const res = makeRes()

		await handleCdnRequest(
			req,
			res,
			() => {
				res.writeHead(200, {
					"cache-control": "public, s-maxage=3600",
					"content-type": "text/html",
					"surrogate-key": "page-about tag-marketing",
				})
				res.end("<html>about</html>")
			},
			store,
			new Set(),
		)

		const cached = await store.get("cdn:GET:/about")
		expect(cached).not.toBeNull()
		expect(cached?.tags).toEqual(["page-about", "tag-marketing"])
	})
})

/* ── Middleware: Vary-keyed caching ───────────────────────────────────── */

describe("handleCdnRequest — Vary header support", () => {
	it("different x-d values → different cache entries (HTML vs NDJSON)", async () => {
		/* First: cache HTML response (x-d absent) */
		const req1 = makeReq({ headers: { host: "localhost" } })
		const res1 = makeRes()

		await handleCdnRequest(
			req1,
			res1,
			() => {
				res1.writeHead(200, {
					"cache-control": "public, s-maxage=3600",
					"content-type": "text/html",
					vary: "x-d",
				})
				res1.end("<html>HTML response</html>")
			},
			store,
			new Set(),
		)

		/* Second: cache NDJSON response (x-d: 1) */
		const req2 = makeReq({ headers: { host: "localhost", "x-d": "1" } })
		const res2 = makeRes()

		await handleCdnRequest(
			req2,
			res2,
			() => {
				res2.writeHead(200, {
					"cache-control": "public, s-maxage=3600",
					"content-type": "application/x-ndjson",
					vary: "x-d",
				})
				res2.end('{"data":"ndjson"}')
			},
			store,
			new Set(),
		)

		/* Third: request HTML again → should get HTML cache, not NDJSON */
		const req3 = makeReq({ headers: { host: "localhost" } })
		const res3 = makeRes()
		let nextCalled = false

		await handleCdnRequest(
			req3,
			res3,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)

		expect(nextCalled).toBe(false)
		expect(res3.body).toBe("<html>HTML response</html>")
		expect(res3.headers["content-type"]).toBe("text/html")
	})

	it("different accept-language → different cache entries", async () => {
		/* Cache English */
		const req1 = makeReq({
			headers: { "accept-language": "en", host: "localhost" },
		})
		const res1 = makeRes()

		await handleCdnRequest(
			req1,
			res1,
			() => {
				res1.writeHead(200, {
					"cache-control": "public, s-maxage=3600",
					"content-type": "text/html",
					vary: "x-d, Accept-Language",
				})
				res1.end("<html>English</html>")
			},
			store,
			new Set(),
		)

		/* Cache French */
		const req2 = makeReq({
			headers: { "accept-language": "fr", host: "localhost" },
		})
		const res2 = makeRes()

		await handleCdnRequest(
			req2,
			res2,
			() => {
				res2.writeHead(200, {
					"cache-control": "public, s-maxage=3600",
					"content-type": "text/html",
					vary: "x-d, Accept-Language",
				})
				res2.end("<html>Français</html>")
			},
			store,
			new Set(),
		)

		/* Request English again → should get English from cache */
		const req3 = makeReq({
			headers: { "accept-language": "en", host: "localhost" },
		})
		const res3 = makeRes()
		let nextCalled = false

		await handleCdnRequest(
			req3,
			res3,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)

		expect(nextCalled).toBe(false)
		expect(res3.body).toBe("<html>English</html>")
	})
})

/* ── Middleware: conditional requests (ETag / 304) ───────────────────── */

describe("handleCdnRequest — conditional requests (ETag / If-None-Match)", () => {
	it("matching ETag → 304 with flare-cdn: HIT", async () => {
		const entry = makeCdnEntry({
			headers: {
				"cache-control": "public, s-maxage=3600",
				"content-type": "text/html",
				etag: 'W/"abc123"',
			},
			storedAt: Date.now(),
			varyHeaders: [],
		})
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({
			headers: { host: "localhost", "if-none-match": 'W/"abc123"' },
		})
		const res = makeRes()
		let nextCalled = false

		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)

		expect(nextCalled).toBe(false)
		expect(res.status).toBe(304)
		expect(res.body).toBe("") /* No body in 304 */
		expect(res.headers["flare-cdn"]).toBe("HIT")
		expect(res.headers.etag).toBe('W/"abc123"')
	})

	it("non-matching ETag → 200 with full body", async () => {
		const entry = makeCdnEntry({
			headers: {
				"cache-control": "public, s-maxage=3600",
				"content-type": "text/html",
				etag: 'W/"abc123"',
			},
			storedAt: Date.now(),
			varyHeaders: [],
		})
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({
			headers: { host: "localhost", "if-none-match": 'W/"different"' },
		})
		const res = makeRes()

		await handleCdnRequest(req, res, () => {}, store, new Set())

		expect(res.status).toBe(200)
		expect(res.body).toBe(entry.body)
		expect(res.headers["flare-cdn"]).toBe("HIT")
	})

	it("wildcard If-None-Match * → 304", async () => {
		const entry = makeCdnEntry({
			headers: {
				"cache-control": "public, s-maxage=3600",
				"content-type": "text/html",
				etag: 'W/"abc123"',
			},
			storedAt: Date.now(),
			varyHeaders: [],
		})
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({
			headers: { host: "localhost", "if-none-match": "*" },
		})
		const res = makeRes()

		await handleCdnRequest(req, res, () => {}, store, new Set())

		expect(res.status).toBe(304)
	})

	it("no ETag on cached entry + If-None-Match → 200 (can't validate)", async () => {
		const entry = makeCdnEntry({
			headers: {
				"cache-control": "public, s-maxage=3600",
				"content-type": "text/html",
			},
			storedAt: Date.now(),
			varyHeaders: [],
		})
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({
			headers: { host: "localhost", "if-none-match": 'W/"abc123"' },
		})
		const res = makeRes()

		await handleCdnRequest(req, res, () => {}, store, new Set())

		expect(res.status).toBe(200) /* Can't validate, serve full response */
	})
})

/* ── Middleware: stale-while-revalidate ───────────────────────────────── */

describe("handleCdnRequest — stale-while-revalidate", () => {
	it("stale entry within SWR → serves STALE + deletes cache", async () => {
		const entry = makeCdnEntry({
			headers: {
				"cache-control": "public, s-maxage=10, stale-while-revalidate=120",
				"content-type": "text/html",
			},
			/* 30s old, past 10s max-age but within 10+120=130s SWR window */
			storedAt: Date.now() - 30_000,
			varyHeaders: [],
		})
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({ headers: { host: "localhost" } })
		const res = makeRes()
		const revalidating = new Set<string>()

		await handleCdnRequest(req, res, () => {}, store, revalidating)

		expect(res.status).toBe(200)
		expect(res.headers["flare-cdn"]).toBe("STALE")
		expect(res.body).toBe(entry.body)

		/* Cache entry deleted for revalidation */
		await vi.waitFor(
			async () => {
				const cached = await store.get("cdn:GET:/about")
				expect(cached).toBeNull()
			},
			{ timeout: 500 },
		)
	})

	it("stale-expired → falls through to SSR", async () => {
		const entry = makeCdnEntry({
			headers: {
				"cache-control": "public, s-maxage=10, stale-while-revalidate=20",
				"content-type": "text/html",
			},
			/* 60s old, past 10+20=30s SWR window */
			storedAt: Date.now() - 60_000,
			varyHeaders: [],
		})
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({ headers: { host: "localhost" } })
		const res = makeRes()
		let nextCalled = false

		await handleCdnRequest(
			req,
			res,
			() => {
				nextCalled = true
			},
			store,
			new Set(),
		)

		expect(nextCalled).toBe(true)
	})
})

/* ── Middleware: tag-based invalidation ───────────────────────────────── */

describe("tag-based invalidation via store.deleteByTags", () => {
	it("deleteByTags removes CDN cache entries with matching surrogate keys", async () => {
		const entry = makeCdnEntry({
			surrogateKeys: ["page-about", "tag-marketing"],
		})
		await seedCache("cdn:GET:/about", entry)

		/* Verify it exists */
		const before = await store.get("cdn:GET:/about")
		expect(before).not.toBeNull()

		/* Purge by tag */
		await store.deleteByTags(["tag-marketing"])

		/* Verify it's gone */
		const after = await store.get("cdn:GET:/about")
		expect(after).toBeNull()
	})

	it("deleteByTags only removes matching tags, not others", async () => {
		const entry1 = makeCdnEntry({ surrogateKeys: ["tag-a"] })
		const entry2 = makeCdnEntry({ surrogateKeys: ["tag-b"] })

		await seedCache("cdn:GET:/page-a", entry1)
		await seedCache("cdn:GET:/page-b", entry2)

		await store.deleteByTags(["tag-a"])

		expect(await store.get("cdn:GET:/page-a")).toBeNull()
		expect(await store.get("cdn:GET:/page-b")).not.toBeNull()
	})
})

/* ── Middleware: Flare header compatibility ───────────────────────────── */

describe("Flare header compatibility", () => {
	it("caches response with Flare-Cache + Flare-Render headers", async () => {
		const req = makeReq()
		const res = makeRes()

		await handleCdnRequest(
			req,
			res,
			() => {
				res.writeHead(200, {
					"cache-control": "public, s-maxage=3600",
					"content-type": "text/html",
					"flare-cache": "HIT",
					"flare-render": "SSG",
					vary: "x-d",
				})
				res.end("<html>SSG page</html>")
			},
			store,
			new Set(),
		)

		/* Flare headers preserved in cached entry */
		const cached = await store.get("cdn:GET:/about:x-d=")
		expect(cached).not.toBeNull()
		const cdnEntry = cached?.data as CdnCacheEntry
		expect(cdnEntry.headers["flare-cache"]).toBe("HIT")
		expect(cdnEntry.headers["flare-render"]).toBe("SSG")
	})

	it("cached Flare-Cache + Flare-Render headers served back", async () => {
		const entry = makeCdnEntry({
			headers: {
				"cache-control": "public, s-maxage=3600",
				"content-type": "text/html",
				"flare-cache": "HIT",
				"flare-render": "ISR",
			},
			storedAt: Date.now(),
			varyHeaders: [],
		})
		await seedCache("cdn:GET:/about", entry)

		const req = makeReq({ headers: { host: "localhost" } })
		const res = makeRes()

		await handleCdnRequest(req, res, () => {}, store, new Set())

		expect(res.headers["flare-cache"]).toBe("HIT")
		expect(res.headers["flare-render"]).toBe("ISR")
		expect(res.headers["flare-cdn"]).toBe("HIT")
	})

	it("ETag preserved from Flare SSR response", async () => {
		const req = makeReq()
		const res = makeRes()

		await handleCdnRequest(
			req,
			res,
			() => {
				res.writeHead(200, {
					"cache-control": "public, s-maxage=3600",
					"content-type": "text/html",
					etag: 'W/"a1b2c3d4e5f6g7h8"',
					vary: "x-d",
				})
				res.end("<html>page with etag</html>")
			},
			store,
			new Set(),
		)

		/* ETag stored */
		const cached = await store.get("cdn:GET:/about:x-d=")
		const cdnEntry = cached?.data as CdnCacheEntry
		expect(cdnEntry.headers.etag).toBe('W/"a1b2c3d4e5f6g7h8"')

		/* Second request: cache hit should include ETag */
		const req2 = makeReq({ headers: { host: "localhost" } })
		const res2 = makeRes()

		await handleCdnRequest(req2, res2, () => {}, store, new Set())

		expect(res2.headers.etag).toBe('W/"a1b2c3d4e5f6g7h8"')
	})
})
