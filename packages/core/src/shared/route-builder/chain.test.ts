import { expect, expectTypeOf, it } from "vitest"
import { createChain } from "./chain.ts"
import { createLayout } from "./layout.ts"
import { createRootLayout } from "./root-layout.ts"
import { createPage } from "./page.ts"
import type { BuilderSteps, RouteState } from "./route-types.ts"
import { createPathSegment } from "./segment.ts"
import type { CacheConfig } from "./types.ts"

const authorize = (): boolean => true
const preloader = (): string => "pre"
const loader = (): { data: string } => ({ data: "data" })
const render = (): string => "view"
const head = (): { title: string } => ({ title: "Home" })

const noop = () => null
const answer = (): Response => new Response(null)

it("second render throws", () => {
	expect(() => createChain("_root_").render(noop).render(noop)).toThrow(/render/)
})

it("loader then response throws", () => {
	expect(() => createChain("_root_").loader(noop).response(answer)).toThrow(/loader/)
})

it("order", () => {
	expect(() =>
		createChain("_root_")
			.loader(noop)
			.cache({ ssr: { ttl: "1m" } }),
	).toThrow(/order/)
})

it("one mode", () => {
	expect(() => {
		// @ts-expect-error ssr and isr are mutually exclusive
		createChain("_root_").cache({ ssr: { ttl: "1m" }, isr: true })
	}).toThrow(/one cache mode/)
	expect(() => createChain("_root_").cache({ ssr: { ttl: "1m" }, isr: true } as never)).toThrow(/one cache mode/)
})

// `isr: { dynamicParams: false }` lists the only slugs served, so it needs `params`: without it, it throws when the
// chain is built, and the type rejects it (BUGS.md 395).
it("dynamicParams needs params", () => {
	expect(() => {
		// @ts-expect-error dynamicParams false needs params
		createChain("_root_").cache({ isr: { dynamicParams: false } })
	}).toThrow("isr: { dynamicParams: false } needs params")
	expect(() => createChain("_root_").cache({ isr: { dynamicParams: false, params: () => [] } })).not.toThrow()
	expect(() => createChain("_root_").cache({ isr: { dynamicParams: true } })).not.toThrow()
})

it("no author key", () => {
	const built = createChain("_root_")
	// @ts-expect-error ssr has no author key
	const chain = built.cache({ ssr: { ttl: "1m", key: () => "x" } })
	expect(typeof chain.render).toBe("function")
})

const slugs = ({ params: parent }: { params: Record<string, string | string[]> }) => [{ ...parent, id: "1" }]

// The dx/cache.md forms: ssr tags as a list or a function of params, isr's fields, and ssg's params forms.
it("cache forms", () => {
	const configs: CacheConfig[] = [
		{ ssr: { ttl: "1m", tags: ({ params: values }) => [`p:${String(values["id"])}`], defer: "stream" } },
		{ isr: { revalidate: "60s", defer: "stream", params: slugs, dynamicParams: false } },
		{ isr: { params: async () => [{ id: "1" }] } },
		{ ssg: slugs },
		{ ssg: { params: slugs, defer: "resolve" } },
		{ ssg: { defer: "stream" } },
	]
	for (const config of configs) expect(typeof createChain("_root_").cache(config).render).toBe("function")
	// @ts-expect-error ttl is required
	expectTypeOf<{ ssr: {} }>().toExtend<CacheConfig>()
	// @ts-expect-error isr has no tags field: store tags are ssr.tags and cdn.tags
	expectTypeOf<{ isr: { tags: string[] } }>().toExtend<CacheConfig>()
})

it("optional argument", () => {
	expect(() => createChain("_root_").authenticate("optional")).toThrow(/authenticateOptional/)
})

it("stores in order", () => {
	const record = createChain("_root_")
		.cache({ ssr: { ttl: "1m" } })
		.authenticate("admin")
		.authorize(authorize)
		.preloader(preloader)
		.loader(loader)
		.head(head)
		.render(render)
		.record()
	expect(record).toEqual({
		cache: { ssr: { ttl: "1m" } },
		auth: { mode: true, callerData: ["admin"] },
		authorize,
		preloader,
		loader,
		head,
		render,
	})
	expect(() =>
		createChain("_root_")
			.preloader(noop)
			.authorize(() => true),
	).toThrow(/order/)
	expect(() => createChain("_root_").response(answer).loader(noop)).toThrow(/loader/)
	expect(createChain("_root_").response(answer).record()).toEqual({ response: answer })
})

it("authenticate records", () => {
	expect(createChain("_root_").authenticate().record()).toEqual({ auth: { mode: true, callerData: [] } })
	expect(createChain("_root_").authenticateOptional("a", "b").record()).toEqual({
		auth: { mode: "optional", callerData: ["a", "b"] },
	})
	expect(() => createChain("_root_").authenticate().authenticateOptional()).toThrow(/authenticate/)
})

function params(raw: unknown): unknown {
	return raw
}

it("input", () => {
	expect(createChain("_root_").input({ params }).record().input).toEqual({ params })
	// An empty input does not type-check (dx/types.md `input empty`); untyped, it throws.
	expect(() => createChain("_root_").input({} as never)).toThrow(/params or searchParams/)
	expect(() => createChain("_root_").authenticate().input({ params })).toThrow(/order/)
	expect(() =>
		createChain("_root_")
			.cache({ ssr: { ttl: "1m" } })
			.input({ searchParams: params }),
	).not.toThrow()
})

const headers = (): Record<string, string> => ({ "x-a": "1" })

// `.headers()` sits after `.head()` and before `.render()`, once (dx/builder.md).
it("headers step", () => {
	expect(createChain("_root_").head(head).headers(headers).render(render).record().headers).toBe(headers)
	expect(() => createChain("_root_").render(render).headers(headers)).toThrow(/order: headers/)
	expect(() => createChain("_root_").headers(headers).head(head)).toThrow(/order: head/)
	expect(() => createChain("_root_").headers(headers).headers(headers)).toThrow(/headers twice/)
	expect(() => createChain("_root_").security({}).headers(headers)).toThrow(/order: headers/)
	// `.response()` sits before the view steps, so the type drops it after them as the runtime refuses it (BUGS.md 355).
	for (const viewed of [createChain("_root_").head(head), createChain("_root_").headers(headers)]) {
		expect(() => viewed.response(() => new Response())).toThrow(/order: response/)
	}
	expect(typeof createLayout("_root_/(g)").headers).toBe("function")
	expect(typeof createRootLayout("_root_").headers).toBe("function")
	expect(createPathSegment("_root_/seg")).not.toHaveProperty("headers")
})

// The typed builders forward every step between ORDER's first two keys and `render`. A reordered key fails here.
it("forwarded steps", () => {
	const forwarded = ["cache", "input", "authenticate", "authenticateOptional", "authorize", "effects"]
	const steps = [...forwarded, "preloader", "loader", "head", "headers", "security"]
	expect(Object.keys(createLayout("_root_/(g)")).sort()).toEqual([...steps, "render"].sort())
	expect(Object.keys(createPage("_root_/p")).sort()).toEqual([...steps, "render", "intercept", "response"].sort())
	type Steps = Exclude<keyof BuilderSteps<RouteState, "layout">, "render">
	expectTypeOf<Steps>().toEqualTypeOf<
		| "cache"
		| "input"
		| "authenticate"
		| "authenticateOptional"
		| "authorize"
		| "effects"
		| "preloader"
		| "loader"
		| "head"
		| "headers"
		| "security"
	>()
})

const fromView = (): { "X-Frame-Options": false } => ({ "X-Frame-Options": false })

// `.security()` takes a config or a function of the four view fields (dx/builder.md).
it("security step", () => {
	const config = { "X-Frame-Options": "SAMEORIGIN" } as const
	expect(createChain("_root_").head(head).headers(headers).security(config).render(render).record().security).toBe(
		config,
	)
	expect(createChain("_root_").security(fromView).record().security).toBe(fromView)
	expect(() => createChain("_root_").render(render).security(config)).toThrow(/order: security/)
	expect(typeof createLayout("_root_/(g)").security).toBe("function")
	expect(typeof createRootLayout("_root_").security).toBe("function")
	expect(createPathSegment("_root_/seg")).not.toHaveProperty("security")
})

const titled = (): { title: string } => ({ title: "R" })

// `.head(fn, options)` records the options beside the head; without options, none.
it("head options", () => {
	const head = titled
	expect(createChain("_root_").head(head, { replace: true }).record()).toEqual({ head, headOptions: { replace: true } })
	expect(createChain("_root_").head(head).record()).toEqual({ head })
})
