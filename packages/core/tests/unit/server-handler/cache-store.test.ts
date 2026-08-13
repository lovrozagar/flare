import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRouter, type MarkedRouterConfig } from "../../../src/router-config/index.ts"
import type { RouteData } from "../../../src/router-primitives/index.ts"
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts"
import { createServerHandler, type ServerHandlerConfig } from "../../../src/server-handler/index.ts"
import type { FlareStore } from "../../../src/store/index.ts"

/* ── Spy on runPipeline to capture cache store arg ───────────────── */

const runPipelineSpy = vi.fn()

vi.mock("../../../src/loader-pipeline", async () => {
	const actual = await vi.importActual<typeof import("../../../src/loader-pipeline")>(
		"../../../src/loader-pipeline",
	)
	return {
		...actual,
		runPipeline: (...args: unknown[]) => {
			runPipelineSpy(...args)
			return actual.runPipeline(...(args as [never]))
		},
	}
})

/* ── Helpers ──────────────────────────────────────────────────────── */

function makeRouteData(): RouteData {
	return {
		e: "page",
		o: {},
		p: () =>
			Promise.resolve({
				default: {
					_type: "render",
					loader: () => ({ msg: "ok" }),
					render: () => "html",
					variablePath: "/test",
					virtualPath: "_root_/test",
				},
			}),
		t: "r" as const,
		v: "/test",
		x: "_root_/test",
	}
}

function makeRouter(): MarkedRouterConfig {
	const tree = createTreeNode()
	insertRoute(tree, "/test", makeRouteData())
	return createRouter({ layouts: {}, routeTree: tree })
}

function makeConfig(overrides?: Partial<ServerHandlerConfig>): ServerHandlerConfig {
	return {
		router: makeRouter(),
		...overrides,
	}
}

/* ── Tests ────────────────────────────────────────────────────────── */

describe("ServerHandlerConfig cache.store", () => {
	beforeEach(() => {
		runPipelineSpy.mockClear()
	})

	it("cache.store object passed directly to pipeline", async () => {
		const store: FlareStore = {
			delete: async () => {},
			deleteByTags: async () => {},
			get: async () => null,
			set: async () => {},
		}

		const handler = createServerHandler(makeConfig({ cache: { store } }))
		await handler.fetch(new Request("http://localhost/test"), {})

		expect(runPipelineSpy).toHaveBeenCalled()
		const pipelineConfig = runPipelineSpy.mock.calls[0]?.[0]
		expect(pipelineConfig.store).toBe(store)
	})

	it("cache.store factory function passed to pipeline", async () => {
		const store: FlareStore = {
			delete: async () => {},
			deleteByTags: async () => {},
			get: async () => null,
			set: async () => {},
		}
		const factory = (_env: unknown) => store

		const handler = createServerHandler(makeConfig({ cache: { store: factory } }))
		await handler.fetch(new Request("http://localhost/test"), { KV: "binding" })

		expect(runPipelineSpy).toHaveBeenCalled()
		const pipelineConfig = runPipelineSpy.mock.calls[0]?.[0]
		expect(pipelineConfig.store).toBe(factory)
	})

	it("no cache.store → pipeline gets undefined", async () => {
		const handler = createServerHandler(makeConfig())
		await handler.fetch(new Request("http://localhost/test"), {})

		expect(runPipelineSpy).toHaveBeenCalled()
		const pipelineConfig = runPipelineSpy.mock.calls[0]?.[0]
		expect(pipelineConfig.store).toBeUndefined()
	})
})
