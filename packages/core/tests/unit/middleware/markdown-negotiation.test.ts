import { NodeHtmlMarkdown } from "node-html-markdown"
import { describe, expect, it, vi } from "vitest"
import type { MiddlewareContext, ResponseHandler } from "../../../src/middleware/index.ts"
import { runMiddlewares } from "../../../src/middleware/index.ts"
import { markdownNegotiation } from "../../../src/middleware/builtins/markdown-negotiation.ts"

function createCtx(overrides?: Partial<MiddlewareContext>): MiddlewareContext {
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env: {},
		error: () => {},
		log: () => {},
		next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
		nonce: "test-nonce",
		onResponse: () => {},
		request: new Request("http://localhost/test"),
		requestType: "page" as const,
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		serverContext: {},
		url: new URL("http://localhost/test"),
		warn: () => {},
		...overrides,
	}
}

async function runWithHandlers(
	mw: ReturnType<typeof markdownNegotiation>,
	ctx: MiddlewareContext,
	upstream: Response,
): Promise<Response> {
	const { responseHandlers } = await runMiddlewares([mw], ctx)
	let response = upstream
	for (const h of responseHandlers) {
		response = await h(response)
	}
	return response
}

const FAKE_HTML = "<html><body><h1>Hi</h1><p>Body</p></body></html>"
const fakeConvert = (html: string) => `${html.replace(/<[^>]+>/g, "").trim()} [md]`

describe("markdownNegotiation middleware", () => {
	it("passes through when Accept does not request markdown", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", {
				headers: { accept: "text/html" },
			}),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "text/html; charset=utf-8" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(final.headers.get("content-type")).toBe("text/html; charset=utf-8")
		expect(await final.text()).toBe(FAKE_HTML)
		/* Vary: Accept should still be set so caches segment future markdown hits. */
		expect(final.headers.get("vary")).toContain("Accept")
	})

	it("converts HTML to markdown when Accept requests markdown", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", {
				headers: { accept: "text/markdown" },
			}),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-length": "51", "content-type": "text/html; charset=utf-8" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(final.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
		expect(final.headers.get("vary")).toContain("Accept")
		expect(final.headers.get("content-length")).toBeNull()
		expect(final.headers.get("x-markdown-tokens")).toMatch(/^\d+$/)
		expect(await final.text()).toBe("HiBody [md]")
	})

	it("leaves non-HTML responses untouched", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/api", {
				headers: { accept: "text/markdown" },
			}),
		})
		const upstream = new Response('{"ok":true}', {
			headers: { "content-type": "application/json" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(final.headers.get("content-type")).toBe("application/json")
		expect(await final.text()).toBe('{"ok":true}')
	})

	it("leaves non-2xx responses untouched", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/404", {
				headers: { accept: "text/markdown" },
			}),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "text/html" },
			status: 404,
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(final.status).toBe(404)
		expect(final.headers.get("content-type")).toBe("text/html")
	})

	it("matches weighted Accept headers (text/html, text/markdown;q=0.9)", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", {
				headers: { accept: "text/html, text/markdown;q=0.9" },
			}),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "text/html" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(final.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
	})

	it("skips conversion when `when` returns false", async () => {
		const mw = markdownNegotiation({
			convert: fakeConvert,
			when: ({ url }) => !url.pathname.startsWith("/tools"),
		})
		const ctx = createCtx({
			request: new Request("http://localhost/tools/base64", {
				headers: { accept: "text/markdown" },
			}),
			url: new URL("http://localhost/tools/base64"),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "text/html" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(final.headers.get("content-type")).toBe("text/html")
	})

	it("bypasses conversion when HTML exceeds maxBytes", async () => {
		const big = `<p>${"x".repeat(2000)}</p>`
		const mw = markdownNegotiation({ convert: fakeConvert, maxBytes: 1000 })
		const ctx = createCtx({
			request: new Request("http://localhost/", {
				headers: { accept: "text/markdown" },
			}),
		})
		const upstream = new Response(big, {
			headers: { "content-type": "text/html" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(final.headers.get("content-type")).toBe("text/html")
	})

	it("suppresses token header when emitTokenHeader is false", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert, emitTokenHeader: false })
		const ctx = createCtx({
			request: new Request("http://localhost/", {
				headers: { accept: "text/markdown" },
			}),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "text/html" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(final.headers.get("x-markdown-tokens")).toBeNull()
	})

	it("accepts an async custom convert", async () => {
		const mw = markdownNegotiation({ convert: async (html) => `ASYNC:${html.length}` })
		const ctx = createCtx({
			request: new Request("http://localhost/", {
				headers: { accept: "text/markdown" },
			}),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "text/html" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)

		expect(await final.text()).toBe(`ASYNC:${FAKE_HTML.length}`)
	})

	it("treats missing Accept header as no match", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({ request: new Request("http://localhost/") })
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/html")
	})

	it("treats empty Accept as no match", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "" } }),
		})
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/html")
	})

	it("skips conversion when response has no content-type", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML)
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).not.toContain("markdown")
	})

	it("skips conversion on 3xx redirects", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(null, {
			headers: { "content-type": "text/html", location: "/new" },
			status: 302,
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.status).toBe(302)
		expect(final.headers.get("location")).toBe("/new")
	})

	it("skips conversion on 5xx errors", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response("<h1>err</h1>", {
			headers: { "content-type": "text/html" },
			status: 500,
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.status).toBe(500)
		expect(final.headers.get("content-type")).toBe("text/html")
	})

	it("skips conversion on 204 No Content", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(null, {
			headers: { "content-type": "text/html" },
			status: 204,
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.status).toBe(204)
	})

	it("matches content-type with charset parameter", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "text/html; charset=UTF-8" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
	})

	it("skips application/xhtml+xml responses (not text/html)", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "application/xhtml+xml" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("application/xhtml+xml")
	})

	it("preserves unrelated response headers on successful conversion", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: {
				"content-type": "text/html",
				"set-cookie": "session=abc; Path=/; HttpOnly",
				"x-custom": "keep-me",
			},
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("set-cookie")).toBe("session=abc; Path=/; HttpOnly")
		expect(final.headers.get("x-custom")).toBe("keep-me")
	})

	it("passes through HTML when convert throws", async () => {
		const mw = markdownNegotiation({
			convert: () => {
				throw new Error("boom")
			},
		})
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/html")
		expect(await final.text()).toBe(FAKE_HTML)
	})

	it("passes through HTML when async convert rejects", async () => {
		const mw = markdownNegotiation({
			convert: async () => {
				throw new Error("async boom")
			},
		})
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/html")
	})

	it("converts empty HTML body", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response("", { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
		expect(await final.text()).toMatch(/\[md\]$/)
	})

	it("skips conversion pre-flight when declared content-length exceeds maxBytes", async () => {
		const convert = vi.fn(fakeConvert)
		const mw = markdownNegotiation({ convert, maxBytes: 100 })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-length": "9999", "content-type": "text/html" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/html")
		expect(convert).not.toHaveBeenCalled()
	})

	it("passes request + url to `when` gate", async () => {
		const when = vi.fn(() => true)
		const mw = markdownNegotiation({ convert: fakeConvert, when })
		const request = new Request("http://localhost/pricing", {
			headers: { accept: "text/markdown" },
		})
		const url = new URL("http://localhost/pricing")
		const ctx = createCtx({ request, url })
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		await runWithHandlers(mw, ctx, upstream)
		expect(when).toHaveBeenCalledTimes(1)
		const lastCall = when.mock.lastCall as unknown as [{ request: Request; url: URL }] | undefined
		expect(lastCall?.[0].request).toBe(request)
		expect(lastCall?.[0].url).toBe(url)
	})

	it("passes the HTML body to the convert callback", async () => {
		const convert = vi.fn((html: string) => `LEN:${html.length}`)
		const mw = markdownNegotiation({ convert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		await runWithHandlers(mw, ctx, upstream)
		expect(convert).toHaveBeenCalledWith(FAKE_HTML)
	})

	it("token header reflects markdown length, not HTML length", async () => {
		const mw = markdownNegotiation({ convert: () => "short" })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response("<html>".repeat(1000), {
			headers: { "content-type": "text/html" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("x-markdown-tokens")).toBe("2") /* ceil(5/4) = 2 */
	})

	it("appends Vary: Accept when upstream already has a Vary header", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/html" } }),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-type": "text/html", vary: "Accept-Encoding" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		const vary = final.headers.get("vary") ?? ""
		expect(vary).toContain("Accept-Encoding")
		expect(vary).toContain("Accept")
	})

	it("sets Vary: Accept even when `when` rejects the request", async () => {
		const mw = markdownNegotiation({
			convert: fakeConvert,
			when: () => false,
		})
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("vary")).toContain("Accept")
		expect(final.headers.get("content-type")).toBe("text/html")
	})

	it("treats case-insensitive Accept header matches", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { Accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
	})

	it("drops content-length after conversion so downstream recomputes", async () => {
		const mw = markdownNegotiation({ convert: () => "tiny" })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, {
			headers: { "content-length": "999", "content-type": "text/html" },
		})
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-length")).toBeNull()
	})

	it("sets WebMCP-friendly content-type exactly (text/markdown; charset=utf-8)", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		expect(final.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
	})

	it("supports multiple onResponse handlers in chain (no duplicate Vary)", async () => {
		const mw = markdownNegotiation({ convert: fakeConvert })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const upstream = new Response(FAKE_HTML, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		/* Two onResponse handlers fire: the Vary appender and the converter.
		   Ensure Vary set only once — headers.append duplicates should be controlled. */
		const vary = final.headers.get("vary") ?? ""
		expect(vary.split(",").map((v) => v.trim()).filter((v) => v === "Accept")).toHaveLength(1)
	})
})

describe("markdownNegotiation — node-html-markdown integration", () => {
	it("converts headings, paragraphs, links, code via real engine", async () => {
		const mw = markdownNegotiation({ convert: (html) => NodeHtmlMarkdown.translate(html) })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const html = `
			<h1>Title</h1>
			<p>Paragraph with <a href="https://example.com">link</a> and <code>code</code>.</p>
			<ul><li>one</li><li>two</li></ul>
		`
		const upstream = new Response(html, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		const md = await final.text()

		expect(md).toContain("# Title")
		expect(md).toContain("[link](https://example.com)")
		expect(md).toContain("`code`")
		expect(md).toMatch(/[*-] one/)
		expect(md).toMatch(/[*-] two/)
	})

	it("converts tables via real engine", async () => {
		const mw = markdownNegotiation({ convert: (html) => NodeHtmlMarkdown.translate(html) })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const html = `<table>
			<thead><tr><th>Name</th><th>Age</th></tr></thead>
			<tbody><tr><td>Alice</td><td>30</td></tr><tr><td>Bob</td><td>25</td></tr></tbody>
		</table>`
		const upstream = new Response(html, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		const md = await final.text()

		expect(md).toContain("Alice")
		expect(md).toContain("Bob")
		expect(md).toContain("|")
	})

	it("strips scripts + styles (never leaks inline JS/CSS into markdown)", async () => {
		const mw = markdownNegotiation({ convert: (html) => NodeHtmlMarkdown.translate(html) })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const html = `
			<html><head><style>body{color:red}</style><script>alert('xss')</script></head>
			<body><h1>Safe</h1><script>bad()</script></body></html>
		`
		const upstream = new Response(html, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		const md = await final.text()

		expect(md).not.toContain("<script")
		expect(md).not.toContain("alert(")
		expect(md).not.toContain("<style")
		expect(md).toContain("Safe")
	})

	it("emits a token count roughly proportional to markdown length", async () => {
		const mw = markdownNegotiation({ convert: (html) => NodeHtmlMarkdown.translate(html) })
		const ctx = createCtx({
			request: new Request("http://localhost/", { headers: { accept: "text/markdown" } }),
		})
		const html = `<html><body>${"<p>word </p>".repeat(200)}</body></html>`
		const upstream = new Response(html, { headers: { "content-type": "text/html" } })
		const final = await runWithHandlers(mw, ctx, upstream)
		const tokens = Number(final.headers.get("x-markdown-tokens"))

		expect(tokens).toBeGreaterThan(10)
		expect(tokens).toBeLessThan(1000)
	})
})

/* Unused-import guard: type referenced only when TS tightens elsewhere. */
type _Unused = ResponseHandler
