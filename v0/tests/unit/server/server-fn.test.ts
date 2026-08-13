/**
 * Server Functions Unit Tests
 *
 * Tests createServerFn builder pattern and callable result.
 */

import { describe, expect, it, vi } from "vitest"
import {
	createServerFn,
	generateFnHash,
	getServerFnMetadata,
	isServerFn,
	type ServerFn,
} from "../../../src/server/server-fn"

describe("createServerFn", () => {
	describe("builder pattern", () => {
		it("creates basic server function with handler only", () => {
			const fn = createServerFn({ method: "get", name: "getUser" }).handler(async () => ({
				id: "123",
				name: "Alice",
			}))

			expect(typeof fn).toBe("function")
			expect(isServerFn(fn)).toBe(true)
		})

		it("creates server function with input schema", () => {
			const schema = { parse: (raw: unknown) => raw as { userId: string } }

			const fn = createServerFn({ method: "get", name: "getUser" })
				.input(schema)
				.handler(async ({ input }) => ({ id: input.userId }))

			expect(isServerFn(fn)).toBe(true)
		})

		it("creates server function with authenticate", () => {
			const fn = createServerFn({ method: "get", name: "getProfile" })
				.authenticate()
				.handler(async ({ auth }) => auth)

			const metadata = getServerFnMetadata(fn)
			expect(metadata?.authenticate).toBe(true)
		})

		it("creates server function with authenticate and input", () => {
			const schema = { parse: (raw: unknown) => raw as { id: string } }

			const fn = createServerFn({ method: "post", name: "updateProfile" })
				.authenticate()
				.input(schema)
				.handler(async ({ auth, input }) => ({ auth, input }))

			const metadata = getServerFnMetadata(fn)
			expect(metadata?.authenticate).toBe(true)
			expect(metadata?.inputSchema).toBe(schema)
		})

		it("creates server function with full chain including authorize", () => {
			const schema = { parse: (raw: unknown) => raw as { userId: string } }

			const fn = createServerFn({ method: "delete", name: "deleteUser" })
				.authenticate()
				.input(schema)
				.authorize(({ auth, input }) => auth.sub === input.userId)
				.handler(async ({ input }) => ({ deleted: input.userId }))

			const metadata = getServerFnMetadata(fn)
			expect(metadata?.authenticate).toBe(true)
			expect(metadata?.authorize).toBeDefined()
		})

		it("creates server function with input and authorize (no authenticate)", () => {
			const schema = { parse: (raw: unknown) => raw as { public: boolean } }

			const fn = createServerFn({ method: "get", name: "getData" })
				.input(schema)
				.authorize(({ input }) => input.public === true)
				.handler(async () => ({ data: "public" }))

			const metadata = getServerFnMetadata(fn)
			expect(metadata?.authenticate).toBe(false)
			expect(metadata?.authorize).toBeDefined()
		})
	})

	describe("HTTP methods", () => {
		it.each(["get", "post", "put", "patch", "delete"] as const)("supports %s method", (method) => {
			const fn = createServerFn({ method, name: "testFn" }).handler(async () => ({ ok: true }))

			const metadata = getServerFnMetadata(fn)
			expect(metadata?.method).toBe(method)
		})
	})

	describe("metadata", () => {
		it("stores endpoint path", () => {
			const fn = createServerFn({ method: "get", name: "myFunction" }).handler(async () => ({}))

			const metadata = getServerFnMetadata(fn)
			expect(metadata?.endpoint).toMatch(/^\/_fn\/[a-z0-9]+\/myFunction$/)
		})

		it("stores function name", () => {
			const fn = createServerFn({ method: "post", name: "customName" }).handler(async () => ({}))

			const metadata = getServerFnMetadata(fn)
			expect(metadata?.name).toBe("customName")
		})

		it("defaults name to fn", () => {
			const fn = createServerFn({ method: "get" }).handler(async () => ({}))

			const metadata = getServerFnMetadata(fn)
			expect(metadata?.name).toBe("fn")
		})
	})
})

describe("TanStack Query helpers", () => {
	describe(".key()", () => {
		it("returns query key array with endpoint and input", () => {
			const fn = createServerFn({ method: "get", name: "getUser" }).handler(async () => ({
				id: "123",
			}))

			const key = fn.key(undefined)
			expect(Array.isArray(key)).toBe(true)
			expect(key[0]).toMatch(/^\/_fn\//)
		})

		it("includes input in key for cache differentiation", () => {
			const schema = { parse: (raw: unknown) => raw as { id: string } }

			const fn = createServerFn({ method: "get", name: "getUser" })
				.input(schema)
				.handler(async ({ input }) => input)

			const key1 = fn.key({ id: "123" })
			const key2 = fn.key({ id: "456" })

			expect(key1[1]).toEqual({ id: "123" })
			expect(key2[1]).toEqual({ id: "456" })
		})
	})

	describe(".queryOptions()", () => {
		it("returns queryKey and queryFn", () => {
			const fn = createServerFn({ method: "get", name: "getData" }).handler(async () => ({
				data: "test",
			}))

			const options = fn.queryOptions(undefined)

			expect(options.queryKey).toBeDefined()
			expect(typeof options.queryFn).toBe("function")
		})

		it("queryKey matches .key() output", () => {
			const schema = { parse: (raw: unknown) => raw as { id: string } }

			const fn = createServerFn({ method: "get", name: "getItem" })
				.input(schema)
				.handler(async () => ({}))

			const input = { id: "abc" }
			const options = fn.queryOptions(input)

			expect(options.queryKey).toEqual(fn.key(input))
		})
	})

	describe(".mutationOptions()", () => {
		it("returns mutationKey and mutationFn", () => {
			const fn = createServerFn({ method: "post", name: "createItem" }).handler(async () => ({
				created: true,
			}))

			const options = fn.mutationOptions()

			expect(options.mutationKey).toBeDefined()
			expect(typeof options.mutationFn).toBe("function")
		})

		it("mutationKey contains endpoint", () => {
			const fn = createServerFn({ method: "delete", name: "removeItem" }).handler(async () => ({}))

			const options = fn.mutationOptions()

			expect(options.mutationKey[0]).toMatch(/^\/_fn\/.*\/removeItem$/)
		})
	})
})

describe("generateFnHash", () => {
	it("generates consistent hash for same inputs", () => {
		const hash1 = generateFnHash("testFn", "get")
		const hash2 = generateFnHash("testFn", "get")

		expect(hash1).toBe(hash2)
	})

	it("generates different hash for different names", () => {
		const hash1 = generateFnHash("fnA", "get")
		const hash2 = generateFnHash("fnB", "get")

		expect(hash1).not.toBe(hash2)
	})

	it("generates different hash for different methods", () => {
		const hash1 = generateFnHash("test", "get")
		const hash2 = generateFnHash("test", "post")

		expect(hash1).not.toBe(hash2)
	})

	it("returns alphanumeric string", () => {
		const hash = generateFnHash("myFunction", "post")

		expect(hash).toMatch(/^[a-z0-9]+$/)
	})
})

describe("isServerFn", () => {
	it("returns true for server functions", () => {
		const fn = createServerFn({ method: "get" }).handler(async () => ({}))

		expect(isServerFn(fn)).toBe(true)
	})

	it("returns false for regular functions", () => {
		const fn = () => {}

		expect(isServerFn(fn)).toBe(false)
	})

	it("returns false for non-functions", () => {
		expect(isServerFn({})).toBe(false)
		expect(isServerFn(null)).toBe(false)
		expect(isServerFn("string")).toBe(false)
		expect(isServerFn(123)).toBe(false)
	})
})

describe("getServerFnMetadata", () => {
	it("returns metadata for server functions", () => {
		const fn = createServerFn({ method: "post", name: "test" }).handler(async () => ({}))

		const metadata = getServerFnMetadata(fn)

		expect(metadata).not.toBeNull()
		expect(metadata?.method).toBe("post")
		expect(metadata?.name).toBe("test")
	})

	it("returns null for non-server functions", () => {
		const fn = (() => {}) as unknown as ServerFn<unknown, unknown>

		expect(getServerFnMetadata(fn)).toBeNull()
	})

	it("includes handler function", () => {
		const handler = async () => ({ result: "ok" })
		const fn = createServerFn({ method: "get" }).handler(handler)

		const metadata = getServerFnMetadata(fn)
		expect(metadata?.handler).toBeDefined()
	})

	it("includes input schema when provided", () => {
		const schema = { parse: (raw: unknown) => raw as { x: number } }
		const fn = createServerFn({ method: "get" })
			.input(schema)
			.handler(async () => ({}))

		const metadata = getServerFnMetadata(fn)
		expect(metadata?.inputSchema).toBe(schema)
	})
})

describe("callable behavior", () => {
	it("function is callable", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			json: () => Promise.resolve({ success: true }),
			ok: true,
		})

		const fn = createServerFn({ method: "get", name: "test" }).handler(async () => ({
			success: true,
		}))

		const result = await fn(undefined)
		expect(result).toEqual({ success: true })
	})

	it("sends request to correct endpoint", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			json: () => Promise.resolve({}),
			ok: true,
		})
		globalThis.fetch = mockFetch

		const fn = createServerFn({ method: "post", name: "createItem" }).handler(async () => ({}))

		await fn(undefined)

		expect(mockFetch).toHaveBeenCalledWith(
			expect.stringMatching(/^\/_fn\/[a-z0-9]+\/createItem$/),
			expect.objectContaining({
				method: "POST",
			}),
		)
	})

	it("sends input as JSON body", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			json: () => Promise.resolve({}),
			ok: true,
		})
		globalThis.fetch = mockFetch

		const schema = { parse: (raw: unknown) => raw as { name: string } }
		const fn = createServerFn({ method: "post", name: "create" })
			.input(schema)
			.handler(async () => ({}))

		await fn({ name: "test" })

		expect(mockFetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				body: JSON.stringify({ name: "test" }),
				headers: { "Content-Type": "application/json" },
			}),
		)
	})

	it("throws on non-ok response", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			json: () => Promise.resolve({ message: "Not found" }),
			ok: false,
		})

		const fn = createServerFn({ method: "get" }).handler(async () => ({}))

		await expect(fn(undefined)).rejects.toThrow("Not found")
	})
})
