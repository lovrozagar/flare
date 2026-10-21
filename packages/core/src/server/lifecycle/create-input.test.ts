import { expect, it, vi } from "vitest"
import { useSearch } from "../../shared/components/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { createServer } from "./create.ts"
import { stateIn } from "../wire.fixture.ts"

// Route `.input()` through createServer (dx/builder.md): validators run before authenticate, and their output
// replaces that side for the match's later callbacks and render props.

const root = createRootLayout("_root_").render((props) => props.children)

function show(): string {
	return "list"
}

function toNumber(raw: unknown): { page: number } {
	return { page: Number(Reflect.get(Object(raw), "page")) }
}

function toId(raw: unknown): { id: number } {
	return { id: Number(Reflect.get(Object(raw), "id")) }
}

it("page input", async () => {
	const authenticate = vi.fn<() => {} | null>(() => ({ id: "ada" }))
	const failing = {
		"~standard": { validate: () => ({ issues: [{ message: "page must be a number", path: ["page"] }] }) },
	}
	const listed = createPage("_root_/list")
		.input({ searchParams: failing })
		.authenticate()
		.loader(() => ({ text: "list" }))
		.render(show)
	const app = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/list", path: "/list", module: listed }],
		}),
		authenticate,
	})
	for (const path of ["/list?page=x", "/list?page=x&_flare=data"]) {
		const response = await app.fetch(new Request(`http://localhost${path}`))
		expect(response.status).toBe(400)
		expect(response.headers.get("content-type")).toMatch(/^application\/json/)
		const body = await response.text()
		expect(JSON.parse(body)).toEqual({
			issues: [{ message: "page must be a number", path: ["page"] }],
			fieldErrors: { page: ["page must be a number"] },
		})
		expect(body).not.toContain("<")
		expect(body).not.toContain('"t":"e"')
	}
	expect(authenticate).not.toHaveBeenCalled()
})

it("input output", async () => {
	const seen: unknown[] = []
	const user = createPage("_root_/users/[id]")
		.input({ params: toId, searchParams: toNumber })
		.loader((ctx) => {
			seen.push({ loader: { params: ctx.params, search: ctx.search } })
			return { text: "user" }
		})
		.render((props) => {
			seen.push({ render: { params: props.params, search: props.search } })
			seen.push({ hook: Object.assign({}, useSearch({ from: "_root_/users/[id]" })) })
			return "user"
		})
	const app = createServer({
		router: createRouter({
			layouts: { _root_: root },
			routeTree: [{ id: "_root_/users/[id]", path: "/users/[id]", module: user }],
		}),
	})
	const body = await (await app.fetch(new Request("http://localhost/users/7?page=2"))).text()
	expect(seen).toEqual([
		{ loader: { params: { id: 7 }, search: { page: 2 } } },
		{ render: { params: { id: 7 }, search: { page: 2 } } },
		{ hook: { page: 2 } },
	])
	// The document state carries the validated values on the wire, as a navigation's `v` frame does (B145).
	expect(stateIn(body).at(-1)).toMatchObject({ params: { id: 7 }, search: { page: 2 } })
})

// A missing or wrong router is named at the call, not met later as an engine's TypeError (BUGS.md 477).
it("router required", () => {
	for (const value of [undefined, null, { routeTree: [] }, "router"]) {
		expect(() => createServer({ router: value } as never)).toThrow("createServer: router is required")
	}
})

// The observability options dx/observability.md plans are not in v1: `ServerOptions` has no such key, and a server
// given one from JavaScript or through a cast throws, naming it, instead of ignoring it (plan 21 13.14, BUGS.md 216).
it("planned options", () => {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [] })
	for (const key of ["logger", "onError", "requestLog", "tracer"]) {
		// The key's presence is what throws, a value of `undefined` included.
		for (const value of [() => undefined, undefined]) {
			expect(() => createServer({ router, [key]: value } as Parameters<typeof createServer>[0])).toThrow(
				`createServer: ${key} is planned (dx/observability.md) and not in v1`,
			)
		}
	}
	expect(() => createServer({ router })).not.toThrow()
})

// Any other key `ServerOptions` does not have throws too, naming it: an adapter's own, which createServer would
// otherwise ignore, says whose it is, and a misspelling is not dropped (BUGS.md 478).
it("unknown options", () => {
	const router = createRouter({ layouts: { _root_: root }, routeTree: [] })
	expect(() => createServer({ router, trustProxy: 1 } as never)).toThrow(
		"createServer: trustProxy is an adapter option, createNodeListener's or createBunFetch's (dx/adapters.md)",
	)
	// A misspelled key is named before any other check reads the options: `Site` with a store is the typo, not a
	// missing `site`.
	expect(() => createServer({ router, Site: "https://flare.test", store: {} } as never)).toThrow(
		"createServer: Site is not an option (dx/server.md)",
	)
	for (const key of ["sites", "basePath", "onerror"]) {
		expect(() => createServer({ router, [key]: undefined } as never)).toThrow(
			`createServer: ${key} is not an option (dx/server.md)`,
		)
	}
})
