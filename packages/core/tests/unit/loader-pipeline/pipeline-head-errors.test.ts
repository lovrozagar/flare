import { describe, expect, it, vi } from "vitest"
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

describe("pipeline head callback errors", () => {
	it("head callback throw stores headError on match", async () => {
		const route = makeRoute({
			head: () => {
				throw new Error("head exploded")
			},
			loader: () => ({ title: "test" }),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("success")
		expect(result.matches[0]?.headError?.message).toBe("head exploded")
	})

	it("head error does not prevent subsequent route heads from running", async () => {
		const layout = makeRoute({
			_type: "layout",
			head: () => {
				throw new Error("layout head failed")
			},
			loader: () => ({}),
			virtualPath: "_root_/(group)",
		})
		const page = makeRoute({
			head: () => ({ title: "page title" }),
			loader: () => ({}),
			virtualPath: "_root_/(group)/page",
		})
		const result = await runPipeline(makeConfig({ routes: [layout, page] }))
		expect(result.matches[0]?.headError?.message).toBe("layout head failed")
		expect(result.matches[1]?.headConfig?.title).toBe("page title")
		expect(result.matches[1]?.headError).toBeUndefined()
	})

	it("non-Error throw stored as Error with stringified message", async () => {
		const route = makeRoute({
			head: () => {
				throw "string error"
			},
			loader: () => ({}),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.headError).toBeInstanceOf(Error)
		expect(result.matches[0]?.headError?.message).toBe("string error")
	})
})

describe("pipeline headers callback errors", () => {
	it("headers callback throw stores headersError on match", async () => {
		const route = makeRoute({
			headers: () => {
				throw new Error("headers exploded")
			},
			loader: () => ({}),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("success")
		expect(result.matches[0]?.headersError?.message).toBe("headers exploded")
		expect(result.matches[0]?.headError).toBeUndefined()
	})

	it("headers error does not prevent subsequent route headers from running", async () => {
		const layout = makeRoute({
			_type: "layout",
			headers: () => {
				throw new Error("layout headers failed")
			},
			loader: () => ({}),
			virtualPath: "_root_/(group)",
		})
		const page = makeRoute({
			headers: () => ({ "X-Custom": "value" }),
			loader: () => ({}),
			virtualPath: "_root_/(group)/page",
		})
		const result = await runPipeline(makeConfig({ routes: [layout, page] }))
		expect(result.matches[0]?.headersError?.message).toBe("layout headers failed")
		expect(result.matches[1]?.responseHeaders?.["X-Custom"]).toBe("value")
		expect(result.matches[1]?.headersError).toBeUndefined()
	})
})

describe("head + headers combined errors", () => {
	it("both head and headers errors preserved separately", async () => {
		const route = makeRoute({
			head: () => {
				throw new Error("head err")
			},
			headers: () => {
				throw new Error("headers err")
			},
			loader: () => ({}),
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.headError?.message).toBe("head err")
		expect(result.matches[0]?.headersError?.message).toBe("headers err")
	})

	it("error match (status error) head callback skipped", async () => {
		const headFn = vi.fn(() => ({ title: "should not run" }))
		const route = makeRoute({
			head: headFn,
			loader: () => {
				throw new Error("loader failed")
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(headFn).not.toHaveBeenCalled()
	})
})
