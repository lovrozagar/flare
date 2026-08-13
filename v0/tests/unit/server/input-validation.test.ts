/**
 * Input Validation Unit Tests
 *
 * Tests executeValidator, searchParamsToObject, and validateInput.
 * Covers function validators, zod-like validators, and passthrough behavior.
 */

import { describe, expect, it, vi } from "vitest"
import { validateInput } from "../../../src/server/handler/input-validation"

/* ============================================================================
 * Helper: searchParamsToObject (internal, tested via validateInput)
 * ============================================================================ */

describe("searchParamsToObject behavior via validateInput", () => {
	it("converts single values from URLSearchParams", () => {
		const result = validateInput(undefined, {}, new URLSearchParams("a=1&b=2"))
		expect(result.search).toEqual({ a: "1", b: "2" })
	})

	it("handles empty URLSearchParams", () => {
		const result = validateInput(undefined, {}, new URLSearchParams())
		expect(result.search).toEqual({})
	})

	it("converts last value when key appears multiple times", () => {
		/* Note: searchParamsToObject uses forEach, later values override */
		const result = validateInput(undefined, {}, new URLSearchParams("x=1&x=2&x=3"))
		expect(result.search).toEqual({ x: "3" })
	})

	it("handles special characters in values", () => {
		const result = validateInput(
			undefined,
			{},
			new URLSearchParams("name=hello%20world&emoji=%F0%9F%98%80"),
		)
		expect(result.search).toEqual({ emoji: "😀", name: "hello world" })
	})

	it("handles empty values", () => {
		const result = validateInput(undefined, {}, new URLSearchParams("empty=&hasValue=yes"))
		expect(result.search).toEqual({ empty: "", hasValue: "yes" })
	})
})

/* ============================================================================
 * executeValidator behavior (internal, tested via validateInput)
 * ============================================================================ */

describe("executeValidator behavior via validateInput params", () => {
	describe("no validator (passthrough)", () => {
		it("returns raw params when no inputConfig", () => {
			const rawParams = { id: "123", slug: ["a", "b"] }
			const result = validateInput(undefined, rawParams, new URLSearchParams())
			expect(result.params).toEqual({ id: "123", slug: ["a", "b"] })
		})

		it("returns raw params when inputConfig is empty object", () => {
			const rawParams = { category: "tech" }
			const result = validateInput({}, rawParams, new URLSearchParams())
			expect(result.params).toEqual({ category: "tech" })
		})

		it("returns raw params when params validator is undefined", () => {
			const rawParams = { page: "1" }
			const result = validateInput({ params: undefined }, rawParams, new URLSearchParams())
			expect(result.params).toEqual({ page: "1" })
		})
	})

	describe("function validator", () => {
		it("calls function validator with raw params", () => {
			const validator = vi.fn((raw: Record<string, string | string[]>) => ({
				id: Number(raw.id),
			}))
			const result = validateInput({ params: validator }, { id: "42" }, new URLSearchParams())
			expect(validator).toHaveBeenCalledWith({ id: "42" })
			expect(result.params).toEqual({ id: 42 })
		})

		it("passes empty params to function validator", () => {
			const validator = vi.fn(() => ({ default: true }))
			const result = validateInput({ params: validator }, {}, new URLSearchParams())
			expect(validator).toHaveBeenCalledWith({})
			expect(result.params).toEqual({ default: true })
		})

		it("handles function validator that throws", () => {
			const validator = () => {
				throw new Error("Invalid params")
			}
			expect(() =>
				validateInput({ params: validator }, { id: "bad" }, new URLSearchParams()),
			).toThrow("Invalid params")
		})

		it("handles async-like function (returns promise object)", () => {
			/* Validators are called synchronously, but could return promise-like */
			const validator = () => Promise.resolve({ async: true })
			const result = validateInput({ params: validator }, {}, new URLSearchParams())
			expect(result.params).toBeInstanceOf(Promise)
		})
	})

	describe("zod-like validator (object with parse method)", () => {
		it("calls parse method with raw params", () => {
			const parse = vi.fn((raw: Record<string, string | string[]>) => ({
				userId: String(raw.id),
			}))
			const zodLike = { parse }
			const result = validateInput({ params: zodLike }, { id: "999" }, new URLSearchParams())
			expect(parse).toHaveBeenCalledWith({ id: "999" })
			expect(result.params).toEqual({ userId: "999" })
		})

		it("handles parse method that throws ZodError-like", () => {
			const zodLike = {
				parse: () => {
					const error = new Error("Zod validation failed")
					error.name = "ZodError"
					throw error
				},
			}
			expect(() =>
				validateInput({ params: zodLike }, { bad: "value" }, new URLSearchParams()),
			).toThrow("Zod validation failed")
		})

		it("passes through when parse is not a function", () => {
			const notZod = { parse: "not a function" }
			const result = validateInput(
				{
					params: notZod as unknown as {
						parse: (raw: Record<string, string | string[]>) => unknown
					},
				},
				{ x: "1" },
				new URLSearchParams(),
			)
			expect(result.params).toEqual({ x: "1" })
		})
	})
})

describe("executeValidator behavior via validateInput searchParams", () => {
	describe("no validator (passthrough)", () => {
		it("returns converted search params when no validator", () => {
			const result = validateInput(undefined, {}, new URLSearchParams("q=test&limit=10"))
			expect(result.search).toEqual({ limit: "10", q: "test" })
		})
	})

	describe("function validator", () => {
		it("calls function validator with search object", () => {
			const validator = vi.fn((raw: Record<string, string>) => ({
				limit: Number(raw.limit),
				query: raw.q,
			}))
			const result = validateInput(
				{ searchParams: validator },
				{},
				new URLSearchParams("q=hello&limit=20"),
			)
			expect(validator).toHaveBeenCalledWith({ limit: "20", q: "hello" })
			expect(result.search).toEqual({ limit: 20, query: "hello" })
		})
	})

	describe("zod-like validator", () => {
		it("calls parse method with search object", () => {
			const parse = vi.fn((raw: Record<string, string>) => ({
				page: Number(raw.page) || 1,
			}))
			const zodLike = { parse }
			const result = validateInput({ searchParams: zodLike }, {}, new URLSearchParams("page=5"))
			expect(parse).toHaveBeenCalledWith({ page: "5" })
			expect(result.search).toEqual({ page: 5 })
		})
	})
})

/* ============================================================================
 * validateInput (main exported function)
 * ============================================================================ */

describe("validateInput", () => {
	describe("returns ValidatedInput structure", () => {
		it("returns object with params and search properties", () => {
			const result = validateInput(undefined, { id: "1" }, new URLSearchParams("q=test"))
			expect(result).toHaveProperty("params")
			expect(result).toHaveProperty("search")
			expect(Object.keys(result)).toHaveLength(2)
		})
	})

	describe("validates both params and search together", () => {
		it("applies both validators independently", () => {
			const paramsValidator = vi.fn((raw: Record<string, string | string[]>) => ({
				productId: raw.id,
			}))
			const searchValidator = vi.fn((raw: Record<string, string>) => ({ sort: raw.sort ?? "asc" }))

			const result = validateInput(
				{ params: paramsValidator, searchParams: searchValidator },
				{ id: "123" },
				new URLSearchParams("sort=desc"),
			)

			expect(paramsValidator).toHaveBeenCalledTimes(1)
			expect(searchValidator).toHaveBeenCalledTimes(1)
			expect(result.params).toEqual({ productId: "123" })
			expect(result.search).toEqual({ sort: "desc" })
		})

		it("handles mixed validator types (function + zod-like)", () => {
			const paramsValidator = (raw: Record<string, string | string[]>) => ({ id: Number(raw.id) })
			const searchValidator = {
				parse: (raw: Record<string, string>) => ({ limit: Number(raw.limit) }),
			}

			const result = validateInput(
				{ params: paramsValidator, searchParams: searchValidator },
				{ id: "42" },
				new URLSearchParams("limit=10"),
			)

			expect(result.params).toEqual({ id: 42 })
			expect(result.search).toEqual({ limit: 10 })
		})
	})

	describe("handles edge cases", () => {
		it("handles empty raw params", () => {
			const result = validateInput(undefined, {}, new URLSearchParams())
			expect(result.params).toEqual({})
			expect(result.search).toEqual({})
		})

		it("handles array params (catch-all routes)", () => {
			const result = validateInput(undefined, { slug: ["a", "b", "c"] }, new URLSearchParams())
			expect(result.params).toEqual({ slug: ["a", "b", "c"] })
		})

		it("handles mixed string and array params", () => {
			const result = validateInput(
				undefined,
				{ category: "tech", tags: ["js", "ts"] },
				new URLSearchParams(),
			)
			expect(result.params).toEqual({ category: "tech", tags: ["js", "ts"] })
		})

		it("handles unicode in params", () => {
			const result = validateInput(undefined, { name: "日本語" }, new URLSearchParams("q=中文"))
			expect(result.params).toEqual({ name: "日本語" })
			expect(result.search).toEqual({ q: "中文" })
		})
	})

	describe("type safety", () => {
		it("preserves typed output from validators", () => {
			interface MyParams {
				id: number
			}
			interface MySearch {
				page: number
				filter: string
			}

			const result = validateInput<MyParams, MySearch>(
				{
					params: (raw) => ({ id: Number(raw.id) }),
					searchParams: (raw) => ({ filter: raw.filter ?? "", page: Number(raw.page) || 1 }),
				},
				{ id: "123" },
				new URLSearchParams("page=2&filter=active"),
			)

			/* TypeScript ensures result.params.id and result.search.page are typed */
			expect(result.params.id).toBe(123)
			expect(result.search.page).toBe(2)
			expect(result.search.filter).toBe("active")
		})
	})
})

/* ============================================================================
 * Real-world validation scenarios
 * ============================================================================ */

describe("real-world validation scenarios", () => {
	it("validates product page params", () => {
		const inputConfig = {
			params: (raw: Record<string, string | string[]>) => {
				const id = raw.id
				if (typeof id !== "string" || !/^\d+$/.test(id)) {
					throw new Error("Product ID must be numeric")
				}
				return { productId: Number(id) }
			},
		}

		const result = validateInput(inputConfig, { id: "42" }, new URLSearchParams())
		expect(result.params).toEqual({ productId: 42 })
	})

	it("throws on invalid product ID", () => {
		const inputConfig = {
			params: (raw: Record<string, string | string[]>) => {
				const id = raw.id
				if (typeof id !== "string" || !/^\d+$/.test(id)) {
					throw new Error("Product ID must be numeric")
				}
				return { productId: Number(id) }
			},
		}

		expect(() => validateInput(inputConfig, { id: "abc" }, new URLSearchParams())).toThrow(
			"Product ID must be numeric",
		)
	})

	it("validates pagination search params", () => {
		const inputConfig = {
			searchParams: (raw: Record<string, string>) => ({
				limit: Math.min(100, Math.max(1, Number(raw.limit) || 10)),
				offset: Math.max(0, Number(raw.offset) || 0),
				sort: ["asc", "desc"].includes(raw.sort) ? raw.sort : "asc",
			}),
		}

		const result = validateInput(
			inputConfig,
			{},
			new URLSearchParams("limit=50&offset=100&sort=desc"),
		)
		expect(result.search).toEqual({ limit: 50, offset: 100, sort: "desc" })
	})

	it("caps limit at maximum", () => {
		const inputConfig = {
			searchParams: (raw: Record<string, string>) => ({
				limit: Math.min(100, Math.max(1, Number(raw.limit) || 10)),
			}),
		}

		const result = validateInput(inputConfig, {}, new URLSearchParams("limit=9999"))
		expect(result.search).toEqual({ limit: 100 })
	})

	it("validates catch-all blog slug params", () => {
		const inputConfig = {
			params: (raw: Record<string, string | string[]>) => {
				const slug = raw.slug
				if (!Array.isArray(slug) || slug.length === 0) {
					throw new Error("Blog path required")
				}
				return { path: slug.join("/"), segments: slug }
			},
		}

		const result = validateInput(
			inputConfig,
			{ slug: ["2024", "01", "hello-world"] },
			new URLSearchParams(),
		)
		expect(result.params).toEqual({
			path: "2024/01/hello-world",
			segments: ["2024", "01", "hello-world"],
		})
	})
})
