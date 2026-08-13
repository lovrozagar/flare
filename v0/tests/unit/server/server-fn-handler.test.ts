/**
 * Server Function Handler Unit Tests
 *
 * Tests server-side handling of /_fn/* requests.
 */

import { describe, expect, it } from "vitest"
import { createServerFn, getServerFnMetadata } from "../../../src/server/server-fn"
import {
	createServerFnRegistry,
	handleServerFnRequest,
	isServerFnRequest,
	type ServerFnRegistry,
} from "../../../src/server/server-fn/handler"

/**
 * Get metadata or throw - for tests where we know it exists
 */
function getMetadataOrThrow<T>(fn: Parameters<typeof getServerFnMetadata<T>>[0]) {
	const metadata = getServerFnMetadata(fn)
	if (!metadata) throw new Error("Expected metadata to exist")
	return metadata
}

describe("createServerFnRegistry", () => {
	it("creates registry from server functions", () => {
		const getUser = createServerFn({ method: "get", name: "getUser" }).handler(() =>
			Promise.resolve({ id: "123" }),
		)

		const createUser = createServerFn({ method: "post", name: "createUser" }).handler(() =>
			Promise.resolve({ created: true }),
		)

		const registry = createServerFnRegistry({ createUser, getUser })

		expect(Object.keys(registry)).toHaveLength(2)
	})

	it("maps functions by endpoint", () => {
		const fn = createServerFn({ method: "get", name: "testFn" }).handler(() => Promise.resolve({}))

		const metadata = getMetadataOrThrow(fn)
		const registry = createServerFnRegistry({ fn })

		expect(registry[metadata.endpoint]).toBe(fn)
	})

	it("ignores non-server-function values", () => {
		const regularFn = () => {}
		const obj = { key: "value" }
		const serverFn = createServerFn({ method: "get" }).handler(() => Promise.resolve({}))

		const registry = createServerFnRegistry({
			obj,
			regularFn,
			serverFn,
		})

		expect(Object.keys(registry)).toHaveLength(1)
	})
})

describe("isServerFnRequest", () => {
	it("returns true for /_fn/ paths", () => {
		const request = new Request("http://localhost/_fn/abc123/getUser")
		expect(isServerFnRequest(request)).toBe(true)
	})

	it("returns true for nested /_fn/ paths", () => {
		const request = new Request("http://localhost/_fn/hash/name/extra")
		expect(isServerFnRequest(request)).toBe(true)
	})

	it("returns false for non-/_fn/ paths", () => {
		const request = new Request("http://localhost/api/users")
		expect(isServerFnRequest(request)).toBe(false)
	})

	it("returns false for similar but different paths", () => {
		const request = new Request("http://localhost/fn/test")
		expect(isServerFnRequest(request)).toBe(false)
	})
})

describe("handleServerFnRequest", () => {
	describe("routing", () => {
		it("returns 404 for unknown endpoints", async () => {
			const registry: ServerFnRegistry = {}
			const request = new Request("http://localhost/_fn/unknown/fn")

			const response = await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(response.status).toBe(404)
		})

		it("returns 405 for wrong HTTP method", async () => {
			const fn = createServerFn({ method: "post", name: "create" }).handler(() =>
				Promise.resolve({}),
			)

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`, {
				method: "GET",
			})

			const response = await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(response.status).toBe(405)
		})
	})

	describe("basic execution", () => {
		it("executes handler and returns result", async () => {
			const fn = createServerFn({ method: "get", name: "getData" }).handler(() =>
				Promise.resolve({ data: "test-value" }),
			)

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`)

			const response = await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(response.status).toBe(200)
			const body = await response.json()
			expect(body).toEqual({ data: "test-value" })
		})

		it("passes env to handler", async () => {
			let capturedEnv: unknown

			const fn = createServerFn({ method: "get", name: "test" }).handler(({ env }) => {
				capturedEnv = env
				return Promise.resolve({})
			})

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const mockEnv = { DB: "mock-db", KV: "mock-kv" }
			const request = new Request(`http://localhost${metadata.endpoint}`)

			await handleServerFnRequest(registry, {
				env: mockEnv,
				request,
			})

			expect(capturedEnv).toBe(mockEnv)
		})

		it("passes request to handler", async () => {
			let capturedRequest: Request | undefined

			const fn = createServerFn({ method: "get", name: "test" }).handler(({ request }) => {
				capturedRequest = request
				return Promise.resolve({})
			})

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`)

			await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(capturedRequest).toBe(request)
		})
	})

	describe("input handling", () => {
		it("parses JSON body as input", async () => {
			let capturedInput: unknown

			const schema = { parse: (raw: unknown) => raw as { name: string } }
			const fn = createServerFn({ method: "post", name: "create" })
				.input(schema)
				.handler(({ input }) => {
					capturedInput = input
					return Promise.resolve({ ok: true })
				})

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`, {
				body: JSON.stringify({ name: "test-name" }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			})

			await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(capturedInput).toEqual({ name: "test-name" })
		})

		it("returns 400 for validation errors", async () => {
			const schema = {
				parse: (_raw: unknown): { bad: string } => {
					throw new Error("Invalid input")
				},
			}
			const fn = createServerFn({ method: "post", name: "create" })
				.input(schema)
				.handler(() => Promise.resolve({}))

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`, {
				body: JSON.stringify({ bad: "data" }),
				method: "POST",
			})

			const response = await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(response.status).toBe(400)
		})
	})

	describe("authentication", () => {
		it("returns 401 when authenticate required but no authenticateFn", async () => {
			const fn = createServerFn({ method: "get", name: "protected" })
				.authenticate()
				.handler(() => Promise.resolve({}))

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`)

			const response = await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(response.status).toBe(401)
		})

		it("returns 401 when authenticateFn returns null", async () => {
			const fn = createServerFn({ method: "get", name: "protected" })
				.authenticate()
				.handler(() => Promise.resolve({}))

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`)

			const response = await handleServerFnRequest(registry, {
				authenticateFn: () => Promise.resolve(null),
				env: {},
				request,
			})

			expect(response.status).toBe(401)
		})

		it("passes auth to handler when authenticated", async () => {
			let capturedAuth: unknown

			const fn = createServerFn({ method: "get", name: "protected" })
				.authenticate()
				.handler(({ auth }) => {
					capturedAuth = auth
					return Promise.resolve({})
				})

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const mockAuth = { email: "test@example.com", sub: "user-123" }
			const request = new Request(`http://localhost${metadata.endpoint}`)

			await handleServerFnRequest(registry, {
				authenticateFn: () => Promise.resolve(mockAuth),
				env: {},
				request,
			})

			expect(capturedAuth).toBe(mockAuth)
		})
	})

	describe("authorization", () => {
		it("returns 403 when authorize returns false", async () => {
			const schema = { parse: (raw: unknown) => raw as { userId: string } }
			const fn = createServerFn({ method: "delete", name: "deleteUser" })
				.authenticate()
				.input(schema)
				.authorize(() => false)
				.handler(() => Promise.resolve({}))

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`, {
				body: JSON.stringify({ userId: "other-user" }),
				method: "DELETE",
			})

			const response = await handleServerFnRequest(registry, {
				authenticateFn: () => Promise.resolve({ sub: "user-123" }),
				env: {},
				request,
			})

			expect(response.status).toBe(403)
		})

		it("executes handler when authorize returns true", async () => {
			const schema = { parse: (raw: unknown) => raw as { userId: string } }
			const fn = createServerFn({ method: "delete", name: "deleteUser" })
				.authenticate()
				.input(schema)
				.authorize(({ auth, input }) => auth.sub === input.userId)
				.handler(() => Promise.resolve({ deleted: true }))

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`, {
				body: JSON.stringify({ userId: "user-123" }),
				method: "DELETE",
			})

			const response = await handleServerFnRequest(registry, {
				authenticateFn: () => Promise.resolve({ sub: "user-123" }),
				env: {},
				request,
			})

			expect(response.status).toBe(200)
			const body = await response.json()
			expect(body).toEqual({ deleted: true })
		})
	})

	describe("error handling", () => {
		it("returns 500 for handler errors", async () => {
			const fn = createServerFn({ method: "get", name: "failing" }).handler(() =>
				Promise.reject(new Error("Something went wrong")),
			)

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`)

			const response = await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(response.status).toBe(500)
			const body = await response.json()
			expect(body.message).toBe("Something went wrong")
		})

		it("returns JSON content type for all responses", async () => {
			const fn = createServerFn({ method: "get", name: "test" }).handler(() => Promise.resolve({}))

			const metadata = getMetadataOrThrow(fn)
			const registry = { [metadata.endpoint]: fn }

			const request = new Request(`http://localhost${metadata.endpoint}`)

			const response = await handleServerFnRequest(registry, {
				env: {},
				request,
			})

			expect(response.headers.get("Content-Type")).toBe("application/json")
		})
	})
})
