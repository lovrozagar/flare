import { afterEach, expect, it, vi } from "vitest"
import type { MiddlewareContext } from "../../../server/middleware/types.ts"
import { indexNow } from "./index-now.ts"

const KEY = "a1b2c3d4-secret-key"

afterEach(() => {
	vi.unstubAllGlobals()
})

function answering(status: number): ReturnType<typeof vi.fn<typeof fetch>> {
	const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status }))
	vi.stubGlobal("fetch", fetcher)
	return fetcher
}

function sent(fetcher: ReturnType<typeof vi.fn<typeof fetch>>): { url: string; init: RequestInit | undefined } {
	const call = fetcher.mock.calls[0]
	return { url: String(call?.[0]), init: call?.[1] }
}

it("posts the url", async () => {
	const fetcher = answering(200)
	const result = await indexNow({ host: "example.com", key: KEY, urls: ["https://example.com/a"] })
	expect(result).toEqual({ ok: true })
	const { url, init } = sent(fetcher)
	expect(url).toBe("https://api.indexnow.org/indexnow")
	expect(init?.method).toBe("POST")
	expect(new Headers(init?.headers).get("content-type")).toBe("application/json; charset=utf-8")
	expect(JSON.parse(String(init?.body))).toEqual({ host: "example.com", key: KEY, urlList: ["https://example.com/a"] })
	// An off-host url, a non-https url, a short key, and an empty list throw before any request.
	const calls = fetcher.mock.calls.length
	await expect(indexNow({ host: "example.com", key: KEY, urls: ["https://other.com/a"] })).rejects.toThrow(
		"indexNow url https://other.com/a is not https on example.com",
	)
	await expect(indexNow({ host: "example.com", key: KEY, urls: ["http://example.com/a"] })).rejects.toThrow(
		"is not https on example.com",
	)
	await expect(indexNow({ host: "example.com", key: "short", urls: ["https://example.com/a"] })).rejects.toThrow(
		"indexNow key must be 8 to 128 letters, digits, or hyphens",
	)
	await expect(indexNow({ host: "example.com", key: KEY, urls: [] })).rejects.toThrow("indexNow needs at least one url")
	const many = Array.from({ length: 10_001 }, (_, index) => `https://example.com/${index}`)
	await expect(indexNow({ host: "example.com", key: KEY, urls: many })).rejects.toThrow(
		"indexNow takes at most 10000 urls",
	)
	expect(fetcher.mock.calls.length).toBe(calls)
})

it("no key in errors", async () => {
	answering(500)
	const result = await indexNow({ host: "example.com", key: KEY, urls: ["https://example.com/a"] })
	expect(result).toEqual({ ok: false, error: "IndexNow answered 500" })
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async () => {
			throw new TypeError(`fetch failed for ${KEY}`)
		}),
	)
	const failed = await indexNow({ host: "example.com", key: KEY, urls: ["https://example.com/a"] })
	expect(failed).toEqual({ ok: false, error: "IndexNow request failed" })
	const thrown = await indexNow({ host: "example.com", key: `${KEY}!`, urls: [] }).catch((error: unknown) => error)
	expect(String(thrown)).not.toContain(KEY)
})

it("host", async () => {
	answering(200)
	for (const host of ["https://example.com", "example.com/path", "", "exa mple.com"]) {
		await expect(indexNow({ host, key: KEY, urls: ["https://example.com/a"] })).rejects.toThrow(
			"indexNow host must be a hostname with no scheme or path",
		)
	}
})

it("key location", async () => {
	const fetcher = answering(202)
	const keyLocation = `https://example.com/keys/${KEY}.txt`
	expect(await indexNow({ host: "example.com", key: KEY, urls: ["https://example.com/a"], keyLocation })).toEqual({
		ok: true,
	})
	expect(JSON.parse(String(sent(fetcher).init?.body))).toMatchObject({ keyLocation })
	await expect(
		indexNow({
			host: "example.com",
			key: KEY,
			urls: ["https://example.com/a"],
			keyLocation: "http://example.com/k.txt",
		}),
	).rejects.toThrow("indexNow keyLocation must be an absolute https url")
})

function context(path: string, method = "GET"): { ctx: MiddlewareContext; respond: ReturnType<typeof vi.fn> } {
	const respond = vi.fn<(response: Response) => void>()
	const ctx: MiddlewareContext = {
		request: new Request(`https://example.com${path}`, { method }),
		path,
		env: {},
		kind: "page",
		next: async () => new Response("router"),
		respond,
		bypass: vi.fn<(response: Response) => void>(),
	}
	return { ctx, respond }
}

it("key file", async () => {
	const file = indexNow.file(KEY)
	const hit = context(`/${KEY}.txt`)
	expect(await file(hit.ctx)).toBeUndefined()
	const response = hit.respond.mock.calls[0]?.[0]
	expect(response).toBeInstanceOf(Response)
	expect(await response.text()).toBe(KEY)
	expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8")
	for (const path of ["/other.txt", `/${KEY}.txt/x`, `/x/${KEY}.txt`]) {
		const miss = context(path)
		expect(await (await file(miss.ctx))?.text()).toBe("router")
		expect(miss.respond).not.toHaveBeenCalled()
	}
	const post = context(`/${KEY}.txt`, "POST")
	expect(await (await file(post.ctx))?.text()).toBe("router")
	expect(() => indexNow.file("../../etc/passwd")).toThrow("indexNow key must be 8 to 128 letters, digits, or hyphens")
})
