import { describe, expect, it } from "vitest"
import {
	compilePattern,
	type FlareMiddleware,
	onPage,
	onServerFn,
	type MiddlewareContext,
	type MiddlewareEntry,
	type RequestType,
	resolveMiddlewareEntries,
	virtualPath,
} from "../../../src/middleware/index.ts"

function makeCtx(overrides: Partial<MiddlewareContext> = {}): MiddlewareContext {
	const url = new URL("http://localhost/test")
	return {
		bypass: (response: Response) => Object.freeze({ response, type: "bypass" as const }),
		env: {},
		error: () => {},
		log: () => {},
		next: () => Promise.resolve(Object.freeze({ type: "next" as const })),
		nonce: "test",
		onResponse: () => {},
		request: new Request(url),
		requestType: "page",
		respond: (response: Response) => Object.freeze({ response, type: "respond" as const }),
		serverContext: {},
		url,
		warn: () => {},
		...overrides,
	}
}

/* ── compilePattern ─────────────────────────────────────────────────── */

describe("compilePattern()", () => {
	it("exact match", () => {
		const match = compilePattern("/dashboard")
		expect(match("/dashboard")).toBe(true)
		expect(match("/dashboard/")).toBe(false)
		expect(match("/dashboard/settings")).toBe(false)
		expect(match("/other")).toBe(false)
	})

	it("wildcard match", () => {
		const match = compilePattern("/api/*")
		expect(match("/api")).toBe(true)
		expect(match("/api/")).toBe(true)
		expect(match("/api/users")).toBe(true)
		expect(match("/api/users/123")).toBe(true)
		expect(match("/apix")).toBe(false)
		expect(match("/other")).toBe(false)
	})

	it("root wildcard", () => {
		const match = compilePattern("/*")
		expect(match("")).toBe(true)
		expect(match("/")).toBe(true)
		expect(match("/anything")).toBe(true)
	})

	it("nested wildcard", () => {
		const match = compilePattern("/a/b/*")
		expect(match("/a/b")).toBe(true)
		expect(match("/a/b/c")).toBe(true)
		expect(match("/a/b/c/d")).toBe(true)
		expect(match("/a")).toBe(false)
	})

	it("exact root match", () => {
		const match = compilePattern("/")
		expect(match("/")).toBe(true)
		expect(match("/other")).toBe(false)
	})
})

/* ── virtualPath ────────────────────────────────────────────────────── */

describe("virtualPath()", () => {
	it("literal segments match exactly", () => {
		const match = virtualPath("/dashboard/settings")
		expect(match("/dashboard/settings")).toBe(true)
		expect(match("/dashboard")).toBe(false)
		expect(match("/dashboard/settings/extra")).toBe(false)
	})

	it("[param] matches any single segment", () => {
		const match = virtualPath("/users/[id]")
		expect(match("/users/123")).toBe(true)
		expect(match("/users/abc")).toBe(true)
		expect(match("/users")).toBe(false)
		expect(match("/users/123/edit")).toBe(false)
	})

	it("[[optional]] matches zero or one segment", () => {
		const match = virtualPath("/[[locale]]/about")
		expect(match("/about")).toBe(true)
		expect(match("/en/about")).toBe(true)
		expect(match("/hr/about")).toBe(true)
		expect(match("/en")).toBe(false)
		expect(match("/en/about/extra")).toBe(false)
	})

	it("[[optional]] at end matches zero or one", () => {
		const match = virtualPath("/blog/[[page]]")
		expect(match("/blog")).toBe(true)
		expect(match("/blog/2")).toBe(true)
		expect(match("/blog/2/extra")).toBe(false)
	})

	it("[...catch] matches one or more segments", () => {
		const match = virtualPath("/docs/[...slug]")
		expect(match("/docs/intro")).toBe(true)
		expect(match("/docs/a/b/c")).toBe(true)
		expect(match("/docs")).toBe(false)
	})

	it("[[...optional-catch]] matches zero or more segments", () => {
		const match = virtualPath("/files/[[...path]]")
		expect(match("/files")).toBe(true)
		expect(match("/files/a")).toBe(true)
		expect(match("/files/a/b/c")).toBe(true)
	})

	it("mixed: [[locale]] + wildcard-like via [[...rest]]", () => {
		const match = virtualPath("/[[locale]]/[[...rest]]")
		expect(match("/")).toBe(true)
		expect(match("/en")).toBe(true)
		expect(match("/en/about")).toBe(true)
		expect(match("/en/dashboard/settings")).toBe(true)
		expect(match("/about")).toBe(true)
	})

	it("multiple params", () => {
		const match = virtualPath("/[org]/[repo]/issues/[id]")
		expect(match("/acme/widgets/issues/42")).toBe(true)
		expect(match("/acme/widgets/issues")).toBe(false)
		expect(match("/acme/widgets")).toBe(false)
	})

	it("root path", () => {
		const match = virtualPath("/")
		expect(match("/")).toBe(true)
		expect(match("/anything")).toBe(false)
	})

	it("optional at start — locale pattern", () => {
		const match = virtualPath("/[[locale]]/[[...rest]]")
		expect(match("/")).toBe(true)
		expect(match("/en")).toBe(true)
		expect(match("/en/about")).toBe(true)
		expect(match("/about")).toBe(true)
		expect(match("/en/dash/settings/deep")).toBe(true)
	})

	it("works as .use() matcher", () => {
		const mwA: FlareMiddleware = async (ctx) => ctx.next()
		const entries: MiddlewareEntry[] = [
			{ matchers: [virtualPath("/[[locale]]/dashboard")], middlewares: [mwA] },
		]
		expect(resolveMiddlewareEntries(entries, "/dashboard")).toEqual([mwA])
		expect(resolveMiddlewareEntries(entries, "/en/dashboard")).toEqual([mwA])
		expect(resolveMiddlewareEntries(entries, "/about")).toEqual([])
	})
})

/* ── onPage / onServerFn ───────────────────────────────────────── */

describe("onPage()", () => {
	it("runs middleware when requestType is page", async () => {
		let ran = false
		const mw: FlareMiddleware = async (ctx) => {
			ran = true
			return ctx.next()
		}
		const wrapped = onPage(mw)
		await wrapped(makeCtx({ requestType: "page" }))
		expect(ran).toBe(true)
	})

	it("skips middleware for server-fn requests", async () => {
		let ran = false
		const mw: FlareMiddleware = async (ctx) => {
			ran = true
			return ctx.next()
		}
		const wrapped = onPage(mw)
		await wrapped(makeCtx({ requestType: "server-fn" }))
		expect(ran).toBe(false)
	})

	it("skips middleware for mount requests", async () => {
		let ran = false
		const mw: FlareMiddleware = async (ctx) => {
			ran = true
			return ctx.next()
		}
		const wrapped = onPage(mw)
		await wrapped(makeCtx({ requestType: "mount" }))
		expect(ran).toBe(false)
	})

	it("skips middleware for internal requests", async () => {
		let ran = false
		const mw: FlareMiddleware = async (ctx) => {
			ran = true
			return ctx.next()
		}
		const wrapped = onPage(mw)
		await wrapped(makeCtx({ requestType: "internal" }))
		expect(ran).toBe(false)
	})
})

describe("onServerFn()", () => {
	it("runs middleware when requestType is server-fn", async () => {
		let ran = false
		const mw: FlareMiddleware = async (ctx) => {
			ran = true
			return ctx.next()
		}
		const wrapped = onServerFn(mw)
		await wrapped(makeCtx({ requestType: "server-fn" }))
		expect(ran).toBe(true)
	})

	it("skips middleware for page requests", async () => {
		let ran = false
		const mw: FlareMiddleware = async (ctx) => {
			ran = true
			return ctx.next()
		}
		const wrapped = onServerFn(mw)
		await wrapped(makeCtx({ requestType: "page" }))
		expect(ran).toBe(false)
	})
})

/* ── resolveMiddlewareEntries ───────────────────────────────────────── */

describe("resolveMiddlewareEntries()", () => {
	const mwA: FlareMiddleware = async (ctx) => ctx.next()
	const mwB: FlareMiddleware = async (ctx) => ctx.next()
	const mwC: FlareMiddleware = async (ctx) => ctx.next()

	it("includes entries without matchers (global)", () => {
		const entries: MiddlewareEntry[] = [{ middlewares: [mwA] }]
		const result = resolveMiddlewareEntries(entries, "/anything")
		expect(result).toEqual([mwA])
	})

	it("includes entries where at least one matcher matches", () => {
		const entries: MiddlewareEntry[] = [
			{ matchers: [compilePattern("/dashboard/*")], middlewares: [mwA] },
		]
		expect(resolveMiddlewareEntries(entries, "/dashboard/settings")).toEqual([mwA])
		expect(resolveMiddlewareEntries(entries, "/other")).toEqual([])
	})

	it("flattens multiple matching entries", () => {
		const entries: MiddlewareEntry[] = [
			{ middlewares: [mwA] },
			{ matchers: [compilePattern("/api/*")], middlewares: [mwB] },
			{ matchers: [compilePattern("/api/*")], middlewares: [mwC] },
		]
		const result = resolveMiddlewareEntries(entries, "/api/test")
		expect(result).toEqual([mwA, mwB, mwC])
	})

	it("preserves order", () => {
		const entries: MiddlewareEntry[] = [
			{ matchers: [compilePattern("/x/*")], middlewares: [mwB] },
			{ middlewares: [mwA] },
		]
		const result = resolveMiddlewareEntries(entries, "/x/y")
		expect(result).toEqual([mwB, mwA])
	})
})

/* ── requestType on context ─────────────────────────────────────────── */

describe("requestType on MiddlewareContext", () => {
	const allTypes: RequestType[] = ["internal", "mount", "page", "server-fn"]

	for (const type of allTypes) {
		it(`accepts requestType "${type}"`, () => {
			const ctx = makeCtx({ requestType: type })
			expect(ctx.requestType).toBe(type)
		})
	}
})

/* ── Scope system removed ───────────────────────────────────────────── */

describe("scope system removed", () => {
	it("FlareMiddleware has no __scope property", () => {
		const mw: FlareMiddleware = async (ctx) => ctx.next()
		expect("__scope" in mw).toBe(false)
	})

	it("middleware module does not export createMiddleware", async () => {
		const mod = await import("../../../src/middleware")
		expect("createMiddleware" in mod).toBe(false)
	})

	it("middleware module does not export filterMiddlewaresByScope", async () => {
		const mod = await import("../../../src/middleware")
		expect("filterMiddlewaresByScope" in mod).toBe(false)
	})

	it("middleware module does not export getMiddlewareScope", async () => {
		const mod = await import("../../../src/middleware")
		expect("getMiddlewareScope" in mod).toBe(false)
	})

	it("middleware module does not export mount()", async () => {
		const mod = await import("../../../src/middleware")
		expect("mount" in mod).toBe(false)
	})

	it("middleware module does not export isMountMiddleware()", async () => {
		const mod = await import("../../../src/middleware")
		expect("isMountMiddleware" in mod).toBe(false)
	})

	it("middleware module does not export middlewareNext", async () => {
		const mod = await import("../../../src/middleware")
		expect("middlewareNext" in mod).toBe(false)
	})

	it("middleware module does not export middlewareBypass", async () => {
		const mod = await import("../../../src/middleware")
		expect("middlewareBypass" in mod).toBe(false)
	})

	it("middleware module does not export middlewareRespond", async () => {
		const mod = await import("../../../src/middleware")
		expect("middlewareRespond" in mod).toBe(false)
	})
})
