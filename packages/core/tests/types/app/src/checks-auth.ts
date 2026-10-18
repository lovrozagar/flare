// The dx/types.md auth seed rows the runtime decides: the session reaches every match of a chain in which any route
// authenticates or authorizes, so an ancestor with no auth method of its own, and a route under a layout that only
// authorizes, type the session or null, never `null` alone. A child that authenticates keeps the session, and a page
// in a chain that reads no session stays `null` (BUGS.md 358). See checks.ts.
import { createLayout, createPage, createRootLayout } from "@lovrozagar/flare"

// ancestor with no auth method
{
	void createLayout("_root_/mixed").loader((ctx) => {
		const seen: { userId: string } | null = ctx.auth
		// @ts-expect-error the session or null, never null alone
		const _null: null = ctx.auth
		return { seen }
	})
	void createRootLayout("_root_").loader((ctx) => {
		const seen: { userId: string } | null = ctx.auth
		// @ts-expect-error the root is every chain's ancestor
		const _null: null = ctx.auth
		return { seen }
	})
}

// under an authorize-only layout
{
	void createPage("_root_/gated/inner").loader((ctx) => {
		const seen: { userId: string } | null = ctx.auth
		// @ts-expect-error the session or null, never null alone
		const _null: null = ctx.auth
		return { seen }
	})
}

// authenticate keeps the session, a public chain stays null
{
	void createPage("_root_/mixed/child")
		.authenticate()
		.loader((ctx) => ({ id: ctx.auth.userId }))
	void createPage("_root_/about").loader((ctx) => {
		const none: null = ctx.auth
		return { none }
	})
}
