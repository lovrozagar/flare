import { describe, expect, it } from "vitest"
import {
	deriveLayouts,
	deriveParams,
	extractLayoutKey,
	isRootLayoutPath,
	stripGroups,
	toUrlPath,
	toVirtualPath,
} from "../../../src/router-primitives/index.ts"

describe("isRootLayoutPath", () => {
	it("accepts valid root layout paths", () => {
		expect(isRootLayoutPath("_root_")).toBe(true)
		expect(isRootLayoutPath("_admin_")).toBe(true)
		expect(isRootLayoutPath("_x_")).toBe(true)
	})

	it("rejects missing trailing underscore", () => {
		expect(isRootLayoutPath("_root")).toBe(false)
	})

	it("rejects missing leading underscore", () => {
		expect(isRootLayoutPath("root_")).toBe(false)
	})

	it("rejects too short", () => {
		expect(isRootLayoutPath("__")).toBe(false)
		expect(isRootLayoutPath("_")).toBe(false)
		expect(isRootLayoutPath("")).toBe(false)
	})

	it("rejects paths with slashes", () => {
		expect(isRootLayoutPath("_root_/something")).toBe(false)
	})
})

describe("stripGroups", () => {
	it("removes group segments", () => {
		expect(stripGroups("/(auth)/login")).toBe("/login")
		expect(stripGroups("/(admin)/(dashboard)/users")).toBe("/users")
	})

	it("preserves non-group segments", () => {
		expect(stripGroups("/products/details")).toBe("/products/details")
	})
})

describe("toUrlPath", () => {
	it("removes root and group segments", () => {
		expect(toUrlPath("_root_/blog/[slug]")).toBe("/blog/[slug]")
		expect(toUrlPath("_root_/(auth)/login")).toBe("/login")
		expect(toUrlPath("_root_")).toBe("/")
	})

	it("pre-root: strips root and all pre-root segments", () => {
		expect(toUrlPath("[locale]/_root_/about")).toBe("/about")
		expect(toUrlPath("[locale]/[tenant]/_root_/page")).toBe("/page")
		expect(toUrlPath("[locale]/_root_")).toBe("/")
		expect(toUrlPath("[...locale]/_root_/about")).toBe("/about")
		expect(toUrlPath("[[...locale]]/_root_/about")).toBe("/about")
	})

	it("regression: root at position 0 unchanged", () => {
		expect(toUrlPath("_root_/about")).toBe("/about")
	})
})

describe("toVirtualPath", () => {
	it("prepends root layout path", () => {
		expect(toVirtualPath("/login", "_root_")).toBe("_root_/login")
		expect(toVirtualPath("/", "_root_")).toBe("_root_")
		expect(toVirtualPath("/products/123", "_docs_")).toBe("_docs_/products/123")
		expect(toVirtualPath("/about", "_admin_")).toBe("_admin_/about")
	})
})

describe("deriveParams", () => {
	it("extracts param names", () => {
		expect(deriveParams("/products/[id]")).toEqual(["id"])
		expect(deriveParams("/[...slug]")).toEqual(["slug"])
		expect(deriveParams("/[[...slug]]")).toEqual(["slug"])
		expect(deriveParams("/products/[id]/reviews/[reviewId]")).toEqual(["id", "reviewId"])
		expect(deriveParams("/about")).toEqual([])
	})

	it("extracts optional single param names", () => {
		expect(deriveParams("/[[locale]]")).toEqual(["locale"])
		expect(deriveParams("/[[locale]]/about")).toEqual(["locale"])
		expect(deriveParams("/[[locale]]/blog/[slug]")).toEqual(["locale", "slug"])
	})
})

describe("extractLayoutKey", () => {
	it("strips URL segments, keeps virtual segments", () => {
		expect(extractLayoutKey("_root_/(layout-tests)/layout-tests/(dynamic)/dynamic/[orgId]")).toBe(
			"_root_/(layout-tests)/(dynamic)/[orgId]",
		)
		expect(extractLayoutKey("_root_/(auth)/login")).toBe("_root_/(auth)")
		expect(extractLayoutKey("_root_/about")).toBe("_root_")
	})

	it("pre-root: includes pre-root params and root", () => {
		expect(extractLayoutKey("[locale]/_root_/(auth)/login")).toBe("[locale]/_root_/(auth)")
		expect(extractLayoutKey("[locale]/[tenant]/_root_/page")).toBe("[locale]/[tenant]/_root_")
	})
})

describe("deriveLayouts", () => {
	it("derives layout keys from virtualPath", () => {
		expect(deriveLayouts("_root_/(auth)/login")).toEqual(["_root_", "_root_/(auth)"])
		expect(deriveLayouts("_root_/(layout)/products/(detail)/[id]")).toEqual([
			"_root_",
			"_root_/(layout)",
			"_root_/(layout)/(detail)",
			"_root_/(layout)/(detail)/[id]",
		])
		expect(deriveLayouts("_root_/about")).toEqual(["_root_"])
		expect(deriveLayouts("_root_/(a)/(b)/page")).toEqual(["_root_", "_root_/(a)", "_root_/(a)/(b)"])
	})

	it("bare param segments form layout boundaries", () => {
		expect(deriveLayouts("_root_/[locale]/about")).toEqual(["_root_", "_root_/[locale]"])
		expect(deriveLayouts("_root_/[locale]/[slug]")).toEqual([
			"_root_",
			"_root_/[locale]",
			"_root_/[locale]/[slug]",
		])
	})

	it("catch-all param segments form layout boundaries", () => {
		expect(deriveLayouts("_root_/[...slug]/page")).toEqual(["_root_", "_root_/[...slug]"])
	})

	it("optional catch-all param segments form layout boundaries", () => {
		expect(deriveLayouts("_root_/[[...slug]]/page")).toEqual(["_root_", "_root_/[[...slug]]"])
	})

	it("multiple param segments each form a boundary", () => {
		expect(deriveLayouts("_root_/[org]/[project]/settings")).toEqual([
			"_root_",
			"_root_/[org]",
			"_root_/[org]/[project]",
		])
	})

	it("mixed group and bare param segments", () => {
		expect(deriveLayouts("_root_/(auth)/[orgId]/settings")).toEqual([
			"_root_",
			"_root_/(auth)",
			"_root_/(auth)/[orgId]",
		])
	})

	it("empty layoutKey (no root/group/param segments) → empty array", () => {
		/* extractLayoutKey("plain/page") returns "" since no recognized segments */
		expect(deriveLayouts("plain/page")).toEqual([])
	})

	it("pre-root: param segments included as layout boundaries", () => {
		expect(deriveLayouts("[locale]/_root_/(auth)/login")).toEqual([
			"[locale]",
			"[locale]/_root_",
			"[locale]/_root_/(auth)",
		])
		expect(deriveLayouts("[locale]/[tenant]/_root_/page")).toEqual([
			"[locale]",
			"[locale]/[tenant]",
			"[locale]/[tenant]/_root_",
		])
		expect(deriveLayouts("[locale]/_root_")).toEqual(["[locale]", "[locale]/_root_"])
	})

	it("pre-root: post-root params still form boundaries", () => {
		expect(deriveLayouts("[locale]/_root_/[slug]")).toEqual([
			"[locale]",
			"[locale]/_root_",
			"[locale]/_root_/[slug]",
		])
	})

	it("regression: root at position 0 unchanged", () => {
		expect(deriveLayouts("_root_/(auth)/login")).toEqual(["_root_", "_root_/(auth)"])
		expect(deriveLayouts("_root_/[locale]/about")).toEqual(["_root_", "_root_/[locale]"])
	})

	it("pre-root: optional single param forms layout boundary", () => {
		expect(deriveLayouts("[[locale]]/_root_/(main)/about")).toEqual([
			"[[locale]]",
			"[[locale]]/_root_",
			"[[locale]]/_root_/(main)",
		])
		expect(deriveLayouts("[[locale]]/_root_")).toEqual(["[[locale]]", "[[locale]]/_root_"])
	})

	it("optional single param in toUrlPath", () => {
		expect(toUrlPath("[[locale]]/_root_/about")).toBe("/about")
		expect(toUrlPath("[[locale]]/_root_")).toBe("/")
	})

	it("extractLayoutKey with optional single param", () => {
		expect(extractLayoutKey("[[locale]]/_root_/(main)/about")).toBe("[[locale]]/_root_/(main)")
		expect(extractLayoutKey("[[locale]]/_root_/about")).toBe("[[locale]]/_root_")
	})
})
