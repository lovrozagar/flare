import { describe, expect, it } from "vitest"
import {
	composeRewrites,
	executeRewriteInput,
	executeRewriteOutput,
} from "../../../src/rewrite/index.ts"

describe("Task 2: rewrite URL construction safety", () => {
	const base = new URL("http://localhost:3000/page")

	describe("executeRewriteInput", () => {
		it("valid relative path works", () => {
			const rewrite = { input: () => "/new-path" }
			const result = executeRewriteInput(rewrite, base)
			expect(result.pathname).toBe("/new-path")
		})

		it("valid full URL works", () => {
			const rewrite = { input: () => "https://example.com/path" }
			const result = executeRewriteInput(rewrite, base)
			expect(result.href).toBe("https://example.com/path")
		})

		it("undefined return keeps original URL", () => {
			const rewrite = { input: () => undefined }
			const result = executeRewriteInput(rewrite, base)
			expect(result.href).toBe(base.href)
		})

		it("relative string resolves against base (URL spec behavior)", () => {
			/* Relative strings always resolve against base — not an error */
			const rewrite = { input: () => "/valid-path" }
			const result = executeRewriteInput(rewrite, base)
			expect(result.pathname).toBe("/valid-path")
			expect(result.origin).toBe(base.origin)
		})

		it("rewrite function that throws returns original URL", () => {
			const rewrite = {
				input: () => {
					throw new Error("rewrite crashed")
				},
			}
			expect(() => executeRewriteInput(rewrite, base)).not.toThrow()
			const result = executeRewriteInput(rewrite, base)
			expect(result.href).toBe(base.href)
		})
	})

	describe("executeRewriteOutput", () => {
		it("valid relative path works", () => {
			const rewrite = { output: () => "/out-path" }
			const result = executeRewriteOutput(rewrite, base)
			expect(result.pathname).toBe("/out-path")
		})

		it("output function returning URL object works", () => {
			const target = new URL("http://localhost:3000/output")
			const rewrite = { output: () => target }
			const result = executeRewriteOutput(rewrite, base)
			expect(result.href).toBe(target.href)
		})

		it("output function that throws returns original URL", () => {
			const rewrite = {
				output: () => {
					throw new Error("output crashed")
				},
			}
			expect(() => executeRewriteOutput(rewrite, base)).not.toThrow()
			const result = executeRewriteOutput(rewrite, base)
			expect(result.href).toBe(base.href)
		})
	})

	describe("composeRewrites error isolation", () => {
		it("error in first rewrite doesn't affect second", () => {
			const composed = composeRewrites([
				{
					input: () => {
						throw new Error("first fails")
					},
				},
				{ input: () => "/second-path" },
			])
			const result = executeRewriteInput(composed, base)
			/* First throws -> returns base, second rewrites base -> /second-path */
			expect(result.pathname).toBe("/second-path")
		})

		it("error in second rewrite preserves first result", () => {
			const composed = composeRewrites([
				{ input: () => "/first-path" },
				{
					input: () => {
						throw new Error("second fails")
					},
				},
			])
			const result = executeRewriteInput(composed, base)
			/* First produces /first-path, second throws -> keeps /first-path */
			expect(result.pathname).toBe("/first-path")
		})

		it("output compose handles errors in reverse order", () => {
			const composed = composeRewrites([
				{ output: () => "/first-out" },
				{
					output: () => {
						throw new Error("second-out fails")
					},
				},
			])
			/* Output applies in reverse: second (throws, keeps input), then first -> /first-out */
			const result = executeRewriteOutput(composed, base)
			expect(result.pathname).toBe("/first-out")
		})
	})
})
