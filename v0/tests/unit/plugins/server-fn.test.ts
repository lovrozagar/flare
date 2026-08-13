/**
 * Server Functions Plugin Tests
 *
 * Tests server function ID injection and hashing logic.
 * Pure functions re-implemented for testing.
 */

import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

/* ============================================================================
 * Re-implemented Pure Functions for Testing
 * ============================================================================ */

/**
 * Generate a short hash from file path
 */
function hashFile(filePath: string): string {
	return createHash("md5").update(filePath).digest("hex").slice(0, 8)
}

/**
 * Extract function name from createServerFn options
 */
function extractFnName(optionsStr: string): string | null {
	const nameMatch = /name\s*:\s*["'](\w+)["']/.exec(optionsStr)
	return nameMatch?.[1] ?? null
}

/**
 * Check if code contains createServerFn calls
 */
function hasServerFn(code: string): boolean {
	return code.includes("createServerFn")
}

/**
 * Check if file matches include pattern
 */
function matchesInclude(id: string, include: RegExp): boolean {
	return include.test(id)
}

/**
 * Generate function ID from file path and function name
 */
function generateFnId(filePath: string, fnName: string): string {
	const fileHash = hashFile(filePath)
	return `${fileHash}/${fnName}`
}

/**
 * Simulate the transform - inject __id into createServerFn options
 */
function simulateTransform(code: string, filePath: string): string {
	if (!hasServerFn(code)) return code

	const fnPattern = /createServerFn\s*\(\s*(\{[^}]*\})\s*\)/g

	return code.replace(fnPattern, (match, optionsStr) => {
		const fnName = extractFnName(optionsStr)
		if (!fnName) return match

		const fnId = generateFnId(filePath, fnName)

		/* Inject __id into options object */
		const newOptions = optionsStr.replace("{", `{ __id: "${fnId}",`)
		return match.replace(optionsStr, newOptions)
	})
}

/* ============================================================================
 * hashFile Tests
 * ============================================================================ */

describe("hashFile", () => {
	describe("basic hashing", () => {
		it("generates 8 character hash", () => {
			const hash = hashFile("/src/api/users.ts")
			expect(hash.length).toBe(8)
		})

		it("generates hex characters only", () => {
			const hash = hashFile("/some/path/file.ts")
			expect(hash).toMatch(/^[0-9a-f]+$/)
		})

		it("produces consistent hash for same input", () => {
			const hash1 = hashFile("/src/api.ts")
			const hash2 = hashFile("/src/api.ts")
			expect(hash1).toBe(hash2)
		})

		it("produces different hash for different inputs", () => {
			const hash1 = hashFile("/src/a.ts")
			const hash2 = hashFile("/src/b.ts")
			expect(hash1).not.toBe(hash2)
		})
	})

	describe("path variations", () => {
		it("hashes absolute paths", () => {
			const hash = hashFile("/home/user/project/src/api.ts")
			expect(hash.length).toBe(8)
		})

		it("hashes relative paths", () => {
			const hash = hashFile("./src/api.ts")
			expect(hash.length).toBe(8)
		})

		it("different slashes produce different hashes", () => {
			const forward = hashFile("/src/api.ts")
			const back = hashFile("\\src\\api.ts")
			expect(forward).not.toBe(back)
		})
	})

	describe("edge cases", () => {
		it("handles empty string", () => {
			const hash = hashFile("")
			expect(hash.length).toBe(8)
		})

		it("handles very long paths", () => {
			const longPath = `${"/a".repeat(1000)}.ts`
			const hash = hashFile(longPath)
			expect(hash.length).toBe(8)
		})

		it("handles unicode in path", () => {
			const hash = hashFile("/src/日本語.ts")
			expect(hash.length).toBe(8)
		})
	})
})

/* ============================================================================
 * extractFnName Tests
 * ============================================================================ */

describe("extractFnName", () => {
	describe("valid options", () => {
		it("extracts name with double quotes", () => {
			const options = '{ method: "POST", name: "createUser" }'
			expect(extractFnName(options)).toBe("createUser")
		})

		it("extracts name with single quotes", () => {
			const options = "{ method: 'POST', name: 'deleteUser' }"
			expect(extractFnName(options)).toBe("deleteUser")
		})

		it("extracts name regardless of position", () => {
			const options = '{ name: "first", method: "GET" }'
			expect(extractFnName(options)).toBe("first")
		})

		it("handles whitespace variations", () => {
			const options = '{ name  :  "spacious" }'
			expect(extractFnName(options)).toBe("spacious")
		})
	})

	describe("invalid options", () => {
		it("returns null for missing name", () => {
			const options = '{ method: "POST" }'
			expect(extractFnName(options)).toBeNull()
		})

		it("returns null for empty object", () => {
			const options = "{}"
			expect(extractFnName(options)).toBeNull()
		})

		it("returns null for template literal name", () => {
			const options = "{ name: `dynamic` }"
			expect(extractFnName(options)).toBeNull()
		})
	})

	describe("name patterns", () => {
		it("extracts camelCase names", () => {
			expect(extractFnName('{ name: "getUserById" }')).toBe("getUserById")
		})

		it("extracts PascalCase names", () => {
			expect(extractFnName('{ name: "CreateUser" }')).toBe("CreateUser")
		})

		it("extracts snake_case names", () => {
			expect(extractFnName('{ name: "get_user" }')).toBe("get_user")
		})

		it("extracts names with numbers", () => {
			expect(extractFnName('{ name: "v2GetUser" }')).toBe("v2GetUser")
		})
	})
})

/* ============================================================================
 * hasServerFn Tests
 * ============================================================================ */

describe("hasServerFn", () => {
	it("detects createServerFn call", () => {
		const code = `export const api = createServerFn({ name: "test" })`
		expect(hasServerFn(code)).toBe(true)
	})

	it("detects in multiline code", () => {
		const code = `
			import { createServerFn } from "@flare/v0/server-fn"
			export const api = createServerFn({
				name: "test"
			})
		`
		expect(hasServerFn(code)).toBe(true)
	})

	it("returns false for no server fn", () => {
		const code = "const x = () => {}"
		expect(hasServerFn(code)).toBe(false)
	})

	it("returns false for similar but different names", () => {
		const code = "const createServerFunction = () => {}"
		expect(hasServerFn(code)).toBe(
			false,
		) /* "createServerFn" != substring of "createServerFunction" */
	})
})

/* ============================================================================
 * matchesInclude Tests
 * ============================================================================ */

describe("matchesInclude", () => {
	const defaultPattern = /\.(ts|tsx)$/

	describe("TypeScript files", () => {
		it("matches .ts files", () => {
			expect(matchesInclude("/src/api.ts", defaultPattern)).toBe(true)
		})

		it("matches .tsx files", () => {
			expect(matchesInclude("/src/component.tsx", defaultPattern)).toBe(true)
		})
	})

	describe("non-TypeScript files", () => {
		it("rejects .js files", () => {
			expect(matchesInclude("/src/api.js", defaultPattern)).toBe(false)
		})

		it("rejects .jsx files", () => {
			expect(matchesInclude("/src/component.jsx", defaultPattern)).toBe(false)
		})

		it("rejects .css files", () => {
			expect(matchesInclude("/src/styles.css", defaultPattern)).toBe(false)
		})
	})

	describe("custom patterns", () => {
		it("can use custom pattern", () => {
			const custom = /\.server\.(ts|tsx)$/
			expect(matchesInclude("/src/api.server.ts", custom)).toBe(true)
			expect(matchesInclude("/src/api.ts", custom)).toBe(false)
		})
	})
})

/* ============================================================================
 * generateFnId Tests
 * ============================================================================ */

describe("generateFnId", () => {
	it("combines hash and function name", () => {
		const fnId = generateFnId("/src/api.ts", "getUser")

		expect(fnId).toContain("/")
		expect(fnId.split("/")[1]).toBe("getUser")
	})

	it("generates unique IDs for different files", () => {
		const id1 = generateFnId("/src/users.ts", "get")
		const id2 = generateFnId("/src/posts.ts", "get")

		expect(id1).not.toBe(id2)
	})

	it("generates unique IDs for different functions", () => {
		const id1 = generateFnId("/src/api.ts", "create")
		const id2 = generateFnId("/src/api.ts", "delete")

		expect(id1).not.toBe(id2)
	})

	it("generates consistent IDs", () => {
		const id1 = generateFnId("/src/api.ts", "test")
		const id2 = generateFnId("/src/api.ts", "test")

		expect(id1).toBe(id2)
	})

	it("ID format is hash/name", () => {
		const fnId = generateFnId("/src/api.ts", "myFn")
		const [hash, name] = fnId.split("/")

		expect(hash?.length).toBe(8)
		expect(hash).toMatch(/^[0-9a-f]+$/)
		expect(name).toBe("myFn")
	})
})

/* ============================================================================
 * simulateTransform Tests
 * ============================================================================ */

describe("simulateTransform", () => {
	describe("basic transformation", () => {
		it("injects __id into options", () => {
			const code = `createServerFn({ name: "test", method: "POST" })`
			const result = simulateTransform(code, "/src/api.ts")

			expect(result).toContain("__id:")
			expect(result).toContain("/test")
		})

		it("preserves other options", () => {
			const code = `createServerFn({ name: "test", method: "POST" })`
			const result = simulateTransform(code, "/src/api.ts")

			expect(result).toContain('method: "POST"')
			expect(result).toContain('name: "test"')
		})

		it("handles multiple server functions", () => {
			const code = `
				const a = createServerFn({ name: "first" })
				const b = createServerFn({ name: "second" })
			`
			const result = simulateTransform(code, "/src/api.ts")

			expect(result).toContain("/first")
			expect(result).toContain("/second")
		})
	})

	describe("no transformation needed", () => {
		it("returns unchanged if no createServerFn", () => {
			const code = "const x = 1"
			const result = simulateTransform(code, "/src/api.ts")

			expect(result).toBe(code)
		})

		it("returns unchanged if no name in options", () => {
			const code = `createServerFn({ method: "POST" })`
			const result = simulateTransform(code, "/src/api.ts")

			expect(result).toBe(code)
		})
	})

	describe("ID uniqueness", () => {
		it("same function name in different files get different IDs", () => {
			const code = `createServerFn({ name: "handler" })`

			const result1 = simulateTransform(code, "/src/users.ts")
			const result2 = simulateTransform(code, "/src/posts.ts")

			/* Extract the __id values */
			const id1 = result1.match(/__id:\s*"([^"]+)"/)
			const id2 = result2.match(/__id:\s*"([^"]+)"/)

			expect(id1?.[1]).not.toBe(id2?.[1])
		})

		it("different function names in same file get different IDs", () => {
			const code1 = `createServerFn({ name: "create" })`
			const code2 = `createServerFn({ name: "delete" })`

			const result1 = simulateTransform(code1, "/src/api.ts")
			const result2 = simulateTransform(code2, "/src/api.ts")

			const id1 = result1.match(/__id:\s*"([^"]+)"/)
			const id2 = result2.match(/__id:\s*"([^"]+)"/)

			expect(id1?.[1]).not.toBe(id2?.[1])
		})
	})
})

/* ============================================================================
 * Integration Scenarios
 * ============================================================================ */

describe("integration scenarios", () => {
	describe("real-world usage patterns", () => {
		it("transforms typical server function definition", () => {
			const code = `
				import { createServerFn } from "@flare/v0/server-fn"

				export const getUsers = createServerFn({
					name: "getUsers",
					method: "GET"
				}).handler(async () => {
					return []
				})
			`
			const result = simulateTransform(code, "/src/api/users.ts")

			expect(result).toContain("__id:")
			expect(result).toContain("getUsers")
		})

		it("transforms mutation server function", () => {
			const code = `
				export const createUser = createServerFn({
					name: "createUser",
					method: "POST"
				}).input(z.object({ name: z.string() }))
				  .handler(async ({ input }) => input)
			`
			const result = simulateTransform(code, "/src/api/mutations.ts")

			expect(result).toContain("__id:")
			expect(result).toContain("createUser")
		})
	})

	describe("registry simulation", () => {
		it("can build registry from transformed code", () => {
			const files = [
				{ code: `createServerFn({ name: "a" })`, path: "/src/a.ts" },
				{ code: `createServerFn({ name: "b" })`, path: "/src/b.ts" },
				{ code: `createServerFn({ name: "c" })`, path: "/src/c.ts" },
			]

			const registry = new Map<string, { file: string; name: string }>()

			for (const file of files) {
				const transformed = simulateTransform(file.code, file.path)
				const idMatch = transformed.match(/__id:\s*"([^"]+)"/)
				const id = idMatch?.[1]
				if (id) {
					const [, name] = id.split("/")
					if (name) {
						registry.set(id, { file: file.path, name })
					}
				}
			}

			expect(registry.size).toBe(3)

			/* All IDs should be unique */
			const ids = Array.from(registry.keys())
			const uniqueIds = new Set(ids)
			expect(uniqueIds.size).toBe(3)
		})
	})
})
