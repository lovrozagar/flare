import { getRequestEvent } from "@solidjs/web"
import { expect, it } from "vitest"
import { createRouter } from "../../shared/router/create-router.ts"
import { serverCtx, withServerContext } from "../context/ctx.ts"
import { runLoaders, type LoaderRoute, type RunInput } from "./run.ts"
import { loaderScope } from "./scope.ts"

const locale = createRouter({
	layouts: {},
	routeTree: [],
	locale: { locales: ["en", "hr"], defaultLocale: "en" },
}).locale

function input(routes: readonly LoaderRoute[], params: Record<string, string>): RunInput {
	return {
		kind: "document",
		request: new Request("http://localhost/"),
		env: {},
		authenticate: () => null,
		routes,
		params,
		locale,
	}
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1))

// Each loader and preloader call runs under a child of the request event that names it, its params, and the
// router's locale config. useLoaderT and usePreloaderT read it there.
it("loader scope", async () => {
	const seen: unknown[] = []
	const route = (id: string): LoaderRoute => ({
		id,
		preloader: () => void seen.push({ id, preloader: loaderScope()?.kind }),
		loader: async () => {
			await tick()
			// The child inherits the request: serverCtx() still answers inside the loader.
			seen.push({ id, scope: loaderScope(), context: serverCtx() })
			return {}
		},
	})
	const request = { request: new Request("http://localhost/"), env: {}, serverContext: () => ({ app: 1 }) }
	const after = await withServerContext(
		request,
		async () => {
			// Two runs at once, each with its own params, keep them apart across the awaits.
			await Promise.all([
				runLoaders(input([route("en")], { locale: "en" })),
				runLoaders(input([route("hr")], { locale: "hr" })),
			])
			return getRequestEvent()
		},
		() => undefined,
	)
	expect(seen).toContainEqual({ id: "en", preloader: "preloader" })
	expect(seen).toContainEqual({
		id: "en",
		scope: { kind: "loader", params: { locale: "en" }, locale },
		context: { app: 1 },
	})
	expect(seen).toContainEqual({
		id: "hr",
		scope: { kind: "loader", params: { locale: "hr" }, locale },
		context: { app: 1 },
	})
	// After the loaders return, the request event is the parent again, with no scope.
	expect(after).toBeDefined()
	expect(after === undefined ? "missing" : "flareLoader" in after).toBe(false)
	expect(loaderScope()).toBeUndefined()
	// A run with no raw params gives its calls an empty record.
	const bare = { ...input([], {}), params: undefined }
	const scope = await withServerContext(
		request,
		() => runLoaders({ ...bare, routes: [{ id: "page", loader: () => ({ scope: loaderScope() }) }] }),
		() => undefined,
	)
	expect(scope?.data[0]).toEqual({ scope: { kind: "loader", params: {}, locale } })
})

const QUERY = Symbol.for("flare.query")

// A loader's `ctx.queryClient` is the registered getter's client for this request (dx/types.md `query client present`).
it("loader query client", async () => {
	const client = { name: "client" }
	Reflect.set(
		globalThis,
		QUERY,
		Object.assign(() => client, { dehydrate: () => undefined }),
	)
	try {
		const run = await runLoaders(
			input([{ id: "page", loader: (ctx) => ({ client: Reflect.get(ctx, "queryClient") }) }], {}),
		)
		expect(run.data[0]).toEqual({ client })
	} finally {
		Reflect.deleteProperty(globalThis, QUERY)
	}
})

// A loader that reads `ctx.queryClient` and returns what it read, or the message it threw.
function readClient(ctx: object): { message: string } {
	try {
		return { message: String(Reflect.get(ctx, "queryClient")) }
	} catch (error) {
		return { message: error instanceof Error ? error.message : "" }
	}
}

it("query client unregistered", async () => {
	const run = await runLoaders(input([{ id: "page", loader: readClient }], {}))
	expect(run.data[0]).toEqual({ message: "call createQueryClientGetter() in a module your router imports" })
})
