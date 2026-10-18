// dx/types.md "Matrix", rows 45 to 58 (auth required through server fn auth required), one case per row, through the
// package entries against the register codegen wrote for this app. app.test.ts compiles this file; vitest never runs it
// (B96, plan 25 5.2).
import { createPage, type FlareRegister } from "@lovrozagar/flare"
import { createServerFn } from "@lovrozagar/flare/server-fn"
import { expectTypeOf, it } from "vitest"

type Register = FlareRegister
type Session = Register["auth"]

it("auth required", () => {
	void createPage("_root_/about")
		.authenticate()
		.loader((ctx) => {
			expectTypeOf(ctx.auth.userId).toEqualTypeOf<string>()
			// @ts-expect-error the required session is never null
			const _none: null = ctx.auth
			return {}
		})
})

it("auth optional", () => {
	void createPage("_root_/guest")
		.authenticateOptional()
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
			// @ts-expect-error the session may be null, and there is no check here
			void ctx.auth.userId
			return {}
		})
})

it("cannot loosen", () => {
	// The blog layout's `.authenticate()` is the parent seed `true`: the child may still require it, not loosen it.
	void createPage("_root_/(blog)/viewer")
		.authenticate()
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
			return {}
		})
	// @ts-expect-error a parent's required session cannot be made optional by the child
	void createPage("_root_/(blog)/viewer").authenticateOptional()
})

it("omit keeps parent", () => {
	// The viewer calls neither method, so the blog layout's `true` still reaches its loader.
	void createPage("_root_/(blog)/viewer").loader((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
		// @ts-expect-error the omitted method does not widen the parent's required session to null
		const _none: null = ctx.auth
		return {}
	})
})

it("grandchild strict", () => {
	// The middle page (post/[slug]) omits both methods; the comments page under it still reads the blog's `true`.
	void createPage("_root_/(blog)/post/[slug]/comments").loader((ctx) => {
		expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
		expectTypeOf(ctx.auth).not.toEqualTypeOf<Session | null>()
		// @ts-expect-error the grandchild is not null alone
		const _none: null = ctx.auth
		return {}
	})
})

it("authorize reads", () => {
	// `_root_/about` has no authenticate method and a root parent with no seed: `.authorize()` alone reads the session or null.
	void createPage("_root_/about")
		.authorize((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
			return true
		})
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
			// @ts-expect-error authorize alone does not make the session non-null
			const _none: null = ctx.auth
			// @ts-expect-error the session may be null, and there is no check here
			void ctx.auth.userId
			return {}
		})
})

it("authorize keeps required", () => {
	// Under the blog layout's `true`, a child that calls only `.authorize()` keeps the required session.
	void createPage("_root_/(blog)/viewer")
		.authorize((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
			return true
		})
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session>()
			expectTypeOf(ctx.auth).not.toEqualTypeOf<Session | null>()
			// @ts-expect-error the required session is never null
			const _none: null = ctx.auth
			return {}
		})
})

it("authorize keeps optional", () => {
	// The optional seed is set before `.authorize()`; `authorize` does not force the session non-null.
	void createPage("_root_/guest")
		.authenticateOptional()
		.authorize(() => true)
		.loader((ctx) => {
			expectTypeOf(ctx.auth).toEqualTypeOf<Session | null>()
			// @ts-expect-error authorize does not make the session non-null
			const _required: Session = ctx.auth
			return {}
		})
})

it("render auth", () => {
	void createPage("_root_/about")
		.authenticate()
		.loader(() => ({ title: "About" }))
		.render((props) => {
			// @ts-expect-error the render props carry no auth field
			void props.auth
			return null
		})
})

it("auth mode", () => {
	expectTypeOf<NonNullable<Register["authModes"]>["_root_/guest"]>().toEqualTypeOf<"optional">()
	// @ts-expect-error a route that calls no auth method has no authModes key
	const _missing: keyof NonNullable<Register["authModes"]> = "_root_/about"
})

it("server fn no optional", () => {
	expectTypeOf(createServerFn()).not.toHaveProperty("authenticateOptional")
	expectTypeOf(createServerFn().authenticate()).toHaveProperty("handler")
	// @ts-expect-error a server function has no optional auth method
	createServerFn().authenticateOptional()
})

it("server fn auth null", () => {
	void createServerFn().handler((ctx) => {
		expectTypeOf(ctx.auth).toBeNull()
		// @ts-expect-error without authenticate the session is never read
		void ctx.auth.userId
	})
})

it("server fn auth required", () => {
	void createServerFn()
		.authenticate()
		.handler((ctx) => {
			expectTypeOf(ctx.auth.userId).toEqualTypeOf<string>()
		})
	// @ts-expect-error authenticate takes no argument
	createServerFn().authenticate("optional")
})
