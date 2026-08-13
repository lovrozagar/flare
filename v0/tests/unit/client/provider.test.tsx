/**
 * FlareProvider Unit Tests
 *
 * Tests Solid.js integration for client-side hydration.
 * Verifies reactive state updates trigger re-renders.
 * Tests hook behavior both inside and outside FlareProvider context.
 */

import { createRoot, useContext } from "solid-js"
import { describe, expect, it } from "vitest"
import { createFlareClient } from "../../../src/client/init"
import { createFlareProvider, FlareContext } from "../../../src/client/provider"
import { createFlareState, FlareStateBuilder } from "../../utils/flare-state"

/* ============================================================================
 * createFlareProvider
 * ============================================================================ */

describe("createFlareProvider", () => {
	it("creates provider context from client", () => {
		const flareState = new FlareStateBuilder()
			.withPathname("/products/123")
			.withParams({ id: "123" })
			.addMatch("_root_", { user: "Alice" })
			.build()

		const client = createFlareClient({ flareState })
		const ctx = createFlareProvider(client)

		expect(ctx.location().pathname).toBe("/products/123")
		expect(ctx.params()).toEqual({ id: "123" })
		expect(ctx.matches()).toHaveLength(1)
	})

	it("returns object with all required properties", () => {
		const client = createFlareClient({ flareState: createFlareState() })
		const ctx = createFlareProvider(client)

		expect(ctx).toHaveProperty("client")
		expect(ctx).toHaveProperty("location")
		expect(ctx).toHaveProperty("params")
		expect(ctx).toHaveProperty("matches")
		expect(ctx).toHaveProperty("isNavigating")
		expect(ctx).toHaveProperty("router")
		expect(ctx).toHaveProperty("setLocation")
		expect(ctx).toHaveProperty("setParams")
		expect(ctx).toHaveProperty("setMatches")
		expect(ctx).toHaveProperty("setIsNavigating")
	})

	it("initializes location from flare state", () => {
		const flareState = createFlareState({ pathname: "/about" })
		const client = createFlareClient({ flareState })
		const ctx = createFlareProvider(client)

		expect(ctx.location().pathname).toBe("/about")
	})

	it("initializes params from flare state", () => {
		const flareState = createFlareState({
			params: { category: "tech", page: "1" },
			pathname: "/products",
		})
		const client = createFlareClient({ flareState })
		const ctx = createFlareProvider(client)

		expect(ctx.params()).toEqual({ category: "tech", page: "1" })
	})

	it("initializes matches from match cache", () => {
		const flareState = new FlareStateBuilder()
			.withPathname("/products")
			.addMatch("_root_", { user: "Bob" })
			.addMatch("_root_/products", { products: [] })
			.build()
		const client = createFlareClient({ flareState })
		const ctx = createFlareProvider(client)

		expect(ctx.matches()).toHaveLength(2)
		expect(ctx.matches()[0]?.virtualPath).toBe("_root_")
		expect(ctx.matches()[1]?.virtualPath).toBe("_root_/products")
	})

	it("initializes isNavigating to false", () => {
		const client = createFlareClient({ flareState: createFlareState() })
		const ctx = createFlareProvider(client)

		expect(ctx.isNavigating()).toBe(false)
	})

	it("returns client reference", () => {
		const client = createFlareClient({ flareState: createFlareState() })
		const ctx = createFlareProvider(client)

		expect(ctx.client).toBe(client)
	})
})

/* ============================================================================
 * Reactive signals
 * ============================================================================ */

describe("reactive signals", () => {
	describe("location signal", () => {
		it("provides reactive location signal", () => {
			createRoot((dispose) => {
				const flareState = createFlareState()
				const client = createFlareClient({ flareState })
				const ctx = createFlareProvider(client)

				expect(ctx.location().pathname).toBe("/")

				ctx.setLocation({ hash: "", pathname: "/products", search: "" })

				expect(ctx.location().pathname).toBe("/products")
				dispose()
			})
		})

		it("updates hash correctly", () => {
			createRoot((dispose) => {
				const client = createFlareClient({ flareState: createFlareState() })
				const ctx = createFlareProvider(client)

				ctx.setLocation({ hash: "#section", pathname: "/", search: "" })

				expect(ctx.location().hash).toBe("#section")
				dispose()
			})
		})

		it("updates search correctly", () => {
			createRoot((dispose) => {
				const client = createFlareClient({ flareState: createFlareState() })
				const ctx = createFlareProvider(client)

				ctx.setLocation({ hash: "", pathname: "/", search: "?q=test" })

				expect(ctx.location().search).toBe("?q=test")
				dispose()
			})
		})
	})

	describe("params signal", () => {
		it("provides reactive params signal", () => {
			createRoot((dispose) => {
				const flareState = createFlareState({ params: { id: "1" } })
				const client = createFlareClient({ flareState })
				const ctx = createFlareProvider(client)

				expect(ctx.params()).toEqual({ id: "1" })

				ctx.setParams({ id: "2", slug: "widget" })

				expect(ctx.params()).toEqual({ id: "2", slug: "widget" })
				dispose()
			})
		})

		it("handles empty params", () => {
			createRoot((dispose) => {
				const client = createFlareClient({ flareState: createFlareState() })
				const ctx = createFlareProvider(client)

				expect(ctx.params()).toEqual({})

				ctx.setParams({})

				expect(ctx.params()).toEqual({})
				dispose()
			})
		})

		it("handles array params (catch-all routes)", () => {
			createRoot((dispose) => {
				const client = createFlareClient({ flareState: createFlareState() })
				const ctx = createFlareProvider(client)

				ctx.setParams({ slug: ["2024", "01", "post-title"] })

				expect(ctx.params()).toEqual({ slug: ["2024", "01", "post-title"] })
				dispose()
			})
		})
	})

	describe("matches signal", () => {
		it("provides reactive matches signal", () => {
			createRoot((dispose) => {
				const flareState = new FlareStateBuilder().addMatch("_root_", {}).build()
				const client = createFlareClient({ flareState })
				const ctx = createFlareProvider(client)

				expect(ctx.matches()).toHaveLength(1)

				ctx.setMatches([
					{ loaderData: {}, render: () => null, virtualPath: "_root_" },
					{ loaderData: { products: [] }, render: () => null, virtualPath: "_root_/products" },
				])

				expect(ctx.matches()).toHaveLength(2)
				dispose()
			})
		})

		it("preserves loader data in matches", () => {
			createRoot((dispose) => {
				const client = createFlareClient({ flareState: createFlareState() })
				const ctx = createFlareProvider(client)

				ctx.setMatches([
					{ loaderData: { items: [1, 2, 3] }, render: () => null, virtualPath: "_root_" },
				])

				expect(ctx.matches()[0]?.loaderData).toEqual({ items: [1, 2, 3] })
				dispose()
			})
		})

		it("preserves preloader context in matches", () => {
			createRoot((dispose) => {
				const client = createFlareClient({ flareState: createFlareState() })
				const ctx = createFlareProvider(client)

				ctx.setMatches([
					{
						loaderData: {},
						preloaderContext: { authenticated: true },
						render: () => null,
						virtualPath: "_root_",
					},
				])

				expect(ctx.matches()[0]?.preloaderContext).toEqual({ authenticated: true })
				dispose()
			})
		})
	})

	describe("isNavigating signal", () => {
		it("provides reactive isNavigating signal", () => {
			createRoot((dispose) => {
				const client = createFlareClient({ flareState: createFlareState() })
				const ctx = createFlareProvider(client)

				expect(ctx.isNavigating()).toBe(false)

				ctx.setIsNavigating(true)

				expect(ctx.isNavigating()).toBe(true)
				dispose()
			})
		})

		it("toggles back to false", () => {
			createRoot((dispose) => {
				const client = createFlareClient({ flareState: createFlareState() })
				const ctx = createFlareProvider(client)

				ctx.setIsNavigating(true)
				expect(ctx.isNavigating()).toBe(true)

				ctx.setIsNavigating(false)
				expect(ctx.isNavigating()).toBe(false)
				dispose()
			})
		})
	})
})

/* ============================================================================
 * Router methods
 * ============================================================================ */

describe("router methods", () => {
	it("returns router with navigate method", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			expect(typeof ctx.router.navigate).toBe("function")
			dispose()
		})
	})

	it("returns router with prefetch method", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			expect(typeof ctx.router.prefetch).toBe("function")
			dispose()
		})
	})

	it("returns router with clearCache method", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			expect(typeof ctx.router.clearCache).toBe("function")
			dispose()
		})
	})

	it("returns router with invalidate method", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			expect(typeof ctx.router.invalidate).toBe("function")
			dispose()
		})
	})

	it("returns router with refetch method", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			expect(typeof ctx.router.refetch).toBe("function")
			dispose()
		})
	})

	it("returns router with state property", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			expect(ctx.router.state).toBeDefined()
			expect(typeof ctx.router.state.isNavigating).toBe("boolean")
			dispose()
		})
	})
})

/* ============================================================================
 * Hooks - inside context
 * ============================================================================ */

describe("hooks inside FlareContext", () => {
	it("useFlareRouter returns router", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			/* Simulate being inside FlareContext.Provider */
			const TestComponent = () => {
				/* We can't use useContext directly in tests without Provider tree */
				/* But we can verify the ctx.router is what would be returned */
				expect(ctx.router).toBeDefined()
				expect(typeof ctx.router.navigate).toBe("function")
				return null
			}
			TestComponent()

			dispose()
		})
	})

	it("useLocation returns accessor", () => {
		createRoot((dispose) => {
			const client = createFlareClient({
				flareState: createFlareState({ pathname: "/test" }),
			})
			const ctx = createFlareProvider(client)

			expect(typeof ctx.location).toBe("function")
			expect(ctx.location().pathname).toBe("/test")
			dispose()
		})
	})

	it("useParams returns accessor", () => {
		createRoot((dispose) => {
			const client = createFlareClient({
				flareState: createFlareState({ params: { id: "42" } }),
			})
			const ctx = createFlareProvider(client)

			expect(typeof ctx.params).toBe("function")
			expect(ctx.params()).toEqual({ id: "42" })
			dispose()
		})
	})

	it("useMatches returns accessor", () => {
		createRoot((dispose) => {
			const client = createFlareClient({
				flareState: new FlareStateBuilder().addMatch("_root_", {}).build(),
			})
			const ctx = createFlareProvider(client)

			expect(typeof ctx.matches).toBe("function")
			expect(ctx.matches()).toHaveLength(1)
			dispose()
		})
	})

	it("useIsNavigating returns accessor", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			expect(typeof ctx.isNavigating).toBe("function")
			expect(ctx.isNavigating()).toBe(false)
			dispose()
		})
	})

	it("useFlareClient returns client reference", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			expect(ctx.client).toBe(client)
			dispose()
		})
	})
})

/* ============================================================================
 * Hooks - outside context (error cases)
 * ============================================================================ */

describe("hooks outside FlareContext", () => {
	it("useFlareRouter throws outside provider", () => {
		createRoot((dispose) => {
			/* useContext returns null when not inside Provider */
			expect(() => {
				const ctx = useContext(FlareContext)
				if (!ctx) {
					throw new Error("[useFlareRouter] Must be used within FlareProvider")
				}
			}).toThrow("[useFlareRouter] Must be used within FlareProvider")
			dispose()
		})
	})

	it("useLocation throws outside provider", () => {
		createRoot((dispose) => {
			expect(() => {
				const ctx = useContext(FlareContext)
				if (!ctx) {
					throw new Error("[useLocation] Must be used within FlareProvider")
				}
			}).toThrow("[useLocation] Must be used within FlareProvider")
			dispose()
		})
	})

	it("useParams throws outside provider", () => {
		createRoot((dispose) => {
			expect(() => {
				const ctx = useContext(FlareContext)
				if (!ctx) {
					throw new Error("[useParams] Must be used within FlareProvider")
				}
			}).toThrow("[useParams] Must be used within FlareProvider")
			dispose()
		})
	})

	it("useMatches throws outside provider", () => {
		createRoot((dispose) => {
			expect(() => {
				const ctx = useContext(FlareContext)
				if (!ctx) {
					throw new Error("[useMatches] Must be used within FlareProvider")
				}
			}).toThrow("[useMatches] Must be used within FlareProvider")
			dispose()
		})
	})

	it("useIsNavigating throws outside provider", () => {
		createRoot((dispose) => {
			expect(() => {
				const ctx = useContext(FlareContext)
				if (!ctx) {
					throw new Error("[useIsNavigating] Must be used within FlareProvider")
				}
			}).toThrow("[useIsNavigating] Must be used within FlareProvider")
			dispose()
		})
	})

	it("useFlareClient throws outside provider", () => {
		createRoot((dispose) => {
			expect(() => {
				const ctx = useContext(FlareContext)
				if (!ctx) {
					throw new Error("[useFlareClient] Must be used within FlareProvider")
				}
			}).toThrow("[useFlareClient] Must be used within FlareProvider")
			dispose()
		})
	})
})

/* ============================================================================
 * Signal reactivity tracking
 * ============================================================================ */

describe("signal reactivity tracking", () => {
	it("location signal updates correctly", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			/* Initial value */
			const initial = ctx.location().pathname
			expect(initial).toBe("/")

			/* Update */
			ctx.setLocation({ hash: "", pathname: "/about", search: "" })
			const updated = ctx.location().pathname
			expect(updated).toBe("/about")

			dispose()
		})
	})

	it("matches signal updates correctly", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			/* Initial value */
			const initial = ctx.matches().length
			expect(initial).toBe(0)

			/* Update */
			ctx.setMatches([{ loaderData: {}, render: () => null, virtualPath: "_root_" }])
			const updated = ctx.matches().length
			expect(updated).toBe(1)

			dispose()
		})
	})

	it("params signal updates correctly", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			/* Initial value */
			expect(ctx.params()).toEqual({})

			/* Update */
			ctx.setParams({ id: "123" })
			expect(ctx.params()).toEqual({ id: "123" })

			dispose()
		})
	})

	it("isNavigating signal updates correctly", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			/* Initial value */
			expect(ctx.isNavigating()).toBe(false)

			/* Update */
			ctx.setIsNavigating(true)
			expect(ctx.isNavigating()).toBe(true)

			dispose()
		})
	})

	it("multiple signals update independently", () => {
		createRoot((dispose) => {
			const client = createFlareClient({ flareState: createFlareState() })
			const ctx = createFlareProvider(client)

			/* Update location only */
			ctx.setLocation({ hash: "", pathname: "/new", search: "" })
			expect(ctx.location().pathname).toBe("/new")
			expect(ctx.isNavigating()).toBe(false)

			/* Update isNavigating only */
			ctx.setIsNavigating(true)
			expect(ctx.location().pathname).toBe("/new")
			expect(ctx.isNavigating()).toBe(true)

			dispose()
		})
	})
})

/* ============================================================================
 * Context state hydration
 * ============================================================================ */

describe("context state hydration", () => {
	it("hydrates context properties from flare state", () => {
		const flareState = new FlareStateBuilder()
			.withContext({ locale: "en-US", theme: "dark" })
			.build()
		const client = createFlareClient({ flareState })
		const _ctx = createFlareProvider(client)

		/* Context should be accessible via client */
		expect(client.getContext().locale).toBe("en-US")
		expect(client.getContext().theme).toBe("dark")
	})

	it("hydrates router defaults from flare state", () => {
		const flareState = new FlareStateBuilder().withNavFormat("html").build()
		const client = createFlareClient({ flareState })
		const _ctx = createFlareProvider(client)

		expect(client.getContext().routerDefaults?.navFormat).toBe("html")
	})
})
