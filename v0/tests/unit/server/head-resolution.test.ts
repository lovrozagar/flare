/**
 * Head Resolution Unit Tests
 *
 * Tests merging and resolution of HeadConfig across route chain.
 */

import { describe, expect, it } from "vitest"
import type { HeadConfig } from "../../../src/router/_internal/types"
import { mergeHeadConfigs, resolveHeadChain } from "../../../src/server/handler/head-resolution"

describe("head-resolution", () => {
	describe("mergeHeadConfigs", () => {
		it("returns empty object when both are undefined", () => {
			const result = mergeHeadConfigs(undefined, undefined)
			expect(result).toEqual({})
		})

		it("returns parent when child is undefined", () => {
			const parent: HeadConfig = { title: "Parent" }
			const result = mergeHeadConfigs(parent, undefined)
			expect(result).toEqual({ title: "Parent" })
		})

		it("returns child when parent is undefined", () => {
			const child: HeadConfig = { title: "Child" }
			const result = mergeHeadConfigs(undefined, child)
			expect(result).toEqual({ title: "Child" })
		})

		it("child title overrides parent title", () => {
			const parent: HeadConfig = { title: "Parent Title" }
			const child: HeadConfig = { title: "Child Title" }
			const result = mergeHeadConfigs(parent, child)
			expect(result.title).toBe("Child Title")
		})

		it("child description overrides parent description", () => {
			const parent: HeadConfig = { description: "Parent desc" }
			const child: HeadConfig = { description: "Child desc" }
			const result = mergeHeadConfigs(parent, child)
			expect(result.description).toBe("Child desc")
		})

		it("child canonical overrides parent canonical", () => {
			const parent: HeadConfig = { canonical: "https://parent.com" }
			const child: HeadConfig = { canonical: "https://child.com" }
			const result = mergeHeadConfigs(parent, child)
			expect(result.canonical).toBe("https://child.com")
		})

		it("child keywords overrides parent keywords", () => {
			const parent: HeadConfig = { keywords: "parent, keywords" }
			const child: HeadConfig = { keywords: "child, keywords" }
			const result = mergeHeadConfigs(parent, child)
			expect(result.keywords).toBe("child, keywords")
		})

		it("preserves parent fields when child lacks them", () => {
			const parent: HeadConfig = { description: "Parent desc", title: "Parent" }
			const child: HeadConfig = { title: "Child" }
			const result = mergeHeadConfigs(parent, child)
			expect(result.title).toBe("Child")
			expect(result.description).toBe("Parent desc")
		})

		it("merges meta objects - child overrides same keys", () => {
			const parent: HeadConfig = {
				meta: { author: "Parent Author", viewport: "width=device-width" },
			}
			const child: HeadConfig = {
				meta: { author: "Child Author", generator: "Flare" },
			}
			const result = mergeHeadConfigs(parent, child)
			expect(result.meta).toEqual({
				author: "Child Author",
				generator: "Flare",
				viewport: "width=device-width",
			})
		})

		it("merges languages - child overrides same keys", () => {
			const parent: HeadConfig = {
				languages: { en: "/en", fr: "/fr" },
			}
			const child: HeadConfig = {
				languages: { de: "/de", en: "/en-us" },
			}
			const result = mergeHeadConfigs(parent, child)
			expect(result.languages).toEqual({
				de: "/de",
				en: "/en-us",
				fr: "/fr",
			})
		})

		it("child robots overrides parent robots", () => {
			const parent: HeadConfig = { robots: { follow: true, index: true } }
			const child: HeadConfig = { robots: { index: false } }
			const result = mergeHeadConfigs(parent, child)
			expect(result.robots).toEqual({ index: false })
		})

		it("child openGraph overrides parent openGraph", () => {
			const parent: HeadConfig = { openGraph: { siteName: "Parent", type: "website" } }
			const child: HeadConfig = { openGraph: { type: "article" } }
			const result = mergeHeadConfigs(parent, child)
			expect(result.openGraph).toEqual({ type: "article" })
		})

		it("child twitter overrides parent twitter", () => {
			const parent: HeadConfig = { twitter: { card: "summary" } }
			const child: HeadConfig = { twitter: { card: "summary_large_image" } }
			const result = mergeHeadConfigs(parent, child)
			expect(result.twitter).toEqual({ card: "summary_large_image" })
		})

		it("child favicons overrides parent favicons", () => {
			const parent: HeadConfig = { favicons: { ico: "/parent.ico" } }
			const child: HeadConfig = { favicons: { ico: "/child.ico" } }
			const result = mergeHeadConfigs(parent, child)
			expect(result.favicons).toEqual({ ico: "/child.ico" })
		})

		it("concatenates images arrays", () => {
			const parent: HeadConfig = { images: [{ url: "/parent.jpg" }] }
			const child: HeadConfig = { images: [{ url: "/child.jpg" }] }
			const result = mergeHeadConfigs(parent, child)
			expect(result.images).toEqual([{ url: "/parent.jpg" }, { url: "/child.jpg" }])
		})

		it("concatenates jsonLd arrays", () => {
			const parent: HeadConfig = { jsonLd: { "@type": "Organization" } }
			const child: HeadConfig = { jsonLd: { "@type": "Article" } }
			const result = mergeHeadConfigs(parent, child)
			expect(result.jsonLd).toEqual([{ "@type": "Organization" }, { "@type": "Article" }])
		})

		it("handles jsonLd when parent is array and child is single", () => {
			const parent: HeadConfig = { jsonLd: [{ "@type": "Organization" }] }
			const child: HeadConfig = { jsonLd: { "@type": "Article" } }
			const result = mergeHeadConfigs(parent, child)
			expect(result.jsonLd).toEqual([{ "@type": "Organization" }, { "@type": "Article" }])
		})

		it("merges custom head - concatenates arrays", () => {
			const parent: HeadConfig = {
				custom: {
					meta: [{ content: "value", name: "parent" }],
					scripts: [{ src: "/parent.js" }],
				},
			}
			const child: HeadConfig = {
				custom: {
					links: [{ href: "/data.json", rel: "preload" }],
					meta: [{ content: "value", name: "child" }],
				},
			}
			const result = mergeHeadConfigs(parent, child)
			expect(result.custom?.meta).toEqual([
				{ content: "value", name: "parent" },
				{ content: "value", name: "child" },
			])
			expect(result.custom?.scripts).toEqual([{ src: "/parent.js" }])
			expect(result.custom?.links).toEqual([{ href: "/data.json", rel: "preload" }])
		})
	})

	describe("resolveHeadChain", () => {
		it("returns empty object for empty matches", () => {
			const result = resolveHeadChain([])
			expect(result).toEqual({})
		})

		it("returns head from single match without head function", () => {
			const result = resolveHeadChain([{ route: {} }])
			expect(result).toEqual({})
		})

		it("returns head from single match with head function", () => {
			const result = resolveHeadChain([
				{
					context: { loaderData: { title: "Test" } },
					route: {
						head: (ctx) => ({ title: (ctx.loaderData as { title: string }).title }),
					},
				},
			])
			expect(result).toEqual({ title: "Test" })
		})

		it("passes parentHead to head function", () => {
			const headFn = (ctx: { parentHead?: HeadConfig }) => ({
				title: ctx.parentHead?.title ? `${ctx.parentHead.title} | Child` : "Child",
			})
			const result = resolveHeadChain([
				{
					context: {},
					route: { head: () => ({ title: "Parent" }) },
				},
				{
					context: {},
					route: { head: headFn },
				},
			])
			expect(result.title).toBe("Parent | Child")
		})

		it("merges head configs through chain", () => {
			const result = resolveHeadChain([
				{
					context: {},
					route: { head: () => ({ description: "Root desc", title: "Root" }) },
				},
				{
					context: {},
					route: { head: () => ({ title: "Layout" }) },
				},
				{
					context: {},
					route: { head: () => ({ keywords: "page", title: "Page" }) },
				},
			])
			expect(result).toEqual({
				description: "Root desc",
				keywords: "page",
				title: "Page",
			})
		})

		it("skips matches without head function", () => {
			const result = resolveHeadChain([
				{
					context: {},
					route: { head: () => ({ title: "Root" }) },
				},
				{
					context: {},
					route: {},
				},
				{
					context: {},
					route: { head: () => ({ description: "Page desc" }) },
				},
			])
			expect(result).toEqual({
				description: "Page desc",
				title: "Root",
			})
		})

		it("includes loaderData in context", () => {
			const result = resolveHeadChain([
				{
					context: { loaderData: { product: { name: "Widget" } } },
					route: {
						head: (ctx) => ({
							title: (ctx.loaderData as { product: { name: string } }).product.name,
						}),
					},
				},
			])
			expect(result.title).toBe("Widget")
		})

		it("includes preloaderContext in context", () => {
			const result = resolveHeadChain([
				{
					context: { preloaderContext: { locale: "en" } },
					route: {
						head: (ctx) => ({
							title: `Site (${(ctx.preloaderContext as { locale: string }).locale})`,
						}),
					},
				},
			])
			expect(result.title).toBe("Site (en)")
		})

		it("includes location in context", () => {
			const result = resolveHeadChain([
				{
					context: { location: { pathname: "/products/123" } },
					route: {
						head: (ctx) => ({
							canonical: `https://example.com${ctx.location?.pathname}`,
						}),
					},
				},
			])
			expect(result.canonical).toBe("https://example.com/products/123")
		})
	})
})
