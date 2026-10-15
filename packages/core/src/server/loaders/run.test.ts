import { expect, it, vi } from "vitest"
import type { Issue } from "../../shared/validation/issues.ts"
import { runLoaders, type LoaderRoute, type RunInput } from "./run.ts"

const session = { id: "ada" }
const issue: Issue = { message: "required", path: ["email"] }
const rejects = { "~standard": { validate: () => ({ issues: [issue] }) } }
const boom = new Error("boom")

function noop(): void {}

function request(routes: readonly LoaderRoute[], extra: Partial<RunInput> = {}): RunInput {
	return {
		kind: "document",
		request: new Request("http://localhost/"),
		env: {},
		authenticate: () => null,
		routes,
		...extra,
	}
}

function throws(): never {
	throw boom
}

type Traced = { seen: string[]; status: number; data: readonly unknown[]; heads: readonly unknown[] }

async function traced(extra: Partial<RunInput>, authorized = true): Promise<Traced> {
	const seen: string[] = []
	const route: LoaderRoute = {
		id: "page",
		auth: { mode: "optional", callerData: [] },
		input: {
			params: (raw) => {
				seen.push("validate")
				return raw
			},
		},
		preloader: () => seen.push("preloader"),
		authorize: () => {
			seen.push("authorize")
			return authorized
		},
		loader: () => {
			seen.push("loader")
			return "page data"
		},
		head: () => {
			seen.push("head")
			return {}
		},
		headers: () => {
			seen.push("headers")
			return {}
		},
	}
	const run = await runLoaders(
		request([route], {
			authenticate: () => {
				seen.push("authenticate")
				return session
			},
			shared: true,
			readStore: () => {
				seen.push("store")
				return Promise.resolve(null)
			},
			...extra,
		}),
	)
	return { seen, status: run.response.status, data: run.data, heads: run.heads }
}

// A shared run reads the store after authorize, a document, data, or prefetch alike (02-system step 11). A run
// that read the store runs no loader: the caller serves the hit, or renders the miss on the shared request.
it("order", async () => {
	for (const kind of ["document", "data", "prefetch"] as const) {
		const shared = await traced({ kind })
		expect(shared.seen).toEqual(["validate", "authenticate", "preloader", "authorize", "store"])
		expect(shared.data).toEqual([])
	}
	const notShared = await traced({ shared: false })
	expect(notShared.seen).toEqual(["validate", "authenticate", "preloader", "authorize", "loader", "head", "headers"])
	expect(notShared.data).toEqual(["page data"])
	expect(notShared.heads).toEqual([{}])
	const denied = await traced({}, false)
	expect(denied.status).toBe(403)
	expect(denied.seen).toEqual(["validate", "authenticate", "preloader", "authorize"])
	const broken = await traced({ authenticate: throws })
	expect(broken.status).toBe(500)
	expect(broken.seen).toEqual(["validate"])
})

it("auth args", async () => {
	const seen: unknown[] = []
	await runLoaders(
		request(
			[
				{
					id: "page",
					auth: { mode: true, callerData: [] },
					preloader: (ctx) => seen.push(ctx.auth),
					authorize: (ctx) => {
						seen.push(ctx.auth)
						return true
					},
					loader: (ctx) => seen.push(ctx.auth),
				},
			],
			{ authenticate: () => session },
		),
	)
	expect(seen).toEqual([session, session, session])
	const authorizeOnly: unknown[] = []
	await runLoaders(
		request(
			[
				{
					id: "page",
					authorize: (ctx) => {
						authorizeOnly.push(ctx.auth)
						return true
					},
				},
			],
			{ authenticate: () => session },
		),
	)
	expect(authorizeOnly).toEqual([session])
})

it("authorize is sequential", async () => {
	let release: () => void = noop
	const gate = new Promise<boolean>((resolve) => {
		release = () => resolve(true)
	})
	let loaderStarted = false
	const pending = runLoaders(
		request([
			{ id: "layout", authorize: () => gate },
			{
				id: "page",
				loader: () => {
					loaderStarted = true
				},
			},
		]),
	)
	await flush()
	expect(loaderStarted).toBe(false)
	release()
	await pending
	expect(loaderStarted).toBe(true)
	const seen: string[] = []
	const denied = await runLoaders(
		request([
			{
				id: "root",
				loader: () => {
					seen.push("root loader")
					return "root data"
				},
			},
			{
				id: "layout",
				preloader: () => seen.push("layout pre"),
				authorize: () => {
					seen.push("layout authz")
					return false
				},
				loader: () => seen.push("layout loader"),
			},
			{ id: "page", preloader: () => seen.push("page pre"), loader: () => seen.push("page loader") },
		]),
	)
	expect(denied.response.status).toBe(403)
	expect(seen).toEqual(["layout pre", "layout authz", "root loader"])
	expect(denied.frames).toEqual([{ t: "l", m: "root", d: "root data" }])
})

it("loaders are parallel", async () => {
	let started = 0
	let release: () => void = noop
	const both = new Promise<void>((resolve) => {
		release = resolve
	})
	const loader = (): Promise<void> => {
		started += 1
		return both
	}
	const pending = runLoaders(
		request([
			{ id: "a", loader },
			{ id: "b", loader },
		]),
	)
	await flush()
	expect(started).toBe(2)
	release()
	await pending
})

it("input failure", async () => {
	const result = await fail("document")
	expect(result.status).toBe(400)
	expect(result.contentType).toBe("application/json")
	expect(result.body).not.toContain("<")
	expect(JSON.parse(result.body)).toEqual({
		issues: [issue],
		fieldErrors: { email: ["required"] },
	})
	expect(result.authenticated).toBe(false)
	expect(result.overlay).toBe(false)
	// Root-down: a layout's params failure answers before the page's validators run.
	const later = vi.fn<(raw: unknown) => unknown>((raw) => raw)
	const routes = [
		{ id: "_root_", input: { params: rejects } },
		{ id: "page", input: { params: later, searchParams: later } },
	]
	const rooted = await runLoaders(request(routes, { params: { id: "7" } }))
	expect(rooted.response.status).toBe(400)
	expect(JSON.parse(await rooted.response.text())).toEqual({ issues: [issue], fieldErrors: { email: ["required"] } })
	expect(later).not.toHaveBeenCalled()
})

it("data input", async () => {
	const result = await fail("data")
	expect(result.status).toBe(400)
	expect(result.contentType).toBe("application/json")
	expect(JSON.parse(result.body)).toEqual({
		issues: [issue],
		fieldErrors: { email: ["required"] },
	})
	expect(result.body).not.toContain('"t":"e"')
})

it("preloader throw", async () => {
	const page = await runLoaders(request([{ id: "page", preloader: throws }]))
	expect(page.response.status).toBe(500)
	expect(page.failed).toEqual({ m: "page", status: 500, boundary: "errorRender", error: boom })
	let descendant = false
	const layout = await runLoaders(
		request([
			{ id: "layout", preloader: throws },
			{
				id: "page",
				loader: () => {
					descendant = true
				},
			},
		]),
	)
	expect(layout.response.status).toBe(500)
	expect(descendant).toBe(false)
	const data = await runLoaders(request([{ id: "page", preloader: throws }], { kind: "data" }))
	expect(data.response.status).toBe(200)
	expect(data.frames).toEqual([{ t: "e", m: "page", e: boom }])
	const authorize = await runLoaders(request([{ id: "page", authorize: throws }]))
	expect(authorize.response.status).toBe(500)
	expect(authorize.failed?.boundary).toBe("errorRender")
})

async function fail(kind: RunInput["kind"]): Promise<{
	status: number
	contentType: string | null
	body: string
	authenticated: boolean
	overlay: boolean
}> {
	let authenticated = false
	let overlay = false
	const { response } = await runLoaders(
		request([{ id: "page", auth: { mode: true, callerData: [] }, input: { searchParams: rejects } }], {
			kind,
			authenticate: () => {
				authenticated = true
				return session
			},
			overlay: () => {
				overlay = true
			},
		}),
	)
	return {
		status: response.status,
		contentType: response.headers.get("content-type"),
		body: await response.text(),
		authenticated,
		overlay,
	}
}

// A macrotask: every microtask the gate and the loaders queue has run before this resolves.
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

it("policy class", async () => {
	const optional: LoaderRoute = { id: "page", auth: { mode: "optional", callerData: [] }, loader: () => "page" }
	const classes = await Promise.all(
		["Bearer ada", "Bearer bob"].map(async (authorization) => {
			const incoming = new Request("http://localhost/", { headers: { authorization } })
			const run = await runLoaders(
				request([optional], {
					request: incoming,
					authenticate: () => ({ token: incoming.headers.get("authorization") }),
				}),
			)
			return run.class
		}),
	)
	expect(classes).toEqual(["anonymous", "anonymous"])
	const required = await runLoaders(
		request([{ id: "page", auth: { mode: true, callerData: [] } }], { authenticate: () => ({ id: "ada" }) }),
	)
	expect(required.class).toBe("required")
})

type Seen = unknown

function contextOf(ctx: { preloaderContext?: unknown }): Seen {
	return "preloaderContext" in ctx ? (ctx.preloaderContext ?? {}) : "absent"
}

it("preloader context", async () => {
	const seen: Record<string, Seen> = {}
	const mark =
		(name: string, value?: Seen) =>
		(ctx: { preloaderContext?: Seen }): Seen | undefined => {
			seen[name] = contextOf(ctx)
			return value
		}
	const chain: LoaderRoute[] = [
		{
			id: "root",
			preloader: mark("root preloader", { a: 1 }),
			authorize: (ctx) => {
				seen["root authorize"] = contextOf(ctx)
				return true
			},
		},
		{
			id: "layout",
			preloader: mark("layout preloader", { b: 2 }),
			authorize: (ctx) => {
				seen["layout authorize"] = contextOf(ctx)
				return true
			},
			loader: mark("layout loader"),
		},
		{
			id: "page",
			preloader: mark("page preloader", { c: 3 }),
			loader: mark("page loader"),
			head: (ctx) => {
				seen["page head"] = ctx.preloaderContext
				return {}
			},
		},
	]
	const run = await runLoaders(request(chain))
	const responder = { ...chain[2], loader: undefined, head: undefined }
	const answered = await runLoaders(
		request([chain[0], chain[1], responder], {
			response: (ctx) => {
				seen["page response"] = contextOf(ctx)
				return new Response("ok")
			},
		}),
	)
	expect(answered.answer?.status).toBe(200)
	expect(seen).toEqual({
		"root preloader": "absent",
		"root authorize": "absent",
		"layout preloader": { a: 1 },
		"layout authorize": { a: 1 },
		"page preloader": { a: 1, b: 2 },
		"page response": { a: 1, b: 2, c: 3 },
		"layout loader": { a: 1, b: 2 },
		"page loader": { a: 1, b: 2, c: 3 },
		"page head": { a: 1, b: 2, c: 3 },
	})
	expect(run.contexts).toEqual([{ a: 1 }, { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }])
})

it("preloader merge", async () => {
	let last: Seen | "absent" = "absent"
	const merged = await runLoaders(
		request([
			{ id: "root", preloader: () => ({ role: "editor", x: 1 }) },
			{ id: "layout", preloader: () => undefined },
			{
				id: "page",
				preloader: () => ({ role: "admin" }),
				loader: (ctx) => {
					last = contextOf(ctx)
				},
			},
		]),
	)
	expect(last).toEqual({ role: "admin", x: 1 })
	expect(merged.contexts).toEqual([
		{ role: "editor", x: 1 },
		{ role: "editor", x: 1 },
		{ role: "admin", x: 1 },
	])
	const none = await runLoaders(request([{ id: "page", loader: (ctx) => (last = contextOf(ctx)) }]))
	expect(last).toEqual({})
	expect(none.contexts).toEqual([{}])
})

function text(): string {
	return "text"
}

it("primitive loader", async () => {
	const dev = await runLoaders(request([{ id: "_root_/about", loader: text }], { dev: true }))
	expect(dev.failed?.error).toEqual(new Error("_root_/about: a loader returns an object or nothing, not a string"))
	const prod = await runLoaders(request([{ id: "_root_/about", loader: text }]))
	expect(prod.data).toEqual(["text"])
	const fine = await runLoaders(
		request(
			[
				{ id: "a", loader: () => ({ ok: 1 }) },
				{ id: "b", loader: () => null },
			],
			{ dev: true },
		),
	)
	expect(fine.data).toEqual([{ ok: 1 }, null])
})
