import { readFileSync } from "node:fs"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { googleIndexing } from "./google.ts"

// A throwaway 2048-bit RSA key made for this test only. It signs nothing anywhere else. google.fixture.txt is the JWT
// it signs for the fixed claims below, checked once with `openssl dgst -sha256 -verify` against its public half.
const TEST_KEY = [
	"-----BEGIN PRIVATE KEY-----",
	"MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5LwTv3mcAevxh",
	"lNmfqI25bC9Kxji5cR0KxgX42b3nMmBxhxpxXFRvozQYdjYlgOcM35RnCDrVpc0f",
	"AcfZ+tpKtFvK5tUgXgYRzJkbw3B5Kekxn3jQQNYpcBdrstStD5Lgd/T0u4eMgSNa",
	"tA/tl9KLHKtVecgJypbqtnpBkhoJXzrK2GmSm+yhsyJ/V4N4XQk/t5+2gac8rHzX",
	"S69qPV6Xgu6gZAjtZODRIliXcc86Sd2V250qRLcziMp1tJGCZnxj5ojKCM8d+GKs",
	"IHw2wo0yB+CfHIZRE6at4VkJKO5Z4V5rGaDkiz6GyPJD2cHHyqjRSvs5P30nHCrn",
	"sARVp+8DAgMBAAECggEAWh3YDLTRsimnbQNHPkuDoILVptE8pH23sNj56gZoRDy/",
	"MzAYfab9ThCBVxAbvHd0uM6KxPL70qFrZxXyQBEzrpwDeYOInsYytPG4Zorezo/H",
	"NAdTfyC2N5cdRqNRnOBRzRuDIJ+r0IO9hTPP9oLmCh2LAT8QyjcE5zai2wry0bDq",
	"mXV+jfj8r+zw/gey/C1fEnGnpHLi4PJd+j/tC+YrSSVYQvqIPYwZ6qjJZPErfOIJ",
	"D6/bQLe3/xJOSplYQUwQmhkH+oibWACaU0HuHVVJ/0EjWqkwPlXX1OiuasOh0HNx",
	"6K3qo3u7nfbcvrAm4AVqVZ64GrjDASd+1GpNmGp2KQKBgQDcNFsIKHImkIza4F39",
	"y91FOyFc7sdO+nq8u76iFsoPqMfhSkQL1dlvAG42ZzxNb5NaciGgoPy3NfoHYA4U",
	"1vWYsHHMXiff1wZ3A+ToEd/X8/sjH2LDuXmTkVVVrXKhNcdq3jxKatmRZPQEuGKs",
	"HBtSNtOPGaDbS2hEP0H5B4opSQKBgQDXSUw2E88KI++ENnhYFe4vyAqv8jLHWmXO",
	"T3ZPLTVOewJFp7BIm+kfoxjIglxIJVEvLwmDnQoz4OIG4IfiprHIxfL1nfVM0Yj2",
	"GOvW/6IZrOi6+uYpfFRc9ip3gT7tfK1GgQGTtbqPtCbF73EduGW1RewLWdQJsRNW",
	"dlUezxTB6wKBgQCgl2IoMe8F5veCjIyfkfS+D6CGOPGLzKqER9uANGSKRQn4aIP1",
	"qbDX/hVigal9w7hQBto1XhLPvoKorEm4swgLoepsI+KqoRNq6qEfCiIYSSvG8pXB",
	"rdtXXm9Ae60UmrbjXk3T69bd7ST06E+1uw3FyIxDWWpxY64Xz5ZaekAtWQKBgFZ+",
	"Mko/pxyx11bM84igNvOncPPDYLdLED/VGPkydoozTXRirKZfTUfSpPBZv22U4IsO",
	"YMop26GAJg8RQkbDJgY90SDw906HmHkXBhl41s1t9Iq6pqHgO5yloeYlXPzY7Fy5",
	"E8MebfeyLymyy0Vfgi1UDEN7MX87T0ObgxM/q11FAoGACCXB/Ux0jRVrgB0u7KUf",
	"RIjuOzaoSN0gzgWSR5CQXNOwBdXKxc6Am8e4UQ36Z6zZG/ehdJKSTZnL89NQIsRt",
	"Uf4P3SBq8hJnXAsfqRVvzN1+3mvB8vYm8dYLgh2LMJia4VZrrzEx/or0Vwdmg/MP",
	"mguYzPMIJw63PyrBFqE7Dws=",
	"-----END PRIVATE KEY-----",
].join("\n")

const FIXTURE = readFileSync(new URL("./google.fixture.txt", import.meta.url), "utf8").trim()
const IAT = 1_700_000_000
const TOKEN = "ya29.test-access-token"
const credentials = { clientEmail: "indexer@example.iam.gserviceaccount.com", privateKey: TEST_KEY }

type Fetcher = ReturnType<typeof vi.fn<typeof fetch>>

const logs: { lines: string[] } = { lines: [] }

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] })
	vi.setSystemTime(IAT * 1000)
	logs.lines = []
	for (const level of ["log", "info", "warn", "error", "debug"] as const) {
		vi.spyOn(console, level).mockImplementation(
			(...args: unknown[]) => void logs.lines.push(args.map(String).join(" ")),
		)
	}
})

afterEach(() => {
	vi.useRealTimers()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

// The token endpoint answers `tokenStatus`, every later call answers `status`.
function google(status = 200, tokenStatus = 200): Fetcher {
	const fetcher = vi.fn<typeof fetch>(async (input) => {
		if (String(input) === "https://oauth2.googleapis.com/token") {
			return Response.json({ access_token: TOKEN, expires_in: 3600 }, { status: tokenStatus })
		}
		return new Response(null, { status })
	})
	vi.stubGlobal("fetch", fetcher)
	return fetcher
}

function call(fetcher: Fetcher, index: number): { url: string; init: RequestInit | undefined } {
	const found = fetcher.mock.calls[index]
	return { url: String(found?.[0]), init: found?.[1] }
}

function decode(part: string | undefined): unknown {
	return JSON.parse(Buffer.from(String(part), "base64url").toString("utf8"))
}

function secretsAbsent(value: unknown): void {
	const text = JSON.stringify(value) + logs.lines.join("\n")
	expect(text).not.toContain("PRIVATE KEY")
	expect(text).not.toContain(TEST_KEY.split("\n")[1])
	expect(text).not.toContain(TOKEN)
}

it("jwt", async () => {
	const fetcher = google()
	const sitemap = { siteUrl: "https://example.com/", sitemapUrl: "https://example.com/sitemap.xml" }
	const result = await googleIndexing({ credentials, sitemap })
	expect(result).toEqual({ ok: true })
	const token = call(fetcher, 0)
	expect(token.url).toBe("https://oauth2.googleapis.com/token")
	expect(token.init?.method).toBe("POST")
	expect(new Headers(token.init?.headers).get("content-type")).toBe("application/x-www-form-urlencoded")
	const form = new URLSearchParams(String(token.init?.body))
	expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer")
	const jwt = form.get("assertion")
	expect(jwt).toBe(FIXTURE)
	const [header, claims] = String(jwt).split(".")
	expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" })
	expect(decode(claims)).toEqual({
		iss: credentials.clientEmail,
		scope: "https://www.googleapis.com/auth/webmasters",
		aud: "https://oauth2.googleapis.com/token",
		iat: IAT,
		exp: IAT + 3600,
	})
	expect(new Headers(call(fetcher, 1).init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`)
	secretsAbsent(result)
	// Notify mode signs for the indexing scope.
	const notify = google()
	await googleIndexing({ credentials, urls: [{ url: "https://example.com/a", type: "URL_UPDATED" }] })
	const notifyClaims = String(new URLSearchParams(String(call(notify, 0).init?.body)).get("assertion")).split(".")[1]
	expect(decode(notifyClaims)).toMatchObject({ scope: "https://www.googleapis.com/auth/indexing" })
})

it("no log", async () => {
	const fetcher = google()
	const privateKey = "-----BEGIN PRIVATE KEY-----\nbm90IGEga2V5IFNFQ1JFVE1BVEVSSUFM\n-----END PRIVATE KEY-----"
	const result = await googleIndexing({
		credentials: { ...credentials, privateKey },
		urls: [{ url: "https://example.com/a", type: "URL_UPDATED" }],
	})
	expect(result).toEqual({ ok: false, error: "Google signing failed" })
	expect(JSON.stringify(result) + logs.lines.join("\n")).not.toContain("bm90IGEga2V5IFNFQ1JFVE1BVEVSSUFM")
	expect(fetcher).not.toHaveBeenCalled()
})

it("one mode", async () => {
	google()
	const sitemap = { siteUrl: "https://example.com", sitemapUrl: "https://example.com/sitemap.xml" }
	const urls = [{ url: "https://example.com/a", type: "URL_UPDATED" as const }]
	// @ts-expect-error exactly one of sitemap and urls
	await expect(googleIndexing({ credentials, sitemap, urls })).rejects.toThrow(
		"googleIndexing takes exactly one of sitemap and urls",
	)
	// @ts-expect-error exactly one of sitemap and urls
	await expect(googleIndexing({ credentials })).rejects.toThrow("googleIndexing takes exactly one of sitemap and urls")
})

it("sitemap", async () => {
	const fetcher = google()
	await googleIndexing({
		credentials,
		sitemap: { siteUrl: "https://example.com/", sitemapUrl: "https://example.com/sitemap.xml" },
	})
	expect(fetcher).toHaveBeenCalledTimes(2)
	const put = call(fetcher, 1)
	expect(put.url).toBe(
		`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent("https://example.com/")}/sitemaps/${encodeURIComponent("https://example.com/sitemap.xml")}`,
	)
	expect(put.init?.method).toBe("PUT")
	await expect(
		googleIndexing({
			credentials,
			sitemap: { siteUrl: "http://example.com", sitemapUrl: "https://example.com/s.xml" },
		}),
	).rejects.toThrow("googleIndexing sitemap.siteUrl must be an https origin")
	await expect(
		googleIndexing({ credentials, sitemap: { siteUrl: "https://example.com", sitemapUrl: "/sitemap.xml" } }),
	).rejects.toThrow("googleIndexing sitemap.sitemapUrl must be an absolute https url")
})

it("notify", async () => {
	const fetcher = google()
	const result = await googleIndexing({
		credentials,
		urls: [
			{ url: "https://example.com/a", type: "URL_UPDATED" },
			{ url: "https://example.com/b", type: "URL_DELETED" },
		],
	})
	expect(result).toEqual({ ok: true })
	expect(fetcher).toHaveBeenCalledTimes(3)
	for (const [index, body] of [
		[1, { url: "https://example.com/a", type: "URL_UPDATED" }],
		[2, { url: "https://example.com/b", type: "URL_DELETED" }],
	] as const) {
		const post = call(fetcher, index)
		expect(post.url).toBe("https://indexing.googleapis.com/v3/urlNotifications:publish")
		expect(post.init?.method).toBe("POST")
		expect(new Headers(post.init?.headers).get("content-type")).toBe("application/json; charset=utf-8")
		expect(JSON.parse(String(post.init?.body))).toEqual(body)
	}
	await expect(
		// @ts-expect-error the type is URL_UPDATED or URL_DELETED
		googleIndexing({ credentials, urls: [{ url: "https://example.com/a", type: "URL_MOVED" }] }),
	).rejects.toThrow('googleIndexing url type "URL_MOVED" is not URL_UPDATED or URL_DELETED')
	await expect(
		googleIndexing({ credentials, urls: [{ url: "http://example.com/a", type: "URL_UPDATED" }] }),
	).rejects.toThrow("googleIndexing url http://example.com/a is not an absolute https url")
})

// Publishes resolve when the test says, so the in-flight count is observable.
function held(failing: string): { fetcher: Fetcher; peak: () => number; release: () => void } {
	let open = 0
	let peak = 0
	const waiting: Array<() => void> = []
	const fetcher = vi.fn<typeof fetch>(async (input, init) => {
		if (String(input) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: TOKEN })
		open += 1
		peak = Math.max(peak, open)
		await new Promise<void>((resolve) => waiting.push(resolve))
		open -= 1
		return new Response(null, { status: String(init?.body).includes(failing) ? 500 : 200 })
	})
	vi.stubGlobal("fetch", fetcher)
	const release = (): void => {
		for (const resolve of waiting.splice(0)) resolve()
	}
	return { fetcher, peak: () => peak, release }
}

async function settled<T>(promise: Promise<T>, release: () => void): Promise<T> {
	const timer = setInterval(release, 1)
	try {
		return await promise
	} finally {
		clearInterval(timer)
	}
}

const three = ["a", "b", "c"].map((path) => ({ url: `https://example.com/${path}`, type: "URL_UPDATED" as const }))

it("concurrency", async () => {
	const one = held("none")
	expect(await settled(googleIndexing({ credentials, urls: three }), one.release)).toEqual({ ok: true })
	expect(one.peak()).toBe(1)
	const two = held("none")
	await settled(googleIndexing({ credentials, urls: three, concurrency: 2 }), two.release)
	expect(two.peak()).toBe(2)
	// A failure starts nothing new and waits for the request in flight.
	const failing = held("example.com/a")
	const result = await settled(googleIndexing({ credentials, urls: three, concurrency: 2 }), failing.release)
	expect(result).toEqual({ ok: false, error: "Google answered 500" })
	expect(failing.fetcher).toHaveBeenCalledTimes(3)
	await expect(googleIndexing({ credentials, urls: three, concurrency: 0 })).rejects.toThrow(
		"googleIndexing concurrency must be an integer of at least 1",
	)
})

it("token fails", async () => {
	const fetcher = google(200, 400)
	const result = await googleIndexing({ credentials, urls: three })
	expect(result).toEqual({ ok: false, error: "Google token request answered 400" })
	expect(fetcher).toHaveBeenCalledTimes(1)
	secretsAbsent(result)
	// A 200 with no token, and a request that throws, are failures too.
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async () => Response.json({})),
	)
	expect(await googleIndexing({ credentials, urls: three })).toEqual({
		ok: false,
		error: "Google token request answered 200",
	})
	vi.stubGlobal(
		"fetch",
		vi.fn<typeof fetch>(async () => {
			throw new TypeError("network down")
		}),
	)
	expect(await googleIndexing({ credentials, urls: three })).toEqual({ ok: false, error: "Google request failed" })
})

it("publish fails", async () => {
	google(500)
	const result = await googleIndexing({ credentials, urls: three })
	expect(result).toEqual({ ok: false, error: "Google answered 500" })
	secretsAbsent(result)
	google(403)
	expect(
		await googleIndexing({
			credentials,
			sitemap: { siteUrl: "https://example.com", sitemapUrl: "https://example.com/sitemap.xml" },
		}),
	).toEqual({ ok: false, error: "Google answered 403" })
})

it("empty", async () => {
	const fetcher = google()
	await expect(googleIndexing({ credentials, urls: [] })).rejects.toThrow("googleIndexing needs at least one url")
	expect(fetcher).not.toHaveBeenCalled()
})

it("over cap", async () => {
	const fetcher = google()
	const urls = Array.from({ length: 101 }, (_, index) => ({
		url: `https://example.com/${index}`,
		type: "URL_UPDATED" as const,
	}))
	await expect(googleIndexing({ credentials, urls })).rejects.toThrow("googleIndexing takes at most 100 urls")
	expect(fetcher).not.toHaveBeenCalled()
})
