import { expect, it } from "vitest"
import { fnRequest } from "./codec.ts"

const read = { id: "0123456789abcdef", record: { method: "get" as const } }
const write = { id: "fedcba9876543210", record: { method: "post" as const } }

it("builds _i", () => {
	const built = fnRequest(read, { a: 1 }, "/")
	const url = new URL(built.url, "http://localhost")
	expect(url.pathname).toBe("/_flare/fn/0123456789abcdef")
	expect([...url.searchParams.keys()]).toEqual(["_i"])
	expect(JSON.parse(url.searchParams.get("_i") ?? "")).toEqual({ a: 1 })
	expect(built.init).toEqual({ method: "GET" })
	// A void input omits `_i`, and the server reads undefined.
	expect(fnRequest(read, undefined, "/").url).toBe("/_flare/fn/0123456789abcdef")
	const posted = fnRequest(write, { a: 1 }, "/")
	expect(posted).toEqual({
		url: "/_flare/fn/fedcba9876543210",
		init: { method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}' },
	})
	expect(fnRequest(write, undefined, "/").init).toEqual({ method: "POST" })
})

it("cap", () => {
	expect(() => fnRequest(read, { text: "x".repeat(8200) }, "/")).toThrow(/8192/)
})

it("base path", () => {
	expect(fnRequest(write, 1, "/app").url).toBe("/app/_flare/fn/fedcba9876543210")
	expect(fnRequest(read, 1, "/app").url).toBe("/app/_flare/fn/0123456789abcdef?_i=1")
})
