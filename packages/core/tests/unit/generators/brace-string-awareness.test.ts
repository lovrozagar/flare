import { describe, expect, it } from "vitest"
import { extractCacheFromChain, extractInterceptFromChain } from "../../../src/generators/index.ts"

/**
 * Bug 69: generators brace-depth parsers not string-aware
 *
 * extractCacheArg, extractNestedBlock, and extractInterceptArg all use naive
 * brace counting. Strings with unmatched braces cause premature closure.
 * Same class as bugs 59-61 in plugins/index.ts.
 */

describe("Bug 69: generators brace-depth string awareness", () => {
	it("extractCacheArg handles unmatched brace in string value", () => {
		/* A closing brace inside a string should NOT end the cache arg */
		const chain = `.cache({ client: { staleTime: 5000 }, label: "close } here" })`
		const result = extractCacheFromChain(chain)
		expect(result.client?.staleTime).toBe(5000)
	})

	it("extractCacheArg handles template literal with expression braces", () => {
		const chain = ".cache({ ssr: { tags: [`tag-${id}`] }, client: { staleTime: 3000 } })"
		const result = extractCacheFromChain(chain)
		expect(result.client?.staleTime).toBe(3000)
	})

	it("extractNestedBlock handles string with unmatched brace", () => {
		/* The ssr block contains a note with an unmatched closing brace in a string */
		const chain = `.cache({ ssr: { tags: ["my-tag"], note: "see } docs" }, client: { staleTime: 2000 } })`
		const result = extractCacheFromChain(chain)
		/* If the nested block parser is fooled by "}" in the string,
		   it would close the ssr block prematurely and miss the client block */
		expect(result.client?.staleTime).toBe(2000)
	})

	it("extractInterceptArg handles string with unmatched brace", () => {
		const chain = `.intercept({ from: ["/dashboard"], render: "modal", note: "fix } later" })`
		const result = extractInterceptFromChain(chain)
		expect(result).toBeDefined()
		expect(result?.from).toEqual(["/dashboard"])
		expect(result?.render).toBe("modal")
	})

	it("extractCacheArg handles single-quoted strings with braces", () => {
		const chain = ".cache({ client: { staleTime: 4000 }, desc: 'has } brace' })"
		const result = extractCacheFromChain(chain)
		expect(result.client?.staleTime).toBe(4000)
	})

	it("extractCacheArg handles block comments with braces", () => {
		const chain = `.cache({ /* config: { broken } */ client: { staleTime: 6000 } })`
		const result = extractCacheFromChain(chain)
		expect(result.client?.staleTime).toBe(6000)
	})

	it("extractCacheArg handles line comments with braces", () => {
		const chain = `.cache({
			// note: { broken }
			client: { staleTime: 7000 }
		})`
		const result = extractCacheFromChain(chain)
		expect(result.client?.staleTime).toBe(7000)
	})
})
