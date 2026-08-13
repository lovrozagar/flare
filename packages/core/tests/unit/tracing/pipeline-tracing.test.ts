import { describe, expect, it, vi } from "vitest"
import type { PipelineConfig, ResolvedRoute } from "../../../src/loader-pipeline/index.ts"
import { runPipeline } from "../../../src/loader-pipeline/index.ts"
import { createTimingTracer } from "../../../src/tracing/timing.ts"

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

describe("pipeline tracing", () => {
	it("produces spans for all 6 phases", async () => {
		const tracer = createTimingTracer()
		const route = makeRoute({
			head: () => ({ title: "Test" }),
			headers: () => ({ "X-Custom": "1" }),
			loader: vi.fn(() => Promise.resolve({ data: "ok" })),
		})

		await runPipeline(makeConfig({ routes: [route], tracer }))

		const names = tracer.getEntries().map((e) => e.name)
		expect(names).toContain("flare.pipeline.validation")
		expect(names).toContain("flare.pipeline.authenticate")
		expect(names).toContain("flare.pipeline.preload_authorize")
		expect(names).toContain("flare.pipeline.loaders")
		expect(names).toContain("flare.pipeline.head")
		expect(names).toContain("flare.pipeline.headers")
	})

	it("produces per-route loader spans", async () => {
		const tracer = createTimingTracer()
		const layout = makeRoute({
			_type: "layout",
			loader: vi.fn(() => Promise.resolve("layout-data")),
			variablePath: "_root_",
			virtualPath: "_root_",
		})
		const page = makeRoute({
			loader: vi.fn(() => Promise.resolve("page-data")),
			variablePath: "_root_/page",
			virtualPath: "_root_/page",
		})

		await runPipeline(makeConfig({ routes: [layout, page], tracer }))

		const names = tracer.getEntries().map((e) => e.name)
		expect(names).toContain("flare.pipeline.loader:_root_")
		expect(names).toContain("flare.pipeline.loader:_root_/page")
	})

	it("produces per-route preloader spans", async () => {
		const tracer = createTimingTracer()
		const route = makeRoute({
			preloader: vi.fn(() => Promise.resolve({ userId: 1 })),
		})

		await runPipeline(makeConfig({ routes: [route], tracer }))

		const names = tracer.getEntries().map((e) => e.name)
		expect(names).toContain("flare.pipeline.preloader:_root_")
	})

	it("produces per-route authorize spans", async () => {
		const tracer = createTimingTracer()
		const route = makeRoute({
			authorize: vi.fn(() => true),
		})

		await runPipeline(makeConfig({ routes: [route], tracer }))

		const names = tracer.getEntries().map((e) => e.name)
		expect(names).toContain("flare.pipeline.authorize:_root_")
	})

	it("all span durations are non-negative", async () => {
		const tracer = createTimingTracer()
		const route = makeRoute({
			loader: vi.fn(() => Promise.resolve("data")),
		})

		await runPipeline(makeConfig({ routes: [route], tracer }))

		for (const entry of tracer.getEntries()) {
			expect(entry.dur).toBeGreaterThanOrEqual(0)
		}
	})

	it("works without tracer (noop fallback)", async () => {
		const route = makeRoute({
			loader: vi.fn(() => Promise.resolve("data")),
		})

		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches).toHaveLength(1)
		expect(result.matches[0]?.status).toBe("success")
	})
})
