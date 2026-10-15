import { createComponent } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it, vi } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import type { FlareStore } from "../cache/contract.ts"
import { artifactPath } from "../../shared/cache/index.ts"
import { createAssetsStore } from "../cache/assets.ts"
import { createMemoryStore } from "../cache/memory.ts"
import { createServer, serveWith } from "./create.ts"
import type { Logger } from "./logger.ts"

// createServer's `store`, `static`, and `site` options (bits/10 `server/lifecycle/create.test.ts`).

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }

const cached = createPage("_root_/")
	.cache({ isr: true })
	.render(() => "home")
// A stored page is a whole document, so its root renders `<html>` and `<body>`.
const whole = createRootLayout("_root_").render((props) =>
	createComponent(Dynamic, {
		component: "html",
		children: createComponent(Dynamic, { component: "body", children: props.children }),
	}),
)
const stored = createRouter({ layouts: { _root_: whole }, routeTree: [{ id: "_root_/", path: "/", module: cached }] })

// The function runs once on that request with that request's env, and the store it returns is the one written.
it("store function", async () => {
	const memory = createMemoryStore()
	const set = vi.fn<FlareStore["set"]>(memory.set)
	const envs: unknown[] = []
	const app = createServer({
		router: stored,
		site: "https://example.com",
		store: (env) => (envs.push(env), { ...memory, set }),
	})
	const env = { KV: "kv" }
	expect((await app.fetch(new Request("http://localhost/"), env)).status).toBe(200)
	expect(envs).toEqual([env])
	await vi.waitFor(() => expect(set).toHaveBeenCalledOnce())
})

// A store needs `site`, the origin every shared render requests. It is checked at the call.
it("store without site", () => {
	const store = createMemoryStore()
	const prod = { dev: false, log: quiet }
	expect(() => serveWith({ router: stored, store }, prod)).toThrow(/site/)
	for (const site of ["http://example.com", "https://example.com/app", "https://example.com/?a=1", "example.com"]) {
		expect(() => serveWith({ router: stored, store, site }, prod)).toThrow(/site/)
	}
	expect(() =>
		serveWith({ router: stored, store, site: "http://localhost:5173" }, { dev: true, log: quiet }),
	).not.toThrow()
	expect(() => serveWith({ router: stored, store, site: "https://example.com/" }, prod)).not.toThrow()
})

// The SSG read takes `static` the same way: called once on that request with its env, and the store it returns is
// the one read.
it("static function", async () => {
	const page = createPage("_root_/")
		.cache({ ssg: true })
		.render(() => "home")
	const router = createRouter({ layouts: { _root_: whole }, routeTree: [{ id: "_root_/", path: "/", module: page }] })
	const reads: string[] = []
	const envs: unknown[] = []
	const seeds = createAssetsStore(async (path) => {
		reads.push(path)
		return null
	})
	const app = createServer({ router, static: (env) => (envs.push(env), seeds) })
	const env = { ASSETS: "assets" }
	expect((await app.fetch(new Request("http://localhost/"), env)).status).toBe(200)
	expect(envs).toEqual([env])
	expect(reads).toEqual([await artifactPath("static:dev:_root_/", { build: "dev" })])
})
