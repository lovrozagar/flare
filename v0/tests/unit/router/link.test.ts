/**
 * Link Unit Tests
 *
 * Tests Link component for SPA navigation.
 * Link uses buildUrl, handles prefetch strategies, and supports activeClass.
 */

import { describe, expect, it } from "vitest"
import {
	createLinkProps,
	isLinkProps,
	Link,
	type LinkProps,
	type PrefetchStrategy,
} from "../../../src/router/link"

describe("Link", () => {
	describe("LinkProps type", () => {
		it("requires to prop", () => {
			const props: LinkProps = { to: "/about" }
			expect(props.to).toBe("/about")
		})

		it("supports params for dynamic routes", () => {
			const props: LinkProps = {
				params: { id: "123" },
				to: "/products/[id]",
			}
			expect(props.params).toEqual({ id: "123" })
		})

		it("supports search params", () => {
			const props: LinkProps = {
				search: { page: 2, sort: "name" },
				to: "/products",
			}
			expect(props.search).toEqual({ page: 2, sort: "name" })
		})

		it("supports hash", () => {
			const props: LinkProps = {
				hash: "reviews",
				to: "/products/[id]",
			}
			expect(props.hash).toBe("reviews")
		})

		it("supports replace option", () => {
			const props: LinkProps = {
				replace: true,
				to: "/dashboard",
			}
			expect(props.replace).toBe(true)
		})

		it("supports shallow option", () => {
			const props: LinkProps = {
				shallow: true,
				to: "/products",
			}
			expect(props.shallow).toBe(true)
		})

		it("supports activeClass", () => {
			const props: LinkProps = {
				activeClass: "font-bold",
				to: "/about",
			}
			expect(props.activeClass).toBe("font-bold")
		})

		it("supports inactiveClass", () => {
			const props: LinkProps = {
				inactiveClass: "text-gray-500",
				to: "/about",
			}
			expect(props.inactiveClass).toBe("text-gray-500")
		})

		it("supports force prop for same-URL refetch", () => {
			const props: LinkProps = {
				force: true,
				to: "/products",
			}
			expect(props.force).toBe(true)
		})

		it("force defaults to undefined (falsy)", () => {
			const props: LinkProps = {
				to: "/products",
			}
			expect(props.force).toBeUndefined()
		})

		it("supports css prop for inline styles", () => {
			const props: LinkProps = {
				css: "color: red; font-weight: bold",
				to: "/about",
			}
			expect(props.css).toBe("color: red; font-weight: bold")
		})

		it("supports tw prop for Tailwind classes", () => {
			const props: LinkProps = {
				to: "/about",
				tw: "text-blue-500 hover:text-blue-700",
			}
			expect(props.tw).toBe("text-blue-500 hover:text-blue-700")
		})

		it("supports activeCss prop", () => {
			const props: LinkProps = {
				activeCss: "font-weight: bold",
				to: "/about",
			}
			expect(props.activeCss).toBe("font-weight: bold")
		})

		it("supports activeTw prop", () => {
			const props: LinkProps = {
				activeTw: "text-blue-600 font-bold",
				to: "/about",
			}
			expect(props.activeTw).toBe("text-blue-600 font-bold")
		})

		it("supports inactiveCss prop", () => {
			const props: LinkProps = {
				inactiveCss: "opacity: 0.5",
				to: "/about",
			}
			expect(props.inactiveCss).toBe("opacity: 0.5")
		})

		it("supports inactiveTw prop", () => {
			const props: LinkProps = {
				inactiveTw: "text-gray-400",
				to: "/about",
			}
			expect(props.inactiveTw).toBe("text-gray-400")
		})

		it("supports params with undefined for optional params", () => {
			const props: LinkProps = {
				params: { id: "123", locale: undefined },
				to: "/[[locale]]/products/[id]",
			}
			expect(props.params).toEqual({ id: "123", locale: undefined })
		})
	})

	describe("PrefetchStrategy", () => {
		it("includes hover", () => {
			const strategy: PrefetchStrategy = "hover"
			expect(strategy).toBe("hover")
		})

		it("includes viewport", () => {
			const strategy: PrefetchStrategy = "viewport"
			expect(strategy).toBe("viewport")
		})

		it("includes false to disable", () => {
			const strategy: PrefetchStrategy = false
			expect(strategy).toBe(false)
		})
	})

	describe("isLinkProps", () => {
		it("returns true for valid link props", () => {
			expect(isLinkProps({ to: "/about" })).toBe(true)
		})

		it("returns true for props with params", () => {
			expect(isLinkProps({ params: { id: "123" }, to: "/products/[id]" })).toBe(true)
		})

		it("returns false for null", () => {
			expect(isLinkProps(null)).toBe(false)
		})

		it("returns false for undefined", () => {
			expect(isLinkProps(undefined)).toBe(false)
		})

		it("returns false for object without to", () => {
			expect(isLinkProps({ href: "/about" })).toBe(false)
		})

		it("returns false for non-string to", () => {
			expect(isLinkProps({ to: 123 })).toBe(false)
		})
	})

	describe("createLinkProps", () => {
		it("creates props with defaults", () => {
			const props = createLinkProps({ to: "/about" })
			expect(props.to).toBe("/about")
			expect(props.prefetch).toBe("hover")
		})

		it("preserves custom prefetch", () => {
			const props = createLinkProps({ prefetch: "viewport", to: "/products" })
			expect(props.prefetch).toBe("viewport")
		})

		it("preserves params", () => {
			const props = createLinkProps({
				params: { id: "123" },
				to: "/products/[id]",
			})
			expect(props.params).toEqual({ id: "123" })
		})

		it("preserves search", () => {
			const props = createLinkProps({
				search: { page: 2 },
				to: "/products",
			})
			expect(props.search).toEqual({ page: 2 })
		})

		it("preserves hash", () => {
			const props = createLinkProps({
				hash: "top",
				to: "/about",
			})
			expect(props.hash).toBe("top")
		})

		it("preserves replace", () => {
			const props = createLinkProps({
				replace: true,
				to: "/dashboard",
			})
			expect(props.replace).toBe(true)
		})

		it("preserves shallow", () => {
			const props = createLinkProps({
				shallow: true,
				to: "/products",
			})
			expect(props.shallow).toBe(true)
		})

		it("preserves activeClass", () => {
			const props = createLinkProps({
				activeClass: "active",
				to: "/about",
			})
			expect(props.activeClass).toBe("active")
		})

		it("preserves inactiveClass", () => {
			const props = createLinkProps({
				inactiveClass: "inactive",
				to: "/about",
			})
			expect(props.inactiveClass).toBe("inactive")
		})

		it("preserves disabled", () => {
			const props = createLinkProps({
				disabled: true,
				to: "/admin",
			})
			expect(props.disabled).toBe(true)
		})

		it("preserves force", () => {
			const props = createLinkProps({
				force: true,
				to: "/products",
			})
			expect(props.force).toBe(true)
		})

		it("preserves css", () => {
			const props = createLinkProps({
				css: "color: blue",
				to: "/about",
			})
			expect(props.css).toBe("color: blue")
		})

		it("preserves tw", () => {
			const props = createLinkProps({
				to: "/about",
				tw: "text-red-500",
			})
			expect(props.tw).toBe("text-red-500")
		})

		it("preserves activeCss", () => {
			const props = createLinkProps({
				activeCss: "font-weight: bold",
				to: "/about",
			})
			expect(props.activeCss).toBe("font-weight: bold")
		})

		it("preserves activeTw", () => {
			const props = createLinkProps({
				activeTw: "font-bold",
				to: "/about",
			})
			expect(props.activeTw).toBe("font-bold")
		})

		it("preserves inactiveCss", () => {
			const props = createLinkProps({
				inactiveCss: "opacity: 0.5",
				to: "/about",
			})
			expect(props.inactiveCss).toBe("opacity: 0.5")
		})

		it("preserves inactiveTw", () => {
			const props = createLinkProps({
				inactiveTw: "text-gray-400",
				to: "/about",
			})
			expect(props.inactiveTw).toBe("text-gray-400")
		})
	})

	describe("Link component", () => {
		it("is defined", () => {
			expect(Link).toBeDefined()
			expect(typeof Link).toBe("function")
		})
	})
})
