/**
 * Path Types Unit Tests
 *
 * Tests runtime utilities for path validation, conversion, and matching.
 */

import { describe, expect, it } from "vitest"
import {
	assertValidPath,
	extractParamNames,
	extractRootFromPath,
	extractRootName,
	findParentLayouts,
	isGroupSegment,
	isPathPrefix,
	isRootLayoutPath,
	pathToRegex,
	stripGroups,
	toUrlPath,
	toVirtualPath,
	validatePath,
	validateRootLayoutPath,
	validateVirtualPath,
} from "../../../src/router/path-types"

/* ============================================================================
 * isRootLayoutPath
 * ============================================================================ */

describe("isRootLayoutPath", () => {
	describe("valid root layout paths", () => {
		it("validates _root_ pattern", () => {
			expect(isRootLayoutPath("_root_")).toBe(true)
		})

		it("validates _docs_ pattern", () => {
			expect(isRootLayoutPath("_docs_")).toBe(true)
		})

		it("validates _admin_ pattern", () => {
			expect(isRootLayoutPath("_admin_")).toBe(true)
		})

		it("validates single character name", () => {
			expect(isRootLayoutPath("_x_")).toBe(true)
		})

		it("validates alphanumeric names", () => {
			expect(isRootLayoutPath("_app2_")).toBe(true)
		})

		it("validates names with hyphens", () => {
			expect(isRootLayoutPath("_my-app_")).toBe(true)
		})
	})

	describe("invalid root layout paths", () => {
		it("rejects paths without leading underscore", () => {
			expect(isRootLayoutPath("root_")).toBe(false)
		})

		it("rejects paths without trailing underscore", () => {
			expect(isRootLayoutPath("_root")).toBe(false)
		})

		it("rejects empty name __", () => {
			expect(isRootLayoutPath("__")).toBe(false)
		})

		it("rejects URL paths", () => {
			expect(isRootLayoutPath("/blog")).toBe(false)
		})

		it("rejects virtual paths", () => {
			expect(isRootLayoutPath("_root_/products")).toBe(false)
		})

		it("rejects names with leading underscore", () => {
			expect(isRootLayoutPath("__root_")).toBe(false)
		})

		it("rejects names with trailing underscore", () => {
			expect(isRootLayoutPath("_root__")).toBe(false)
		})

		it("rejects empty string", () => {
			expect(isRootLayoutPath("")).toBe(false)
		})

		it("rejects single underscore", () => {
			expect(isRootLayoutPath("_")).toBe(false)
		})
	})
})

/* ============================================================================
 * extractRootName
 * ============================================================================ */

describe("extractRootName", () => {
	it("extracts name from _root_", () => {
		expect(extractRootName("_root_")).toBe("root")
	})

	it("extracts name from _docs_", () => {
		expect(extractRootName("_docs_")).toBe("docs")
	})

	it("extracts name from _admin_", () => {
		expect(extractRootName("_admin_")).toBe("admin")
	})

	it("extracts single character name", () => {
		expect(extractRootName("_x_")).toBe("x")
	})

	it("returns null for invalid root path", () => {
		expect(extractRootName("/blog")).toBeNull()
	})

	it("returns null for __", () => {
		expect(extractRootName("__")).toBeNull()
	})

	it("returns null for empty string", () => {
		expect(extractRootName("")).toBeNull()
	})
})

/* ============================================================================
 * extractRootFromPath
 * ============================================================================ */

describe("extractRootFromPath", () => {
	it("extracts root from virtual path", () => {
		expect(extractRootFromPath("_root_/blog/[slug]")).toBe("_root_")
	})

	it("extracts root from path with virtual segments", () => {
		expect(extractRootFromPath("_docs_/(sidebar)/api")).toBe("_docs_")
	})

	it("returns root when path is just root", () => {
		expect(extractRootFromPath("_root_")).toBe("_root_")
	})

	it("returns null for URL path", () => {
		expect(extractRootFromPath("/blog")).toBeNull()
	})

	it("returns null for empty string", () => {
		expect(extractRootFromPath("")).toBeNull()
	})

	it("handles deeply nested paths", () => {
		expect(extractRootFromPath("_admin_/users/[id]/settings")).toBe("_admin_")
	})
})

/* ============================================================================
 * toUrlPath
 * ============================================================================ */

describe("toUrlPath", () => {
	it("converts _root_/blog/[slug] to /blog/[slug]", () => {
		expect(toUrlPath("_root_/blog/[slug]")).toBe("/blog/[slug]")
	})

	it("converts _root_ to /", () => {
		expect(toUrlPath("_root_")).toBe("/")
	})

	it("strips virtual segments", () => {
		expect(toUrlPath("_docs_/(sidebar)/api")).toBe("/api")
	})

	it("strips multiple virtual segments", () => {
		expect(toUrlPath("_root_/(auth)/login")).toBe("/login")
	})

	it("handles path with multiple groups", () => {
		expect(toUrlPath("_root_/(admin)/(dashboard)/users")).toBe("/users")
	})

	it("preserves param segments", () => {
		expect(toUrlPath("_root_/(auth)/users/[id]")).toBe("/users/[id]")
	})

	it("preserves catch-all segments", () => {
		expect(toUrlPath("_root_/docs/[...slug]")).toBe("/docs/[...slug]")
	})

	it("preserves optional catch-all segments", () => {
		expect(toUrlPath("_root_/docs/[[...slug]]")).toBe("/docs/[[...slug]]")
	})

	it("handles deeply nested paths", () => {
		expect(toUrlPath("_root_/users/[id]/posts/[postId]")).toBe("/users/[id]/posts/[postId]")
	})

	it("returns path unchanged if no root segment", () => {
		expect(toUrlPath("/already/url")).toBe("/already/url")
	})
})

/* ============================================================================
 * toVirtualPath
 * ============================================================================ */

describe("toVirtualPath", () => {
	it("converts /blog/[slug] to _root_/blog/[slug]", () => {
		expect(toVirtualPath("/blog/[slug]", "_root_")).toBe("_root_/blog/[slug]")
	})

	it("converts /api to _docs_/api", () => {
		expect(toVirtualPath("/api", "_docs_")).toBe("_docs_/api")
	})

	it("converts / to root only", () => {
		expect(toVirtualPath("/", "_root_")).toBe("_root_")
	})

	it("converts empty string to root only", () => {
		expect(toVirtualPath("", "_root_")).toBe("_root_")
	})

	it("handles path without leading slash", () => {
		expect(toVirtualPath("products", "_root_")).toBe("_root_/products")
	})

	it("handles nested path", () => {
		expect(toVirtualPath("/users/[id]/settings", "_admin_")).toBe("_admin_/users/[id]/settings")
	})
})

/* ============================================================================
 * stripGroups
 * ============================================================================ */

describe("stripGroups", () => {
	it("strips single group", () => {
		expect(stripGroups("/(auth)/login")).toBe("/login")
	})

	it("strips multiple groups", () => {
		expect(stripGroups("/(admin)/(dashboard)/users")).toBe("/users")
	})

	it("returns path unchanged if no groups", () => {
		expect(stripGroups("/dashboard")).toBe("/dashboard")
	})

	it("returns / when all segments are groups", () => {
		expect(stripGroups("/(auth)")).toBe("/")
	})

	it("preserves root layout paths", () => {
		expect(stripGroups("_root_")).toBe("_root_")
	})

	it("handles mixed path with groups and regular segments", () => {
		expect(stripGroups("/admin/(settings)/profile")).toBe("/admin/profile")
	})
})

/* ============================================================================
 * isGroupSegment
 * ============================================================================ */

describe("isGroupSegment", () => {
	it("identifies (auth) as group", () => {
		expect(isGroupSegment("(auth)")).toBe(true)
	})

	it("identifies (dashboard) as group", () => {
		expect(isGroupSegment("(dashboard)")).toBe(true)
	})

	it("identifies (layout-name) as group", () => {
		expect(isGroupSegment("(layout-name)")).toBe(true)
	})

	it("rejects regular segment", () => {
		expect(isGroupSegment("products")).toBe(false)
	})

	it("rejects param segment", () => {
		expect(isGroupSegment("[id]")).toBe(false)
	})

	it("rejects incomplete group (missing closing)", () => {
		expect(isGroupSegment("(auth")).toBe(false)
	})

	it("rejects incomplete group (missing opening)", () => {
		expect(isGroupSegment("auth)")).toBe(false)
	})
})

/* ============================================================================
 * validateRootLayoutPath
 * ============================================================================ */

describe("validateRootLayoutPath", () => {
	it("returns null for valid _root_", () => {
		expect(validateRootLayoutPath("_root_")).toBeNull()
	})

	it("returns null for valid _docs_", () => {
		expect(validateRootLayoutPath("_docs_")).toBeNull()
	})

	it("returns error for missing leading underscore", () => {
		const error = validateRootLayoutPath("root_")
		expect(error).not.toBeNull()
		expect(error?.message).toContain("must match")
	})

	it("returns error for missing trailing underscore", () => {
		const error = validateRootLayoutPath("_root")
		expect(error).not.toBeNull()
		expect(error?.message).toContain("must match")
	})

	it("returns error for empty name", () => {
		const error = validateRootLayoutPath("__")
		expect(error).not.toBeNull()
		expect(error?.message).toContain("cannot be empty")
	})

	it("returns error for invalid characters", () => {
		const error = validateRootLayoutPath("_root@_")
		expect(error).not.toBeNull()
		expect(error?.message).toContain("alphanumeric")
	})

	it("returns error for name starting with number", () => {
		const error = validateRootLayoutPath("_2root_")
		expect(error).not.toBeNull()
		expect(error?.message).toContain("alphanumeric")
	})
})

/* ============================================================================
 * validateVirtualPath
 * ============================================================================ */

describe("validateVirtualPath", () => {
	it("returns null for valid _root_/products", () => {
		expect(validateVirtualPath("_root_/products")).toBeNull()
	})

	it("returns null for valid _root_/(auth)/login", () => {
		expect(validateVirtualPath("_root_/(auth)/login")).toBeNull()
	})

	it("returns null for just root", () => {
		expect(validateVirtualPath("_root_")).toBeNull()
	})

	it("returns error for path without root segment", () => {
		const error = validateVirtualPath("/products")
		expect(error).not.toBeNull()
		expect(error?.message).toContain("must start with root")
	})

	it("returns error for invalid root segment", () => {
		const error = validateVirtualPath("__/products")
		expect(error).not.toBeNull()
	})
})

/* ============================================================================
 * validatePath
 * ============================================================================ */

describe("validatePath", () => {
	describe("valid paths", () => {
		it("accepts /", () => {
			expect(validatePath("/")).toBeNull()
		})

		it("accepts /products", () => {
			expect(validatePath("/products")).toBeNull()
		})

		it("accepts /products/[id]", () => {
			expect(validatePath("/products/[id]")).toBeNull()
		})

		it("accepts /docs/[...slug]", () => {
			expect(validatePath("/docs/[...slug]")).toBeNull()
		})

		it("accepts /docs/[[...slug]]", () => {
			expect(validatePath("/docs/[[...slug]]")).toBeNull()
		})

		it("accepts optional single param /[[locale]]/compare", () => {
			expect(validatePath("/[[locale]]/compare")).toBeNull()
		})

		it("accepts optional single param at start /[[locale]]", () => {
			expect(validatePath("/[[locale]]")).toBeNull()
		})

		it("accepts optional single param mid-path /products/[[category]]/[id]", () => {
			expect(validatePath("/products/[[category]]/[id]")).toBeNull()
		})

		it("accepts /(auth)/login", () => {
			expect(validatePath("/(auth)/login")).toBeNull()
		})

		it("accepts path with hyphen", () => {
			expect(validatePath("/my-products")).toBeNull()
		})

		it("accepts path with underscore", () => {
			expect(validatePath("/my_products")).toBeNull()
		})

		it("accepts root layout paths", () => {
			expect(validatePath("_root_")).toBeNull()
		})

		it("accepts virtual paths", () => {
			expect(validatePath("_root_/products")).toBeNull()
		})
	})

	describe("invalid paths", () => {
		it("rejects path without leading slash", () => {
			const error = validatePath("products")
			expect(error).not.toBeNull()
			expect(error?.message).toContain('must start with "/"')
		})

		it("rejects path with trailing slash", () => {
			const error = validatePath("/products/")
			expect(error).not.toBeNull()
			expect(error?.message).toContain('must not end with "/"')
		})

		it("rejects path with double slash", () => {
			const error = validatePath("/products//items")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("double slash")
		})

		it("rejects Express-style params :id", () => {
			const error = validatePath("/products/:id")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("Express-style")
			expect(error?.message).toContain("[id]")
		})

		it("rejects curly brace params {id}", () => {
			const error = validatePath("/products/{id}")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("Curly brace")
		})

		it("rejects angle bracket params <id>", () => {
			const error = validatePath("/products/<id>")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("Angle bracket")
		})

		it("rejects empty param name []", () => {
			const error = validatePath("/products/[]")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("Empty param name")
		})

		it("rejects unclosed bracket", () => {
			const error = validatePath("/products/[id")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("Unclosed bracket")
		})

		it("rejects param name starting with number", () => {
			const error = validatePath("/products/[1id]")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("cannot start with number")
		})

		it("rejects param name with hyphen", () => {
			const error = validatePath("/products/[my-id]")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("camelCase")
		})

		it("rejects segment with space", () => {
			const error = validatePath("/my products")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("space")
		})

		it("rejects catch-all not at end", () => {
			const error = validatePath("/docs/[...slug]/extra")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("must be the last segment")
		})

		it("rejects empty group name", () => {
			const error = validatePath("/()/login")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("Empty group name")
		})

		it("rejects invalid catch-all syntax", () => {
			const error = validatePath("/docs/[..slug]")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("three dots")
		})

		it("rejects empty optional single param [[]]", () => {
			const error = validatePath("/[[]]")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("Empty optional param name")
		})

		it("rejects optional single param starting with number", () => {
			const error = validatePath("/[[1locale]]")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("cannot start with number")
		})

		it("rejects optional single param with hyphen", () => {
			const error = validatePath("/[[my-locale]]")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("camelCase")
		})

		it("rejects invalid optional catch-all [[..slug]] (two dots)", () => {
			const error = validatePath("/[[..slug]]")
			expect(error).not.toBeNull()
			expect(error?.message).toContain("three dots")
		})
	})
})

/* ============================================================================
 * assertValidPath
 * ============================================================================ */

describe("assertValidPath", () => {
	it("does not throw for valid path", () => {
		expect(() => assertValidPath("/products")).not.toThrow()
	})

	it("throws for invalid path", () => {
		expect(() => assertValidPath("products")).toThrow()
	})

	it("includes file location in error", () => {
		expect(() => assertValidPath("products", "routes.ts", 10)).toThrow("routes.ts:10")
	})

	it("includes error message", () => {
		expect(() => assertValidPath("products")).toThrow('must start with "/"')
	})
})

/* ============================================================================
 * pathToRegex
 * ============================================================================ */

describe("pathToRegex", () => {
	it("root layout matches empty string", () => {
		const regex = pathToRegex("_root_")
		expect(regex.test("")).toBe(true)
		expect(regex.test("/")).toBe(false)
	})

	it("creates regex matching exact path", () => {
		const regex = pathToRegex("/products")
		expect(regex.test("/products")).toBe(true)
		expect(regex.test("/products/extra")).toBe(false)
		expect(regex.test("/other")).toBe(false)
	})

	it("creates regex for single param", () => {
		const regex = pathToRegex("/products/[id]")
		expect(regex.test("/products/123")).toBe(true)
		expect(regex.test("/products/abc")).toBe(true)
		expect(regex.test("/products/")).toBe(false)
		expect(regex.test("/products/123/extra")).toBe(false)
	})

	it("creates regex for multiple params", () => {
		const regex = pathToRegex("/users/[id]/posts/[postId]")
		expect(regex.test("/users/1/posts/2")).toBe(true)
		expect(regex.test("/users/abc/posts/xyz")).toBe(true)
	})

	it("creates regex for required catch-all", () => {
		const regex = pathToRegex("/docs/[...slug]")
		expect(regex.test("/docs/a")).toBe(true)
		expect(regex.test("/docs/a/b/c")).toBe(true)
		expect(regex.test("/docs/")).toBe(false)
		expect(regex.test("/docs")).toBe(false)
	})

	it("creates regex for optional catch-all", () => {
		const regex = pathToRegex("/docs/[[...slug]]")
		expect(regex.test("/docs/")).toBe(true)
		expect(regex.test("/docs/a")).toBe(true)
		expect(regex.test("/docs/a/b/c")).toBe(true)
	})

	it("creates regex for optional single param at start", () => {
		const regex = pathToRegex("/[[locale]]/compare")
		expect(regex.test("/compare")).toBe(true)
		expect(regex.test("/en/compare")).toBe(true)
		expect(regex.test("/de/compare")).toBe(true)
		expect(regex.test("/en/de/compare")).toBe(false)
	})

	it("creates regex for optional single param only", () => {
		const regex = pathToRegex("/[[locale]]")
		expect(regex.test("/")).toBe(true)
		expect(regex.test("/en")).toBe(true)
		expect(regex.test("/en/extra")).toBe(false)
	})

	it("creates regex for optional single param mid-path", () => {
		const regex = pathToRegex("/shop/[[category]]/products")
		expect(regex.test("/shop/products")).toBe(true)
		expect(regex.test("/shop/electronics/products")).toBe(true)
		expect(regex.test("/shop/electronics/more/products")).toBe(false)
	})

	it("creates regex for combined optional and required params", () => {
		const regex = pathToRegex("/[[locale]]/products/[id]")
		expect(regex.test("/products/123")).toBe(true)
		expect(regex.test("/en/products/123")).toBe(true)
		expect(regex.test("/products/")).toBe(false)
	})

	it("converts virtual path before creating regex", () => {
		const regex = pathToRegex("_root_/products/[id]")
		expect(regex.test("/products/123")).toBe(true)
	})

	it("strips groups from virtual path", () => {
		const regex = pathToRegex("_root_/(auth)/login")
		expect(regex.test("/login")).toBe(true)
	})
})

/* ============================================================================
 * extractParamNames
 * ============================================================================ */

describe("extractParamNames", () => {
	it("extracts single param name", () => {
		expect(extractParamNames("/products/[id]")).toEqual(["id"])
	})

	it("extracts multiple param names", () => {
		expect(extractParamNames("/users/[userId]/posts/[postId]")).toEqual(["userId", "postId"])
	})

	it("extracts catch-all param name", () => {
		expect(extractParamNames("/docs/[...slug]")).toEqual(["slug"])
	})

	it("extracts optional catch-all param name", () => {
		expect(extractParamNames("/docs/[[...slug]]")).toEqual(["slug"])
	})

	it("extracts optional single param name", () => {
		expect(extractParamNames("/[[locale]]/compare")).toEqual(["locale"])
	})

	it("extracts optional single param only", () => {
		expect(extractParamNames("/[[locale]]")).toEqual(["locale"])
	})

	it("returns empty array for path without params", () => {
		expect(extractParamNames("/products")).toEqual([])
	})

	it("handles mixed params and catch-all", () => {
		expect(extractParamNames("/[org]/[repo]/[...path]")).toEqual(["org", "repo", "path"])
	})

	it("handles mixed optional single and required params", () => {
		expect(extractParamNames("/[[locale]]/products/[id]")).toEqual(["locale", "id"])
	})

	it("handles optional single param with optional catch-all", () => {
		expect(extractParamNames("/[[locale]]/docs/[[...slug]]")).toEqual(["locale", "slug"])
	})
})

/* ============================================================================
 * isPathPrefix
 * ============================================================================ */

describe("isPathPrefix", () => {
	it("root layout is prefix of paths with same root", () => {
		expect(isPathPrefix("_root_", "_root_/products")).toBe(true)
	})

	it("root layout is prefix of itself", () => {
		expect(isPathPrefix("_root_", "_root_")).toBe(true)
	})

	it("/ is prefix of all paths", () => {
		expect(isPathPrefix("/", "/products")).toBe(true)
		expect(isPathPrefix("/", "/users/[id]")).toBe(true)
	})

	it("/products is prefix of /products/[id]", () => {
		expect(isPathPrefix("/products", "/products/[id]")).toBe(true)
	})

	it("/products is NOT prefix of /products", () => {
		expect(isPathPrefix("/products", "/products")).toBe(false)
	})

	it("/products is NOT prefix of /other", () => {
		expect(isPathPrefix("/products", "/other")).toBe(false)
	})

	it("handles nested prefix", () => {
		expect(isPathPrefix("/users/[id]", "/users/[id]/posts")).toBe(true)
	})

	it("rejects partial segment match", () => {
		expect(isPathPrefix("/prod", "/products")).toBe(false)
	})
})

/* ============================================================================
 * findParentLayouts
 * ============================================================================ */

describe("findParentLayouts", () => {
	it("returns empty array when no layouts match", () => {
		const layouts = ["_root_/(other)"]
		expect(findParentLayouts("_root_/products", layouts)).toEqual([])
	})

	it("finds root layout as parent", () => {
		const layouts = ["_root_"]
		expect(findParentLayouts("_root_/products", layouts)).toEqual(["_root_"])
	})

	it("finds multiple parent layouts in order", () => {
		const layouts = ["_root_", "_root_/(auth)", "_root_/(auth)/(admin)"]
		const result = findParentLayouts("_root_/(auth)/(admin)/users", layouts)
		expect(result).toEqual(["_root_", "_root_/(auth)", "_root_/(auth)/(admin)"])
	})

	it("sorts by specificity (root first, then by length)", () => {
		const layouts = ["_root_/(auth)", "_root_"]
		const result = findParentLayouts("_root_/(auth)/login", layouts)
		expect(result[0]).toBe("_root_")
		expect(result[1]).toBe("_root_/(auth)")
	})

	it("filters out non-prefix layouts", () => {
		const layouts = ["_root_", "_root_/(auth)", "_docs_/(sidebar)"]
		const result = findParentLayouts("_root_/(auth)/login", layouts)
		expect(result).not.toContain("_docs_/(sidebar)")
	})

	it("handles deeply nested page path", () => {
		const layouts = ["_root_", "_root_/(dashboard)", "_root_/(dashboard)/(settings)"]
		const result = findParentLayouts("_root_/(dashboard)/(settings)/profile", layouts)
		expect(result).toHaveLength(3)
		expect(result[0]).toBe("_root_")
	})
})
