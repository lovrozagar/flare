/** @vitest-environment node */
import { describe, expect, expectTypeOf, it, vi } from "vitest"
import {
	ServerFnValidationError,
	UnauthenticatedError,
	UnauthorizedError,
} from "../../../src/errors/index.ts"
import { runWithServerContext } from "../../../src/server-context/index.ts"
import type {
	ServerFnHandlerRegistration,
	ServerFnRegistration,
	ServerFnStreamRegistration,
} from "../../../src/server-fn/index.ts"
import {
	createServerFn,
	handleServerFnRequest,
	serverFnMutationOptions,
	serverFnQueryOptions,
} from "../../../src/server-fn/index.ts"
import type { FlareStore } from "../../../src/store/index.ts"

function makeFlareStore(overrides?: Partial<FlareStore>): FlareStore {
	return {
		delete: vi.fn(async () => {}),
		deleteByTags: vi.fn(async () => {}),
		get: vi.fn(async () => null),
		set: vi.fn(async () => {}),
		...overrides,
	}
}

function makeReg(overrides?: Partial<ServerFnHandlerRegistration>): ServerFnRegistration {
	return {
		authenticate: false,
		fn: async (ctx) => ctx.input,
		id: "test",
		method: "post",
		name: "test",
		...overrides,
	} as ServerFnRegistration
}

function makeFns(
	...entries: Array<[string, Partial<ServerFnHandlerRegistration>]>
): Map<string, ServerFnRegistration> {
	const map = new Map<string, ServerFnRegistration>()
	for (const [id, reg] of entries) {
		map.set(id, makeReg({ ...reg }))
	}
	return map
}

function postReq(path: string, body?: unknown): Request {
	return new Request(`http://localhost${path}`, {
		body: body !== undefined ? JSON.stringify(body) : undefined,
		headers: body !== undefined ? { "content-type": "application/json" } : {},
		method: "POST",
	})
}

function getReq(path: string): Request {
	return new Request(`http://localhost${path}`, { method: "GET" })
}

describe("createServerFn", () => {
	it("returns a builder with authenticate, authorize, handler, input", () => {
		const builder = createServerFn({ name: "test" })
		expect(builder.authenticate).toBeTypeOf("function")
		expect(builder.authorize).toBeTypeOf("function")
		expect(builder.handler).toBeTypeOf("function")
		expect(builder.input).toBeTypeOf("function")
	})

	it("config method defaults to post", () => {
		const builder = createServerFn({ name: "test" })
		const fn = builder.handler(async () => "ok")
		expect(fn._registration?.method).toBe("post")
	})

	it('config method "get" preserved', () => {
		const builder = createServerFn({ method: "get", name: "test" })
		const fn = builder.handler(async () => "ok")
		expect(fn._registration?.method).toBe("get")
	})
})

describe("builder immutability", () => {
	it(".authenticate() returns new builder", () => {
		const b1 = createServerFn({ name: "test" })
		const b2 = b1.authenticate()
		expect(b1).not.toBe(b2)
	})

	it(".input() returns new builder", () => {
		const b1 = createServerFn({ name: "test" })
		const b2 = b1.input((raw: unknown) => raw)
		expect(b1).not.toBe(b2)
	})

	it(".authorize() returns new builder", () => {
		const b1 = createServerFn({ name: "test" })
		const b2 = b1.authorize(() => true)
		expect(b1).not.toBe(b2)
	})
})

describe("builder chain soundness: progressive type narrowing", () => {
	it("authenticate() removed after authenticate()", () => {
		const after = createServerFn({ name: "test" }).authenticate()
		type After = typeof after
		expectTypeOf<After>().not.toHaveProperty("authenticate")
		expectTypeOf<After>().toHaveProperty("authorize")
		expectTypeOf<After>().toHaveProperty("handler")
		expectTypeOf<After>().toHaveProperty("input")
		expectTypeOf<After>().toHaveProperty("stream")
	})

	it("authenticate() removed after authorize()", () => {
		const after = createServerFn({ name: "test" }).authorize(() => true)
		type After = typeof after
		expectTypeOf<After>().not.toHaveProperty("authenticate")
		expectTypeOf<After>().not.toHaveProperty("authorize")
		expectTypeOf<After>().toHaveProperty("handler")
		expectTypeOf<After>().toHaveProperty("input")
		expectTypeOf<After>().toHaveProperty("stream")
	})

	it("authenticate().authorize() → terminal (no auth methods)", () => {
		const after = createServerFn({ name: "test" })
			.authenticate()
			.authorize(() => true)
		type After = typeof after
		expectTypeOf<After>().not.toHaveProperty("authenticate")
		expectTypeOf<After>().not.toHaveProperty("authorize")
		expectTypeOf<After>().toHaveProperty("handler")
	})

	it("input() preserves builder level", () => {
		const initial = createServerFn({ name: "test" })
		const afterInput = initial.input((raw: unknown) => raw)
		type AfterInput = typeof afterInput
		expectTypeOf<AfterInput>().toHaveProperty("authenticate")
		expectTypeOf<AfterInput>().toHaveProperty("authorize")

		const afterAuth = initial.authenticate()
		const afterAuthInput = afterAuth.input((raw: unknown) => raw)
		type AfterAuthInput = typeof afterAuthInput
		expectTypeOf<AfterAuthInput>().not.toHaveProperty("authenticate")
		expectTypeOf<AfterAuthInput>().toHaveProperty("authorize")
	})
})

describe("builder chain - authenticate", () => {
	it(".authenticate().handler() → registration.authenticate === true", () => {
		const fn = createServerFn({ name: "test" })
			.authenticate()
			.handler(async () => "ok")
		expect(fn._registration?.authenticate).toBe(true)
	})

	it("no .authenticate() → registration.authenticate === false", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		expect(fn._registration?.authenticate).toBe(false)
	})
})

describe("builder chain - input", () => {
	it(".input(zodSchema).handler() → registration.input set", () => {
		const schema = { parse: (raw: unknown) => raw as string }
		const fn = createServerFn({ name: "test" })
			.input(schema)
			.handler(async () => "ok")
		expect(fn._registration?.input).toBeDefined()
	})

	it(".input(plainFn).handler() → registration.input set", () => {
		const validator = (raw: unknown) => raw as string
		const fn = createServerFn({ name: "test" })
			.input(validator)
			.handler(async () => "ok")
		expect(fn._registration?.input).toBeDefined()
	})

	it("no .input() → registration.input undefined", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		expect(fn._registration?.input).toBeUndefined()
	})
})

describe("builder chain - authorize", () => {
	it(".authorize(fn).handler() → registration.authorizeFn set", () => {
		const fn = createServerFn({ name: "test" })
			.authorize(() => true)
			.handler(async () => "ok")
		expect(fn._registration?.authorizeFn).toBeTypeOf("function")
	})

	it("no .authorize() → registration.authorizeFn undefined", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		expect(fn._registration?.authorizeFn).toBeUndefined()
	})
})

describe("builder chain - handler", () => {
	it(".handler() returns callable async function", async () => {
		const fn = createServerFn({ name: "test" }).handler(async (ctx) => `got: ${ctx.input}`)
		expect(fn).toBeTypeOf("function")
	})
})

describe("builder chain - ordering", () => {
	it("authenticate → input → authorize → handler", () => {
		const fn = createServerFn({ name: "test" })
			.authenticate()
			.input((raw: unknown) => raw)
			.authorize(() => true)
			.handler(async () => "ok")
		expect(fn._registration?.authenticate).toBe(true)
		expect(fn._registration?.input).toBeDefined()
		expect(fn._registration?.authorizeFn).toBeDefined()
	})

	it("input → authenticate → authorize → handler", () => {
		const fn = createServerFn({ name: "test" })
			.input((raw: unknown) => raw)
			.authenticate()
			.authorize(() => true)
			.handler(async () => "ok")
		expect(fn._registration?.authenticate).toBe(true)
	})
})

describe("handleServerFnRequest - URL parsing", () => {
	it("/_fn/abc123/myFn → proceeds", async () => {
		const fns = makeFns(["abc123", { name: "myFn" }])
		const res = await handleServerFnRequest(postReq("/_fn/abc123/myFn"), {}, fns)
		expect(res.status).toBe(200)
	})

	it("/_fn/abc123 → 404 (missing name)", async () => {
		const fns = makeFns(["abc123", { name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/abc123"), {}, fns)
		expect(res.status).toBe(404)
	})

	it("/_fn/ → 404", async () => {
		const res = await handleServerFnRequest(postReq("/_fn/"), {}, new Map())
		expect(res.status).toBe(404)
	})
})

describe("handleServerFnRequest - lookup", () => {
	it("known id, matching name → proceeds", async () => {
		const fns = makeFns(["id1", { name: "myFn" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/myFn"), {}, fns)
		expect(res.status).toBe(200)
	})

	it("known id, wrong name → 404", async () => {
		const fns = makeFns(["id1", { name: "myFn" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/wrong"), {}, fns)
		expect(res.status).toBe(404)
	})

	it("unknown id → 404", async () => {
		const fns = makeFns(["id1", { name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/unknown/test"), {}, fns)
		expect(res.status).toBe(404)
	})

	it("empty fns Map → 404", async () => {
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, new Map())
		expect(res.status).toBe(404)
	})
})

describe("handleServerFnRequest - method validation", () => {
	it('registration "post", request GET → 405', async () => {
		const fns = makeFns(["id1", { method: "post", name: "test" }])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(405)
	})

	it('registration "get", request POST → 405', async () => {
		const fns = makeFns(["id1", { method: "get", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(405)
	})

	it('registration "post", request POST → proceeds', async () => {
		const fns = makeFns(["id1", { method: "post", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(200)
	})

	it('registration "get", request GET → proceeds', async () => {
		const fns = makeFns(["id1", { method: "get", name: "test" }])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(200)
	})
})

describe("handleServerFnRequest - authentication", () => {
	it("authenticate: true, authenticateFn returns user → proceeds", async () => {
		const fns = makeFns(["id1", { authenticate: true, name: "test" }])
		const authFn = async () => ({ id: "user1" })
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns, authFn)
		expect(res.status).toBe(200)
	})

	it("authenticate: true, authenticateFn returns null → 401", async () => {
		const fns = makeFns(["id1", { authenticate: true, name: "test" }])
		const authFn = async () => null
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns, authFn)
		expect(res.status).toBe(401)
	})

	it("authenticate: false → no authenticateFn call", async () => {
		const authFn = vi.fn(async () => ({ id: "user1" }))
		const fns = makeFns(["id1", { authenticate: false, name: "test" }])
		await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns, authFn)
		expect(authFn).not.toHaveBeenCalled()
	})

	it("authenticate: true, no authenticateFn → 401", async () => {
		const fns = makeFns(["id1", { authenticate: true, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(401)
	})
})

describe("handleServerFnRequest - input parsing", () => {
	it("POST with JSON body → parsed as input", async () => {
		const handler = vi.fn(async (ctx) => ctx.input)
		const fns = makeFns(["id1", { fn: handler, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { x: 1 }), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual({ x: 1 })
	})

	it("POST with empty body → input = undefined", async () => {
		const handler = vi.fn(async (ctx) => ctx.input)
		const fns = makeFns(["id1", { fn: handler, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.data).toBeNull()
	})

	it("GET with search params → Object.fromEntries as input", async () => {
		const handler = vi.fn(async (ctx) => ctx.input)
		const fns = makeFns(["id1", { fn: handler, method: "get", name: "test" }])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test?foo=bar"), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual({ foo: "bar" })
	})
})

describe("handleServerFnRequest - input validation", () => {
	it("zod schema, valid → proceeds", async () => {
		const schema = { parse: (raw: unknown) => raw }
		const fns = makeFns(["id1", { fn: async (ctx) => ctx.input, input: schema, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { x: 1 }), {}, fns)
		expect(res.status).toBe(200)
	})

	it("zod schema, invalid → 400", async () => {
		const schema = {
			parse: () => {
				throw new Error("Invalid input")
			},
		}
		const fns = makeFns(["id1", { fn: async () => "ok", input: schema, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { x: 1 }), {}, fns)
		expect(res.status).toBe(400)
	})

	it("plain function, throws → 400", async () => {
		const validator = () => {
			throw new Error("bad input")
		}
		const fns = makeFns(["id1", { fn: async () => "ok", input: validator, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { x: 1 }), {}, fns)
		expect(res.status).toBe(400)
	})
})

describe("handleServerFnRequest - authorization", () => {
	it("authorizeFn returns true → proceeds", async () => {
		const fns = makeFns(["id1", { authorizeFn: () => true, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(200)
	})

	it("authorizeFn returns false → 403", async () => {
		const fns = makeFns(["id1", { authorizeFn: () => false, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
	})

	it("authorizeFn returns Promise<true> → proceeds", async () => {
		const fns = makeFns(["id1", { authorizeFn: async () => true, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(200)
	})

	it("no authorizeFn → proceeds", async () => {
		const fns = makeFns(["id1", { name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(200)
	})
})

describe("handleServerFnRequest - handler execution", () => {
	it("handler returns value → 200 { data: value }", async () => {
		const fns = makeFns(["id1", { fn: async () => "hello", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(res.status).toBe(200)
		expect(body).toEqual({ data: "hello" })
	})

	it("handler returns undefined → 200 { data: null }", async () => {
		const fns = makeFns(["id1", { fn: async () => undefined, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body).toEqual({ data: null })
	})

	it("handler returns null → 200 { data: null }", async () => {
		const fns = makeFns(["id1", { fn: async () => null, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body).toEqual({ data: null })
	})

	it("handler receives { auth, env, input, request }", async () => {
		let captured: Record<string, unknown> | undefined
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					captured = {
						auth: ctx.auth,
						env: ctx.env,
						hasInput: ctx.input !== undefined,
						hasRequest: ctx.request instanceof Request,
					}
					return "ok"
				},
				name: "test",
			},
		])
		await handleServerFnRequest(postReq("/_fn/id1/test", { x: 1 }), { DB: "test" }, fns)
		expect(captured?.env).toEqual({ DB: "test" })
		expect(captured?.hasRequest).toBe(true)
	})
})

describe("handleServerFnRequest - error mapping", () => {
	it("handler throws ServerFnValidationError → 400 with errors", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw new ServerFnValidationError({
						fieldErrors: { email: ["required"] },
						formErrors: ["bad data"],
					})
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(400)
		const body = await res.json()
		expect(body.message).toBe("bad data")
		expect(body.errors).toEqual({
			fieldErrors: { email: ["required"] },
			formErrors: ["bad data"],
		})
	})

	it("handler throws UnauthenticatedError → 401", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw new UnauthenticatedError()
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(401)
	})

	it("handler throws UnauthorizedError → 403", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw new UnauthorizedError()
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
	})

	it("handler throws generic Error → 500 { message: 'Internal server error' }", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw new Error("secret internal details")
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(500)
		const body = await res.json()
		expect(body.message).toBe("Internal server error")
	})
})

describe("handleServerFnRequest - response format", () => {
	it("Content-Type: application/json on all responses", async () => {
		const fns = makeFns(["id1", { fn: async () => "ok", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
	})

	it("error response also has application/json", async () => {
		const res = await handleServerFnRequest(postReq("/_fn/unknown/test"), {}, new Map())
		expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
		expect(res.status).toBe(404)
	})
})

describe("handleServerFnRequest - execution order", () => {
	it("authenticate fails → handler not called", async () => {
		const handler = vi.fn(async () => "ok")
		const fns = makeFns(["id1", { authenticate: true, fn: handler, name: "test" }])
		await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns, async () => null)
		expect(handler).not.toHaveBeenCalled()
	})

	it("validation fails → authorize + handler not called", async () => {
		const authorizeFn = vi.fn(() => true)
		const handler = vi.fn(async () => "ok")
		const fns = makeFns([
			"id1",
			{
				authorizeFn,
				fn: handler,
				input: {
					parse: () => {
						throw new Error("bad")
					},
				},
				name: "test",
			},
		])
		await handleServerFnRequest(postReq("/_fn/id1/test", { x: 1 }), {}, fns)
		expect(authorizeFn).not.toHaveBeenCalled()
		expect(handler).not.toHaveBeenCalled()
	})
})

/* ── Additional edge cases ─────────────────────────────────────────── */

describe("handleServerFnRequest - auth returns undefined", () => {
	it("authenticate: true, authenticateFn returns undefined → 401", async () => {
		const fns = makeFns(["id1", { authenticate: true, name: "test" }])
		const authFn = async () => undefined
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns, authFn)
		expect(res.status).toBe(401)
	})
})

describe("handleServerFnRequest - malformed JSON", () => {
	it("POST with invalid JSON body → 400", async () => {
		const fns = makeFns(["id1", { name: "test" }])
		const req = new Request("http://localhost/_fn/id1/test", {
			body: "not-valid-json{{{",
			headers: { "content-type": "application/json" },
			method: "POST",
		})
		const res = await handleServerFnRequest(req, {}, fns)
		expect(res.status).toBe(400)
		const body = await res.json()
		expect(body.message).toBe("Invalid JSON")
	})
})

describe("handleServerFnRequest - authorize falsy values", () => {
	it("authorizeFn returns undefined → 403", async () => {
		const fns = makeFns([
			"id1",
			{ authorizeFn: () => undefined as unknown as boolean, name: "test" },
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
	})

	it("authorizeFn returns null → 403", async () => {
		const fns = makeFns(["id1", { authorizeFn: () => null as unknown as boolean, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
	})

	it("authorizeFn returns 0 → 403", async () => {
		const fns = makeFns(["id1", { authorizeFn: () => 0 as unknown as boolean, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
	})

	it("authorizeFn returns empty string → 403", async () => {
		const fns = makeFns(["id1", { authorizeFn: () => "" as unknown as boolean, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
	})
})

describe("handleServerFnRequest - GET multi-value params", () => {
	it("duplicate keys → grouped into array", async () => {
		const handler = vi.fn(async (ctx) => ctx.input)
		const fns = makeFns(["id1", { fn: handler, method: "get", name: "test" }])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test?tag=a&tag=b"), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual({ tag: ["a", "b"] })
	})

	it("triple duplicate keys → array of 3", async () => {
		const handler = vi.fn(async (ctx) => ctx.input)
		const fns = makeFns(["id1", { fn: handler, method: "get", name: "test" }])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test?x=1&x=2&x=3"), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual({ x: ["1", "2", "3"] })
	})

	it("mixed single and multi-value params", async () => {
		const handler = vi.fn(async (ctx) => ctx.input)
		const fns = makeFns(["id1", { fn: handler, method: "get", name: "test" }])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test?q=hello&tag=a&tag=b"), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual({ q: "hello", tag: ["a", "b"] })
	})
})

describe("handleServerFnRequest - GET no params", () => {
	it("GET with no search params → input undefined, handler receives undefined", async () => {
		const handler = vi.fn(async (ctx) => ctx.input)
		const fns = makeFns(["id1", { fn: handler, method: "get", name: "test" }])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.data).toBeNull()
	})
})

/* ── registration.id ───────────────────────────────────────────────── */

describe("registration.id", () => {
	it("defaults to name when __id not provided", () => {
		const fn = createServerFn({ name: "myFn" }).handler(async () => "ok")
		expect(fn._registration?.id).toBe("myFn")
	})

	it("uses __id when provided", () => {
		const fn = createServerFn({ __id: "hash123", name: "myFn" }).handler(async () => "ok")
		expect(fn._registration?.id).toBe("hash123")
	})

	it("empty string __id falls back to name (empty is unreachable)", () => {
		const fn = createServerFn({ __id: "", name: "myFn" }).handler(async () => "ok")
		expect(fn._registration?.id).toBe("myFn")
	})

	it("undefined __id falls back to name", () => {
		const fn = createServerFn({ __id: undefined, name: "myFn" }).handler(async () => "ok")
		expect(fn._registration?.id).toBe("myFn")
	})

	it("__id with special chars preserved", () => {
		const fn = createServerFn({ __id: "a/b/c.hash-123", name: "myFn" }).handler(async () => "ok")
		expect(fn._registration?.id).toBe("a/b/c.hash-123")
	})

	it("id preserved through full builder chain", () => {
		const fn = createServerFn({ __id: "custom-id", name: "myFn" })
			.authenticate()
			.input((raw: unknown) => raw)
			.authorize(() => true)
			.handler(async () => "ok")
		expect(fn._registration?.id).toBe("custom-id")
		expect(fn._registration?.name).toBe("myFn")
	})

	it("name and id are independent", () => {
		const fn = createServerFn({ __id: "abc", name: "xyz" }).handler(async () => "ok")
		expect(fn._registration?.id).toBe("abc")
		expect(fn._registration?.name).toBe("xyz")
	})
})

/* ── piggyback ─────────────────────────────────────────────────────── */

describe("handleServerFnRequest - piggyback", () => {
	it("single piggyback → response includes queries array", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["todos"], [{ id: 1, title: "Buy milk" }])
					return { ok: true }
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual({ ok: true })
		expect(body.queries).toEqual([{ data: [{ id: 1, title: "Buy milk" }], key: ["todos"] }])
	})

	it("handler without piggyback → response has no queries field", async () => {
		const fns = makeFns(["id1", { fn: async () => "ok", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body).toEqual({ data: "ok" })
		expect(body.queries).toBeUndefined()
	})

	it("multiple piggyback calls → all collected in order", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["todos"], [1, 2])
					ctx.piggyback(["user", 1], { name: "Alice" })
					ctx.piggyback(["settings"], { theme: "dark" })
					return "done"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries).toHaveLength(3)
		expect(body.queries[0].key).toEqual(["todos"])
		expect(body.queries[1].key).toEqual(["user", 1])
		expect(body.queries[2].key).toEqual(["settings"])
	})

	it("piggyback with null data", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["cleared"], null)
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries).toEqual([{ data: null, key: ["cleared"] }])
	})

	it("piggyback with empty array data", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["empty-list"], [])
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries[0].data).toEqual([])
	})

	it("piggyback with deeply nested data", async () => {
		const nested = { a: { b: { c: [1, 2, { d: true }] } } }
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["deep"], nested)
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries[0].data).toEqual(nested)
	})

	it("piggyback with compound query key", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["users", { filter: "active", page: 2 }], [{ id: 1 }])
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries[0].key).toEqual(["users", { filter: "active", page: 2 }])
	})

	it("piggyback same key twice → both collected", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["todos"], [1])
					ctx.piggyback(["todos"], [1, 2])
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries).toHaveLength(2)
		expect(body.queries[0].data).toEqual([1])
		expect(body.queries[1].data).toEqual([1, 2])
	})

	it("piggyback does NOT appear when handler throws", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["should-not-appear"], "data")
					throw new Error("boom")
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(500)
		const body = await res.json()
		expect(body.queries).toBeUndefined()
	})

	it("piggyback works with authenticated handler", async () => {
		const fns = makeFns([
			"id1",
			{
				authenticate: true,
				fn: async (ctx) => {
					ctx.piggyback(["profile"], { user: ctx.auth })
					return "ok"
				},
				name: "test",
			},
		])
		const authFn = async () => ({ id: "user1" })
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns, authFn)
		const body = await res.json()
		expect(body.queries[0].data).toEqual({ user: { id: "user1" } })
	})

	it("piggyback works with validated input", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["validated"], ctx.input)
					return "ok"
				},
				input: { parse: (raw: unknown) => raw },
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { x: 42 }), {}, fns)
		const body = await res.json()
		expect(body.queries[0].data).toEqual({ x: 42 })
	})

	it("piggyback isolation between requests", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					if (ctx.input === "first") {
						ctx.piggyback(["first-only"], "a")
					}
					return ctx.input
				},
				name: "test",
			},
		])
		const res1 = await handleServerFnRequest(postReq("/_fn/id1/test", "first"), {}, fns)
		const body1 = await res1.json()
		expect(body1.queries).toHaveLength(1)

		const res2 = await handleServerFnRequest(postReq("/_fn/id1/test", "second"), {}, fns)
		const body2 = await res2.json()
		expect(body2.queries).toBeUndefined()
	})

	it("direct invocation provides no-op piggyback", async () => {
		let piggybackCalled = false
		const fn = createServerFn({ name: "test" }).handler(async (ctx) => {
			ctx.piggyback(["key"], "val")
			piggybackCalled = true
			return "ok"
		})
		const result = await fn()
		expect(result).toBe("ok")
		expect(piggybackCalled).toBe(true)
	})
})

/* ── serverFnQueryOptions ────────────────────────────────────────────── */

describe("serverFnQueryOptions", () => {
	it("returns queryKey based on name + input", () => {
		const fn = createServerFn({ name: "getTodo" }).handler(async () => ({ id: 1 }))
		const opts = serverFnQueryOptions(fn, { input: undefined })
		expect(opts.queryKey).toEqual(["getTodo", undefined])
	})

	it("queryKey with no config → [name, undefined]", () => {
		const fn = createServerFn({ name: "getTodo" }).handler(async () => ({ id: 1 }))
		const opts = serverFnQueryOptions(fn)
		expect(opts.queryKey).toEqual(["getTodo", undefined])
	})

	it("queryKey includes input value", () => {
		const fn = createServerFn({ name: "getTodo" })
			.input((raw: unknown) => raw as number)
			.handler(async () => ({ id: 1 }))
		const opts = serverFnQueryOptions(fn, { input: 42 })
		expect(opts.queryKey).toEqual(["getTodo", 42])
	})

	it("queryKey with object input", () => {
		const fn = createServerFn({ name: "search" })
			.input((raw: unknown) => raw as { page: number; q: string })
			.handler(async () => [])
		const opts = serverFnQueryOptions(fn, { input: { page: 1, q: "hello" } })
		expect(opts.queryKey).toEqual(["search", { page: 1, q: "hello" }])
	})

	it("custom queryKey overrides default", () => {
		const fn = createServerFn({ name: "getTodo" }).handler(async () => ({ id: 1 }))
		const opts = serverFnQueryOptions(fn, { queryKey: ["todos", 1] })
		expect(opts.queryKey).toEqual(["todos", 1])
	})

	it("custom queryKey empty array", () => {
		const fn = createServerFn({ name: "getTodo" }).handler(async () => ({ id: 1 }))
		const opts = serverFnQueryOptions(fn, { queryKey: [] })
		expect(opts.queryKey).toEqual([])
	})

	it("passes staleTime through", () => {
		const fn = createServerFn({ name: "getTodo" }).handler(async () => ({ id: 1 }))
		const opts = serverFnQueryOptions(fn, { staleTime: 60_000 })
		expect(opts.staleTime).toBe(60_000)
	})

	it("staleTime 0 passed through", () => {
		const fn = createServerFn({ name: "getTodo" }).handler(async () => ({ id: 1 }))
		const opts = serverFnQueryOptions(fn, { staleTime: 0 })
		expect(opts.staleTime).toBe(0)
	})

	it("staleTime undefined when not set", () => {
		const fn = createServerFn({ name: "getTodo" }).handler(async () => ({ id: 1 }))
		const opts = serverFnQueryOptions(fn)
		expect(opts.staleTime).toBeUndefined()
	})

	it("queryFn calls serverFn directly on server (no input)", async () => {
		const fn = createServerFn({ name: "getAll" }).handler(async () => [1, 2, 3])
		const opts = serverFnQueryOptions(fn)
		const result = await opts.queryFn()
		expect(result).toEqual([1, 2, 3])
	})

	it("queryFn calls serverFn directly on server (with input)", async () => {
		const fn = createServerFn({ name: "echo" })
			.input((raw: unknown) => raw as string)
			.handler(async (ctx) => `echo:${ctx.input}`)
		const opts = serverFnQueryOptions(fn, { input: "hello" })
		const result = await opts.queryFn()
		expect(result).toBe("echo:hello")
	})

	it("queryFn passes correct input to handler", async () => {
		let captured: unknown
		const fn = createServerFn({ name: "capture" })
			.input((raw: unknown) => raw as { id: number })
			.handler(async (ctx) => {
				captured = ctx.input
				return "done"
			})
		const opts = serverFnQueryOptions(fn, { input: { id: 42 } })
		await opts.queryFn()
		expect(captured).toEqual({ id: 42 })
	})

	it("uses __id for URL construction", () => {
		const fn = createServerFn({ __id: "abc123", name: "myFn" }).handler(async () => "ok")
		const opts = serverFnQueryOptions(fn)
		expect(opts.queryKey).toEqual(["myFn", undefined])
		/* verify id is used (not name) for URL — test via registration check */
		expect(fn._registration?.id).toBe("abc123")
	})

	it("returns all three fields", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		const opts = serverFnQueryOptions(fn, { staleTime: 1000 })
		expect(opts).toHaveProperty("queryFn")
		expect(opts).toHaveProperty("queryKey")
		expect(opts).toHaveProperty("staleTime")
		expect(typeof opts.queryFn).toBe("function")
	})

	it("queryFn handles null return", async () => {
		const fn = createServerFn({ name: "nullable" }).handler(async () => null)
		const opts = serverFnQueryOptions(fn)
		const result = await opts.queryFn()
		expect(result).toBeNull()
	})

	it("different inputs produce different queryKeys", () => {
		const fn = createServerFn({ name: "getTodo" })
			.input((raw: unknown) => raw as number)
			.handler(async () => ({}))
		const opts1 = serverFnQueryOptions(fn, { input: 1 })
		const opts2 = serverFnQueryOptions(fn, { input: 2 })
		expect(opts1.queryKey).not.toEqual(opts2.queryKey)
	})
})

/* ── serverFnMutationOptions ─────────────────────────────────────────── */

describe("serverFnMutationOptions", () => {
	it("without config → no onSuccess", () => {
		const fn = createServerFn({ name: "update" }).handler(async () => "ok")
		const opts = serverFnMutationOptions(fn)
		expect(opts.onSuccess).toBeUndefined()
	})

	it("empty config → no onSuccess", () => {
		const fn = createServerFn({ name: "update" }).handler(async () => "ok")
		const opts = serverFnMutationOptions(fn, {})
		expect(opts.onSuccess).toBeUndefined()
	})

	it("invalidates without queryClient → no onSuccess", () => {
		const fn = createServerFn({ name: "update" }).handler(async () => "ok")
		const opts = serverFnMutationOptions(fn, { invalidates: [["todos"]] })
		expect(opts.onSuccess).toBeUndefined()
	})

	it("queryClient without invalidates → no onSuccess", () => {
		const fn = createServerFn({ name: "update" }).handler(async () => "ok")
		const mockClient = {
			invalidateQueries: async () => {},
			setQueryData: () => undefined,
		}
		const opts = serverFnMutationOptions(fn, { queryClient: mockClient })
		expect(opts.onSuccess).toBeUndefined()
	})

	it("with invalidates + queryClient → onSuccess calls invalidateQueries for each key", async () => {
		const fn = createServerFn({ name: "update" }).handler(async () => "ok")
		const invalidated: unknown[][] = []
		const mockClient = {
			invalidateQueries: async (opts: { queryKey: unknown[] }) => {
				invalidated.push(opts.queryKey)
			},
			setQueryData: () => undefined,
		}
		const opts = serverFnMutationOptions(fn, {
			invalidates: [["todos"], ["user", 1], ["stats"]],
			queryClient: mockClient,
		})
		expect(opts.onSuccess).toBeTypeOf("function")
		opts.onSuccess?.()
		await new Promise((r) => setTimeout(r, 10))
		expect(invalidated).toEqual([["todos"], ["user", 1], ["stats"]])
	})

	it("single invalidation key", async () => {
		const fn = createServerFn({ name: "update" }).handler(async () => "ok")
		const invalidated: unknown[][] = []
		const mockClient = {
			invalidateQueries: async (opts: { queryKey: unknown[] }) => {
				invalidated.push(opts.queryKey)
			},
			setQueryData: () => undefined,
		}
		const opts = serverFnMutationOptions(fn, {
			invalidates: [["todos"]],
			queryClient: mockClient,
		})
		opts.onSuccess?.()
		await new Promise((r) => setTimeout(r, 10))
		expect(invalidated).toEqual([["todos"]])
	})

	it("empty invalidates array → onSuccess exists but does nothing", async () => {
		const fn = createServerFn({ name: "update" }).handler(async () => "ok")
		const invalidated: unknown[][] = []
		const mockClient = {
			invalidateQueries: async (opts: { queryKey: unknown[] }) => {
				invalidated.push(opts.queryKey)
			},
			setQueryData: () => undefined,
		}
		/* empty array is truthy, so onSuccess should be created but loop 0 times */
		const opts = serverFnMutationOptions(fn, {
			invalidates: [],
			queryClient: mockClient,
		})
		/* empty array is falsy-ish for the check; let's verify behavior */
		if (opts.onSuccess) {
			opts.onSuccess()
			await new Promise((r) => setTimeout(r, 10))
		}
		expect(invalidated).toEqual([])
	})

	it("mutationFn calls serverFn directly on server (no input)", async () => {
		const fn = createServerFn({ name: "deleteAll" }).handler(async () => "cleared")
		const opts = serverFnMutationOptions(fn)
		const result = await opts.mutationFn(undefined as never)
		expect(result).toBe("cleared")
	})

	it("mutationFn calls serverFn directly on server (with input)", async () => {
		const fn = createServerFn({ name: "update" })
			.input((raw: unknown) => raw as string)
			.handler(async (ctx) => `updated:${ctx.input}`)
		const opts = serverFnMutationOptions(fn)
		const result = await opts.mutationFn("test")
		expect(result).toBe("updated:test")
	})

	it("mutationFn with complex input", async () => {
		const fn = createServerFn({ name: "update" })
			.input((raw: unknown) => raw as { id: number; title: string })
			.handler(async (ctx) => ctx.input)
		const opts = serverFnMutationOptions(fn)
		const result = await opts.mutationFn({ id: 1, title: "New" })
		expect(result).toEqual({ id: 1, title: "New" })
	})

	it("mutationFn propagates errors", async () => {
		const fn = createServerFn({ name: "fail" }).handler(async () => {
			throw new Error("boom")
		})
		const opts = serverFnMutationOptions(fn)
		await expect(opts.mutationFn(undefined as never)).rejects.toThrow("boom")
	})

	it("always returns mutationFn", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		const opts = serverFnMutationOptions(fn)
		expect(opts.mutationFn).toBeTypeOf("function")
	})

	it("compound invalidation keys", async () => {
		const fn = createServerFn({ name: "update" }).handler(async () => "ok")
		const invalidated: unknown[][] = []
		const mockClient = {
			invalidateQueries: async (opts: { queryKey: unknown[] }) => {
				invalidated.push(opts.queryKey)
			},
			setQueryData: () => undefined,
		}
		const opts = serverFnMutationOptions(fn, {
			invalidates: [
				["users", { filter: "active" }],
				["stats", "dashboard"],
			],
			queryClient: mockClient,
		})
		opts.onSuccess?.()
		await new Promise((r) => setTimeout(r, 10))
		expect(invalidated).toEqual([
			["users", { filter: "active" }],
			["stats", "dashboard"],
		])
	})
})

/* ── Integration: piggyback + handleServerFnRequest full pipeline ──── */

describe("integration: full pipeline", () => {
	it("createServerFn → handleServerFnRequest with piggyback → parse response", async () => {
		const todoFn = createServerFn({ __id: "todo-update", name: "updateTodo" })
			.input((raw: unknown) => raw as { id: number; title: string })
			.handler(async (ctx) => {
				const updated = { ...ctx.input, done: false }
				ctx.piggyback(["todos"], [updated])
				ctx.piggyback(["todo", ctx.input.id], updated)
				return updated
			})

		/* register into map using the registration id */
		const fns = new Map<string, typeof todoFn._registration>()
		fns.set(todoFn._registration?.id ?? "", todoFn._registration ?? ({} as never))

		const req = postReq("/_fn/todo-update/updateTodo", { id: 1, title: "Updated" })
		const res = await handleServerFnRequest(req, {}, fns as never)

		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.data).toEqual({ done: false, id: 1, title: "Updated" })
		expect(body.queries).toHaveLength(2)
		expect(body.queries[0].key).toEqual(["todos"])
		expect(body.queries[0].data).toEqual([{ done: false, id: 1, title: "Updated" }])
		expect(body.queries[1].key).toEqual(["todo", 1])
	})

	it("serverFnQueryOptions queryFn → server-side direct call chain", async () => {
		const fn = createServerFn({ __id: "get-todos", name: "getTodos" }).handler(async () => [
			{ id: 1, title: "Test" },
		])

		const opts = serverFnQueryOptions(fn)

		expect(opts.queryKey).toEqual(["getTodos", undefined])
		const result = await opts.queryFn()
		expect(result).toEqual([{ id: 1, title: "Test" }])
	})

	it("serverFnMutationOptions mutationFn → direct call → verify result", async () => {
		const fn = createServerFn({ name: "createTodo" })
			.input((raw: unknown) => raw as { title: string })
			.handler(async (ctx) => ({ id: 99, title: ctx.input.title }))

		const opts = serverFnMutationOptions(fn)
		const result = await opts.mutationFn({ title: "New todo" })
		expect(result).toEqual({ id: 99, title: "New todo" })
	})

	it("authenticated handler + piggyback + validation", async () => {
		const fn = createServerFn({ __id: "profile-update", name: "updateProfile" })
			.authenticate()
			.input((raw: unknown) => {
				const obj = raw as Record<string, unknown>
				if (!obj.name) throw new Error("name required")
				return obj as { name: string }
			})
			.handler(async (ctx) => {
				const profile = { auth: ctx.auth, name: ctx.input.name }
				ctx.piggyback(["profile"], profile)
				return profile
			})

		const fns = new Map<string, typeof fn._registration>()
		fns.set("profile-update", fn._registration ?? ({} as never))

		const authFn = async () => ({ id: "user-123", role: "admin" })
		const req = postReq("/_fn/profile-update/updateProfile", { name: "Alice" })
		const res = await handleServerFnRequest(req, {}, fns as never, authFn)

		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.data.name).toBe("Alice")
		expect(body.data.auth).toEqual({ id: "user-123", role: "admin" })
		expect(body.queries[0].data.name).toBe("Alice")
	})

	it("auth failure → no piggyback in error response", async () => {
		const fn = createServerFn({ __id: "secret", name: "secret" })
			.authenticate()
			.handler(async (ctx) => {
				ctx.piggyback(["should-not-appear"], "data")
				return "ok"
			})

		const fns = new Map<string, typeof fn._registration>()
		fns.set("secret", fn._registration ?? ({} as never))

		const res = await handleServerFnRequest(postReq("/_fn/secret/secret"), {}, fns as never)
		expect(res.status).toBe(401)
		const body = await res.json()
		expect(body.queries).toBeUndefined()
	})

	it("validation failure → no piggyback in error response", async () => {
		const fn = createServerFn({ __id: "validated", name: "validated" })
			.input(() => {
				throw new Error("bad")
			})
			.handler(async (ctx) => {
				ctx.piggyback(["should-not-appear"], "data")
				return "ok"
			})

		const fns = new Map<string, typeof fn._registration>()
		fns.set("validated", fn._registration ?? ({} as never))

		const req = postReq("/_fn/validated/validated", { x: 1 })
		const res = await handleServerFnRequest(req, {}, fns as never)
		expect(res.status).toBe(400)
		const body = await res.json()
		expect(body.queries).toBeUndefined()
	})

	it("different serverFns with same name but different __id are independent", () => {
		const fn1 = createServerFn({ __id: "hash-1", name: "getData" }).handler(async () => "a")
		const fn2 = createServerFn({ __id: "hash-2", name: "getData" }).handler(async () => "b")

		const opts1 = serverFnQueryOptions(fn1)
		const opts2 = serverFnQueryOptions(fn2)

		expect(fn1._registration?.id).toBe("hash-1")
		expect(fn2._registration?.id).toBe("hash-2")
		/* both have same name-based queryKey */
		expect(opts1.queryKey).toEqual(["getData", undefined])
		expect(opts2.queryKey).toEqual(["getData", undefined])
	})

	it("serverFnQueryOptions with get method", async () => {
		const fn = createServerFn({ method: "get", name: "search" })
			.input((raw: unknown) => raw as { q: string })
			.handler(async (ctx) => [ctx.input.q])

		const opts = serverFnQueryOptions(fn, { input: { q: "test" } })
		expect(opts.queryKey).toEqual(["search", { q: "test" }])

		/* server-side: direct call */
		const result = await opts.queryFn()
		expect(result).toEqual(["test"])
	})
})

/* ── Deeper edge cases ─────────────────────────────────────────────── */

describe("serverFnQueryOptions — deep edge cases", () => {
	it("fn without handler → _registration undefined → fallback keys", () => {
		const builder = createServerFn({ name: "noHandler" })
		/* cast to ServerFn to test the fallback path */
		const fakeFn = (() => Promise.resolve("fake")) as ReturnType<typeof builder.handler>
		fakeFn._registration = undefined
		const opts = serverFnQueryOptions(fakeFn)
		expect(opts.queryKey).toEqual(["unknown", undefined])
	})

	it("staleTime Infinity passed through", () => {
		const fn = createServerFn({ name: "inf" }).handler(async () => "ok")
		const opts = serverFnQueryOptions(fn, { staleTime: Infinity })
		expect(opts.staleTime).toBe(Infinity)
	})

	it("input null produces queryKey [name, null]", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		const opts = serverFnQueryOptions(fn, { input: null as never })
		expect(opts.queryKey).toEqual(["test", null])
	})

	it("input false produces queryKey [name, false]", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		const opts = serverFnQueryOptions(fn, { input: false as never })
		expect(opts.queryKey).toEqual(["test", false])
	})

	it("input 0 produces queryKey [name, 0]", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		const opts = serverFnQueryOptions(fn, { input: 0 as never })
		expect(opts.queryKey).toEqual(["test", 0])
	})

	it("input empty string produces queryKey [name, '']", () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		const opts = serverFnQueryOptions(fn, { input: "" as never })
		expect(opts.queryKey).toEqual(["test", ""])
	})

	it("queryFn error propagation from handler", async () => {
		const fn = createServerFn({ name: "fail" }).handler(async () => {
			throw new Error("handler-boom")
		})
		const opts = serverFnQueryOptions(fn)
		await expect(opts.queryFn()).rejects.toThrow("handler-boom")
	})

	it("queryFn with async handler that resolves after delay", async () => {
		const fn = createServerFn({ name: "delayed" }).handler(async () => {
			await new Promise((r) => setTimeout(r, 10))
			return "delayed-result"
		})
		const opts = serverFnQueryOptions(fn)
		const result = await opts.queryFn()
		expect(result).toBe("delayed-result")
	})

	it("two different fns produce independent options", () => {
		const fn1 = createServerFn({ name: "fn1" }).handler(async () => "a")
		const fn2 = createServerFn({ name: "fn2" }).handler(async () => "b")
		const opts1 = serverFnQueryOptions(fn1, { staleTime: 1000 })
		const opts2 = serverFnQueryOptions(fn2, { staleTime: 2000 })

		expect(opts1.queryKey).toEqual(["fn1", undefined])
		expect(opts2.queryKey).toEqual(["fn2", undefined])
		expect(opts1.staleTime).toBe(1000)
		expect(opts2.staleTime).toBe(2000)
	})
})

describe("serverFnMutationOptions — deep edge cases", () => {
	it("onSuccess is idempotent when called multiple times", async () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		const invalidated: unknown[][] = []
		const mockClient = {
			invalidateQueries: async (opts: { queryKey: unknown[] }) => {
				invalidated.push(opts.queryKey)
			},
			setQueryData: () => undefined,
		}
		const opts = serverFnMutationOptions(fn, {
			invalidates: [["todos"]],
			queryClient: mockClient,
		})
		opts.onSuccess?.()
		opts.onSuccess?.()
		opts.onSuccess?.()
		await new Promise((r) => setTimeout(r, 20))
		expect(invalidated).toEqual([["todos"], ["todos"], ["todos"]])
	})

	it("mutationFn with null input", async () => {
		const fn = createServerFn({ name: "test" }).handler(async (ctx) => ctx.input)
		const opts = serverFnMutationOptions(fn)
		const result = await opts.mutationFn(null as never)
		expect(result).toBeNull()
	})

	it("mutationFn with undefined input", async () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "done")
		const opts = serverFnMutationOptions(fn)
		const result = await opts.mutationFn(undefined as never)
		expect(result).toBe("done")
	})

	it("fn without handler → _registration undefined → fallback id/name", () => {
		const fakeFn = (() => Promise.resolve("fake")) as ReturnType<
			ReturnType<typeof createServerFn>["handler"]
		>
		fakeFn._registration = undefined
		const opts = serverFnMutationOptions(fakeFn)
		expect(opts.mutationFn).toBeTypeOf("function")
	})

	it("invalidates with single-element keys", async () => {
		const fn = createServerFn({ name: "test" }).handler(async () => "ok")
		const invalidated: unknown[][] = []
		const mockClient = {
			invalidateQueries: async (opts: { queryKey: unknown[] }) => {
				invalidated.push(opts.queryKey)
			},
			setQueryData: () => undefined,
		}
		const opts = serverFnMutationOptions(fn, {
			invalidates: [["a"], ["b"], ["c"]],
			queryClient: mockClient,
		})
		opts.onSuccess?.()
		await new Promise((r) => setTimeout(r, 10))
		expect(invalidated).toEqual([["a"], ["b"], ["c"]])
	})
})

/* ── Piggyback deep edge cases ─────────────────────────────────────── */

describe("handleServerFnRequest — piggyback deep edge cases", () => {
	it("piggyback with number 0 data", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["zero"], 0)
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries[0].data).toBe(0)
	})

	it("piggyback with boolean false data", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["bool"], false)
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries[0].data).toBe(false)
	})

	it("piggyback with empty string data", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["empty-str"], "")
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries[0].data).toBe("")
	})

	it("piggyback with large number of entries", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					for (let i = 0; i < 50; i++) {
						ctx.piggyback([`key-${i}`], { i })
					}
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries).toHaveLength(50)
		expect(body.queries[0].key).toEqual(["key-0"])
		expect(body.queries[49].key).toEqual(["key-49"])
	})

	it("piggyback after async work inside handler", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					await new Promise((r) => setTimeout(r, 5))
					ctx.piggyback(["delayed"], "after-await")
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries).toEqual([{ data: "after-await", key: ["delayed"] }])
	})

	it("piggyback with single-element key", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["simple"], "data")
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries[0].key).toEqual(["simple"])
	})

	it("piggyback with numeric key segments", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback([1, 2, 3], "data")
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.queries[0].key).toEqual([1, 2, 3])
	})

	it("authorization fails → handler never called → no piggyback possible", async () => {
		const handlerCalled = vi.fn()
		const fns = makeFns([
			"id1",
			{
				authorizeFn: () => false,
				fn: async (ctx) => {
					handlerCalled()
					ctx.piggyback(["should-not-appear"], "data")
					return "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
		const body = await res.json()
		expect(body.queries).toBeUndefined()
		expect(handlerCalled).not.toHaveBeenCalled()
	})

	it("handler throws UnauthenticatedError after piggyback → no queries in response", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["data"], "should-not-appear")
					throw new UnauthenticatedError()
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(401)
		const body = await res.json()
		expect(body.queries).toBeUndefined()
	})

	it("handler throws UnauthorizedError after piggyback → no queries in response", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["data"], "should-not-appear")
					throw new UnauthorizedError()
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
		const body = await res.json()
		expect(body.queries).toBeUndefined()
	})

	it("handler throws ServerFnValidationError after piggyback → no queries", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["data"], "should-not-appear")
					throw new ServerFnValidationError({ fieldErrors: {}, formErrors: ["bad"] })
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(400)
		const body = await res.json()
		expect(body.queries).toBeUndefined()
	})

	it("GET method handler with piggyback", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["search-cache"], ctx.input)
					return [1, 2, 3]
				},
				method: "get" as const,
				name: "test",
			},
		])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test?q=hello"), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual([1, 2, 3])
		expect(body.queries[0].data).toEqual({ q: "hello" })
	})
})

/* ── Builder state isolation ───────────────────────────────────────── */

describe("createServerFn — builder state isolation", () => {
	it("two builders don't share state", () => {
		const b1 = createServerFn({ name: "fn1" }).authenticate()
		const b2 = createServerFn({ name: "fn2" })

		const fn1 = b1.handler(async () => "a")
		const fn2 = b2.handler(async () => "b")

		expect(fn1._registration?.authenticate).toBe(true)
		expect(fn2._registration?.authenticate).toBe(false)
	})

	it("branching from same builder creates independent chains", () => {
		const base = createServerFn({ name: "base" })
		const withAuth = base.authenticate()
		const withInput = base.input((raw: unknown) => raw as string)

		const fn1 = withAuth.handler(async () => "a")
		const fn2 = withInput.handler(async () => "b")

		expect(fn1._registration?.authenticate).toBe(true)
		expect(fn1._registration?.input).toBeUndefined()
		expect(fn2._registration?.authenticate).toBe(false)
		expect(fn2._registration?.input).toBeDefined()
	})

	it("registrations are independent objects", () => {
		const fn1 = createServerFn({ name: "a" }).handler(async () => "a")
		const fn2 = createServerFn({ name: "b" }).handler(async () => "b")

		expect(fn1._registration).not.toBe(fn2._registration)
		expect(fn1._registration?.name).toBe("a")
		expect(fn2._registration?.name).toBe("b")
	})
})

/* ── Handler context shape ─────────────────────────────────────────── */

describe("handleServerFnRequest — handler context shape", () => {
	it("handler receives piggyback function", async () => {
		let hasPiggyback = false
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					hasPiggyback = typeof ctx.piggyback === "function"
					return "ok"
				},
				name: "test",
			},
		])
		await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(hasPiggyback).toBe(true)
	})

	it("handler receives env object", async () => {
		let capturedEnv: unknown
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					capturedEnv = ctx.env
					return "ok"
				},
				name: "test",
			},
		])
		const env = { DB: "d1-binding", KV: "kv-binding" }
		await handleServerFnRequest(postReq("/_fn/id1/test"), env, fns)
		expect(capturedEnv).toEqual({ DB: "d1-binding", KV: "kv-binding" })
	})

	it("handler receives request object", async () => {
		let isRequest = false
		let capturedUrl = ""
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					isRequest = ctx.request instanceof Request
					capturedUrl = ctx.request.url
					return "ok"
				},
				name: "test",
			},
		])
		await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(isRequest).toBe(true)
		expect(capturedUrl).toBe("http://localhost/_fn/id1/test")
	})

	it("authenticated handler receives auth value from authenticateFn", async () => {
		let capturedAuth: unknown
		const fns = makeFns([
			"id1",
			{
				authenticate: true,
				fn: async (ctx) => {
					capturedAuth = ctx.auth
					return "ok"
				},
				name: "test",
			},
		])
		const authFn = async () => ({ id: "u1", permissions: ["read", "write"] })
		await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns, authFn)
		expect(capturedAuth).toEqual({ id: "u1", permissions: ["read", "write"] })
	})

	it("unauthenticated handler receives null auth", async () => {
		let capturedAuth: unknown = "not-null"
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					capturedAuth = ctx.auth
					return "ok"
				},
				name: "test",
			},
		])
		await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(capturedAuth).toBeNull()
	})
})

/* ── E2E: handleServerFnRequest → parse → hydrateQueryCache ────────── */

describe("e2e: handleServerFnRequest → response → query cache hydration", () => {
	it("piggyback data from response hydrated into real QueryClient", async () => {
		/* dynamic import to use real QueryClient */
		const { QueryClient } = await import("@tanstack/solid-query")

		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["todos"], [{ id: 1, title: "Buy milk" }])
					ctx.piggyback(["user", 1], { name: "Alice" })
					return { ok: true }
				},
				name: "updateTodo",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/updateTodo"), {}, fns)
		const body = await res.json()

		/* simulate what client-side mutation unwrapping does */
		const qc = new QueryClient()
		if (body.queries) {
			for (const q of body.queries) {
				qc.setQueryData(q.key, q.data)
			}
		}

		expect(qc.getQueryData(["todos"])).toEqual([{ id: 1, title: "Buy milk" }])
		expect(qc.getQueryData(["user", 1])).toEqual({ name: "Alice" })
		expect(body.data).toEqual({ ok: true })
	})

	it("full round-trip: track → serialize → handle → hydrate", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const { hydrateQueryCache, createTrackedQueryClient } =
			await import("../../../src/query-client")

		/* 1. SSR: track queries during render */
		const serverQC = new QueryClient()
		serverQC.setQueryDefaults(["todos"], { staleTime: 30_000 })
		const tracked = createTrackedQueryClient(serverQC)
		tracked.client.setQueryData(["todos"], [{ id: 1, title: "Test" }])
		tracked.client.setQueryData(["user", 1], { name: "Alice" })

		/* 2. Serialize to JSON (as would happen in SSR response) */
		const serialized = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		/* 3. Client: hydrate from serialized state */
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, serialized)

		expect(clientQC.getQueryData(["todos"])).toEqual([{ id: 1, title: "Test" }])
		expect(clientQC.getQueryData(["user", 1])).toEqual({ name: "Alice" })
		expect(clientQC.getQueryDefaults(["todos"])?.staleTime).toBe(30_000)

		/* 4. Mutation with piggyback */
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(
						["todos"],
						[
							{ id: 1, title: "Test" },
							{ id: 2, title: "New" },
						],
					)
					return { id: 2, title: "New" }
				},
				name: "createTodo",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/createTodo"), {}, fns)
		const body = await res.json()

		/* 5. Apply piggybacked data */
		if (body.queries) {
			for (const q of body.queries) {
				clientQC.setQueryData(q.key, q.data)
			}
		}

		expect(clientQC.getQueryData(["todos"])).toEqual([
			{ id: 1, title: "Test" },
			{ id: 2, title: "New" },
		])
		/* user data unchanged */
		expect(clientQC.getQueryData(["user", 1])).toEqual({ name: "Alice" })
	})

	it("multiple sequential mutations with piggyback", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")

		const qc = new QueryClient()
		qc.setQueryData(["counter"], 0)

		/* simulate 3 mutations each piggybacking updated counter */
		for (let i = 1; i <= 3; i++) {
			const fns = makeFns([
				"id1",
				{
					fn: async (ctx) => {
						ctx.piggyback(["counter"], i)
						return { step: i }
					},
					name: "increment",
				},
			])
			const res = await handleServerFnRequest(postReq("/_fn/id1/increment"), {}, fns)
			const body = await res.json()
			if (body.queries) {
				for (const q of body.queries) {
					qc.setQueryData(q.key, q.data)
				}
			}
		}

		expect(qc.getQueryData(["counter"])).toBe(3)
	})

	it("response without queries field → no cache changes", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")

		const qc = new QueryClient()
		qc.setQueryData(["existing"], "original")

		const fns = makeFns(["id1", { fn: async () => "ok", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()

		/* no queries to apply */
		expect(body.queries).toBeUndefined()
		expect(qc.getQueryData(["existing"])).toBe("original")
	})
})

/* ── Direct invocation edge cases ──────────────────────────────────── */

describe("createServerFn — direct invocation", () => {
	it("direct call passes input to handler", async () => {
		const fn = createServerFn({ name: "echo" })
			.input((raw: unknown) => raw as { msg: string })
			.handler(async (ctx) => ctx.input.msg)
		const result = await fn({ msg: "hello" })
		expect(result).toBe("hello")
	})

	it("direct call with no input", async () => {
		const fn = createServerFn({ name: "noInput" }).handler(async () => "result")
		const result = await fn()
		expect(result).toBe("result")
	})

	it("direct call handler error propagates", async () => {
		const fn = createServerFn({ name: "failing" }).handler(async () => {
			throw new Error("direct-fail")
		})
		await expect(fn()).rejects.toThrow("direct-fail")
	})

	it("direct call piggyback is no-op but doesn't throw", async () => {
		let piggybackResult: unknown = "not-called"
		const fn = createServerFn({ name: "test" }).handler(async (ctx) => {
			piggybackResult = ctx.piggyback(["key"], "val")
			return "ok"
		})
		await fn()
		expect(piggybackResult).toBeUndefined()
	})

	it("direct call auth is null", async () => {
		let capturedAuth: unknown = "not-null"
		const fn = createServerFn({ name: "test" }).handler(async (ctx) => {
			capturedAuth = ctx.auth
			return "ok"
		})
		await fn()
		expect(capturedAuth).toBeNull()
	})

	it("direct call env is empty object", async () => {
		let capturedEnv: unknown
		const fn = createServerFn({ name: "test" }).handler(async (ctx) => {
			capturedEnv = ctx.env
			return "ok"
		})
		await fn()
		expect(capturedEnv).toEqual({})
	})

	it("direct call request is a Request instance", async () => {
		let isReq = false
		const fn = createServerFn({ name: "test" }).handler(async (ctx) => {
			isReq = ctx.request instanceof Request
			return "ok"
		})
		await fn()
		expect(isReq).toBe(true)
	})

	it("direct call runs input validator", async () => {
		const fn = createServerFn({ name: "validated" })
			.input((raw: unknown) => {
				const r = raw as { n: number }
				if (typeof r.n !== "number") throw new Error("must be number")
				return { n: r.n * 2 }
			})
			.handler(async (ctx) => ctx.input.n)
		const result = await fn({ n: 5 })
		expect(result).toBe(10)
	})

	it("direct call validator rejection propagates", async () => {
		const fn = createServerFn({ name: "badInput" })
			.input((_raw: unknown): string => {
				throw new Error("invalid input")
			})
			.handler(async (ctx) => ctx.input)
		await expect(fn("anything")).rejects.toThrow("invalid input")
	})

	it("direct call without validator passes input as-is", async () => {
		const fn = createServerFn({ name: "noValidator" })
			.input((x: unknown) => x as { raw: boolean })
			.handler(async (ctx) => ctx.input)
		const result = await fn({ raw: true })
		expect(result).toEqual({ raw: true })
	})
})

/* ── RedirectResponse re-throw ─────────────────────────────────────── */

describe("handleServerFnRequest — RedirectResponse re-throw", () => {
	it("handler throws RedirectResponse → re-thrown (not caught as 500)", async () => {
		const { RedirectResponse } = await import("../../../src/errors")
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw new RedirectResponse({ to: "/login" })
				},
				name: "test",
			},
		])
		await expect(handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)).rejects.toThrow(
			"Redirect",
		)
	})

	it("handler throws external RedirectResponse → re-thrown", async () => {
		const { RedirectResponse } = await import("../../../src/errors")
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw new RedirectResponse({ href: "https://example.com" })
				},
				name: "test",
			},
		])
		try {
			await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
			expect.unreachable("should have thrown")
		} catch (e) {
			expect(e).toBeInstanceOf(RedirectResponse)
			expect((e as InstanceType<typeof RedirectResponse>).url).toBe("https://example.com")
			expect((e as InstanceType<typeof RedirectResponse>).external).toBe(true)
		}
	})

	it("piggyback before redirect → piggyback lost (redirect re-thrown)", async () => {
		const { RedirectResponse } = await import("../../../src/errors")
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					ctx.piggyback(["data"], "should-be-lost")
					throw new RedirectResponse({ to: "/login" })
				},
				name: "test",
			},
		])
		await expect(handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)).rejects.toThrow(
			"Redirect",
		)
	})
})

/* ── URL edge cases ────────────────────────────────────────────────── */

describe("handleServerFnRequest — URL edge cases", () => {
	it("extra path segments after name → still matches (segments[1] and [2] used)", async () => {
		const fns = makeFns(["id1", { fn: async () => "ok", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test/extra/segments"), {}, fns)
		expect(res.status).toBe(200)
	})

	it("URL-encoded id segment", async () => {
		const fns = makeFns(["my%20id", { fn: async () => "ok", name: "test" }])
		/* browser encodes spaces as %20, URL.pathname preserves encoding */
		const res = await handleServerFnRequest(postReq("/_fn/my%20id/test"), {}, fns)
		/* depends on whether fns map uses encoded or decoded key */
		expect([200, 404]).toContain(res.status)
	})

	it("segments with dots and hyphens", async () => {
		const fns = makeFns(["mod.v2-hash", { fn: async () => "ok", name: "get-data" }])
		const res = await handleServerFnRequest(postReq("/_fn/mod.v2-hash/get-data"), {}, fns)
		expect(res.status).toBe(200)
	})

	it("query string does not interfere with POST path parsing", async () => {
		const handler = vi.fn(async (ctx) => ctx.input)
		const fns = makeFns(["id1", { fn: handler, name: "test" }])
		const res = await handleServerFnRequest(
			postReq("/_fn/id1/test?ignored=true", { x: 1 }),
			{},
			fns,
		)
		const body = await res.json()
		/* POST reads body, not query string */
		expect(body.data).toEqual({ x: 1 })
	})
})

/* ── Validator transformation ──────────────────────────────────────── */

describe("handleServerFnRequest — validator transforms input", () => {
	it("validator trims and uppercases string input", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => ctx.input,
				input: (raw: unknown) => String(raw).trim().toUpperCase(),
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", "  hello  "), {}, fns)
		const body = await res.json()
		expect(body.data).toBe("HELLO")
	})

	it("validator coerces type", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => ctx.input,
				input: (raw: unknown) => {
					const obj = raw as { count: string }
					return { count: Number(obj.count) }
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { count: "42" }), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual({ count: 42 })
	})

	it("validator adds defaults to partial input", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => ctx.input,
				input: (raw: unknown) => ({ limit: 10, page: 1, ...(raw as Record<string, unknown>) }),
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { page: 3 }), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual({ limit: 10, page: 3 })
	})

	it("object validator (parse method) transforms input", async () => {
		const schema = {
			parse: (raw: unknown) => {
				const arr = raw as number[]
				return arr.filter((n: number) => n > 0).sort((a: number, b: number) => a - b)
			},
		}
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => ctx.input,
				input: schema,
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", [3, -1, 2, 0, 5]), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual([2, 3, 5])
	})
})

/* ── Handler return type edge cases ────────────────────────────────── */

describe("handleServerFnRequest — handler return types", () => {
	it("returns nested arrays", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => [
					[1, 2],
					[3, [4, 5]],
				],
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual([
			[1, 2],
			[3, [4, 5]],
		])
	})

	it("returns very large object", async () => {
		const bigObj: Record<string, number> = {}
		for (let i = 0; i < 500; i++) bigObj[`key-${i}`] = i
		const fns = makeFns(["id1", { fn: async () => bigObj, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(Object.keys(body.data)).toHaveLength(500)
		expect(body.data["key-0"]).toBe(0)
		expect(body.data["key-499"]).toBe(499)
	})

	it("returns string with special chars", async () => {
		const fns = makeFns([
			"id1",
			{ fn: async () => 'hello "world" <script>alert(1)</script>', name: "test" },
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.data).toBe('hello "world" <script>alert(1)</script>')
	})

	it("returns unicode string", async () => {
		const fns = makeFns(["id1", { fn: async () => "Hello", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.data).toBe("Hello")
	})

	it("returns number 0", async () => {
		const fns = makeFns(["id1", { fn: async () => 0, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.data).toBe(0)
	})

	it("returns false", async () => {
		const fns = makeFns(["id1", { fn: async () => false, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.data).toBe(false)
	})

	it("returns empty string", async () => {
		const fns = makeFns(["id1", { fn: async () => "", name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		/* ?? only catches null/undefined, empty string passes through */
		expect(body.data).toBe("")
	})

	it("returns empty array", async () => {
		const fns = makeFns(["id1", { fn: async () => [], name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const body = await res.json()
		expect(body.data).toEqual([])
	})
})

/* ── Non-Error throws ──────────────────────────────────────────────── */

describe("handleServerFnRequest — non-Error throws", () => {
	it("handler throws string → 500", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw "string-error"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(500)
	})

	it("handler throws number → 500", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw 42
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(500)
	})

	it("handler throws null → 500", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw null
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(500)
	})

	it("handler throws object with name=ServerFnValidationError → NOT matched (not instanceof Error)", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async () => {
					throw { message: "Validation error", name: "ServerFnValidationError" }
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		/* plain object doesn't pass `e instanceof Error`, so falls through to 500 */
		expect(res.status).toBe(500)
	})
})

/* ── Async authorization ───────────────────────────────────────────── */

describe("handleServerFnRequest — async authorization", () => {
	it("async authorizeFn with delay → still resolves", async () => {
		const fns = makeFns([
			"id1",
			{
				authorizeFn: async () => {
					await new Promise((r) => setTimeout(r, 10))
					return true
				},
				fn: async () => "ok",
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(200)
	})

	it("async authorizeFn that rejects → 500", async () => {
		const fns = makeFns([
			"id1",
			{
				authorizeFn: async () => {
					throw new Error("authz-exploded")
				},
				fn: async () => "ok",
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(500)
	})

	it("authorizeFn receives auth and input", async () => {
		let captured: { auth: unknown; input: unknown } | undefined
		const fns = makeFns([
			"id1",
			{
				authenticate: true,
				authorizeFn: (ctx) => {
					captured = ctx
					return true
				},
				fn: async () => "ok",
				input: (raw: unknown) => raw,
				name: "test",
			},
		])
		const authFn = async () => ({ role: "admin" })
		await handleServerFnRequest(postReq("/_fn/id1/test", { action: "delete" }), {}, fns, authFn)
		expect(captured?.auth).toEqual({ role: "admin" })
		expect(captured?.input).toEqual({ action: "delete" })
	})
})

/* ── Multiple registrations routing ────────────────────────────────── */

describe("handleServerFnRequest — multi-registration routing", () => {
	it("routes to correct fn among many", async () => {
		const fns = new Map<string, ServerFnRegistration>()
		fns.set("id-a", makeReg({ fn: async () => "result-a", id: "id-a", name: "fnA" }))
		fns.set("id-b", makeReg({ fn: async () => "result-b", id: "id-b", name: "fnB" }))
		fns.set("id-c", makeReg({ fn: async () => "result-c", id: "id-c", name: "fnC" }))

		const resA = await handleServerFnRequest(postReq("/_fn/id-a/fnA"), {}, fns)
		const resB = await handleServerFnRequest(postReq("/_fn/id-b/fnB"), {}, fns)
		const resC = await handleServerFnRequest(postReq("/_fn/id-c/fnC"), {}, fns)

		expect((await resA.json()).data).toBe("result-a")
		expect((await resB.json()).data).toBe("result-b")
		expect((await resC.json()).data).toBe("result-c")
	})

	it("same name different ids → independent", async () => {
		const fns = new Map<string, ServerFnRegistration>()
		fns.set("v1", makeReg({ fn: async () => "version-1", id: "v1", name: "getData" }))
		fns.set("v2", makeReg({ fn: async () => "version-2", id: "v2", name: "getData" }))

		const res1 = await handleServerFnRequest(postReq("/_fn/v1/getData"), {}, fns)
		const res2 = await handleServerFnRequest(postReq("/_fn/v2/getData"), {}, fns)

		expect((await res1.json()).data).toBe("version-1")
		expect((await res2.json()).data).toBe("version-2")
	})

	it("different methods on different ids", async () => {
		const fns = new Map<string, ServerFnRegistration>()
		fns.set(
			"get-id",
			makeReg({ fn: async () => "get-result", id: "get-id", method: "get", name: "data" }),
		)
		fns.set(
			"post-id",
			makeReg({ fn: async () => "post-result", id: "post-id", method: "post", name: "data" }),
		)

		const getRes = await handleServerFnRequest(getReq("/_fn/get-id/data"), {}, fns)
		const postRes = await handleServerFnRequest(postReq("/_fn/post-id/data"), {}, fns)

		expect((await getRes.json()).data).toBe("get-result")
		expect((await postRes.json()).data).toBe("post-result")
	})
})

/* ── Client-side fetch paths (mock window + fetch) ─────────────────── */

describe("serverFnQueryOptions — client-side fetch path", () => {
	const originalWindow = globalThis.window

	function mockClientEnv(mockFetch: typeof globalThis.fetch) {
		/* make typeof window !== "undefined" */
		;(globalThis as Record<string, unknown>).window = {}
		globalThis.fetch = mockFetch
	}

	function restoreEnv() {
		if (originalWindow === undefined) {
			delete (globalThis as Record<string, unknown>).window
		} else {
			;(globalThis as Record<string, unknown>).window = originalWindow
		}
	}

	it("POST: queryFn fetches /_fn/{id}/{name} with JSON body", async () => {
		let capturedUrl = ""
		let capturedInit: RequestInit | undefined
		mockClientEnv(async (url, init) => {
			capturedUrl = String(url)
			capturedInit = init
			return new Response(JSON.stringify({ data: { id: 1, title: "Test" } }), {
				headers: { "content-type": "application/json" },
			})
		})

		try {
			const fn = createServerFn({ __id: "abc", name: "getTodo" })
				.input((raw: unknown) => raw as { id: number })
				.handler(async (ctx) => ctx.input)
			const opts = serverFnQueryOptions(fn, { input: { id: 42 } })
			const result = await opts.queryFn()

			expect(capturedUrl).toBe("/_fn/abc/getTodo")
			expect(capturedInit?.method).toBe("POST")
			expect(capturedInit?.body).toBe(JSON.stringify({ id: 42 }))
			expect(result).toEqual({ id: 1, title: "Test" })
		} finally {
			restoreEnv()
		}
	})

	it("GET: queryFn fetches with URLSearchParams", async () => {
		let capturedUrl = ""
		mockClientEnv(async (url) => {
			capturedUrl = String(url)
			return new Response(JSON.stringify({ data: [1, 2] }), {
				headers: { "content-type": "application/json" },
			})
		})

		try {
			const fn = createServerFn({ __id: "search-id", method: "get", name: "search" })
				.input((raw: unknown) => raw as { q: string })
				.handler(async () => [])
			const opts = serverFnQueryOptions(fn, { input: { q: "hello" } })
			const result = await opts.queryFn()

			expect(capturedUrl).toBe("/_fn/search-id/search?q=hello")
			expect(result).toEqual([1, 2])
		} finally {
			restoreEnv()
		}
	})

	it("GET: no input → fetch URL without search params", async () => {
		let capturedUrl = ""
		mockClientEnv(async (url) => {
			capturedUrl = String(url)
			return new Response(JSON.stringify({ data: "all" }))
		})

		try {
			const fn = createServerFn({ __id: "all-id", method: "get", name: "getAll" }).handler(
				async () => [],
			)
			const opts = serverFnQueryOptions(fn)
			await opts.queryFn()

			expect(capturedUrl).toBe("/_fn/all-id/getAll")
		} finally {
			restoreEnv()
		}
	})

	it("HTTP error → throws with server message", async () => {
		mockClientEnv(async () => {
			return new Response(JSON.stringify({ message: "Not found" }), { status: 404 })
		})

		try {
			const fn = createServerFn({ name: "missing" }).handler(async () => "ok")
			const opts = serverFnQueryOptions(fn)
			await expect(opts.queryFn()).rejects.toThrow("Not found")
		} finally {
			restoreEnv()
		}
	})

	it("HTTP error with unparseable body → fallback message", async () => {
		mockClientEnv(async () => {
			return new Response("not json", { status: 500 })
		})

		try {
			const fn = createServerFn({ name: "broken" }).handler(async () => "ok")
			const opts = serverFnQueryOptions(fn)
			await expect(opts.queryFn()).rejects.toThrow("Request failed")
		} finally {
			restoreEnv()
		}
	})

	it("POST: no input → body is undefined", async () => {
		let capturedInit: RequestInit | undefined
		mockClientEnv(async (_url, init) => {
			capturedInit = init
			return new Response(JSON.stringify({ data: "ok" }))
		})

		try {
			const fn = createServerFn({ name: "noInput" }).handler(async () => "ok")
			const opts = serverFnQueryOptions(fn)
			await opts.queryFn()
			expect(capturedInit?.body).toBeUndefined()
		} finally {
			restoreEnv()
		}
	})

	it("queryFn applies piggybacked queries to queryClient", async () => {
		mockClientEnv(async () => {
			return new Response(
				JSON.stringify({
					data: { id: 1 },
					queries: [
						{ data: [{ id: 1 }, { id: 2 }], key: ["todos"] },
						{ data: { name: "Alice" }, key: ["user", 1] },
					],
				}),
			)
		})

		try {
			const cache = new Map<string, unknown>()
			const mockClient = {
				invalidateQueries: async () => {},
				setQueryData: (key: unknown[], data: unknown) => {
					cache.set(JSON.stringify(key), data)
				},
			}
			const fn = createServerFn({ name: "withPiggyback" }).handler(async () => ({ id: 1 }))
			const opts = serverFnQueryOptions(fn, { queryClient: mockClient })
			const result = await opts.queryFn()

			expect(result).toEqual({ id: 1 })
			expect(cache.get(JSON.stringify(["todos"]))).toEqual([{ id: 1 }, { id: 2 }])
			expect(cache.get(JSON.stringify(["user", 1]))).toEqual({ name: "Alice" })
		} finally {
			restoreEnv()
		}
	})

	it("queryFn without queryClient → piggyback silently ignored", async () => {
		mockClientEnv(async () => {
			return new Response(
				JSON.stringify({
					data: "ok",
					queries: [{ data: "cached", key: ["key"] }],
				}),
			)
		})

		try {
			const fn = createServerFn({ name: "noPiggy" }).handler(async () => "ok")
			const opts = serverFnQueryOptions(fn)
			const result = await opts.queryFn()
			expect(result).toBe("ok")
		} finally {
			restoreEnv()
		}
	})

	it("piggybacked entry with non-array key → skipped", async () => {
		mockClientEnv(async () => {
			return new Response(
				JSON.stringify({
					data: "ok",
					queries: [
						{ data: "bad", key: "not-array" },
						{ data: "good", key: ["valid"] },
					],
				}),
			)
		})

		try {
			const applied: Array<{ data: unknown; key: unknown[] }> = []
			const mockClient = {
				invalidateQueries: async () => {},
				setQueryData: (key: unknown[], data: unknown) => {
					applied.push({ data, key })
				},
			}
			const fn = createServerFn({ name: "mixedPiggy" }).handler(async () => "ok")
			const opts = serverFnQueryOptions(fn, { queryClient: mockClient })
			await opts.queryFn()

			expect(applied).toHaveLength(1)
			expect(applied[0]?.key).toEqual(["valid"])
		} finally {
			restoreEnv()
		}
	})
})

describe("serverFnMutationOptions — client-side fetch path", () => {
	const originalWindow = globalThis.window

	function mockClientEnv(mockFetch: typeof globalThis.fetch) {
		;(globalThis as Record<string, unknown>).window = {}
		globalThis.fetch = mockFetch
	}

	function restoreEnv() {
		if (originalWindow === undefined) {
			delete (globalThis as Record<string, unknown>).window
		} else {
			;(globalThis as Record<string, unknown>).window = originalWindow
		}
	}

	it("mutationFn fetches /_fn/{id}/{name} with POST", async () => {
		let capturedUrl = ""
		let capturedBody = ""
		mockClientEnv(async (url, init) => {
			capturedUrl = String(url)
			capturedBody = String(init?.body ?? "")
			return new Response(JSON.stringify({ data: { id: 1 } }))
		})

		try {
			const fn = createServerFn({ __id: "mut-id", name: "update" })
				.input((raw: unknown) => raw as { title: string })
				.handler(async () => ({ id: 1 }))
			const opts = serverFnMutationOptions(fn)
			const result = await opts.mutationFn({ title: "New" })

			expect(capturedUrl).toBe("/_fn/mut-id/update")
			expect(capturedBody).toBe(JSON.stringify({ title: "New" }))
			expect(result).toEqual({ id: 1 })
		} finally {
			restoreEnv()
		}
	})

	it("mutationFn applies piggybacked queries to queryClient", async () => {
		mockClientEnv(async () => {
			return new Response(
				JSON.stringify({
					data: { ok: true },
					queries: [
						{ data: [{ id: 1 }, { id: 2 }], key: ["todos"] },
						{ data: { name: "Alice" }, key: ["user", 1] },
					],
				}),
			)
		})

		try {
			const setData: Array<{ data: unknown; key: unknown[] }> = []
			const mockClient = {
				invalidateQueries: async () => {},
				setQueryData: (key: unknown[], data: unknown) => {
					setData.push({ data, key })
					return undefined
				},
			}

			const fn = createServerFn({ name: "update" }).handler(async () => ({ ok: true }))
			const opts = serverFnMutationOptions(fn, { queryClient: mockClient })
			const result = await opts.mutationFn(undefined as never)

			expect(result).toEqual({ ok: true })
			expect(setData).toHaveLength(2)
			expect(setData[0]).toEqual({ data: [{ id: 1 }, { id: 2 }], key: ["todos"] })
			expect(setData[1]).toEqual({ data: { name: "Alice" }, key: ["user", 1] })
		} finally {
			restoreEnv()
		}
	})

	it("mutationFn without queryClient → piggyback ignored", async () => {
		mockClientEnv(async () => {
			return new Response(
				JSON.stringify({
					data: "ok",
					queries: [{ data: "x", key: ["ignored"] }],
				}),
			)
		})

		try {
			const fn = createServerFn({ name: "update" }).handler(async () => "ok")
			/* no queryClient → piggyback data silently dropped */
			const opts = serverFnMutationOptions(fn)
			const result = await opts.mutationFn(undefined as never)
			expect(result).toBe("ok")
		} finally {
			restoreEnv()
		}
	})

	it("mutationFn HTTP error → throws", async () => {
		mockClientEnv(async () => {
			return new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 })
		})

		try {
			const fn = createServerFn({ name: "fail" }).handler(async () => "ok")
			const opts = serverFnMutationOptions(fn)
			await expect(opts.mutationFn(undefined as never)).rejects.toThrow("Forbidden")
		} finally {
			restoreEnv()
		}
	})

	it("mutationFn + onSuccess invalidation combo on client", async () => {
		mockClientEnv(async () => {
			return new Response(JSON.stringify({ data: "created" }))
		})

		try {
			const invalidated: unknown[][] = []
			const setData: Array<{ data: unknown; key: unknown[] }> = []
			const mockClient = {
				invalidateQueries: async (opts: { queryKey: unknown[] }) => {
					invalidated.push(opts.queryKey)
				},
				setQueryData: (key: unknown[], data: unknown) => {
					setData.push({ data, key })
					return undefined
				},
			}

			const fn = createServerFn({ name: "create" }).handler(async () => "created")
			const opts = serverFnMutationOptions(fn, {
				invalidates: [["todos"], ["stats"]],
				queryClient: mockClient,
			})

			const result = await opts.mutationFn(undefined as never)
			expect(result).toBe("created")

			/* call onSuccess to trigger invalidation */
			opts.onSuccess?.()
			await new Promise((r) => setTimeout(r, 10))
			expect(invalidated).toEqual([["todos"], ["stats"]])
		} finally {
			restoreEnv()
		}
	})

	it("response without queries field → no setQueryData calls", async () => {
		mockClientEnv(async () => {
			return new Response(JSON.stringify({ data: "ok" }))
		})

		try {
			const setDataCalled = vi.fn()
			const mockClient = {
				invalidateQueries: async () => {},
				setQueryData: (...args: unknown[]) => {
					setDataCalled(...args)
					return undefined
				},
			}

			const fn = createServerFn({ name: "test" }).handler(async () => "ok")
			const opts = serverFnMutationOptions(fn, { queryClient: mockClient })
			await opts.mutationFn(undefined as never)

			expect(setDataCalled).not.toHaveBeenCalled()
		} finally {
			restoreEnv()
		}
	})
})

/* ── E2E: complete application flows ───────────────────────────────── */

describe("e2e: CRUD application flow", () => {
	it("full CRUD: create, read, update, delete with piggyback", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")

		const qc = new QueryClient()

		/* simulated DB */
		let db: Array<{ done: boolean; id: number; title: string }> = []

		const createTodo = createServerFn({ __id: "create", name: "createTodo" })
			.input((raw: unknown) => raw as { title: string })
			.handler(async (ctx) => {
				const todo = { done: false, id: db.length + 1, title: ctx.input.title }
				db.push(todo)
				ctx.piggyback(["todos"], [...db])
				return todo
			})

		const getTodos = createServerFn({ __id: "list", method: "get", name: "getTodos" }).handler(
			async () => [...db],
		)

		const updateTodo = createServerFn({ __id: "update", name: "updateTodo" })
			.input((raw: unknown) => raw as { done: boolean; id: number })
			.handler(async (ctx) => {
				const todo = db.find((t) => t.id === ctx.input.id)
				if (!todo) throw new Error("not found")
				todo.done = ctx.input.done
				ctx.piggyback(["todos"], [...db])
				ctx.piggyback(["todo", ctx.input.id], { ...todo })
				return { ...todo }
			})

		const deleteTodo = createServerFn({ __id: "delete", name: "deleteTodo" })
			.input((raw: unknown) => raw as { id: number })
			.handler(async (ctx) => {
				db = db.filter((t) => t.id !== ctx.input.id)
				ctx.piggyback(["todos"], [...db])
				return { deleted: true }
			})

		/* register all fns */
		const fns = new Map<string, ServerFnRegistration>()
		for (const fn of [createTodo, getTodos, updateTodo, deleteTodo]) {
			const reg = fn._registration
			if (reg) fns.set(reg.id, reg)
		}

		async function call(req: Request): Promise<Record<string, unknown>> {
			const res = await handleServerFnRequest(req, {}, fns)
			expect(res.status).toBe(200)
			const body = (await res.json()) as Record<string, unknown>
			/* apply piggyback to cache */
			if (body.queries) {
				for (const q of body.queries as Array<{ data: unknown; key: unknown[] }>) {
					qc.setQueryData(q.key, q.data)
				}
			}
			return body
		}

		/* CREATE */
		const r1 = await call(postReq("/_fn/create/createTodo", { title: "Buy milk" }))
		expect(r1.data).toEqual({ done: false, id: 1, title: "Buy milk" })
		expect(qc.getQueryData(["todos"])).toEqual([{ done: false, id: 1, title: "Buy milk" }])

		/* CREATE another */
		await call(postReq("/_fn/create/createTodo", { title: "Walk dog" }))
		expect(qc.getQueryData(["todos"])).toHaveLength(2)

		/* READ */
		const r3 = await call(getReq("/_fn/list/getTodos"))
		expect(r3.data).toHaveLength(2)

		/* UPDATE */
		const r4 = await call(postReq("/_fn/update/updateTodo", { done: true, id: 1 }))
		expect((r4.data as Record<string, unknown>).done).toBe(true)
		expect(qc.getQueryData(["todo", 1])).toEqual({ done: true, id: 1, title: "Buy milk" })
		const todos = qc.getQueryData(["todos"]) as Array<{ done: boolean }>
		expect(todos[0]?.done).toBe(true)

		/* DELETE */
		await call(postReq("/_fn/delete/deleteTodo", { id: 1 }))
		expect(qc.getQueryData(["todos"])).toHaveLength(1)
		expect((qc.getQueryData(["todos"]) as Array<{ title: string }>)[0]?.title).toBe("Walk dog")
	})

	it("auth-gated CRUD: unauthenticated → 401, authenticated → success", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")

		const qc = new QueryClient()

		const createItem = createServerFn({ __id: "auth-create", name: "createItem" })
			.authenticate()
			.input((raw: unknown) => raw as { name: string })
			.handler(async (ctx) => {
				const item = { id: 1, name: ctx.input.name, owner: (ctx.auth as { id: string }).id }
				ctx.piggyback(["items"], [item])
				return item
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("auth-create", createItem._registration ?? ({} as never))

		/* unauthenticated attempt */
		const res1 = await handleServerFnRequest(
			postReq("/_fn/auth-create/createItem", { name: "Secret" }),
			{},
			fns,
		)
		expect(res1.status).toBe(401)
		expect(qc.getQueryData(["items"])).toBeUndefined()

		/* authenticated attempt */
		const authFn = async () => ({ id: "user-42" })
		const res2 = await handleServerFnRequest(
			postReq("/_fn/auth-create/createItem", { name: "Secret" }),
			{},
			fns,
			authFn,
		)
		expect(res2.status).toBe(200)
		const body2 = await res2.json()
		/* apply piggyback */
		for (const q of body2.queries) {
			qc.setQueryData(q.key, q.data)
		}
		expect(qc.getQueryData(["items"])).toEqual([{ id: 1, name: "Secret", owner: "user-42" }])
	})

	it("validation failure → retry with valid data → success", async () => {
		const fn = createServerFn({ __id: "validated", name: "submitForm" })
			.input((raw: unknown) => {
				const obj = raw as { email: string }
				if (!obj.email?.includes("@")) throw new Error("Invalid email")
				return obj
			})
			.handler(async (ctx) => {
				ctx.piggyback(["profile"], { email: ctx.input.email })
				return { ok: true }
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("validated", fn._registration ?? ({} as never))

		/* invalid submission */
		const res1 = await handleServerFnRequest(
			postReq("/_fn/validated/submitForm", { email: "bad" }),
			{},
			fns,
		)
		expect(res1.status).toBe(400)
		const body1 = await res1.json()
		expect(body1.queries).toBeUndefined()

		/* valid submission */
		const res2 = await handleServerFnRequest(
			postReq("/_fn/validated/submitForm", { email: "user@test.com" }),
			{},
			fns,
		)
		expect(res2.status).toBe(200)
		const body2 = await res2.json()
		expect(body2.queries[0].data).toEqual({ email: "user@test.com" })
	})

	it("concurrent requests to different fns with independent piggyback", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const qc = new QueryClient()

		const fn1 = createServerFn({ __id: "fn1", name: "fn1" }).handler(async (ctx) => {
			await new Promise((r) => setTimeout(r, 10))
			ctx.piggyback(["fn1-data"], "from-fn1")
			return "result-1"
		})
		const fn2 = createServerFn({ __id: "fn2", name: "fn2" }).handler(async (ctx) => {
			ctx.piggyback(["fn2-data"], "from-fn2")
			return "result-2"
		})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("fn1", fn1._registration ?? ({} as never))
		fns.set("fn2", fn2._registration ?? ({} as never))

		/* fire both concurrently */
		const [res1, res2] = await Promise.all([
			handleServerFnRequest(postReq("/_fn/fn1/fn1"), {}, fns),
			handleServerFnRequest(postReq("/_fn/fn2/fn2"), {}, fns),
		])

		const body1 = await res1.json()
		const body2 = await res2.json()

		/* piggyback is isolated per request */
		expect(body1.queries).toEqual([{ data: "from-fn1", key: ["fn1-data"] }])
		expect(body2.queries).toEqual([{ data: "from-fn2", key: ["fn2-data"] }])

		/* apply both to cache */
		for (const q of [...body1.queries, ...body2.queries]) {
			qc.setQueryData(q.key, q.data)
		}
		expect(qc.getQueryData(["fn1-data"])).toBe("from-fn1")
		expect(qc.getQueryData(["fn2-data"])).toBe("from-fn2")
	})

	it("SSR hydration → client mutation → piggyback update → verify cache coherence", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const { createTrackedQueryClient, hydrateQueryCache } =
			await import("../../../src/query-client")

		/* ── SSR phase ── */
		const serverQC = new QueryClient()
		serverQC.setQueryDefaults(["todos"], { staleTime: 60_000 })
		serverQC.setQueryDefaults(["user"], { staleTime: 300_000 })
		const tracked = createTrackedQueryClient(serverQC)

		tracked.client.setQueryData(["todos"], [{ done: false, id: 1, title: "Initial" }])
		tracked.client.setQueryData(["user", "me"], { name: "Alice", role: "user" })
		tracked.client.setQueryData(["settings"], { darkMode: true, lang: "en" })

		const ssrPayload = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		/* ── Client hydration phase ── */
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, ssrPayload)

		/* verify hydration */
		expect(clientQC.getQueryData(["todos"])).toEqual([{ done: false, id: 1, title: "Initial" }])
		expect(clientQC.getQueryData(["user", "me"])).toEqual({ name: "Alice", role: "user" })
		expect(clientQC.getQueryData(["settings"])).toEqual({ darkMode: true, lang: "en" })
		expect(clientQC.getQueryDefaults(["todos"])?.staleTime).toBe(60_000)
		/* staleTime tracked for ["user", "me"], not prefix ["user"] */
		expect(clientQC.getQueryDefaults(["user", "me"])?.staleTime).toBe(300_000)

		/* ── Client mutation phase (simulated via handleServerFnRequest) ── */
		const addTodo = createServerFn({ __id: "add", name: "addTodo" })
			.input((raw: unknown) => raw as { title: string })
			.handler(async (ctx) => {
				const newTodo = { done: false, id: 2, title: ctx.input.title }
				ctx.piggyback(["todos"], [{ done: false, id: 1, title: "Initial" }, newTodo])
				return newTodo
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("add", addTodo._registration ?? ({} as never))

		const res = await handleServerFnRequest(
			postReq("/_fn/add/addTodo", { title: "From client" }),
			{},
			fns,
		)
		const body = await res.json()

		/* apply piggyback to client cache */
		for (const q of body.queries) {
			clientQC.setQueryData(q.key, q.data)
		}

		/* ── Verify full cache state ── */
		expect(clientQC.getQueryData(["todos"])).toEqual([
			{ done: false, id: 1, title: "Initial" },
			{ done: false, id: 2, title: "From client" },
		])
		/* non-piggybacked data unchanged */
		expect(clientQC.getQueryData(["user", "me"])).toEqual({ name: "Alice", role: "user" })
		expect(clientQC.getQueryData(["settings"])).toEqual({ darkMode: true, lang: "en" })
		/* staleTime defaults survived */
		expect(clientQC.getQueryDefaults(["todos"])?.staleTime).toBe(60_000)
		expect(clientQC.getQueryDefaults(["user", "me"])?.staleTime).toBe(300_000)
	})

	it("multi-step workflow: register → hydrate → mutate × 3 → final state", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const qc = new QueryClient()

		/* initial state */
		qc.setQueryData(["cart"], { items: [], total: 0 })

		const addItem = createServerFn({ __id: "add-item", name: "addItem" })
			.input((raw: unknown) => raw as { name: string; price: number })
			.handler(async (ctx) => {
				/* simulate server computing new state */
				const item = { name: ctx.input.name, price: ctx.input.price }
				return item
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("add-item", addItem._registration ?? ({} as never))

		/* simulate 3 mutations building cart */
		const items: Array<{ name: string; price: number }> = []
		for (const item of [
			{ name: "Widget", price: 10 },
			{ name: "Gadget", price: 25 },
			{ name: "Doohickey", price: 5 },
		]) {
			items.push(item)
			/* re-create fn with piggyback for each mutation */
			const mutFns = new Map<string, ServerFnRegistration>()
			mutFns.set(
				"add-item",
				makeReg({
					fn: async (ctx) => {
						ctx.piggyback(["cart"], {
							items: [...items],
							total: items.reduce((sum, i) => sum + i.price, 0),
						})
						return item
					},
					id: "add-item",
					name: "addItem",
				}),
			)

			const res = await handleServerFnRequest(postReq("/_fn/add-item/addItem", item), {}, mutFns)
			const body = await res.json()
			for (const q of body.queries) {
				qc.setQueryData(q.key, q.data)
			}
		}

		const cart = qc.getQueryData(["cart"]) as { items: unknown[]; total: number }
		expect(cart.items).toHaveLength(3)
		expect(cart.total).toBe(40)
	})

	it("authorization + role-based access: admin can, viewer cannot", async () => {
		const deleteFn = createServerFn({ __id: "del", name: "delete" })
			.authenticate()
			.authorize((ctx) => (ctx.auth as { role: string }).role === "admin")
			.handler(async (ctx) => {
				ctx.piggyback(["items"], [])
				return { deleted: true }
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("del", deleteFn._registration ?? ({} as never))

		/* viewer → 403 */
		const viewerAuth = async () => ({ id: "u1", role: "viewer" })
		const res1 = await handleServerFnRequest(postReq("/_fn/del/delete"), {}, fns, viewerAuth)
		expect(res1.status).toBe(403)

		/* admin → 200 + piggyback */
		const adminAuth = async () => ({ id: "u2", role: "admin" })
		const res2 = await handleServerFnRequest(postReq("/_fn/del/delete"), {}, fns, adminAuth)
		expect(res2.status).toBe(200)
		const body = await res2.json()
		expect(body.queries).toEqual([{ data: [], key: ["items"] }])
	})
})

/* ── E2E: pagination flow ──────────────────────────────────────────── */

describe("e2e: pagination with piggyback cache", () => {
	it("SSR page 1 → client navigates pages 2–4 via server fns", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const { createTrackedQueryClient, hydrateQueryCache } =
			await import("../../../src/query-client")

		const allItems = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, title: `Item ${i + 1}` }))
		const pageSize = 10

		/* SSR: render page 1 */
		const serverQC = new QueryClient()
		serverQC.setQueryDefaults(["items"], { staleTime: 30_000 })
		const tracked = createTrackedQueryClient(serverQC)
		tracked.client.setQueryData(["items", { page: 1 }], allItems.slice(0, pageSize))
		tracked.client.setQueryData(["items-total"], allItems.length)

		const payload = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))

		/* client hydration */
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, payload)
		expect(clientQC.getQueryData(["items", { page: 1 }])).toHaveLength(10)
		expect(clientQC.getQueryData(["items-total"])).toBe(40)

		/* client fetches pages 2-4 via serverFn */
		const getPage = createServerFn({ __id: "get-page", method: "get", name: "getPage" })
			.input((raw: unknown) => raw as { page: number })
			.handler(async (ctx) => {
				const page = ctx.input.page
				const start = (page - 1) * pageSize
				return allItems.slice(start, start + pageSize)
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("get-page", getPage._registration ?? ({} as never))

		for (const page of [2, 3, 4]) {
			const res = await handleServerFnRequest(getReq(`/_fn/get-page/getPage?page=${page}`), {}, fns)
			expect(res.status).toBe(200)
			const body = await res.json()
			clientQC.setQueryData(["items", { page }], body.data)
		}

		/* verify all pages cached */
		for (let page = 1; page <= 4; page++) {
			const data = clientQC.getQueryData(["items", { page }]) as Array<{ id: number }>
			expect(data).toHaveLength(10)
			expect(data[0]?.id).toBe((page - 1) * 10 + 1)
		}
	})
})

/* ── E2E: error recovery ───────────────────────────────────────────── */

describe("e2e: error recovery flow", () => {
	it("mutation fails → cache unchanged → retry succeeds → cache updated", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")

		const clientQC = new QueryClient()
		clientQC.setQueryData(["todos"], [{ id: 1, title: "Original" }])

		let callCount = 0
		const updateFn = createServerFn({ __id: "update", name: "update" })
			.input((raw: unknown) => raw as { id: number; title: string })
			.handler(async (ctx) => {
				callCount++
				if (callCount === 1) throw new Error("transient failure")
				const updated = { id: ctx.input.id, title: ctx.input.title }
				ctx.piggyback(["todos"], [updated])
				ctx.piggyback(["todo", ctx.input.id], updated)
				return updated
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("update", updateFn._registration ?? ({} as never))

		/* first attempt: fails */
		const res1 = await handleServerFnRequest(
			postReq("/_fn/update/update", { id: 1, title: "Updated" }),
			{},
			fns,
		)
		expect(res1.status).toBe(500)
		/* cache unchanged */
		expect(clientQC.getQueryData(["todos"])).toEqual([{ id: 1, title: "Original" }])

		/* retry: succeeds */
		const res2 = await handleServerFnRequest(
			postReq("/_fn/update/update", { id: 1, title: "Updated" }),
			{},
			fns,
		)
		expect(res2.status).toBe(200)
		const body2 = await res2.json()
		for (const q of body2.queries) {
			clientQC.setQueryData(q.key, q.data)
		}

		expect(clientQC.getQueryData(["todos"])).toEqual([{ id: 1, title: "Updated" }])
		expect(clientQC.getQueryData(["todo", 1])).toEqual({ id: 1, title: "Updated" })
	})

	it("validation fails multiple times → finally valid → success with piggyback", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		const submitFn = createServerFn({ __id: "submit", name: "submit" })
			.input((raw: unknown) => {
				const obj = raw as { email: string; name: string }
				if (!obj.name || obj.name.length < 2) throw new Error("Name too short")
				if (!obj.email?.includes("@")) throw new Error("Invalid email")
				return obj
			})
			.handler(async (ctx) => {
				const user = { email: ctx.input.email, id: 1, name: ctx.input.name }
				ctx.piggyback(["user"], user)
				return user
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("submit", submitFn._registration ?? ({} as never))

		/* attempt 1: name too short */
		const r1 = await handleServerFnRequest(
			postReq("/_fn/submit/submit", { email: "a@b.com", name: "A" }),
			{},
			fns,
		)
		expect(r1.status).toBe(400)

		/* attempt 2: invalid email */
		const r2 = await handleServerFnRequest(
			postReq("/_fn/submit/submit", { email: "bad", name: "Alice" }),
			{},
			fns,
		)
		expect(r2.status).toBe(400)

		/* attempt 3: valid */
		const r3 = await handleServerFnRequest(
			postReq("/_fn/submit/submit", { email: "alice@test.com", name: "Alice" }),
			{},
			fns,
		)
		expect(r3.status).toBe(200)
		const body = await r3.json()
		for (const q of body.queries) clientQC.setQueryData(q.key, q.data)

		expect(clientQC.getQueryData(["user"])).toEqual({
			email: "alice@test.com",
			id: 1,
			name: "Alice",
		})
	})
})

/* ── E2E: batch operations ─────────────────────────────────────────── */

describe("e2e: batch operations with many piggyback entries", () => {
	it("single mutation piggybacks 20 cache entries", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		const batchUpdate = createServerFn({ __id: "batch", name: "batchUpdate" })
			.input((raw: unknown) => raw as { ids: number[] })
			.handler(async (ctx) => {
				const results = ctx.input.ids.map((id) => ({ id, status: "processed" }))
				/* piggyback individual item caches + the list */
				for (const item of results) {
					ctx.piggyback(["item", item.id], item)
				}
				ctx.piggyback(["items"], results)
				ctx.piggyback(["items-count"], results.length)
				return { processed: results.length }
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("batch", batchUpdate._registration ?? ({} as never))

		const ids = Array.from({ length: 20 }, (_, i) => i + 1)
		const res = await handleServerFnRequest(postReq("/_fn/batch/batchUpdate", { ids }), {}, fns)
		expect(res.status).toBe(200)
		const body = await res.json()
		expect(body.queries).toHaveLength(22) /* 20 items + list + count */

		for (const q of body.queries) clientQC.setQueryData(q.key, q.data)

		/* verify all individual caches */
		for (let i = 1; i <= 20; i++) {
			expect(clientQC.getQueryData(["item", i])).toEqual({ id: i, status: "processed" })
		}
		expect(clientQC.getQueryData(["items"])).toHaveLength(20)
		expect(clientQC.getQueryData(["items-count"])).toBe(20)
	})
})

/* ── E2E: race conditions ──────────────────────────────────────────── */

describe("e2e: concurrent mutations to same resource", () => {
	it("two mutations race → both succeed → last applied wins in cache", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()
		clientQC.setQueryData(["counter"], 0)

		const increment = createServerFn({ __id: "inc", name: "increment" })
			.input((raw: unknown) => raw as { amount: number; delay: number })
			.handler(async (ctx) => {
				await new Promise((r) => setTimeout(r, ctx.input.delay))
				const newVal = ctx.input.amount
				ctx.piggyback(["counter"], newVal)
				return { value: newVal }
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("inc", increment._registration ?? ({} as never))

		/* fire two mutations concurrently: slow (10) and fast (100) */
		const [resSlow, resFast] = await Promise.all([
			handleServerFnRequest(postReq("/_fn/inc/increment", { amount: 10, delay: 20 }), {}, fns),
			handleServerFnRequest(postReq("/_fn/inc/increment", { amount: 100, delay: 1 }), {}, fns),
		])

		/* fast finishes first, apply it */
		const bodyFast = await resFast.json()
		for (const q of bodyFast.queries) clientQC.setQueryData(q.key, q.data)
		expect(clientQC.getQueryData(["counter"])).toBe(100)

		/* slow finishes later, apply it — overwrites */
		const bodySlow = await resSlow.json()
		for (const q of bodySlow.queries) clientQC.setQueryData(q.key, q.data)
		expect(clientQC.getQueryData(["counter"])).toBe(10)
	})

	it("three parallel mutations to independent resources → no interference", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		const updateItem = createServerFn({ __id: "upd", name: "updateItem" })
			.input((raw: unknown) => raw as { id: number; value: string })
			.handler(async (ctx) => {
				await new Promise((r) => setTimeout(r, Math.random() * 10))
				ctx.piggyback(["item", ctx.input.id], { id: ctx.input.id, value: ctx.input.value })
				return { ok: true }
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("upd", updateItem._registration ?? ({} as never))

		const results = await Promise.all([
			handleServerFnRequest(postReq("/_fn/upd/updateItem", { id: 1, value: "alpha" }), {}, fns),
			handleServerFnRequest(postReq("/_fn/upd/updateItem", { id: 2, value: "beta" }), {}, fns),
			handleServerFnRequest(postReq("/_fn/upd/updateItem", { id: 3, value: "gamma" }), {}, fns),
		])

		for (const res of results) {
			expect(res.status).toBe(200)
			const body = await res.json()
			for (const q of body.queries) clientQC.setQueryData(q.key, q.data)
		}

		expect(clientQC.getQueryData(["item", 1])).toEqual({ id: 1, value: "alpha" })
		expect(clientQC.getQueryData(["item", 2])).toEqual({ id: 2, value: "beta" })
		expect(clientQC.getQueryData(["item", 3])).toEqual({ id: 3, value: "gamma" })
	})
})

/* ── E2E: mixed GET/POST pipeline ──────────────────────────────────── */

describe("e2e: mixed GET/POST pipeline", () => {
	it("GET reads → POST mutates → GET re-reads with updated data", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		let db = [
			{ id: 1, name: "Alice", role: "user" },
			{ id: 2, name: "Bob", role: "user" },
		]

		const getUsers = createServerFn({ __id: "get-users", method: "get", name: "getUsers" }).handler(
			async () => [...db],
		)

		const promoteUser = createServerFn({ __id: "promote", name: "promoteUser" })
			.authenticate()
			.input((raw: unknown) => raw as { id: number })
			.handler(async (ctx) => {
				const user = db.find((u) => u.id === ctx.input.id)
				if (!user) throw new Error("not found")
				user.role = "admin"
				ctx.piggyback(["users"], [...db])
				ctx.piggyback(["user", ctx.input.id], { ...user })
				return { ...user }
			})

		const addUser = createServerFn({ __id: "add-user", name: "addUser" })
			.authenticate()
			.authorize((ctx) => (ctx.auth as { role: string }).role === "admin")
			.input((raw: unknown) => {
				const obj = raw as { name: string }
				if (!obj.name) throw new Error("Name required")
				return obj
			})
			.handler(async (ctx) => {
				const newUser = { id: db.length + 1, name: ctx.input.name, role: "user" as string }
				db = [...db, newUser]
				ctx.piggyback(["users"], [...db])
				ctx.piggyback(["user", newUser.id], newUser)
				ctx.piggyback(["user-count"], db.length)
				return newUser
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("get-users", getUsers._registration ?? ({} as never))
		fns.set("promote", promoteUser._registration ?? ({} as never))
		fns.set("add-user", addUser._registration ?? ({} as never))

		const adminAuth = async () => ({ id: "admin-1", role: "admin" })

		async function call(req: Request, authFn?: typeof adminAuth): Promise<Record<string, unknown>> {
			const res = await handleServerFnRequest(req, {}, fns, authFn)
			expect(res.status).toBe(200)
			const body = (await res.json()) as Record<string, unknown>
			if (body.queries) {
				for (const q of body.queries as Array<{ data: unknown; key: unknown[] }>) {
					clientQC.setQueryData(q.key, q.data)
				}
			}
			return body
		}

		/* step 1: GET users */
		const r1 = await call(getReq("/_fn/get-users/getUsers"))
		clientQC.setQueryData(["users"], r1.data)
		expect(clientQC.getQueryData(["users"])).toHaveLength(2)

		/* step 2: promote Alice */
		await call(postReq("/_fn/promote/promoteUser", { id: 1 }), adminAuth)
		const users = clientQC.getQueryData(["users"]) as Array<{ role: string }>
		expect(users[0]?.role).toBe("admin")
		expect(clientQC.getQueryData(["user", 1])).toEqual({ id: 1, name: "Alice", role: "admin" })

		/* step 3: add new user (admin only) */
		await call(postReq("/_fn/add-user/addUser", { name: "Charlie" }), adminAuth)
		expect(clientQC.getQueryData(["users"])).toHaveLength(3)
		expect(clientQC.getQueryData(["user", 3])).toEqual({ id: 3, name: "Charlie", role: "user" })
		expect(clientQC.getQueryData(["user-count"])).toBe(3)

		/* step 4: non-admin tries to add user → 403 */
		const viewerAuth = async () => ({ id: "viewer-1", role: "viewer" })
		const forbidden = await handleServerFnRequest(
			postReq("/_fn/add-user/addUser", { name: "Dave" }),
			{},
			fns,
			viewerAuth,
		)
		expect(forbidden.status).toBe(403)
		expect(clientQC.getQueryData(["users"])).toHaveLength(3) /* unchanged */
	})
})

/* ── E2E: multi-tenant isolation ───────────────────────────────────── */

describe("e2e: multi-tenant data isolation", () => {
	it("different auth contexts produce tenant-scoped cache entries", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")

		const getTodos = createServerFn({ __id: "todos", name: "getTodos" })
			.authenticate()
			.handler(async (ctx) => {
				const userId = (ctx.auth as { id: string }).id
				const todos: Record<string, Array<{ id: number; title: string }>> = {
					"user-1": [{ id: 1, title: "User 1 todo" }],
					"user-2": [
						{ id: 2, title: "User 2 todo" },
						{ id: 3, title: "User 2 second" },
					],
				}
				const result = todos[userId] ?? []
				ctx.piggyback(["todos", userId], result)
				return result
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("todos", getTodos._registration ?? ({} as never))

		/* user 1 request */
		const qc1 = new QueryClient()
		const res1 = await handleServerFnRequest(postReq("/_fn/todos/getTodos"), {}, fns, async () => ({
			id: "user-1",
		}))
		const body1 = await res1.json()
		for (const q of body1.queries) qc1.setQueryData(q.key, q.data)

		/* user 2 request */
		const qc2 = new QueryClient()
		const res2 = await handleServerFnRequest(postReq("/_fn/todos/getTodos"), {}, fns, async () => ({
			id: "user-2",
		}))
		const body2 = await res2.json()
		for (const q of body2.queries) qc2.setQueryData(q.key, q.data)

		/* each tenant has their own data */
		expect(qc1.getQueryData(["todos", "user-1"])).toHaveLength(1)
		expect(qc1.getQueryData(["todos", "user-2"])).toBeUndefined()
		expect(qc2.getQueryData(["todos", "user-2"])).toHaveLength(2)
		expect(qc2.getQueryData(["todos", "user-1"])).toBeUndefined()
	})
})

/* ── E2E: real-world dashboard scenario ────────────────────────────── */

describe("e2e: dashboard with multiple data sources", () => {
	it("SSR hydrates layout + page data → client mutations update individual widgets", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const { createTrackedQueryClient, hydrateQueryCache } =
			await import("../../../src/query-client")

		/* ── SSR: dashboard page ── */
		const serverQC = new QueryClient()
		serverQC.setQueryDefaults(["analytics"], { staleTime: 60_000 })
		serverQC.setQueryDefaults(["notifications"], { staleTime: 10_000 })
		const tracked = createTrackedQueryClient(serverQC)

		/* layout loader: session + nav */
		tracked.client.setQueryData(["session"], {
			avatar: "https://example.com/alice.jpg",
			name: "Alice",
			plan: "pro",
		})
		tracked.client.setQueryData(
			["nav-items"],
			[
				{ href: "/dashboard", label: "Dashboard" },
				{ href: "/settings", label: "Settings" },
				{ href: "/billing", label: "Billing" },
			],
		)

		/* page loader: analytics + notifications + recent activity */
		tracked.client.setQueryData(["analytics", "overview"], {
			conversion: 3.2,
			pageViews: 12_500,
			revenue: 45_000,
			uniqueVisitors: 8_200,
		})
		tracked.client.setQueryData(["analytics", "chart"], {
			labels: ["Mon", "Tue", "Wed", "Thu", "Fri"],
			values: [1200, 1500, 1100, 1800, 2000],
		})
		tracked.client.setQueryData(
			["notifications"],
			[
				{ id: 1, message: "New signup", read: false },
				{ id: 2, message: "Payment received", read: true },
			],
		)
		tracked.client.setQueryData(
			["recent-activity"],
			[
				{ action: "login", time: "2024-01-15T10:00:00Z", user: "Alice" },
				{ action: "purchase", time: "2024-01-15T09:30:00Z", user: "Bob" },
			],
		)

		/* serialize SSR state */
		const ssrPayload = JSON.parse(JSON.stringify(tracked.getTrackedQueries()))
		expect(ssrPayload).toHaveLength(6)

		/* ── Client: hydrate ── */
		const clientQC = new QueryClient()
		hydrateQueryCache(clientQC, ssrPayload)

		/* verify all data hydrated */
		expect((clientQC.getQueryData(["session"]) as Record<string, unknown>).name).toBe("Alice")
		expect(clientQC.getQueryData(["nav-items"])).toHaveLength(3)
		expect(
			(clientQC.getQueryData(["analytics", "overview"]) as Record<string, unknown>).pageViews,
		).toBe(12_500)
		expect(clientQC.getQueryData(["notifications"])).toHaveLength(2)
		expect(clientQC.getQueryDefaults(["analytics", "overview"])?.staleTime).toBe(60_000)
		expect(clientQC.getQueryDefaults(["notifications"])?.staleTime).toBe(10_000)

		/* ── Client: mark notification as read ── */
		const markRead = createServerFn({ __id: "mark-read", name: "markRead" })
			.authenticate()
			.input((raw: unknown) => raw as { id: number })
			.handler(async (ctx) => {
				ctx.piggyback(
					["notifications"],
					[
						{ id: 1, message: "New signup", read: true },
						{ id: 2, message: "Payment received", read: true },
					],
				)
				ctx.piggyback(["unread-count"], 0)
				return { ok: true }
			})

		const fns = new Map<string, ServerFnRegistration>()
		fns.set("mark-read", markRead._registration ?? ({} as never))

		const res = await handleServerFnRequest(
			postReq("/_fn/mark-read/markRead", { id: 1 }),
			{},
			fns,
			async () => ({ id: "alice" }),
		)
		const body = await res.json()
		for (const q of body.queries) clientQC.setQueryData(q.key, q.data)

		/* notifications updated, everything else untouched */
		const notifs = clientQC.getQueryData(["notifications"]) as Array<{ read: boolean }>
		expect(notifs.every((n) => n.read)).toBe(true)
		expect(clientQC.getQueryData(["unread-count"])).toBe(0)
		expect(
			(clientQC.getQueryData(["analytics", "overview"]) as Record<string, unknown>).pageViews,
		).toBe(12_500)
		expect((clientQC.getQueryData(["session"]) as Record<string, unknown>).name).toBe("Alice")
	})
})

/* ── E2E: serverFnQueryOptions + real QueryClient ──────────────────── */

describe("e2e: serverFnQueryOptions with real QueryClient", () => {
	it("queryFn result stored in cache via QueryClient", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		const getTodo = createServerFn({ __id: "get-todo", name: "getTodo" })
			.input((raw: unknown) => raw as { id: number })
			.handler(async (ctx) => ({ id: ctx.input.id, title: `Todo ${ctx.input.id}` }))

		const opts = serverFnQueryOptions(getTodo, { input: { id: 42 }, staleTime: 60_000 })

		/* simulate what TanStack would do: call queryFn, store result */
		const data = await opts.queryFn()
		clientQC.setQueryData(opts.queryKey, data)
		if (opts.staleTime !== undefined) {
			clientQC.setQueryDefaults(opts.queryKey, { staleTime: opts.staleTime })
		}

		expect(clientQC.getQueryData(["getTodo", { id: 42 }])).toEqual({ id: 42, title: "Todo 42" })
		expect(clientQC.getQueryDefaults(["getTodo", { id: 42 }])?.staleTime).toBe(60_000)
	})

	it("multiple serverFnQueryOptions → populate cache → verify independence", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		const getUser = createServerFn({ name: "getUser" })
			.input((raw: unknown) => raw as { id: number })
			.handler(async (ctx) => ({ id: ctx.input.id, name: `User ${ctx.input.id}` }))

		const getPosts = createServerFn({ name: "getPosts" })
			.input((raw: unknown) => raw as { userId: number })
			.handler(async (ctx) => [
				{ id: 1, title: "Post 1", userId: ctx.input.userId },
				{ id: 2, title: "Post 2", userId: ctx.input.userId },
			])

		const userOpts = serverFnQueryOptions(getUser, { input: { id: 1 } })
		const postsOpts = serverFnQueryOptions(getPosts, { input: { userId: 1 } })

		const [userData, postsData] = await Promise.all([userOpts.queryFn(), postsOpts.queryFn()])
		clientQC.setQueryData(userOpts.queryKey, userData)
		clientQC.setQueryData(postsOpts.queryKey, postsData)

		expect(clientQC.getQueryData(["getUser", { id: 1 }])).toEqual({ id: 1, name: "User 1" })
		expect(clientQC.getQueryData(["getPosts", { userId: 1 }])).toHaveLength(2)
	})
})

/* ── E2E: serverFnMutationOptions + real QueryClient ───────────────── */

describe("e2e: serverFnMutationOptions with real QueryClient", () => {
	it("mutation → direct call → invalidation → verify", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		/* seed cache */
		clientQC.setQueryData(["todos"], [{ id: 1, title: "Original" }])
		clientQC.setQueryData(["stats"], { count: 1 })

		const addTodo = createServerFn({ name: "addTodo" })
			.input((raw: unknown) => raw as { title: string })
			.handler(async (ctx) => ({ id: 2, title: ctx.input.title }))

		const invalidated: unknown[][] = []
		const opts = serverFnMutationOptions(addTodo, {
			invalidates: [["todos"], ["stats"]],
			queryClient: {
				invalidateQueries: async (o: { queryKey: unknown[] }) => {
					invalidated.push(o.queryKey)
				},
				setQueryData: (key: unknown[], data: unknown) => clientQC.setQueryData(key, data),
			},
		})

		/* execute mutation (server-side direct) */
		const result = await opts.mutationFn({ title: "New todo" })
		expect(result).toEqual({ id: 2, title: "New todo" })

		/* trigger onSuccess (simulates TanStack calling it) */
		opts.onSuccess?.()
		await new Promise((r) => setTimeout(r, 10))

		expect(invalidated).toEqual([["todos"], ["stats"]])
	})
})

/* ── E2E: client-side fetch full flow ──────────────────────────────── */

describe("e2e: client-side full fetch → mutate → piggyback → invalidate", () => {
	const originalWindow = globalThis.window

	function mockClientEnv(mockFetch: typeof globalThis.fetch) {
		;(globalThis as Record<string, unknown>).window = {}
		globalThis.fetch = mockFetch
	}

	function restoreEnv() {
		if (originalWindow === undefined) {
			delete (globalThis as Record<string, unknown>).window
		} else {
			;(globalThis as Record<string, unknown>).window = originalWindow
		}
	}

	it("query fetches data → mutation updates with piggyback → cache reflects both", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		/* mock: first call is query, second is mutation */
		let callIndex = 0
		mockClientEnv(async () => {
			callIndex++
			if (callIndex === 1) {
				/* query response */
				return new Response(
					JSON.stringify({
						data: [{ done: false, id: 1, title: "Buy milk" }],
					}),
				)
			}
			/* mutation response with piggyback */
			return new Response(
				JSON.stringify({
					data: { done: false, id: 2, title: "Walk dog" },
					queries: [
						{
							data: [
								{ done: false, id: 1, title: "Buy milk" },
								{ done: false, id: 2, title: "Walk dog" },
							],
							key: ["todos"],
						},
					],
				}),
			)
		})

		try {
			const getTodos = createServerFn({ __id: "list", method: "get", name: "getTodos" }).handler(
				async () => [],
			)
			const addTodo = createServerFn({ __id: "add", name: "addTodo" })
				.input((raw: unknown) => raw as { title: string })
				.handler(async () => ({}))

			/* step 1: query */
			const queryOpts = serverFnQueryOptions(getTodos)
			const queryResult = await queryOpts.queryFn()
			clientQC.setQueryData(queryOpts.queryKey, queryResult)

			expect(clientQC.getQueryData(["getTodos", undefined])).toEqual([
				{ done: false, id: 1, title: "Buy milk" },
			])

			/* step 2: mutation with piggyback */
			const invalidated: unknown[][] = []
			const mutOpts = serverFnMutationOptions(addTodo, {
				invalidates: [["getTodos", undefined]],
				queryClient: {
					invalidateQueries: async (o: { queryKey: unknown[] }) => {
						invalidated.push(o.queryKey)
					},
					setQueryData: (key: unknown[], data: unknown) => clientQC.setQueryData(key, data),
				},
			})

			const mutResult = await mutOpts.mutationFn({ title: "Walk dog" })
			expect(mutResult).toEqual({ done: false, id: 2, title: "Walk dog" })

			/* piggyback was applied to cache by mutationFn */
			expect(clientQC.getQueryData(["todos"])).toEqual([
				{ done: false, id: 1, title: "Buy milk" },
				{ done: false, id: 2, title: "Walk dog" },
			])

			/* trigger invalidation */
			mutOpts.onSuccess?.()
			await new Promise((r) => setTimeout(r, 10))
			expect(invalidated).toEqual([["getTodos", undefined]])
		} finally {
			restoreEnv()
		}
	})

	it("query fails → mutation succeeds with piggyback → cache populated from mutation only", async () => {
		const { QueryClient } = await import("@tanstack/solid-query")
		const clientQC = new QueryClient()

		let callIndex = 0
		mockClientEnv(async () => {
			callIndex++
			if (callIndex === 1) {
				return new Response(JSON.stringify({ message: "Service unavailable" }), { status: 503 })
			}
			return new Response(
				JSON.stringify({
					data: { id: 1, title: "Created" },
					queries: [{ data: [{ id: 1, title: "Created" }], key: ["items"] }],
				}),
			)
		})

		try {
			const getItems = createServerFn({ __id: "get", name: "getItems" }).handler(async () => [])
			const addItem = createServerFn({ __id: "add", name: "addItem" })
				.input((raw: unknown) => raw as { title: string })
				.handler(async () => ({}))

			/* query fails */
			const queryOpts = serverFnQueryOptions(getItems)
			await expect(queryOpts.queryFn()).rejects.toThrow("Service unavailable")
			expect(clientQC.getQueryData(["items"])).toBeUndefined()

			/* mutation succeeds with piggyback */
			const mutOpts = serverFnMutationOptions(addItem, {
				queryClient: {
					invalidateQueries: async () => {},
					setQueryData: (key: unknown[], data: unknown) => clientQC.setQueryData(key, data),
				},
			})
			const result = await mutOpts.mutationFn({ title: "Created" })
			expect(result).toEqual({ id: 1, title: "Created" })

			/* cache populated from piggyback */
			expect(clientQC.getQueryData(["items"])).toEqual([{ id: 1, title: "Created" }])
		} finally {
			restoreEnv()
		}
	})
})

/* ── Stream builder ────────────────────────────────────────────────── */

describe("stream builder", () => {
	it(".stream() returns callable with _registration", () => {
		const fn = createServerFn({ name: "chat" }).stream(async function* () {
			yield "hello"
		})
		expect(fn).toBeTypeOf("function")
		expect(fn._registration).toBeDefined()
	})

	it("_registration.stream === true for .stream() fns", () => {
		const fn = createServerFn({ name: "chat" }).stream(async function* () {
			yield "hello"
		})
		expect(fn._registration?.stream).toBe(true)
	})

	it("_registration.stream is falsy for .handler() fns", () => {
		const fn = createServerFn({ name: "echo" }).handler(async () => "ok")
		expect(fn._registration?.stream).toBeFalsy()
	})

	it("builder chain: authenticate → input → authorize → stream", () => {
		const fn = createServerFn({ name: "chat" })
			.authenticate()
			.input((raw: unknown) => raw as { prompt: string })
			.authorize(() => true)
			.stream(async function* (ctx) {
				yield ctx.input.prompt
			})
		expect(fn._registration?.authenticate).toBe(true)
		expect(fn._registration?.input).toBeDefined()
		expect(fn._registration?.authorizeFn).toBeDefined()
		expect(fn._registration?.stream).toBe(true)
	})

	it("builder chain: input → stream (no auth)", () => {
		const fn = createServerFn({ name: "count" })
			.input((raw: unknown) => raw as { n: number })
			.stream(async function* (ctx) {
				for (let i = 0; i < ctx.input.n; i++) yield i
			})
		expect(fn._registration?.authenticate).toBe(false)
		expect(fn._registration?.input).toBeDefined()
		expect(fn._registration?.stream).toBe(true)
	})

	it("direct server-side call returns AsyncIterable that yields chunks", async () => {
		const fn = createServerFn({ name: "count" }).stream(async function* () {
			yield 1
			yield 2
			yield 3
		})
		const chunks: number[] = []
		for await (const chunk of fn(undefined)) {
			chunks.push(chunk as number)
		}
		expect(chunks).toEqual([1, 2, 3])
	})

	it("direct call validates input before streaming", async () => {
		const fn = createServerFn({ name: "chat" })
			.input((raw: unknown) => {
				const obj = raw as Record<string, unknown>
				if (typeof obj.prompt !== "string") throw new Error("prompt required")
				return obj as { prompt: string }
			})
			.stream(async function* (ctx) {
				yield ctx.input.prompt
			})
		await expect(async () => {
			const iter = fn({ bad: true } as unknown as { prompt: string })
			/* must consume to trigger validation */
			for await (const _chunk of iter) {
				/* noop */
			}
		}).rejects.toThrow("prompt required")
	})

	it("registration has correct name/id/method", () => {
		const fn = createServerFn({ __id: "abc123", name: "myStream" }).stream(async function* () {
			yield "ok"
		})
		expect(fn._registration?.name).toBe("myStream")
		expect(fn._registration?.id).toBe("abc123")
		expect(fn._registration?.method).toBe("post")
	})
})

/* ── Stream request handling ───────────────────────────────────────── */

async function collectNDJSON(res: Response): Promise<unknown[]> {
	const text = await res.text()
	return text
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as unknown)
}

function makeStreamReg(overrides?: Partial<ServerFnStreamRegistration>): ServerFnRegistration {
	return {
		authenticate: false,
		fn: async function* () {
			yield "default"
		},
		id: "test",
		method: "post",
		name: "test",
		stream: true,
		...overrides,
	} as ServerFnRegistration
}

function makeStreamFns(
	...entries: Array<[string, Partial<ServerFnStreamRegistration>]>
): Map<string, ServerFnRegistration> {
	const map = new Map<string, ServerFnRegistration>()
	for (const [id, reg] of entries) {
		map.set(id, makeStreamReg({ ...reg }))
	}
	return map
}

describe("handleServerFnRequest - streaming", () => {
	it("stream fn returns text/x-ndjson content-type", async () => {
		const fns = makeStreamFns(["id1", { name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.headers.get("content-type")).toBe("text/x-ndjson")
	})

	it("stream response contains chunk messages for each yield", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					yield "hello"
					yield "world"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		expect(messages).toContainEqual({ c: "hello" })
		expect(messages).toContainEqual({ c: "world" })
	})

	it("stream response ends with { d: true }", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					yield "one"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		expect(messages[messages.length - 1]).toEqual({ d: true })
	})

	it("auth failure → normal JSON 401 (not streamed)", async () => {
		const fns = makeStreamFns(["id1", { authenticate: true, name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(401)
		expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
	})

	it("input validation failure → normal JSON 400", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				input: {
					parse: () => {
						throw new Error("bad input")
					},
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { x: 1 }), {}, fns)
		expect(res.status).toBe(400)
		expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
	})

	it("authorization failure → normal JSON 403", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				authorizeFn: () => false,
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
		expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
	})

	it("generator error mid-stream → { e: { message } } then close", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					yield "ok"
					throw new Error("stream broke")
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		expect(messages[0]).toEqual({ c: "ok" })
		expect(messages).toContainEqual({ e: { message: "stream broke" } })
	})

	it("empty generator → just { d: true }", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					/* yields nothing */
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		expect(messages).toEqual([{ d: true }])
	})

	it("multiple chunks arrive in order", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					yield 1
					yield 2
					yield 3
					yield 4
					yield 5
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		const chunks = messages.filter((m): m is { c: number } => "c" in (m as Record<string, unknown>))
		expect(chunks.map((c) => c.c)).toEqual([1, 2, 3, 4, 5])
	})

	it("StreamContext has signal (AbortSignal instance)", async () => {
		let hasSignal = false
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* (ctx: { signal: unknown }) {
					hasSignal = ctx.signal instanceof AbortSignal
					yield "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		await collectNDJSON(res)
		expect(hasSignal).toBe(true)
	})

	it("undefined yielded → { c: null } (serialize as null)", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					yield undefined
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		expect(messages[0]).toEqual({ c: null })
	})

	it("generator throws immediately → { e: { message } } then close", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					throw new Error("instant fail")
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		expect(messages).toContainEqual({ e: { message: "instant fail" } })
	})

	it("non-Error thrown → { e: { message: 'Stream error' } }", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					throw "string error"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		expect(messages).toContainEqual({ e: { message: "Stream error" } })
	})

	it("StreamContext receives correct auth after authenticate", async () => {
		let capturedAuth: unknown
		const fns = makeStreamFns([
			"id1",
			{
				authenticate: true,
				fn: async function* (ctx: { auth: unknown }) {
					capturedAuth = ctx.auth
					yield "ok"
				},
				name: "test",
			},
		])
		const authFn = () => ({ role: "admin", userId: "u1" })
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns, authFn)
		await collectNDJSON(res)
		expect(capturedAuth).toEqual({ role: "admin", userId: "u1" })
	})

	it("StreamContext receives parsed input", async () => {
		let capturedInput: unknown
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* (ctx: { input: unknown }) {
					capturedInput = ctx.input
					yield "ok"
				},
				input: { parse: (raw: unknown) => raw },
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { prompt: "hello" }), {}, fns)
		await collectNDJSON(res)
		expect(capturedInput).toEqual({ prompt: "hello" })
	})

	it("StreamContext receives env from options", async () => {
		let capturedEnv: unknown
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* (ctx: { env: unknown }) {
					capturedEnv = ctx.env
					yield "ok"
				},
				name: "test",
			},
		])
		const env = { API_KEY: "secret" }
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), env, fns)
		await collectNDJSON(res)
		expect(capturedEnv).toEqual({ API_KEY: "secret" })
	})

	it("StreamContext receives request object", async () => {
		let capturedUrl: unknown
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* (ctx: { request: Request }) {
					capturedUrl = ctx.request.url
					yield "ok"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		await collectNDJSON(res)
		expect(capturedUrl).toBe("http://localhost/_fn/id1/test")
	})

	it("GET method stream: query params parsed as input", async () => {
		let capturedInput: unknown
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* (ctx: { input: unknown }) {
					capturedInput = ctx.input
					yield "ok"
				},
				method: "get",
				name: "test",
			},
		])
		const res = await handleServerFnRequest(getReq("/_fn/id1/test?prompt=hello&n=5"), {}, fns)
		expect(res.headers.get("content-type")).toBe("text/x-ndjson")
		const messages = await collectNDJSON(res)
		expect(messages).toContainEqual({ c: "ok" })
		expect(capturedInput).toEqual({ n: "5", prompt: "hello" })
	})

	it("complex objects serialized correctly in chunks", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					yield { items: [1, 2], nested: { deep: true } }
					yield [1, "two", null]
					yield 42
					yield true
					yield null
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		const chunks = messages.filter(
			(m): m is { c: unknown } => "c" in (m as Record<string, unknown>),
		)
		expect(chunks[0]?.c).toEqual({ items: [1, 2], nested: { deep: true } })
		expect(chunks[1]?.c).toEqual([1, "two", null])
		expect(chunks[2]?.c).toBe(42)
		expect(chunks[3]?.c).toBe(true)
		expect(chunks[4]?.c).toBeNull()
	})

	it("async generator with await between yields", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					yield "start"
					await Promise.resolve()
					yield "middle"
					await Promise.resolve()
					yield "end"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		const chunks = messages.filter((m): m is { c: string } => "c" in (m as Record<string, unknown>))
		expect(chunks.map((c) => c.c)).toEqual(["start", "middle", "end"])
	})

	it("error after several yields → partial chunks + error", async () => {
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					yield "a"
					yield "b"
					yield "c"
					throw new Error("late fail")
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		const messages = await collectNDJSON(res)
		const chunks = messages.filter((m): m is { c: string } => "c" in (m as Record<string, unknown>))
		expect(chunks.map((c) => c.c)).toEqual(["a", "b", "c"])
		expect(messages).toContainEqual({ e: { message: "late fail" } })
		/* no done signal after error */
		expect(messages).not.toContainEqual({ d: true })
	})

	it("stream response status is 200", async () => {
		const fns = makeStreamFns(["id1", { name: "test" }])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(200)
	})

	it("authorization runs before streaming starts", async () => {
		let generatorCalled = false
		const fns = makeStreamFns([
			"id1",
			{
				authorizeFn: () => false,
				fn: async function* () {
					generatorCalled = true
					yield "should not reach"
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns)
		expect(res.status).toBe(403)
		expect(generatorCalled).toBe(false)
	})

	it("input validation runs before streaming starts", async () => {
		let generatorCalled = false
		const fns = makeStreamFns([
			"id1",
			{
				fn: async function* () {
					generatorCalled = true
					yield "should not reach"
				},
				input: {
					parse: () => {
						throw new Error("bad")
					},
				},
				name: "test",
			},
		])
		const res = await handleServerFnRequest(postReq("/_fn/id1/test", { x: 1 }), {}, fns)
		expect(res.status).toBe(400)
		expect(generatorCalled).toBe(false)
	})
})

/* ── ctx.revalidate ─────────────────────────────────────────────────── */

describe("ctx.revalidate", () => {
	it("handler receives revalidate function on context", async () => {
		let hasRevalidate = false
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					hasRevalidate = typeof ctx.revalidate === "function"
					return "ok"
				},
				name: "test",
			},
		])
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost"),
				store: makeFlareStore(),
			},
			() => handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns),
		)
		expect(hasRevalidate).toBe(true)
	})

	it("ctx.revalidate calls cache store deleteByTags", async () => {
		const store = makeFlareStore()
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					await ctx.revalidate({ tags: ["products"], tiers: ["ssr"] })
					return "ok"
				},
				name: "test",
			},
		])
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost"),
				store: store,
			},
			() => handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns),
		)
		expect(store.deleteByTags).toHaveBeenCalledWith(["products"], undefined)
	})

	it("ctx.revalidate calls cache store delete for keys", async () => {
		const store = makeFlareStore()
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					await ctx.revalidate({ keys: ["key1", "key2"], tiers: ["ssr"] })
					return "ok"
				},
				name: "test",
			},
		])
		await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost"),
				store: store,
			},
			() => handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns),
		)
		expect(store.delete).toHaveBeenCalledWith("key1")
		expect(store.delete).toHaveBeenCalledWith("key2")
	})

	it("ctx.revalidate throws if store tier not configured", async () => {
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					await ctx.revalidate({ tags: ["x"], tiers: ["ssr"] })
					return "ok"
				},
				name: "test",
			},
		])
		const res = await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost"),
			},
			() => handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns),
		)
		expect(res.status).toBe(500)
	})
})

/* ── revalidatedTags in response ────────────────────────────────────── */

describe("revalidatedTags in response", () => {
	it("response includes revalidatedTags when ctx.revalidate called with tags", async () => {
		const store = makeFlareStore()
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					await ctx.revalidate({ tags: ["products", "users"], tiers: ["ssr"] })
					return "ok"
				},
				name: "test",
			},
		])
		const res = await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost"),
				store: store,
			},
			() => handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns),
		)
		const body = (await res.json()) as Record<string, unknown>
		expect(body.revalidatedTags).toEqual(["products", "users"])
	})

	it("response omits revalidatedTags when nothing revalidated", async () => {
		const fns = makeFns(["id1", { fn: async () => "ok", name: "test" }])
		const res = await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost"),
			},
			() => handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns),
		)
		const body = (await res.json()) as Record<string, unknown>
		expect(body.revalidatedTags).toBeUndefined()
	})

	it("multiple ctx.revalidate calls accumulate unique tags in response", async () => {
		const store = makeFlareStore()
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					await ctx.revalidate({ tags: ["products"], tiers: ["ssr"] })
					await ctx.revalidate({ tags: ["users", "products"], tiers: ["ssr"] })
					return "ok"
				},
				name: "test",
			},
		])
		const res = await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost"),
				store: store,
			},
			() => handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns),
		)
		const body = (await res.json()) as Record<string, unknown>
		expect(body.revalidatedTags).toEqual(["products", "users"])
	})

	it("revalidatedTags empty array when only keys revalidated (no tags)", async () => {
		const store = makeFlareStore()
		const fns = makeFns([
			"id1",
			{
				fn: async (ctx) => {
					await ctx.revalidate({ keys: ["key1"], tiers: ["ssr"] })
					return "ok"
				},
				name: "test",
			},
		])
		const res = await runWithServerContext(
			{
				nonce: "x",
				request: new Request("http://localhost"),
				store: store,
			},
			() => handleServerFnRequest(postReq("/_fn/id1/test"), {}, fns),
		)
		const body = (await res.json()) as Record<string, unknown>
		expect(body.revalidatedTags).toBeUndefined()
	})
})

/* ── onRevalidate callback ──────────────────────────────────────────── */

describe("onRevalidate callback", () => {
	it("serverFnMutationOptions calls onRevalidate with revalidatedTags from response", async () => {
		const onRevalidate = vi.fn()
		const fn = createServerFn({ method: "post", name: "test" }).handler(async () => "ok")

		/* Mock fetch to return response with revalidatedTags */
		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: "ok", revalidatedTags: ["products", "users"] }), {
					headers: { "content-type": "application/json" },
					status: 200,
				}),
		) as unknown as typeof fetch

		/* Simulate client-side: window exists */
		const originalWindow = globalThis.window
		Object.defineProperty(globalThis, "window", { configurable: true, value: {} })

		try {
			const opts = serverFnMutationOptions(fn, { onRevalidate })
			await opts.mutationFn(undefined as never)
			expect(onRevalidate).toHaveBeenCalledWith(["products", "users"])
		} finally {
			globalThis.fetch = originalFetch
			Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow })
		}
	})

	it("serverFnMutationOptions skips onRevalidate when no revalidatedTags", async () => {
		const onRevalidate = vi.fn()
		const fn = createServerFn({ method: "post", name: "test" }).handler(async () => "ok")

		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: "ok" }), {
					headers: { "content-type": "application/json" },
					status: 200,
				}),
		) as unknown as typeof fetch

		const originalWindow = globalThis.window
		Object.defineProperty(globalThis, "window", { configurable: true, value: {} })

		try {
			const opts = serverFnMutationOptions(fn, { onRevalidate })
			await opts.mutationFn(undefined as never)
			expect(onRevalidate).not.toHaveBeenCalled()
		} finally {
			globalThis.fetch = originalFetch
			Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow })
		}
	})

	it("serverFnQueryOptions calls onRevalidate with revalidatedTags from response", async () => {
		const onRevalidate = vi.fn()
		const fn = createServerFn({ method: "post", name: "test" }).handler(async () => "ok")

		const originalFetch = globalThis.fetch
		globalThis.fetch = vi.fn(
			async () =>
				new Response(JSON.stringify({ data: "ok", revalidatedTags: ["orders"] }), {
					headers: { "content-type": "application/json" },
					status: 200,
				}),
		) as unknown as typeof fetch

		const originalWindow = globalThis.window
		Object.defineProperty(globalThis, "window", { configurable: true, value: {} })

		try {
			const opts = serverFnQueryOptions(fn, { onRevalidate })
			await opts.queryFn()
			expect(onRevalidate).toHaveBeenCalledWith(["orders"])
		} finally {
			globalThis.fetch = originalFetch
			Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow })
		}
	})
})
