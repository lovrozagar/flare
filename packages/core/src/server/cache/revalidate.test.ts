import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it, vi } from "vitest"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { serveWith } from "../lifecycle/create.ts"
import type { Logger } from "../lifecycle/logger.ts"
import type { FlareStore } from "./contract.ts"
import { createMemoryStore } from "./memory.ts"
import { createRevalidateFn, revalidate, type RevalidateOptions } from "./revalidate.ts"

function noop(): void {}

const quiet: Logger = { level: "error", error: noop, warn: noop, log: noop }

function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

const SITE = "https://example.com"
const KEY = "static:dev:_root_/p"

// A stored page at /p, and a `.response()` route at /purge that calls the handler's `revalidate`.
function serve(store: FlareStore, purge: RevalidateOptions): ReturnType<typeof serveWith> {
	const page = createPage("_root_/p")
		.cache({ isr: true })
		.render(() => "p")
	const purger = createPage("_root_/purge").response(async () => {
		await revalidate(purge)
		return new Response("purged")
	})
	const router = createRouter({
		layouts: { _root_: createRootLayout("_root_").render((props) => documentOf(props.children)) },
		routeTree: [
			{ id: "_root_/p", path: "/p", module: page },
			{ id: "_root_/purge", path: "/purge", module: purger, response: true },
		],
	})
	return serveWith({ router, site: SITE, store }, { dev: false, log: quiet })
}

async function cacheOf(app: ReturnType<typeof serveWith>): Promise<string | null> {
	const response = await app.fetch(new Request(`${SITE}/p`))
	await response.text()
	return response.headers.get("flare-cache")
}

// The handler's `revalidate` and `createRevalidateFn(store)` purge the store the handler reads.
it("same store", async () => {
	const store = createMemoryStore()
	const app = serve(store, { keys: [KEY] })
	expect(await cacheOf(app)).toBe("miss")
	await vi.waitFor(async () => expect(await cacheOf(app)).toBe("hit"))
	await (await app.fetch(new Request(`${SITE}/purge`))).text()
	expect(await cacheOf(app)).toBe("miss")
	await vi.waitFor(async () => expect(await cacheOf(app)).toBe("hit"))
	await createRevalidateFn(store)({ keys: [KEY] })
	expect(await cacheOf(app)).toBe("miss")
})

// A purge started during a request is handed to the adapter's waitUntil, so it outlives the response.
it("background", async () => {
	const store = createMemoryStore()
	const waitUntil = vi.fn<(promise: Promise<unknown>) => void>()
	await (await serve(store, { tags: ["t"] }).fetch(new Request(`${SITE}/purge`), {}, { waitUntil })).text()
	expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
	expect((await store.get("epoch:t"))?.data).toEqual(expect.any(Number))
})

// Neither field throws at the call, before any store work.
it("empty", () => {
	const store = createMemoryStore()
	expect(() => createRevalidateFn(store)({})).toThrow(/keys or tags/)
	expect(() => revalidate({ keys: [] })).toThrow(/keys or tags/)
})

// v0's fields do not exist. A cast still throws when the options are read.
it("no tiers", () => {
	const store = createMemoryStore()
	const purge = createRevalidateFn(store)
	const options: unknown = { tags: ["p"], tiers: ["cdn"] }
	expect(() => purge(options as RevalidateOptions)).toThrow(/tiers/)
	// Outside a request, the handler's revalidate has no store to purge.
	expect(() => revalidate({ tags: ["p"] })).toThrow(/inside a request/)
})
