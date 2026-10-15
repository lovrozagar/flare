import { afterEach, expect, it, vi } from "vitest"
import { bingIndexing } from "./bing.ts"

const KEY = "bing-secret-api-key"

afterEach(() => {
	vi.unstubAllGlobals()
})

function answering(status: number): ReturnType<typeof vi.fn<typeof fetch>> {
	const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status }))
	vi.stubGlobal("fetch", fetcher)
	return fetcher
}

it("bing query", async () => {
	const fetcher = answering(200)
	const result = await bingIndexing({ apiKey: KEY, siteUrl: "https://example.com", urls: ["https://example.com/a"] })
	expect(result).toEqual({ ok: true })
	const [url, init] = fetcher.mock.calls[0] ?? []
	expect(String(url)).toBe(`https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${KEY}`)
	expect(init?.method).toBe("POST")
	expect(new Headers(init?.headers).get("content-type")).toBe("application/json; charset=utf-8")
	expect(JSON.parse(String(init?.body))).toEqual({
		siteUrl: "https://example.com",
		urlList: ["https://example.com/a"],
	})
	expect(String(init?.body)).not.toContain(KEY)
	// The key is encoded into the query, so it cannot add a parameter.
	await bingIndexing({ apiKey: "a&b=c", siteUrl: "https://example.com", urls: ["https://example.com/a"] })
	expect(String(fetcher.mock.calls[1]?.[0])).toMatch(/\?apikey=a%26b%3Dc$/)
	await expect(
		bingIndexing({ apiKey: KEY, siteUrl: "https://example.com/x", urls: ["https://example.com/a"] }),
	).rejects.toThrow("bingIndexing siteUrl must be an https origin")
	await expect(
		bingIndexing({ apiKey: KEY, siteUrl: "https://example.com", urls: ["http://example.com/a"] }),
	).rejects.toThrow("bingIndexing url http://example.com/a is not an absolute https url")
	await expect(bingIndexing({ apiKey: KEY, siteUrl: "https://example.com", urls: [] })).rejects.toThrow(
		"bingIndexing needs at least one url",
	)
	await expect(
		bingIndexing({ apiKey: "", siteUrl: "https://example.com", urls: ["https://example.com/a"] }),
	).rejects.toThrow("bingIndexing needs an apiKey")
	expect(fetcher).toHaveBeenCalledTimes(2)
})

it("no key in errors", async () => {
	answering(500)
	const result = await bingIndexing({ apiKey: KEY, siteUrl: "https://example.com", urls: ["https://example.com/a"] })
	expect(result).toEqual({ ok: false, error: "Bing answered 500" })
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async (input) => {
			throw new TypeError(`fetch failed for ${String(input)}`)
		}),
	)
	const failed = await bingIndexing({ apiKey: KEY, siteUrl: "https://example.com", urls: ["https://example.com/a"] })
	expect(failed).toEqual({ ok: false, error: "Bing request failed" })
	expect(JSON.stringify(failed)).not.toContain(KEY)
})
