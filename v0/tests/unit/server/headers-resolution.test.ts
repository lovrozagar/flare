/**
 * Headers Resolution Unit Tests
 *
 * Tests merging and resolution of ResponseHeaders across route chain.
 */

import { describe, expect, it } from "vitest"
import type { ResponseHeaders } from "../../../src/router/_internal/types"
import {
	mergeResponseHeaders,
	resolveHeadersChain,
} from "../../../src/server/handler/headers-resolution"

describe("headers-resolution", () => {
	describe("mergeResponseHeaders", () => {
		it("returns empty object when both are undefined", () => {
			const result = mergeResponseHeaders(undefined, undefined)
			expect(result).toEqual({})
		})

		it("returns parent when child is undefined", () => {
			const parent: ResponseHeaders = { "cache-control": "public" }
			const result = mergeResponseHeaders(parent, undefined)
			expect(result).toEqual({ "cache-control": "public" })
		})

		it("returns child when parent is undefined", () => {
			const child: ResponseHeaders = { "cache-control": "private" }
			const result = mergeResponseHeaders(undefined, child)
			expect(result).toEqual({ "cache-control": "private" })
		})

		it("child header overrides parent header with same key", () => {
			const parent: ResponseHeaders = { "cache-control": "public, max-age=3600" }
			const child: ResponseHeaders = { "cache-control": "private, no-store" }
			const result = mergeResponseHeaders(parent, child)
			expect(result["cache-control"]).toBe("private, no-store")
		})

		it("preserves parent headers when child lacks them", () => {
			const parent: ResponseHeaders = {
				"cache-control": "public",
				"content-type": "text/html",
			}
			const child: ResponseHeaders = { "x-custom": "value" }
			const result = mergeResponseHeaders(parent, child)
			expect(result).toEqual({
				"cache-control": "public",
				"content-type": "text/html",
				"x-custom": "value",
			})
		})

		it("merges multiple headers from both parent and child", () => {
			const parent: ResponseHeaders = {
				"cache-control": "public",
				"x-frame-options": "DENY",
			}
			const child: ResponseHeaders = {
				"content-security-policy": "default-src 'self'",
				"x-custom": "value",
			}
			const result = mergeResponseHeaders(parent, child)
			expect(result).toEqual({
				"cache-control": "public",
				"content-security-policy": "default-src 'self'",
				"x-custom": "value",
				"x-frame-options": "DENY",
			})
		})

		it("handles custom headers", () => {
			const parent: ResponseHeaders = { "x-parent-header": "parent" }
			const child: ResponseHeaders = { "x-child-header": "child" }
			const result = mergeResponseHeaders(parent, child)
			expect(result).toEqual({
				"x-child-header": "child",
				"x-parent-header": "parent",
			})
		})
	})

	describe("resolveHeadersChain", () => {
		it("returns empty object for empty matches", () => {
			const result = resolveHeadersChain([])
			expect(result).toEqual({})
		})

		it("returns empty object for match without headers function", () => {
			const result = resolveHeadersChain([{ route: {} }])
			expect(result).toEqual({})
		})

		it("returns headers from single match with headers function", () => {
			const result = resolveHeadersChain([
				{
					context: {},
					route: { headers: () => ({ "cache-control": "public" }) },
				},
			])
			expect(result).toEqual({ "cache-control": "public" })
		})

		it("passes parentHeaders to headers function", () => {
			const headersFn = (ctx: { parentHeaders?: ResponseHeaders }) => ({
				"cache-control": ctx.parentHeaders?.["cache-control"] ?? "private",
				"x-extended": "true",
			})
			const result = resolveHeadersChain([
				{
					context: {},
					route: { headers: () => ({ "cache-control": "public, max-age=3600" }) },
				},
				{
					context: {},
					route: { headers: headersFn },
				},
			])
			expect(result["cache-control"]).toBe("public, max-age=3600")
			expect(result["x-extended"]).toBe("true")
		})

		it("merges headers through chain - child overrides", () => {
			const result = resolveHeadersChain([
				{
					context: {},
					route: {
						headers: () => ({
							"cache-control": "public",
							"x-root": "root",
						}),
					},
				},
				{
					context: {},
					route: {
						headers: () => ({
							"cache-control": "private",
							"x-layout": "layout",
						}),
					},
				},
				{
					context: {},
					route: {
						headers: () => ({
							"cache-control": "no-store",
							"x-page": "page",
						}),
					},
				},
			])
			expect(result).toEqual({
				"cache-control": "no-store",
				"x-layout": "layout",
				"x-page": "page",
				"x-root": "root",
			})
		})

		it("skips matches without headers function", () => {
			const result = resolveHeadersChain([
				{
					context: {},
					route: { headers: () => ({ "x-root": "root" }) },
				},
				{
					context: {},
					route: {},
				},
				{
					context: {},
					route: { headers: () => ({ "x-page": "page" }) },
				},
			])
			expect(result).toEqual({
				"x-page": "page",
				"x-root": "root",
			})
		})

		it("includes loaderData in context", () => {
			const result = resolveHeadersChain([
				{
					context: { loaderData: { cacheSeconds: 7200 } },
					route: {
						headers: (ctx) => ({
							"cache-control": `public, max-age=${(ctx.loaderData as { cacheSeconds: number }).cacheSeconds}`,
						}),
					},
				},
			])
			expect(result["cache-control"]).toBe("public, max-age=7200")
		})

		it("includes request in context", () => {
			const mockRequest = new Request("https://example.com/test")
			const result = resolveHeadersChain([
				{
					context: { request: mockRequest },
					route: {
						headers: (ctx) => ({
							"x-url": ctx.request?.url ?? "",
						}),
					},
				},
			])
			expect(result["x-url"]).toBe("https://example.com/test")
		})

		it("includes env in context", () => {
			const result = resolveHeadersChain([
				{
					context: { env: { CDN_URL: "https://cdn.example.com" } },
					route: {
						headers: (ctx) => ({
							"x-cdn": (ctx.env as { CDN_URL: string }).CDN_URL,
						}),
					},
				},
			])
			expect(result["x-cdn"]).toBe("https://cdn.example.com")
		})
	})
})
