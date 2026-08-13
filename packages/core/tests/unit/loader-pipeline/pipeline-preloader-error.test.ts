import { describe, expect, it, vi } from "vitest"
import {
	NotFoundError,
	RedirectResponse,
	UnauthenticatedError,
	UnauthorizedError,
} from "../../../src/errors/index.ts"
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

describe("preloader error recovery", () => {
	it("preloader throws → match has error, loaderData undefined", async () => {
		const loader = vi.fn(() => Promise.resolve({ data: true }))
		const route = makeRoute({
			loader,
			preloader: () => {
				throw new Error("preloader boom")
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[0]?.error?.message).toBe("preloader boom")
		expect(result.matches[0]?.loaderData).toBeUndefined()
		expect(loader).not.toHaveBeenCalled()
	})

	it("preloader throws redirect → pipeline throws redirect (re-throw)", async () => {
		const route = makeRoute({
			preloader: () => {
				throw new RedirectResponse({ to: "/login" })
			},
		})
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow(RedirectResponse)
	})

	it("preloader throws notFound → pipeline throws notFound (re-throw)", async () => {
		const route = makeRoute({
			preloader: () => {
				throw new NotFoundError()
			},
		})
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow(NotFoundError)
	})

	it("preloader throws UnauthenticatedError → pipeline throws (re-throw)", async () => {
		const route = makeRoute({
			preloader: () => {
				throw new UnauthenticatedError()
			},
		})
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow(UnauthenticatedError)
	})

	it("preloader throws UnauthorizedError → pipeline throws (re-throw)", async () => {
		const route = makeRoute({
			preloader: () => {
				throw new UnauthorizedError()
			},
		})
		await expect(runPipeline(makeConfig({ routes: [route] }))).rejects.toThrow(UnauthorizedError)
	})

	it("layout preloader throws → descendants errored, siblings unaffected", async () => {
		const childLoader = vi.fn(() => Promise.resolve("child-data"))
		const siblingLoader = vi.fn(() => Promise.resolve("sibling-data"))

		const layout = makeRoute({
			_type: "layout",
			preloader: () => {
				throw new Error("layout preloader fail")
			},
			virtualPath: "_root_/(auth)",
		})
		const child = makeRoute({
			loader: childLoader,
			virtualPath: "_root_/(auth)/dashboard",
		})
		const sibling = makeRoute({
			loader: siblingLoader,
			virtualPath: "_root_/public",
		})
		const result = await runPipeline(makeConfig({ routes: [layout, child, sibling] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[0]?.error?.message).toBe("layout preloader fail")
		expect(result.matches[1]?.status).toBe("error")
		expect(result.matches[1]?.error?.message).toBe("layout preloader fail")
		expect(childLoader).not.toHaveBeenCalled()
		expect(result.matches[2]?.status).toBe("success")
		expect(result.matches[2]?.loaderData).toBe("sibling-data")
	})

	it("root-layout preloader throws → all children errored", async () => {
		const childLoader = vi.fn(() => Promise.resolve("data"))
		const root = makeRoute({
			_type: "root-layout",
			preloader: () => {
				throw new Error("root fail")
			},
			virtualPath: "_root_",
		})
		const child = makeRoute({
			loader: childLoader,
			virtualPath: "_root_/page",
		})
		const result = await runPipeline(makeConfig({ routes: [root, child] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[1]?.status).toBe("error")
		expect(childLoader).not.toHaveBeenCalled()
	})

	it("preloader error skips authorize for that route", async () => {
		const authorizeFn = vi.fn(() => true)
		const route = makeRoute({
			authorize: authorizeFn,
			preloader: () => {
				throw new Error("pre fail")
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(authorizeFn).not.toHaveBeenCalled()
	})

	it("preloaderSnapshot captured before error (inherits parent context)", async () => {
		const root = makeRoute({
			_type: "root-layout",
			preloader: () => ({ user: { id: "1" } }),
			virtualPath: "_root_",
		})
		const layout = makeRoute({
			_type: "layout",
			preloader: () => {
				throw new Error("layout fail")
			},
			virtualPath: "_root_/(auth)",
		})
		const result = await runPipeline(makeConfig({ routes: [root, layout] }))
		/* root succeeded — its snapshot has its own preloader result */
		expect(result.matches[0]?.preloaderContext).toEqual({ user: { id: "1" } })
		/* layout failed — snapshot captures state before its own preloader ran (parent context) */
		expect(result.matches[1]?.preloaderContext).toEqual({ user: { id: "1" } })
	})

	it("preloader throwing non-Error (string) → wrapped in Error", async () => {
		const route = makeRoute({
			preloader: () => {
				throw "raw string"
			},
		})
		const result = await runPipeline(makeConfig({ routes: [route] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[0]?.error).toBeInstanceOf(Error)
		expect(result.matches[0]?.error?.message).toBe("raw string")
	})

	it("render-type route preloader error does NOT cascade to siblings", async () => {
		const siblingLoader = vi.fn(() => Promise.resolve("ok"))
		const page = makeRoute({
			preloader: () => {
				throw new Error("page fail")
			},
			virtualPath: "_root_/page-a",
		})
		const sibling = makeRoute({
			loader: siblingLoader,
			virtualPath: "_root_/page-b",
		})
		const result = await runPipeline(makeConfig({ routes: [page, sibling] }))
		expect(result.matches[0]?.status).toBe("error")
		expect(result.matches[1]?.status).toBe("success")
		expect(siblingLoader).toHaveBeenCalled()
	})
})
