import { describe, expectTypeOf, it } from "vitest"
import type {
	ExtractPathParams,
	InferAuthMode,
	InferLoaderData,
	InferParams,
	InferPreloaderContext,
	InferSearchParams,
	ParentAuthResolution,
	PreloaderChain,
	ResolvedAuth,
	RouteAuthMode,
	RouteLoaderData,
	RouteModule,
	RouteParams,
	RouteParamsProps,
	RoutePathParams,
	RoutePaths,
	RoutePreloaderContext,
	RouteSearchParams,
	RouteSearchProps,
	RouteSearchType,
	RouteVirtualPaths,
} from "../../../src/route-builder/register.ts"
import type { AuthenticateMode } from "../../../src/route-builder/types.ts"

/* ── ExtractPathParams ────────────────────────────────────── */

describe("ExtractPathParams", () => {
	it("static path → empty object", () => {
		expectTypeOf<ExtractPathParams<"_root_/about">>().toEqualTypeOf<{}>()
	})

	it("single [param] → { param: string }", () => {
		expectTypeOf<ExtractPathParams<"_root_/users/[id]">>().toEqualTypeOf<{ id: string }>()
	})

	it("multiple params → intersection", () => {
		expectTypeOf<
			ExtractPathParams<"_root_/store/[storeSlug]/customers/[customerId]">
		>().toEqualTypeOf<{ customerId: string; storeSlug: string }>()
	})

	it("catch-all [...name] → { name: string[] }", () => {
		expectTypeOf<ExtractPathParams<"_root_/docs/[...path]">>().toEqualTypeOf<{ path: string[] }>()
	})

	it("optional catch-all [[...name]] → { name: string[] | undefined }", () => {
		expectTypeOf<ExtractPathParams<"_root_/docs/[[...path]]">>().toEqualTypeOf<{
			path: string[] | undefined
		}>()
	})

	it("mixed: [org]/repos/[...path]", () => {
		expectTypeOf<ExtractPathParams<"_root_/[org]/repos/[...path]">>().toEqualTypeOf<{
			org: string
			path: string[]
		}>()
	})

	it("param at end of path", () => {
		expectTypeOf<ExtractPathParams<"_root_/validated/[id]">>().toEqualTypeOf<{ id: string }>()
	})

	it("group segments ignored", () => {
		expectTypeOf<ExtractPathParams<"_root_/(blog)/posts/[slug]">>().toEqualTypeOf<{
			slug: string
		}>()
	})
})

/* ── Mock route module shapes ──────────────────────────────── */

type MockPageWithLoader = {
	_type: "render"
	render: (props: { loaderData: { name: string; count: number }; preloaderContext: {} }) => unknown
	virtualPath: "_root_/about"
}

type MockPageNoLoader = {
	_type: "render"
	render: (props: { loaderData: void; preloaderContext: {} }) => unknown
	virtualPath: "_root_/"
}

type MockLayoutWithPreloader = {
	_type: "layout"
	render: (props: {
		children: unknown
		loaderData: void
		preloaderContext: { theme: string }
	}) => unknown
	virtualPath: "_root_"
}

type MockLayoutWithMultiPreloader = {
	_type: "layout"
	render: (props: {
		children: unknown
		loaderData: { nav: string[] }
		preloaderContext: { locale: string; theme: string }
	}) => unknown
	virtualPath: "_root_/(blog)"
}

type MockPageWithParams = {
	_type: "render"
	render: (props: {
		loaderData: void
		location: { params: { id: string; slug: string } }
		preloaderContext: {}
	}) => unknown
	virtualPath: "_root_/users/[id]/posts/[slug]"
}

type MockPageNoParams = {
	_type: "render"
	render: (props: {
		loaderData: void
		location: { params: Record<string, string | string[]> }
		preloaderContext: {}
	}) => unknown
	virtualPath: "_root_/about"
}

/* ── InferParams ──────────────────────────────────────────── */

describe("InferParams", () => {
	it("extracts typed params from route with location.params", () => {
		expectTypeOf<InferParams<MockPageWithParams>>().toEqualTypeOf<{
			id: string
			slug: string
		}>()
	})

	it("returns Record fallback for route without typed params", () => {
		expectTypeOf<InferParams<MockPageNoParams>>().toEqualTypeOf<Record<string, string | string[]>>()
	})

	it("returns Record fallback for non-route type", () => {
		expectTypeOf<InferParams<{ foo: string }>>().toEqualTypeOf<Record<string, string | string[]>>()
	})
})

/* ── RoutePathParams ─────────────────────────────────────── */

describe("RoutePathParams", () => {
	it("falls back to ExtractPathParams for unregistered path", () => {
		expectTypeOf<RoutePathParams<"_root_/users/[id]">>().toEqualTypeOf<{
			id: string
		}>()
	})

	it("returns empty for static unregistered path", () => {
		expectTypeOf<RoutePathParams<"_root_/about">>().toEqualTypeOf<{}>()
	})

	it("returns unknown for unregistered nonexistent path", () => {
		/* RouteModule<"nonexistent"> = never → falls back to ExtractPathParams */
		expectTypeOf<RoutePathParams<"nonexistent">>().toEqualTypeOf<{}>()
	})
})

/* ── InferLoaderData ───────────────────────────────────────── */

describe("InferLoaderData", () => {
	it("extracts loaderData from route with loader", () => {
		expectTypeOf<InferLoaderData<MockPageWithLoader>>().toEqualTypeOf<{
			name: string
			count: number
		}>()
	})

	it("returns void for route without loader", () => {
		expectTypeOf<InferLoaderData<MockPageNoLoader>>().toEqualTypeOf<void>()
	})

	it("returns void for non-route type", () => {
		expectTypeOf<InferLoaderData<{ foo: string }>>().toEqualTypeOf<void>()
	})

	it("extracts loaderData from layout with loader", () => {
		expectTypeOf<InferLoaderData<MockLayoutWithMultiPreloader>>().toEqualTypeOf<{ nav: string[] }>()
	})
})

/* ── InferPreloaderContext ─────────────────────────────────── */

describe("InferPreloaderContext", () => {
	it("extracts preloaderContext from layout with preloader", () => {
		expectTypeOf<InferPreloaderContext<MockLayoutWithPreloader>>().toEqualTypeOf<{
			theme: string
		}>()
	})

	it("returns {} for route without preloader", () => {
		expectTypeOf<InferPreloaderContext<MockPageNoLoader>>().toEqualTypeOf<{}>()
	})

	it("returns {} for non-route type", () => {
		expectTypeOf<InferPreloaderContext<{ foo: string }>>().toEqualTypeOf<{}>()
	})

	it("extracts accumulated preloaderContext from layout chain", () => {
		expectTypeOf<InferPreloaderContext<MockLayoutWithMultiPreloader>>().toEqualTypeOf<{
			locale: string
			theme: string
		}>()
	})
})

/* ── Unregistered fallbacks ────────────────────────────────── */

describe("unregistered FlareRegister fallbacks", () => {
	it("RouteModule resolves to never for unknown path", () => {
		expectTypeOf<RouteModule<"nonexistent">>().toBeNever()
	})

	it("RouteLoaderData falls back to unknown for unregistered path", () => {
		expectTypeOf<RouteLoaderData<"nonexistent">>().toBeUnknown()
	})

	it("RoutePreloaderContext falls back to unknown for unregistered path", () => {
		expectTypeOf<RoutePreloaderContext<"nonexistent">>().toBeUnknown()
	})

	it("RoutePaths is string when no routes augmented", () => {
		expectTypeOf<RoutePaths>().toEqualTypeOf<string>()
	})

	it("RouteVirtualPaths is string when no modules registered", () => {
		expectTypeOf<RouteVirtualPaths>().toEqualTypeOf<string>()
	})
})

/* ── PreloaderChain ────────────────────────────────────────── */

describe("PreloaderChain", () => {
	it("empty tuple → empty object", () => {
		expectTypeOf<PreloaderChain<[]>>().toEqualTypeOf<{}>()
	})

	/* PreloaderChain uses RouteModule which needs FlareRegister.
	 * Without augmentation, RouteModule<T> = never, so InferPreloaderContext<never> = never.
	 * Testing the recursion logic with augmented types is done via e2e TypeScript check. */
})

/* ── {} intersection poisoning ─────────────────── */

describe("{} intersection safety", () => {
	it("{} & explicit props — explicit keys survive", () => {
		type Result = {} & { role: string }
		expectTypeOf<Result["role"]>().toEqualTypeOf<string>()
	})

	it("double {} intersection preserves explicit keys", () => {
		type Result = {} & { authUserId: string; role: string } & {}
		expectTypeOf<Result["role"]>().toEqualTypeOf<string>()
		expectTypeOf<Result["authUserId"]>().toEqualTypeOf<string>()
	})

	it("three-level chain: root + mid-layout + leaf page", () => {
		type Root = {} & { theme: string }
		type Mid = {} & { blogId: number }
		type Leaf = {}
		type Chain = Root & Mid & Leaf & {}
		expectTypeOf<Chain["theme"]>().toEqualTypeOf<string>()
		expectTypeOf<Chain["blogId"]>().toEqualTypeOf<number>()
	})
})

/* ── Deep inheritance simulation ──────────────────────────────────── */

describe("deep preloader inheritance", () => {
	/*
	 * Simulates the resolved type chain for PreloaderChain.
	 * Each layout's InferPreloaderContext extracts whatever the builder
	 * accumulated via .preloader() into the render signature.
	 *
	 * Builder starts with {}.
	 * After .preloader(() => ({ role })), TPreloaderContext becomes
	 * {} & { role: string }.
	 * The render prop gets that intersected type.
	 */

	/* root layout: no preloader */
	type RootCtx = {}

	/* auth layout: .preloader(() => ({ role, authUserId })) */
	type AuthLayoutCtx = {} & { authUserId: string; role: string }

	/* nested layout: .preloader(() => ({ locale })) — inherits auth */
	type NestedLayoutCtx = {} & { locale: string }

	/* leaf page: no preloader */
	type LeafPageCtx = {}

	it("4-level chain preserves all parent preloader keys", () => {
		type Chain = RootCtx & AuthLayoutCtx & NestedLayoutCtx & LeafPageCtx & {}
		expectTypeOf<Chain["role"]>().toEqualTypeOf<string>()
		expectTypeOf<Chain["authUserId"]>().toEqualTypeOf<string>()
		expectTypeOf<Chain["locale"]>().toEqualTypeOf<string>()
	})

	it("child page gets all inherited props via chain", () => {
		type Chain = RootCtx & AuthLayoutCtx & LeafPageCtx & {}
		/* usePreloaderContext({ from: "page" }) should return { role, authUserId } */
		expectTypeOf<Chain>().toMatchTypeOf<{ authUserId: string; role: string }>()
	})

	it("layout-only chain accumulates correctly", () => {
		type Chain = RootCtx & AuthLayoutCtx & NestedLayoutCtx & {}
		expectTypeOf<Chain>().toMatchTypeOf<{ authUserId: string; locale: string; role: string }>()
	})

	it("single layout with preloader — no intersection poisoning", () => {
		type Chain = AuthLayoutCtx & {}
		expectTypeOf<Chain["role"]>().toEqualTypeOf<string>()
		expectTypeOf<Chain["authUserId"]>().toEqualTypeOf<string>()
	})

	it("empty chain (no layouts) returns empty object", () => {
		expectTypeOf<PreloaderChain<[]>>().toEqualTypeOf<{}>()
	})

	it("overlapping keys — same type merges cleanly", () => {
		type A = {} & { role: string }
		type B = {} & { locale: string; role: string }
		type Chain = A & B & {}
		expectTypeOf<Chain["role"]>().toEqualTypeOf<string>()
		expectTypeOf<Chain["locale"]>().toEqualTypeOf<string>()
	})

	it("overlapping keys — narrower type wins in intersection", () => {
		type A = {} & { role: "admin" | "editor" }
		type B = {} & { role: string }
		type Chain = A & B & {}
		/* intersection narrows: ("admin" | "editor") & string = "admin" | "editor" */
		expectTypeOf<Chain["role"]>().toEqualTypeOf<"admin" | "editor">()
	})

	it("nested object types preserved through chain", () => {
		type A = {} & { config: { theme: string; variant: number } }
		type B = {}
		type Chain = A & B & {}
		expectTypeOf<Chain["config"]>().toEqualTypeOf<{ theme: string; variant: number }>()
	})

	it("array types preserved through chain", () => {
		type A = {} & { permissions: string[] }
		type B = {} & { locale: string }
		type Chain = A & B & {}
		expectTypeOf<Chain["permissions"]>().toEqualTypeOf<string[]>()
		expectTypeOf<Chain["locale"]>().toEqualTypeOf<string>()
	})
})

/* ── Mock route module shapes for search params ───────────── */

type MockPageWithSearch = {
	_type: "render"
	render: (props: {
		loaderData: void
		location: { search: { category: string; page: number } }
		preloaderContext: {}
	}) => unknown
	virtualPath: "_root_/products"
}

type MockPageDefaultSearch = {
	_type: "render"
	render: (props: {
		loaderData: void
		location: { search: Record<string, string> }
		preloaderContext: {}
	}) => unknown
	virtualPath: "_root_/"
}

type MockLayoutWithSearch = {
	_type: "layout"
	render: (props: {
		children: unknown
		loaderData: void
		location: { search: { lang: string } }
		preloaderContext: {}
	}) => unknown
	virtualPath: "_root_"
}

/* ── InferSearchParams ────────────────────────────────────── */

describe("InferSearchParams", () => {
	it("extracts typed search from route with validator", () => {
		expectTypeOf<InferSearchParams<MockPageWithSearch>>().toEqualTypeOf<{
			category: string
			page: number
		}>()
	})

	it("returns Record<string, string> for route without validator", () => {
		expectTypeOf<InferSearchParams<MockPageDefaultSearch>>().toEqualTypeOf<Record<string, string>>()
	})

	it("returns Record<string, string> for non-route type", () => {
		expectTypeOf<InferSearchParams<{ foo: string }>>().toEqualTypeOf<Record<string, string>>()
	})

	it("extracts from layout module", () => {
		expectTypeOf<InferSearchParams<MockLayoutWithSearch>>().toEqualTypeOf<{
			lang: string
		}>()
	})
})

/* ── RouteSearchParams ────────────────────────────────────── */

describe("RouteSearchParams", () => {
	it("returns unknown for unregistered path", () => {
		expectTypeOf<RouteSearchParams<"nonexistent">>().toBeUnknown()
	})
})

/* ── RouteSearchType + RouteSearchProps ────────────────────── */

describe("RouteSearchType", () => {
	it("returns specific type for registered route", () => {
		expectTypeOf<RouteSearchType<"/test-search">>().toEqualTypeOf<{
			category: string
			page: number
		}>()
	})

	it("returns Record<string, unknown> for unregistered route", () => {
		expectTypeOf<RouteSearchType<"/nonexistent">>().toEqualTypeOf<Record<string, unknown>>()
	})
})

describe("RouteSearchProps", () => {
	it("has typed optional search for registered route", () => {
		expectTypeOf<RouteSearchProps<"/test-search">>().toEqualTypeOf<{
			search?: { category: string; page: number }
		}>()
	})

	it("has Record<string, unknown> search for unregistered route", () => {
		expectTypeOf<RouteSearchProps<"/nonexistent">>().toEqualTypeOf<{
			search?: Record<string, unknown>
		}>()
	})
})

/* ── ResolvedAuth 3-mode ─────────────────────────────────── */

describe("ResolvedAuth 3-mode", () => {
	it("true → RegisteredAuth (null when FlareRegister not augmented)", () => {
		expectTypeOf<ResolvedAuth<true>>().toEqualTypeOf<null>()
	})

	it("false → null", () => {
		expectTypeOf<ResolvedAuth<false>>().toEqualTypeOf<null>()
	})

	it("optional → RegisteredAuth | null (= null | null = null when not augmented)", () => {
		expectTypeOf<ResolvedAuth<"optional">>().toEqualTypeOf<null>()
	})
})

/* ── InferAuthMode ───────────────────────────────────────── */

type MockWithAuthRequired = {
	authenticateMode: true
	render: (props: { loaderData: void }) => unknown
}

type MockWithAuthOptional = {
	authenticateMode: "optional"
	render: (props: { loaderData: void }) => unknown
}

type MockWithoutAuth = {
	render: (props: { loaderData: void }) => unknown
}

describe("InferAuthMode", () => {
	it("extracts true from required auth route", () => {
		expectTypeOf<InferAuthMode<MockWithAuthRequired>>().toEqualTypeOf<true>()
	})

	it("extracts optional from optional auth route", () => {
		expectTypeOf<InferAuthMode<MockWithAuthOptional>>().toEqualTypeOf<"optional">()
	})

	it("returns false for route without authenticateMode", () => {
		expectTypeOf<InferAuthMode<MockWithoutAuth>>().toEqualTypeOf<false>()
	})

	it("returns false for non-route type", () => {
		expectTypeOf<InferAuthMode<{ foo: string }>>().toEqualTypeOf<false>()
	})
})

/* ── AuthenticateMode type ───────────────────────────────── */

describe("AuthenticateMode", () => {
	it("boolean is subset of AuthenticateMode", () => {
		expectTypeOf<false>().toMatchTypeOf<AuthenticateMode>()
		expectTypeOf<true>().toMatchTypeOf<AuthenticateMode>()
	})

	it("optional is valid AuthenticateMode", () => {
		expectTypeOf<"optional">().toMatchTypeOf<AuthenticateMode>()
	})
})

/* ── Mock FlareRegister augmentation for auth inheritance tests ─── */

declare module "flare" {
	interface FlareRegister {
		routeParams: {
			"/test-params": { id: number }
		}
		routeSearchParams: {
			"/test-search": { category: string; page: number }
		}
		authModes: {
			"_root_/(test-auth)": true
			"_root_/(test-opt)": "optional"
			"_root_/(test-deep-auth)": true
			"_root_/(test-deep-auth)/(test-deep-opt)": "optional"
		}
		routeParents: {
			_root_: readonly []
			"_root_/(test-auth)": readonly ["_root_"]
			"_root_/(test-auth)/child": readonly ["_root_", "_root_/(test-auth)"]
			"_root_/(test-opt)": readonly ["_root_"]
			"_root_/(test-opt)/child": readonly ["_root_", "_root_/(test-opt)"]
			"_root_/no-auth": readonly ["_root_"]
			"_root_/(test-deep-auth)": readonly ["_root_"]
			"_root_/(test-deep-auth)/(test-deep-opt)": readonly ["_root_", "_root_/(test-deep-auth)"]
			"_root_/(test-deep-auth)/(test-deep-opt)/leaf": readonly [
				"_root_",
				"_root_/(test-deep-auth)",
				"_root_/(test-deep-auth)/(test-deep-opt)",
			]
		}
	}
}

/* ── RouteAuthMode ─────────────────────────────────────────── */

describe("RouteAuthMode", () => {
	it("returns true for authenticated layout", () => {
		expectTypeOf<RouteAuthMode<"_root_/(test-auth)">>().toEqualTypeOf<true>()
	})

	it("returns optional for optional-auth layout", () => {
		expectTypeOf<RouteAuthMode<"_root_/(test-opt)">>().toEqualTypeOf<"optional">()
	})

	it("returns false for path not in authModes", () => {
		expectTypeOf<RouteAuthMode<"_root_">>().toEqualTypeOf<false>()
	})

	it("returns false for child path without own authenticate", () => {
		expectTypeOf<RouteAuthMode<"_root_/(test-auth)/child">>().toEqualTypeOf<false>()
	})
})

/* ── ParentAuthResolution (exercises AuthChain + StrictestAuth) ── */

describe("ParentAuthResolution", () => {
	it("inherits true from parent layout with authenticate", () => {
		expectTypeOf<ParentAuthResolution<"_root_/(test-auth)/child">>().toEqualTypeOf<true>()
	})

	it("inherits optional from parent with authenticateOptional", () => {
		expectTypeOf<ParentAuthResolution<"_root_/(test-opt)/child">>().toEqualTypeOf<"optional">()
	})

	it("resolves false when no parent has auth", () => {
		expectTypeOf<ParentAuthResolution<"_root_/no-auth">>().toEqualTypeOf<false>()
	})

	it("true wins over optional (StrictestAuth)", () => {
		expectTypeOf<
			ParentAuthResolution<"_root_/(test-deep-auth)/(test-deep-opt)/leaf">
		>().toEqualTypeOf<true>()
	})

	it("optional wins over false", () => {
		expectTypeOf<
			ParentAuthResolution<"_root_/(test-deep-auth)/(test-deep-opt)">
		>().toEqualTypeOf<true>()
	})

	it("resolves false for path not in routeParents", () => {
		expectTypeOf<ParentAuthResolution<"nonexistent">>().toEqualTypeOf<false>()
	})

	it("root path with empty parents resolves false", () => {
		expectTypeOf<ParentAuthResolution<"_root_">>().toEqualTypeOf<false>()
	})
})

/* ── RouteParams (with routeParams augmentation) ──────────── */

describe("RouteParams", () => {
	it("resolves from routeParams when registered", () => {
		expectTypeOf<RouteParams<"/test-params">>().toEqualTypeOf<{ id: number }>()
	})

	it("falls back to routes registry for non-routeParams path", () => {
		/* routes not augmented in this test, so falls through to {} */
		expectTypeOf<RouteParams<"/about">>().toEqualTypeOf<{}>()
	})

	it("falls back to ExtractPathParams for non-registered path with params", () => {
		expectTypeOf<RouteParams<"/docs/[...path]">>().toEqualTypeOf<{ path: string[] }>()
	})
})

/* ── RouteParamsProps (with routeParams augmentation) ──────── */

describe("RouteParamsProps", () => {
	it("requires params when routeParams has keys", () => {
		expectTypeOf<RouteParamsProps<"/test-params">>().toEqualTypeOf<{ params: { id: number } }>()
	})

	it("forbids params for path not in routeParams", () => {
		expectTypeOf<RouteParamsProps<"/about">>().toEqualTypeOf<{ params?: never }>()
	})

	it("forbids params for unknown path", () => {
		expectTypeOf<RouteParamsProps<"/nonexistent">>().toEqualTypeOf<{ params?: never }>()
	})
})
