// dx/types.md "Merge", the auth rules, the server function chain, and the segment, one case per rule, through the
// package entries against the register codegen wrote for this app. app.test.ts compiles this file; vitest never runs it
// (B96, plan 25 5.2).
import { createLayout, createPage, createRootLayout } from "@lovrozagar/flare"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { expectTypeOf, it } from "vitest"

type Session = { userId: string }

it("auth seed", () => {
	// The blog layout's `true` reaches the post; the root's own `false` reads as the session or null.
	void createPage("_root_/(blog)/post/[slug]").loader((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
		return {}
	})
	void createRootLayout("_root_").loader((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
		return {}
	})
})

it(".authenticate()", () => {
	void createPage("_root_/about")
		.authenticate()
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
			return {}
		})
})

it(".authenticateOptional()", () => {
	void createPage("_root_/about")
		.authenticateOptional()
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
			return {}
		})
	expectTypeOf(createPage("_root_/(blog)/post/[slug]")).not.toHaveProperty("authenticateOptional")
})

it("neither auth method", () => {
	// A page keeps its parents' seed: under the authorize-only layout the session or null, under none `null`.
	void createPage("_root_/gated/inner").loader((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
		return {}
	})
	void createPage("_root_/about").loader((ctx) => {
		expectTypeOf(ctx.auth).toBeNull()
		return {}
	})
	void createLayout("_root_/mixed").loader((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
		return {}
	})
})

it("a middle file omits both methods", () => {
	// The comments page is under the post page's folder, whose layout chain carries the blog layout's `true`.
	void createPage("_root_/(blog)/post/[slug]/comments").loader((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
		return {}
	})
})

it(".authorize() on a public route", () => {
	void createPage("_root_/about")
		.authorize((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
			return true
		})
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
			return {}
		})
	void createPage("_root_/(blog)/post/[slug]").authorize((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
		return true
	})
})

it("ResolvedAuth<true>", () => {
	void createPage("_root_/about")
		.authenticate()
		.preloader((ctx) => {
			expectTypeOf(ctx.auth.userId).toEqualTypeOf<string>()
			return {}
		})
})

it('ResolvedAuth<"optional">', () => {
	void createPage("_root_/guest")
		.authenticateOptional()
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
			// @ts-expect-error the session may be null
			void ctx.auth.userId
			return {}
		})
})

it("ResolvedAuth<false>", () => {
	void createPage("_root_/static").loader((ctx) => {
		expectTypeOf(ctx.auth).toBeNull()
		return {}
	})
})

it("server function auth", () => {
	expectTypeOf(createServerFn()).not.toHaveProperty("authenticateOptional")
	void createServerFn().handler((ctx) => {
		expectTypeOf(ctx.auth).toBeNull()
	})
	void createServerFn()
		.authenticate()
		.handler((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
		})
})

it("segment", () => {
	// A segment is never a parent: the docs page under the root lists the root only.
	void createPage("_root_/docs/[...path]").preloader((ctx) => {
		expectTypeOf(ctx.preloaderContext).toEqualTypeOf<{ requestId: string }>()
		return {}
	})
})
