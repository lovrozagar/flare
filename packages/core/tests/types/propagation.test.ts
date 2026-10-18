import { expectTypeOf, it } from "vitest"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import type {
	Deferred,
	ExtractPathParams,
	FlareRegister,
	InferParams,
	InferSearch,
	LoaderDataFrom,
	RouteTarget,
	RawSearch,
	RegisteredEnv,
	RegisteredServerContext,
	PropagationApp as App,
	ResolvedAuth,
	To,
} from "../../src/shared/route-builder/register.ts"
import type { PreloaderFrom } from "../../src/shared/route-builder/route-types.ts"
import type { Router } from "../../src/shared/router/create-router.ts"
import { createTestServer } from "../../src/testing/harness.ts"

type UsersLink = RouteTarget<App, "_root_/users/[id]">

// @ts-expect-error null has no userId
const readOptionalUser = (session: ResolvedAuth<App, "optional">): string => session.userId

// @ts-expect-error a public authorize still needs a null check
const readAuthorizedUser = (session: ResolvedAuth<App, "optional">): string => session.userId

it("param types", () => {
	expectTypeOf<ExtractPathParams<"[id]">>().toEqualTypeOf<{ id: string }>()
	// @ts-expect-error id is not a number
	const _bad: ExtractPathParams<"[id]"> = { id: 1 }
})
it("no params", () => {
	expectTypeOf<RouteTarget<App, "_root_/about">>().toMatchTypeOf<{ to: "_root_/about"; params?: never }>()
	// @ts-expect-error params are omitted on a static page
	const _bad: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 }, params: { id: "1" } }
})
it("optional param", () => {
	const withValue: RouteTarget<App, "_root_/[[locale]]"> = { to: "_root_/[[locale]]", params: { locale: "en" } }
	const withUndefined: RouteTarget<App, "_root_/[[locale]]"> = {
		to: "_root_/[[locale]]",
		params: { locale: undefined },
	}
	expectTypeOf(withValue.params.locale).toEqualTypeOf<string | undefined>()
	expectTypeOf(withUndefined.params.locale).toEqualTypeOf<string | undefined>()
	// @ts-expect-error the locale key is required inside params
	const _empty: RouteTarget<App, "_root_/[[locale]]"> = { to: "_root_/[[locale]]", params: {} }
})
it("catch-all", () => {
	const ok: RouteTarget<App, "_root_/files/[...path]"> = { to: "_root_/files/[...path]", params: { path: ["a", "b"] } }
	expectTypeOf(ok.params.path).toEqualTypeOf<string[]>()
	// @ts-expect-error a catch-all is an array
	const _bad: RouteTarget<App, "_root_/files/[...path]"> = { to: "_root_/files/[...path]", params: { path: "a" } }
})
it("optional catch-all", () => {
	const ok: RouteTarget<App, "_root_/[[...rest]]"> = { to: "_root_/[[...rest]]", params: { rest: undefined } }
	expectTypeOf(ok.params.rest).toEqualTypeOf<string[] | undefined>()
	// @ts-expect-error an empty object drops the rest key
	const _bad: RouteTarget<App, "_root_/[[...rest]]"> = { to: "_root_/[[...rest]]", params: {} }
})
it("literal brackets", () => {
	expectTypeOf<ExtractPathParams<"_root_/[_]id]">>().toEqualTypeOf<{}>()
	expectTypeOf<"id" extends keyof ExtractPathParams<"_root_/[_]id]"> ? true : false>().toEqualTypeOf<false>()
})
it("group is not a param", () => {
	expectTypeOf<ExtractPathParams<"_root_/(blog)/post">>().toEqualTypeOf<{}>()
	expectTypeOf<"blog" extends keyof ExtractPathParams<"_root_/(blog)/post"> ? true : false>().toEqualTypeOf<false>()
})
it("param before root", () => {
	expectTypeOf<ExtractPathParams<"[locale]/_root_/about">>().toEqualTypeOf<{ locale: string }>()
	// @ts-expect-error locale stays in the URL
	const _bad: ExtractPathParams<"[locale]/_root_/about"> = {}
})
it("input params", () => {
	expectTypeOf<InferParams<App, "_root_/users/[id]">>().toEqualTypeOf<{ id: number }>()
	// @ts-expect-error the validator output is number, not the bracket string
	const _bad: InferParams<App, "_root_/users/[id]"> = { id: "1" }
})
it("input one side", () => {
	expectTypeOf<InferSearch<App, "_root_/users/[id]">>().toEqualTypeOf<RawSearch>()
	// @ts-expect-error search is not the params validator output
	const _bad: InferSearch<App, "_root_/users/[id]"> = { id: 1 }
})
it("missing param", () => {
	const ok: RouteTarget<App, "_root_/users/[id]"> = { to: "_root_/users/[id]", params: { id: 1 } }
	expectTypeOf(ok.params.id).toEqualTypeOf<number>()
	// @ts-expect-error params are required
	const _bad: RouteTarget<App, "_root_/users/[id]"> = { to: "_root_/users/[id]" }
})
it("extra param", () => {
	expectTypeOf<RouteTarget<App, "_root_/users/[id]">["params"]>().toEqualTypeOf<{ id: number }>()
	// @ts-expect-error extra keys are rejected
	const _bad: RouteTarget<App, "_root_/users/[id]"> = { to: "_root_/users/[id]", params: { id: 1, extra: "x" } }
})
it("unknown route", () => {
	const ok: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 } }
	expectTypeOf(ok.to).toEqualTypeOf<"_root_/about">()
	// @ts-expect-error unknown ids are rejected after augmentation
	const _bad: RouteTarget<App, "_root_/about"> = { to: "nope", search: { page: 1 } }
})
it("layout to", () => {
	expectTypeOf<"_root_/layout" extends To<App> ? true : false>().toEqualTypeOf<false>()
	// @ts-expect-error a layout id is not a page target
	const _bad: RouteTarget<App, "_root_/layout"> = { to: "_root_/layout" }
})
it("segment to", () => {
	expectTypeOf<"_root_/seg" extends To<App> ? true : false>().toEqualTypeOf<false>()
	// @ts-expect-error a segment id is not a page target
	const _bad: RouteTarget<App, "_root_/seg"> = { to: "_root_/seg" }
})
it("response route id", () => {
	const ok: RouteTarget<App, "_root_/echo"> = { to: "_root_/echo" }
	expectTypeOf(ok.to).toEqualTypeOf<"_root_/echo">()
	// @ts-expect-error a response page has no public URL in routes, which is keyed by URL
	const _listed: keyof NonNullable<App["routes"]> = "/echo"
	expectTypeOf<NonNullable<App["routes"]>["/users/[id]"]>().toEqualTypeOf<{ params: { id: string } }>()
})
it("unregistered fallback", () => {
	expectTypeOf<To<FlareRegister>>().toEqualTypeOf<string>()
	// The package declares no field, so the generated augmentation never redeclares one with another type.
	expectTypeOf<keyof FlareRegister>().toBeNever()
	expectTypeOf<0 extends 1 & InferParams<FlareRegister, string> ? true : false>().toEqualTypeOf<false>()
	expectTypeOf<RouteTarget<FlareRegister, string>["params"]>().toEqualTypeOf<
		Readonly<Record<string, unknown>> | undefined
	>()
	expectTypeOf<RouteTarget<FlareRegister, string>["search"]>().toEqualTypeOf<RawSearch | undefined>()
	expectTypeOf<LoaderDataFrom<FlareRegister, string>>().toBeUnknown()
	expectTypeOf<PreloaderFrom<FlareRegister, string>>().toEqualTypeOf<Record<string, unknown>>()
})
it("hash not generic", () => {
	const ok: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 }, hash: "top", replace: true }
	expectTypeOf(ok.hash).toEqualTypeOf<string | undefined>()
	// @ts-expect-error hash is a string, not a number
	const _bad: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 }, hash: 1 }
})
it("search raw", () => {
	const one: UsersLink = { to: "_root_/users/[id]", params: { id: 1 }, search: { q: "a" } }
	const many: UsersLink = { to: "_root_/users/[id]", params: { id: 1 }, search: { q: ["a", "b"] } }
	expectTypeOf(one.search).toEqualTypeOf<RawSearch | undefined>()
	expectTypeOf(many.search).toEqualTypeOf<RawSearch | undefined>()
	// @ts-expect-error a raw search value is not a number
	const _bad: UsersLink = { to: "_root_/users/[id]", params: { id: 1 }, search: { q: 1 } }
})
it("search validated", () => {
	expectTypeOf<InferSearch<App, "_root_/about">>().toEqualTypeOf<{ page: number }>()
	// @ts-expect-error page is a number
	const _bad: InferSearch<App, "_root_/about"> = { page: "1" }
})
it("search required key", () => {
	const ok: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 } }
	expectTypeOf(ok.search.page).toEqualTypeOf<number>()
	// @ts-expect-error a required search key makes search required
	const _bad: RouteTarget<App, "_root_/about"> = { to: "_root_/about" }
})
it("search optional keys", () => {
	type Loose = FlareRegister & { routeSearchParams: { page: { tag?: string } } }
	type Pages = Loose & { routeModules: { page: { _type: "page" } } }
	const omitted: RouteTarget<Pages, "page"> = { to: "page" }
	const empty: RouteTarget<Pages, "page"> = { to: "page", search: {} }
	expectTypeOf(omitted.to).toEqualTypeOf<"page">()
	expectTypeOf(empty.to).toEqualTypeOf<"page">()
	// @ts-expect-error extra search keys are rejected
	const _bad: RouteTarget<Pages, "page"> = { to: "page", search: { extra: "x" } }
})
it("search extra key", () => {
	expectTypeOf<InferSearch<App, "_root_/about">>().toEqualTypeOf<{ page: number }>()
	// @ts-expect-error only validator keys are legal
	const _bad: InferSearch<App, "_root_/about"> = { page: 1, extra: "x" }
})
it("search empty", () => {
	type EmptySearch = FlareRegister & { routeSearchParams: { page: {} }; routeModules: { page: { _type: "page" } } }
	const omitted: RouteTarget<EmptySearch, "page"> = { to: "page" }
	expectTypeOf(omitted.to).toEqualTypeOf<"page">()
	// @ts-expect-error an empty validator forbids a search object
	const _bad: RouteTarget<EmptySearch, "page"> = { to: "page", search: {} }
})
it("parent search hidden", () => {
	expectTypeOf<InferSearch<App, "_root_/users/[id]">>().toEqualTypeOf<RawSearch>()
	// @ts-expect-error a parent search validator does not apply to the page
	const _bad: InferSearch<App, "_root_/users/[id]"> = { section: 1 }
})
it("loader deep", () => {
	expectTypeOf<LoaderDataFrom<App, "_root_/users/[id]">["user"]["name"]>().toEqualTypeOf<string>()
	// @ts-expect-error age is not on the loader
	const _bad: LoaderDataFrom<App, "_root_/users/[id]">["user"] = { name: "a", age: 1 }
})
it("loader absent", () => {
	expectTypeOf<LoaderDataFrom<App, "_root_/echo">>().toEqualTypeOf<void>()
	// @ts-expect-error there is no field without a loader
	const _bad: LoaderDataFrom<App, "_root_/echo"> = { n: 1 }
})
it("parent loader hidden", () => {
	expectTypeOf<LoaderDataFrom<App, "_root_/about">>().toEqualTypeOf<{ title: string }>()
	// @ts-expect-error the page loader does not include the layout field
	const _bad: LoaderDataFrom<App, "_root_/about"> = { title: "a", section: "b" }
})
it("layout data", () => {
	expectTypeOf<LoaderDataFrom<App, "_root_/layout">>().toEqualTypeOf<{ section: string }>()
	// @ts-expect-error the layout loader does not include the page field
	const _bad: LoaderDataFrom<App, "_root_/layout"> = { section: "a", title: "b" }
})
it("preloader accumulate", () => {
	type Ctx = PreloaderFrom<App, "_root_/about">
	expectTypeOf<Ctx["requestId"]>().toEqualTypeOf<string>()
	expectTypeOf<Ctx["theme"]>().toEqualTypeOf<string>()
	expectTypeOf<Ctx["n"]>().toEqualTypeOf<1>()
	// @ts-expect-error a parent key is not erased
	const _bad: Ctx = { role: "admin", theme: "t", n: 1 }
})
it("preloader narrow", () => {
	expectTypeOf<PreloaderFrom<App, "_root_/about">["role"]>().toEqualTypeOf<"admin">()
	// @ts-expect-error the wider parent member does not survive
	const _bad: PreloaderFrom<App, "_root_/about">["role"] = "editor"
})
it("preloader clash", () => {
	expectTypeOf<PreloaderFrom<App, "_root_/clash">["requestId"]>().toEqualTypeOf<string>()
	expectTypeOf<PreloaderFrom<App, "_root_/clash">["theme"]>().toEqualTypeOf<never>()
})
it("missing parent", () => {
	expectTypeOf<PreloaderFrom<App, "_root_/orphan">>().toEqualTypeOf<never>()
	// @ts-expect-error a missing parent is never, not an empty object
	const _bad: PreloaderFrom<App, "_root_/orphan"> = {}
})
it("auth required", () => {
	expectTypeOf<ResolvedAuth<App, true>>().toEqualTypeOf<{ userId: string }>()
	// @ts-expect-error a required session is not null
	const _bad: ResolvedAuth<App, true> = null
})
it("auth optional", () => {
	expectTypeOf<ResolvedAuth<App, "optional">>().toEqualTypeOf<{ userId: string } | null>()
	expectTypeOf(readOptionalUser).toBeFunction()
})
it("auth unaugmented", () => {
	expectTypeOf<ResolvedAuth<FlareRegister, true>>().toEqualTypeOf<null>()
	// @ts-expect-error there is no session field until the app augments auth
	const _bad: ResolvedAuth<FlareRegister, true> = { userId: "a" }
})
it("omit keeps parent", () => {
	expectTypeOf<ResolvedAuth<App, true>>().toEqualTypeOf<{ userId: string }>()
	// @ts-expect-error omitting the method does not widen a required parent
	const _bad: ResolvedAuth<App, true> = null
})
it("grandchild strict", () => {
	expectTypeOf<ResolvedAuth<App, true>["userId"]>().toEqualTypeOf<string>()
	// @ts-expect-error a middle omission does not widen the grandchild
	const _bad: ResolvedAuth<App, true> = null
})
it("authorize reads", () => {
	expectTypeOf<ResolvedAuth<App, "optional">>().toEqualTypeOf<{ userId: string } | null>()
	expectTypeOf(readAuthorizedUser).toBeFunction()
})
it("auth mode", () => {
	expectTypeOf<NonNullable<App["authModes"]>["_root_/about"]>().toEqualTypeOf<"optional">()
	// @ts-expect-error a route that does not call authenticate is absent
	const _missing: keyof NonNullable<App["authModes"]> = "_root_/users/[id]"
})
it("defer field", () => {
	expectTypeOf<Deferred<{ quote: string }>>().toEqualTypeOf<Deferred<{ quote: string }>>()
	// @ts-expect-error the field stays wrapped
	const _bad: Deferred<{ quote: string }> = { quote: "a" }
})
it("defer nested", () => {
	expectTypeOf<Awaited<Deferred<{ quote: string }>["promise"]>["quote"]>().toEqualTypeOf<string>()
	// @ts-expect-error quote is on the promise, not the wrapper
	const _bad: Deferred<{ quote: string }> = { promise: Promise.resolve({ quote: "a" }), quote: "a" }
})
it("defer no then", () => {
	expectTypeOf<Awaited<Deferred<{ n: number }>>>().toEqualTypeOf<Deferred<{ n: number }>>()
	// @ts-expect-error Awaited does not unwrap Deferred
	const _bad: Awaited<Deferred<{ n: number }>> = { n: 1 }
})
// The real builders: each step removes itself and every step before it, so an out-of-order chain does not type-check
// instead of throwing `order:` on the first request (BUGS.md B9).
it("method order", () => {
	const loaded = createPage("_root_/").loader(() => ({ ok: true }))
	expectTypeOf(loaded).not.toHaveProperty("cache")
	expectTypeOf(loaded).not.toHaveProperty("response")
	expectTypeOf(loaded).toHaveProperty("head")
	// `.response()` runs before the view steps, so after any of them it is gone too (BUGS.md 355).
	expectTypeOf(createPage("_root_/").head(() => ({}))).not.toHaveProperty("response")
	expectTypeOf(createPage("_root_/").headers(() => ({}))).not.toHaveProperty("response")
	expectTypeOf(createPage("_root_/").security({})).not.toHaveProperty("response")
	expectTypeOf(createPage("_root_/").preloader(() => ({}))).toHaveProperty("response")
	const secured = createRootLayout("_admin_")
		.headers(() => ({}))
		.security({})
	expectTypeOf(secured).not.toHaveProperty("head")
	expectTypeOf(secured).not.toHaveProperty("headers")
	expectTypeOf(secured).toHaveProperty("render")
	const guarded = createPage("_admin_/admin")
		.authenticate()
		.preloader(() => ({}))
	expectTypeOf(guarded).not.toHaveProperty("authorize")
	expectTypeOf(guarded).not.toHaveProperty("authenticateOptional")
	expectTypeOf(guarded).toHaveProperty("loader")
})
it("boundary remains", () => {
	const left = createPage("_root_/")
		.render(() => "page")
		.errorRender(() => "error")
	expectTypeOf(left).toHaveProperty("notFoundRender")
	expectTypeOf(left).not.toHaveProperty("errorRender")
})
it("boundaries done", () => {
	const done = createPage("_root_/")
		.render(() => "page")
		.errorRender(() => "error")
		.notFoundRender(() => "missing")
		.unauthenticatedRender(() => "guest")
		.unauthorizedRender(() => "denied")
	expectTypeOf(done).not.toHaveProperty("errorRender")
	expectTypeOf(done).not.toHaveProperty("notFoundRender")
	expectTypeOf(done).not.toHaveProperty("unauthenticatedRender")
	expectTypeOf(done).not.toHaveProperty("unauthorizedRender")
})
it("intercept remains", () => {
	const left = createPage("_root_/search").intercept({ from: ["_root_/"], render: "search-modal" })
	expectTypeOf(left).toHaveProperty("cache")
	expectTypeOf(left).not.toHaveProperty("intercept")
})
it("parents closed", () => {
	type Parent = NonNullable<App["routeParents"]>["_root_/about"][number]
	expectTypeOf<Parent extends keyof NonNullable<App["routeModules"]> ? true : false>().toEqualTypeOf<true>()
	// @ts-expect-error every parent id is a route module
	const _bad: Parent = "missing"
})
it("keyed by route id", () => {
	expectTypeOf<keyof NonNullable<App["routeParams"]>>().toEqualTypeOf<"_root_/users/[id]">()
	// @ts-expect-error the key is the route id, not the public URL
	const _bad: keyof NonNullable<App["routeParams"]> = "/users/:id"
})
it("env omitted", () => {
	expectTypeOf<RegisteredEnv<FlareRegister>>().toEqualTypeOf<unknown>()
	expectTypeOf<RegisteredEnv<FlareRegister> extends { site: string } ? true : false>().toEqualTypeOf<false>()
})
it("server context omitted", () => {
	const ctx: RegisteredServerContext<FlareRegister> = {}
	expectTypeOf(ctx).toEqualTypeOf<Record<string, unknown>>()
	type Open = RegisteredServerContext<FlareRegister>
	expectTypeOf<Open extends { requestId: string } ? true : false>().toEqualTypeOf<false>()
})

// A register that declares `serverContext` makes the test server's option required, and nothing else fits it (B25).
function testServerTypes(router: Router): void {
	// @ts-expect-error the register declares serverContext
	createTestServer<App>(router)
	createTestServer<App>(router, { serverContext: () => ({ requestId: "r" }) })
	// @ts-expect-error the context is the register's shape
	createTestServer<App>(router, { serverContext: () => ({ requestId: 1 }) })
	// @ts-expect-error only serverContext
	createTestServer<App>(router, { serverContext: () => ({ requestId: "r" }), site: "https://x" })
	createTestServer(router)
}

it("test server context", () => {
	expectTypeOf(testServerTypes).toBeFunction()
})
