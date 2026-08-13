import { describe, expect, it } from "vitest"
import type { PipelineConfig, ResolvedRoute } from "../../../src/loader-pipeline/index.ts"
import { runPipeline } from "../../../src/loader-pipeline/index.ts"

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
	return {
		_type: "render",
		variablePath: "/",
		virtualPath: "_root_",
		...overrides,
	}
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
	return {
		abortController: new AbortController(),
		cause: "enter",
		env: {},
		prefetch: false,
		request: new Request("http://localhost/"),
		routes: [],
		url: new URL("http://localhost/"),
		...overrides,
	}
}

/* ── loaderDeps computation ──────────────────────────────────────── */

describe("loaderDeps computation", () => {
	it("loaderDeps: ({search}) => [search.q] → deps in loader = ['test'] when ?q=test", async () => {
		let captured: unknown
		const route = makeRoute({
			effectsConfig: {
				loaderDeps: ({ search }: { search: Record<string, string | string[]> }) => [search.q ?? ""],
			},
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.deps
				return {}
			},
		})
		const url = new URL("http://localhost/?q=test")
		await runPipeline(makeConfig({ routes: [route], url }))
		expect(captured).toEqual(["test"])
	})

	it("loaderDeps affects matchId computation (different search → different matchId)", async () => {
		const loaderDeps = ({ search }: { search: Record<string, string | string[]> }) => [
			search.q ?? "",
		]
		const route1 = makeRoute({
			effectsConfig: { loaderDeps },
			loader: () => Promise.resolve({}),
			virtualPath: "_root_/search",
		})
		const url1 = new URL("http://localhost/search?q=foo")
		const result1 = await runPipeline(makeConfig({ routes: [route1], url: url1 }))

		const route2 = makeRoute({
			effectsConfig: { loaderDeps },
			loader: () => Promise.resolve({}),
			virtualPath: "_root_/search",
		})
		const url2 = new URL("http://localhost/search?q=bar")
		const result2 = await runPipeline(makeConfig({ routes: [route2], url: url2 }))

		expect(result1.matches[0]?.matchId).not.toBe(result2.matches[0]?.matchId)
	})

	it("no loaderDeps → deps = [] in loader", async () => {
		let captured: unknown
		const route = makeRoute({
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.deps
				return {}
			},
		})
		await runPipeline(makeConfig({ routes: [route] }))
		expect(captured).toEqual([])
	})

	it("loaderDeps returning empty array → deps = []", async () => {
		let captured: unknown
		const route = makeRoute({
			effectsConfig: {
				loaderDeps: () => [],
			},
			loader: (ctx: Record<string, unknown>) => {
				captured = ctx.deps
				return {}
			},
		})
		await runPipeline(makeConfig({ routes: [route] }))
		expect(captured).toEqual([])
	})
})

/* ── matchId with loaderDeps ─────────────────────────────────────── */

describe("matchId with loaderDeps", () => {
	it("same route + same params + same deps → same matchId", async () => {
		const loaderDeps = ({ search }: { search: Record<string, string | string[]> }) => [
			search.q ?? "",
		]
		const route1 = makeRoute({
			effectsConfig: { loaderDeps },
			loader: () => Promise.resolve({}),
			virtualPath: "_root_/search",
		})
		const url1 = new URL("http://localhost/search?q=hello")
		const result1 = await runPipeline(makeConfig({ routes: [route1], url: url1 }))

		const route2 = makeRoute({
			effectsConfig: { loaderDeps },
			loader: () => Promise.resolve({}),
			virtualPath: "_root_/search",
		})
		const url2 = new URL("http://localhost/search?q=hello")
		const result2 = await runPipeline(makeConfig({ routes: [route2], url: url2 }))

		expect(result1.matches[0]?.matchId).toBe(result2.matches[0]?.matchId)
	})

	it("same route + same params + different deps → different matchId", async () => {
		const loaderDeps = ({ search }: { search: Record<string, string | string[]> }) => [
			search.q ?? "",
		]
		const route1 = makeRoute({
			effectsConfig: { loaderDeps },
			loader: () => Promise.resolve({}),
			virtualPath: "_root_/search",
		})
		const url1 = new URL("http://localhost/search?q=alpha")
		const result1 = await runPipeline(makeConfig({ routes: [route1], url: url1 }))

		const route2 = makeRoute({
			effectsConfig: { loaderDeps },
			loader: () => Promise.resolve({}),
			virtualPath: "_root_/search",
		})
		const url2 = new URL("http://localhost/search?q=beta")
		const result2 = await runPipeline(makeConfig({ routes: [route2], url: url2 }))

		expect(result1.matches[0]?.matchId).not.toBe(result2.matches[0]?.matchId)
	})
})
