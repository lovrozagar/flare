import { expect, it, vi } from "vitest"
import { useSearch } from "../../shared/components/index.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { createServer } from "./create.ts"

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
	const authenticate = vi.fn<() => unknown>(() => ({ id: "ada" }))
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
	expect(body).toContain('"params":{"id":7},"search":{"page":2}')
})
