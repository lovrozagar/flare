import { expect, it, vi } from "vitest"
import { createRouter, type RouteModule } from "./create-router.ts"
import { loadChain } from "./load-chain.ts"

// A module namespace, as the generated lazy ref returns it: tagged `Module`, its record under `route`.
function namespace(route?: RouteModule): { route?: RouteModule } {
	return Object.defineProperty(route === undefined ? {} : { route }, Symbol.toStringTag, { value: "Module" })
}

function lazyAt(module: () => Promise<{ route?: RouteModule }>) {
	return createRouter({ layouts: { _root_: {} }, routeTree: [{ id: "_root_/a", path: "/a", module }] }).match("/a")
		.chain
}

// The generated lazy ref returns the module's namespace, and its record is `route`. In dev, Vite's runner can hand a
// concurrent import a namespace that is still evaluating, through an import cycle, after an edit: its `route` fills
// when that evaluation finishes, so dev waits for the live binding, at most about 600 ms. Production never waits
// (BUGS.md 73).
it("namespace record", async () => {
	const page = { loader: () => ({ id: "page" }) }
	expect((await loadChain(lazyAt(async () => namespace(page)))).map((entry) => entry.module)).toEqual([{}, page])
	const filling = namespace()
	setTimeout(() => Object.assign(filling, { route: page }), 5)
	expect((await loadChain(lazyAt(async () => filling))).map((entry) => entry.module)).toEqual([{}, page])
	await expect(loadChain(lazyAt(async () => namespace()))).rejects.toThrow(
		"_root_/a has no route record: export `route`",
	)
	vi.stubEnv("DEV", false)
	try {
		const late = namespace()
		setTimeout(() => Object.assign(late, { route: page }), 5)
		await expect(loadChain(lazyAt(async () => late))).rejects.toThrow("_root_/a has no route record")
	} finally {
		vi.unstubAllEnvs()
	}
})
