/**
 * Router Hooks Unit Tests
 *
 * Tests navigation hooks: useLocation, useParams, useSearch, useMatch, useMatches.
 * Also tests useLoaderData, usePreloaderContext, and signal creators.
 */

import { afterEach, describe, expect, it } from "vitest"
import { clearGlobalFlareContext, setGlobalFlareContext } from "../../../src/client/flare-context"
import {
	createLocationSignal,
	createParamsSignal,
	createSearchSignal,
	type UseLoaderDataOptions,
	type UseMatchOptions,
	useHydrated,
	useLoaderData,
	useLocation,
	useMatch,
	useMatches,
	useParams,
	usePreloaderContext,
	useSearch,
} from "../../../src/router/hooks"

/* ============================================================================
 * Signal Creators
 * ============================================================================ */

describe("createLocationSignal", () => {
	describe("initial values", () => {
		it("creates signal with pathname", () => {
			const [location] = createLocationSignal({
				hash: "",
				pathname: "/products",
				search: "",
			})
			expect(location().pathname).toBe("/products")
		})

		it("creates signal with search", () => {
			const [location] = createLocationSignal({
				hash: "",
				pathname: "/",
				search: "?page=2",
			})
			expect(location().search).toBe("?page=2")
		})

		it("creates signal with hash", () => {
			const [location] = createLocationSignal({
				hash: "#top",
				pathname: "/",
				search: "",
			})
			expect(location().hash).toBe("#top")
		})

		it("creates signal with all properties", () => {
			const [location] = createLocationSignal({
				hash: "#section",
				pathname: "/page",
				search: "?q=test",
			})
			expect(location()).toEqual({
				hash: "#section",
				pathname: "/page",
				search: "?q=test",
			})
		})
	})

	describe("setter", () => {
		it("updates location via setter", () => {
			const [location, setLocation] = createLocationSignal({
				hash: "",
				pathname: "/",
				search: "",
			})
			setLocation({ hash: "", pathname: "/new", search: "" })
			expect(location().pathname).toBe("/new")
		})

		it("updates all properties at once", () => {
			const [location, setLocation] = createLocationSignal({
				hash: "",
				pathname: "/",
				search: "",
			})
			setLocation({ hash: "#new", pathname: "/path", search: "?foo=bar" })
			expect(location()).toEqual({
				hash: "#new",
				pathname: "/path",
				search: "?foo=bar",
			})
		})

		it("allows multiple updates", () => {
			const [location, setLocation] = createLocationSignal({
				hash: "",
				pathname: "/",
				search: "",
			})
			setLocation({ hash: "", pathname: "/first", search: "" })
			setLocation({ hash: "", pathname: "/second", search: "" })
			setLocation({ hash: "", pathname: "/third", search: "" })
			expect(location().pathname).toBe("/third")
		})
	})

	describe("edge cases", () => {
		it("handles empty string pathname", () => {
			const [location] = createLocationSignal({
				hash: "",
				pathname: "",
				search: "",
			})
			expect(location().pathname).toBe("")
		})

		it("handles encoded search params", () => {
			const [location] = createLocationSignal({
				hash: "",
				pathname: "/",
				search: "?name=hello%20world",
			})
			expect(location().search).toBe("?name=hello%20world")
		})
	})
})

describe("createParamsSignal", () => {
	describe("initial values", () => {
		it("creates signal with params", () => {
			const [params] = createParamsSignal({ id: "123", slug: "hello" })
			expect(params().id).toBe("123")
			expect(params().slug).toBe("hello")
		})

		it("creates signal with empty params", () => {
			const [params] = createParamsSignal({})
			expect(params()).toEqual({})
		})

		it("handles single param", () => {
			const [params] = createParamsSignal({ id: "42" })
			expect(params()).toEqual({ id: "42" })
		})
	})

	describe("setter", () => {
		it("updates params via setter", () => {
			const [params, setParams] = createParamsSignal({ id: "1" })
			setParams({ id: "2" })
			expect(params().id).toBe("2")
		})

		it("replaces all params", () => {
			const [params, setParams] = createParamsSignal({ a: "1", b: "2" })
			setParams({ c: "3" })
			expect(params()).toEqual({ c: "3" })
		})
	})
})

describe("createSearchSignal", () => {
	describe("initial values", () => {
		it("creates signal with search params", () => {
			const [search] = createSearchSignal({ page: 2, sort: "name" })
			expect(search().page).toBe(2)
			expect(search().sort).toBe("name")
		})

		it("creates signal with empty search", () => {
			const [search] = createSearchSignal({})
			expect(search()).toEqual({})
		})

		it("handles mixed types", () => {
			const [search] = createSearchSignal({
				active: true,
				count: 10,
				filter: null,
				name: "test",
			})
			expect(search()).toEqual({
				active: true,
				count: 10,
				filter: null,
				name: "test",
			})
		})

		it("handles arrays", () => {
			const [search] = createSearchSignal({ tags: ["a", "b", "c"] })
			expect(search().tags).toEqual(["a", "b", "c"])
		})
	})

	describe("setter", () => {
		it("updates search via setter", () => {
			const [search, setSearch] = createSearchSignal({ page: 1 })
			setSearch({ page: 2 })
			expect(search().page).toBe(2)
		})

		it("replaces entire search object", () => {
			const [search, setSearch] = createSearchSignal({ a: 1, b: 2 })
			setSearch({ c: 3 })
			expect(search()).toEqual({ c: 3 })
		})
	})
})

/* ============================================================================
 * Hooks - Error Behavior (outside context)
 * ============================================================================ */

describe("useLocation", () => {
	afterEach(() => {
		clearGlobalFlareContext()
	})

	it("is a function", () => {
		expect(typeof useLocation).toBe("function")
	})

	it("throws when used outside context", () => {
		expect(() => useLocation()).toThrow("[useLocation] Must be used within FlareProvider")
	})

	it("returns location from context", () => {
		setGlobalFlareContext({
			location: () => ({ hash: "#top", pathname: "/products", search: "?page=1" }),
			matches: () => [],
			params: () => ({}),
		})
		const location = useLocation()
		expect(location()).toEqual({ hash: "#top", pathname: "/products", search: "?page=1" })
	})
})

describe("useParams", () => {
	afterEach(() => {
		clearGlobalFlareContext()
	})

	it("is a function", () => {
		expect(typeof useParams).toBe("function")
	})

	it("throws when used outside context", () => {
		expect(() => useParams()).toThrow("[useParams] Must be used within FlareProvider")
	})

	it("returns params from context", () => {
		setGlobalFlareContext({
			location: () => ({ hash: "", pathname: "/", search: "" }),
			matches: () => [],
			params: () => ({ id: "123", slug: "hello" }),
		})
		const params = useParams()
		expect(params()).toEqual({ id: "123", slug: "hello" })
	})
})

describe("useSearch", () => {
	afterEach(() => {
		clearGlobalFlareContext()
	})

	it("is a function", () => {
		expect(typeof useSearch).toBe("function")
	})

	it("throws when used outside context", () => {
		expect(() => useSearch()).toThrow("[useSearch] Must be used within FlareProvider")
	})

	it("parses search from location", () => {
		setGlobalFlareContext({
			location: () => ({ hash: "", pathname: "/", search: "page=2&sort=name" }),
			matches: () => [],
			params: () => ({}),
		})
		const search = useSearch()
		expect(search()).toEqual({ page: "2", sort: "name" })
	})
})

describe("useMatch", () => {
	afterEach(() => {
		clearGlobalFlareContext()
	})

	it("is a function", () => {
		expect(typeof useMatch).toBe("function")
	})

	it("throws when used outside context", () => {
		expect(() => useMatch({ from: "/test" })).toThrow(
			"[useMatch] Must be used within FlareProvider",
		)
	})

	it("returns match for virtualPath", () => {
		setGlobalFlareContext({
			location: () => ({ hash: "", pathname: "/", search: "" }),
			matches: () => [
				{ loaderData: { root: true }, virtualPath: "/" },
				{ loaderData: { product: true }, virtualPath: "/products/[id]" },
			],
			params: () => ({}),
		})
		const match = useMatch({ from: "/products/[id]" })
		expect(match()?.virtualPath).toBe("/products/[id]")
		expect(match()?.loaderData).toEqual({ product: true })
	})

	it("returns undefined for non-matching virtualPath", () => {
		setGlobalFlareContext({
			location: () => ({ hash: "", pathname: "/", search: "" }),
			matches: () => [{ loaderData: {}, virtualPath: "/" }],
			params: () => ({}),
		})
		const match = useMatch({ from: "/not-found" })
		expect(match()).toBeUndefined()
	})
})

describe("useMatches", () => {
	afterEach(() => {
		clearGlobalFlareContext()
	})

	it("is a function", () => {
		expect(typeof useMatches).toBe("function")
	})

	it("throws when used outside context", () => {
		expect(() => useMatches()).toThrow("[useMatches] Must be used within FlareProvider")
	})

	it("returns all matches from context", () => {
		const mockMatches = [
			{ loaderData: { root: true }, virtualPath: "/" },
			{ loaderData: { products: true }, virtualPath: "/products" },
			{ loaderData: { product: true }, virtualPath: "/products/[id]" },
		]
		setGlobalFlareContext({
			location: () => ({ hash: "", pathname: "/", search: "" }),
			matches: () => mockMatches,
			params: () => ({}),
		})
		const matches = useMatches()
		expect(matches()).toHaveLength(3)
		expect(matches().map((m) => m.virtualPath)).toEqual(["/", "/products", "/products/[id]"])
	})
})

describe("useHydrated", () => {
	it("is a function", () => {
		expect(typeof useHydrated).toBe("function")
	})

	it("returns false in SSR environment (no window)", () => {
		/* In test environment, window may or may not exist */
		/* useHydrated returns false during SSR, true on client */
		const hydrated = useHydrated()
		expect(typeof hydrated()).toBe("boolean")
	})
})

/* ============================================================================
 * UseMatchOptions / UseLoaderDataOptions Types
 * ============================================================================ */

describe("UseMatchOptions", () => {
	it("requires from", () => {
		const options: UseMatchOptions = { from: "/products/[id]" }
		expect(options.from).toBe("/products/[id]")
	})

	it("accepts any from string", () => {
		const options: UseMatchOptions = { from: "/" }
		expect(options.from).toBe("/")
	})
})

describe("UseLoaderDataOptions", () => {
	it("requires from", () => {
		const options: UseLoaderDataOptions = { from: "/products/[id]" }
		expect(options.from).toBe("/products/[id]")
	})
})

/* ============================================================================
 * useLoaderData (with global context)
 * ============================================================================ */

describe("useLoaderData", () => {
	afterEach(() => {
		clearGlobalFlareContext()
	})

	it("throws when no context is available", () => {
		expect(() => useLoaderData({ from: "/test" })).toThrow(
			"[useLoaderData] Must be used within FlareProvider",
		)
	})

	it("returns loader data for matching route", () => {
		setGlobalFlareContext({
			matches: () => [{ loaderData: { name: "Test Product" }, virtualPath: "/products/[id]" }],
		})

		const data = useLoaderData({ from: "/products/[id]" })
		expect(data()).toEqual({ name: "Test Product" })
	})

	it("throws when route not in current route chain", () => {
		setGlobalFlareContext({
			matches: () => [{ loaderData: {}, virtualPath: "/home" }],
		})

		expect(() => useLoaderData({ from: "/products" })).toThrow(
			'[useLoaderData] Route "/products" is not in the current route chain',
		)
	})

	it("includes available paths in error message", () => {
		setGlobalFlareContext({
			matches: () => [
				{ loaderData: {}, virtualPath: "/" },
				{ loaderData: {}, virtualPath: "/dashboard" },
			],
		})

		expect(() => useLoaderData({ from: "/settings" })).toThrow("Available routes: [/, /dashboard]")
	})

	it("finds correct match in route chain", () => {
		setGlobalFlareContext({
			matches: () => [
				{ loaderData: { global: true }, virtualPath: "/" },
				{ loaderData: { user: { id: 1 } }, virtualPath: "/users" },
				{ loaderData: { userId: 123 }, virtualPath: "/users/[id]" },
			],
		})

		const rootData = useLoaderData({ from: "/" })
		const usersData = useLoaderData({ from: "/users" })
		const userIdData = useLoaderData({ from: "/users/[id]" })

		expect(rootData()).toEqual({ global: true })
		expect(usersData()).toEqual({ user: { id: 1 } })
		expect(userIdData()).toEqual({ userId: 123 })
	})

	it("handles undefined loader data", () => {
		setGlobalFlareContext({
			matches: () => [{ loaderData: undefined, virtualPath: "/" }],
		})

		const data = useLoaderData({ from: "/" })
		expect(data()).toBeUndefined()
	})

	it("handles empty matches array", () => {
		setGlobalFlareContext({
			matches: () => [],
		})

		expect(() => useLoaderData({ from: "/" })).toThrow(
			'[useLoaderData] Route "/" is not in the current route chain',
		)
	})

	it("transforms data with select function", () => {
		setGlobalFlareContext({
			matches: () => [
				{
					loaderData: { product: { id: 1, name: "Widget", price: 99.99 } },
					virtualPath: "/products/[id]",
				},
			],
		})

		const productName = useLoaderData({
			from: "/products/[id]",
			select: (data: { product: { id: number; name: string; price: number } }) => data.product.name,
		})

		expect(productName()).toBe("Widget")
	})

	it("select can return derived values", () => {
		setGlobalFlareContext({
			matches: () => [
				{
					loaderData: { items: [1, 2, 3, 4, 5] },
					virtualPath: "/",
				},
			],
		})

		const count = useLoaderData({
			from: "/",
			select: (data: { items: number[] }) => data.items.length,
		})

		expect(count()).toBe(5)
	})

	it("select can return objects", () => {
		setGlobalFlareContext({
			matches: () => [
				{
					loaderData: { user: { email: "john@example.com", firstName: "John", lastName: "Doe" } },
					virtualPath: "/",
				},
			],
		})

		const nameOnly = useLoaderData({
			from: "/",
			select: (data: { user: { firstName: string; lastName: string; email: string } }) => ({
				fullName: `${data.user.firstName} ${data.user.lastName}`,
			}),
		})

		expect(nameOnly()).toEqual({ fullName: "John Doe" })
	})

	it("works without select (returns full data)", () => {
		const fullData = { nested: { deep: { value: 42 } } }
		setGlobalFlareContext({
			matches: () => [{ loaderData: fullData, virtualPath: "/" }],
		})

		const data = useLoaderData({ from: "/" })
		expect(data()).toEqual(fullData)
	})
})

/* ============================================================================
 * usePreloaderContext (with global context)
 * ============================================================================ */

describe("usePreloaderContext", () => {
	afterEach(() => {
		clearGlobalFlareContext()
	})

	it("throws when no context is available", () => {
		expect(() => usePreloaderContext({ from: "/test" })).toThrow(
			"[usePreloaderContext] Must be used within FlareProvider",
		)
	})

	it("returns preloader context for matching route", () => {
		setGlobalFlareContext({
			matches: () => [{ preloaderContext: { theme: "dark" }, virtualPath: "/" }],
		})

		const ctx = usePreloaderContext({ from: "/" })
		expect(ctx()).toEqual({ theme: "dark" })
	})

	it("throws when route not in current route chain", () => {
		setGlobalFlareContext({
			matches: () => [{ preloaderContext: {}, virtualPath: "/home" }],
		})

		expect(() => usePreloaderContext({ from: "/settings" })).toThrow(
			'[usePreloaderContext] Route "/settings" is not in the current route chain',
		)
	})

	it("includes available paths in error message", () => {
		setGlobalFlareContext({
			matches: () => [
				{ preloaderContext: {}, virtualPath: "/" },
				{ preloaderContext: {}, virtualPath: "/admin" },
			],
		})

		expect(() => usePreloaderContext({ from: "/user" })).toThrow("Available routes: [/, /admin]")
	})

	it("finds correct match in route chain", () => {
		setGlobalFlareContext({
			matches: () => [
				{ preloaderContext: { level: "root" }, virtualPath: "/" },
				{ preloaderContext: { level: "nested" }, virtualPath: "/nested" },
			],
		})

		const rootCtx = usePreloaderContext({ from: "/" })
		const nestedCtx = usePreloaderContext({ from: "/nested" })

		expect(rootCtx()).toEqual({ level: "root" })
		expect(nestedCtx()).toEqual({ level: "nested" })
	})

	it("handles undefined preloader context", () => {
		setGlobalFlareContext({
			matches: () => [{ preloaderContext: undefined, virtualPath: "/" }],
		})

		const ctx = usePreloaderContext({ from: "/" })
		expect(ctx()).toBeUndefined()
	})

	it("transforms context with select function", () => {
		setGlobalFlareContext({
			matches: () => [
				{
					preloaderContext: { locale: "en", theme: "dark", user: { name: "John" } },
					virtualPath: "/",
				},
			],
		})

		const theme = usePreloaderContext({
			from: "/",
			select: (ctx: { theme: string; locale: string; user: { name: string } }) => ctx.theme,
		})

		expect(theme()).toBe("dark")
	})
})

/* ============================================================================
 * Edge Cases and Special Characters
 * ============================================================================ */

describe("hooks edge cases", () => {
	afterEach(() => {
		clearGlobalFlareContext()
	})

	describe("special characters in route path", () => {
		it("handles catch-all routes with [[...slug]]", () => {
			setGlobalFlareContext({
				matches: () => [{ loaderData: { segments: ["a", "b"] }, virtualPath: "/blog/[[...slug]]" }],
			})

			const data = useLoaderData({ from: "/blog/[[...slug]]" })
			expect(data()).toEqual({ segments: ["a", "b"] })
		})

		it("handles dynamic segments with [id]", () => {
			setGlobalFlareContext({
				matches: () => [{ loaderData: { id: 123 }, virtualPath: "/users/[id]" }],
			})

			const data = useLoaderData({ from: "/users/[id]" })
			expect(data()).toEqual({ id: 123 })
		})

		it("handles nested dynamic segments", () => {
			setGlobalFlareContext({
				matches: () => [{ loaderData: { org: "acme", repo: "lib" }, virtualPath: "/[org]/[repo]" }],
			})

			const data = useLoaderData({ from: "/[org]/[repo]" })
			expect(data()).toEqual({ org: "acme", repo: "lib" })
		})
	})

	describe("complex data types", () => {
		it("handles nested objects in loader data", () => {
			setGlobalFlareContext({
				matches: () => [
					{
						loaderData: {
							user: {
								address: { city: "NYC", country: "USA" },
								name: "John",
							},
						},
						virtualPath: "/",
					},
				],
			})

			const data = useLoaderData({ from: "/" })
			expect(data().user.address.city).toBe("NYC")
		})

		it("handles arrays in loader data", () => {
			setGlobalFlareContext({
				matches: () => [
					{
						loaderData: { items: [1, 2, 3, 4, 5] },
						virtualPath: "/",
					},
				],
			})

			const data = useLoaderData({ from: "/" })
			expect(data().items).toEqual([1, 2, 3, 4, 5])
		})

		it("handles null values in loader data", () => {
			setGlobalFlareContext({
				matches: () => [
					{
						loaderData: { maybeValue: null },
						virtualPath: "/",
					},
				],
			})

			const data = useLoaderData({ from: "/" })
			expect(data().maybeValue).toBeNull()
		})
	})
})
