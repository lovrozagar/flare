/**
 * Router Context Unit Tests
 *
 * Tests router context, state, and useRouter hook.
 * Router provides navigate, prefetch, refetch, clearCache methods.
 * State includes location, isNavigating, matches.
 */

import { describe, expect, it } from "vitest"
import {
	createRouter,
	createRouterState,
	isRouterState,
	type NavigateOptions,
	type PrefetchOptions,
	RouterContext,
	type RouterState,
	useRouter,
} from "../../../src/router/router-context"

describe("RouterContext", () => {
	describe("RouterState", () => {
		it("has location property", () => {
			const state: RouterState = {
				isNavigating: false,
				location: { hash: "", pathname: "/", search: "" },
				matches: [],
			}
			expect(state.location.pathname).toBe("/")
		})

		it("has isNavigating property", () => {
			const state: RouterState = {
				isNavigating: true,
				location: { hash: "", pathname: "/", search: "" },
				matches: [],
			}
			expect(state.isNavigating).toBe(true)
		})

		it("has matches array", () => {
			const state: RouterState = {
				isNavigating: false,
				location: { hash: "", pathname: "/", search: "" },
				matches: [{ loaderData: {}, render: () => null, virtualPath: "_root_" }],
			}
			expect(state.matches).toHaveLength(1)
		})
	})

	describe("createRouterState", () => {
		it("creates state with defaults", () => {
			const state = createRouterState()
			expect(state.isNavigating).toBe(false)
			expect(state.location.pathname).toBe("/")
			expect(state.matches).toEqual([])
		})

		it("creates state with custom location", () => {
			const state = createRouterState({
				location: { hash: "#top", pathname: "/products", search: "?page=2" },
			})
			expect(state.location.pathname).toBe("/products")
			expect(state.location.search).toBe("?page=2")
			expect(state.location.hash).toBe("#top")
		})

		it("creates state with isNavigating", () => {
			const state = createRouterState({ isNavigating: true })
			expect(state.isNavigating).toBe(true)
		})

		it("creates state with matches", () => {
			const matches = [{ loaderData: {}, render: () => null, virtualPath: "_root_" }]
			const state = createRouterState({ matches })
			expect(state.matches).toBe(matches)
		})
	})

	describe("isRouterState", () => {
		it("returns true for valid state", () => {
			const state = createRouterState()
			expect(isRouterState(state)).toBe(true)
		})

		it("returns false for null", () => {
			expect(isRouterState(null)).toBe(false)
		})

		it("returns false for undefined", () => {
			expect(isRouterState(undefined)).toBe(false)
		})

		it("returns false for object without location", () => {
			expect(isRouterState({ isNavigating: false, matches: [] })).toBe(false)
		})

		it("returns false for object without isNavigating", () => {
			expect(isRouterState({ location: {}, matches: [] })).toBe(false)
		})

		it("returns false for object without matches", () => {
			expect(isRouterState({ isNavigating: false, location: {} })).toBe(false)
		})
	})

	describe("NavigateOptions", () => {
		it("requires to property", () => {
			const options: NavigateOptions = { to: "/products" }
			expect(options.to).toBe("/products")
		})

		it("supports params", () => {
			const options: NavigateOptions = {
				params: { id: "123" },
				to: "/products/[id]",
			}
			expect(options.params).toEqual({ id: "123" })
		})

		it("supports search", () => {
			const options: NavigateOptions = {
				search: { page: 2 },
				to: "/products",
			}
			expect(options.search).toEqual({ page: 2 })
		})

		it("supports hash", () => {
			const options: NavigateOptions = {
				hash: "reviews",
				to: "/products",
			}
			expect(options.hash).toBe("reviews")
		})

		it("supports replace", () => {
			const options: NavigateOptions = {
				replace: true,
				to: "/dashboard",
			}
			expect(options.replace).toBe(true)
		})

		it("supports shallow", () => {
			const options: NavigateOptions = {
				shallow: true,
				to: "/products",
			}
			expect(options.shallow).toBe(true)
		})

		it("supports viewTransition", () => {
			const options: NavigateOptions = {
				to: "/products",
				viewTransition: true,
			}
			expect(options.viewTransition).toBe(true)
		})
	})

	describe("PrefetchOptions", () => {
		it("requires to property", () => {
			const options: PrefetchOptions = { to: "/products" }
			expect(options.to).toBe("/products")
		})

		it("supports params", () => {
			const options: PrefetchOptions = {
				params: { id: "123" },
				to: "/products/[id]",
			}
			expect(options.params).toEqual({ id: "123" })
		})
	})

	describe("createRouter", () => {
		it("creates router with state", () => {
			const router = createRouter()
			expect(router.state).toBeDefined()
			expect(router.state.isNavigating).toBe(false)
		})

		it("creates router with navigate function", () => {
			const router = createRouter()
			expect(typeof router.navigate).toBe("function")
		})

		it("creates router with prefetch function", () => {
			const router = createRouter()
			expect(typeof router.prefetch).toBe("function")
		})

		it("creates router with refetch function", () => {
			const router = createRouter()
			expect(typeof router.refetch).toBe("function")
		})

		it("creates router with clearCache function", () => {
			const router = createRouter()
			expect(typeof router.clearCache).toBe("function")
		})

		it("accepts initial state", () => {
			const router = createRouter({
				initialState: {
					isNavigating: true,
					location: { hash: "", pathname: "/products", search: "" },
					matches: [],
				},
			})
			expect(router.state.location.pathname).toBe("/products")
			expect(router.state.isNavigating).toBe(true)
		})
	})

	describe("RouterContext", () => {
		it("is defined", () => {
			expect(RouterContext).toBeDefined()
		})
	})

	describe("useRouter", () => {
		it("is defined", () => {
			expect(useRouter).toBeDefined()
			expect(typeof useRouter).toBe("function")
		})
	})
})
