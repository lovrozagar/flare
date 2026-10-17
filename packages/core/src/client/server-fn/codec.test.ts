import { expect, it } from "vitest"
import { encodeGetInput } from "../../shared/protocol/index.ts"
import { fromWire, toWire } from "../../shared/protocol/value.ts"
import { fnRequest } from "./codec.ts"

const read = { id: "0123456789abcdef", record: { method: "get" as const } }
const write = { id: "fedcba9876543210", record: { method: "post" as const } }
const ROOT = { basePath: "/", build: "" }

it("builds _i", () => {
	const built = fnRequest(read, { a: 1 }, ROOT)
	const url = new URL(built.url, "http://localhost")
	expect(url.pathname).toBe("/_flare/fn/0123456789abcdef")
	expect([...url.searchParams.keys()]).toEqual(["_i"])
	expect(fromWire(JSON.parse(url.searchParams.get("_i") ?? ""))).toEqual({ a: 1 })
	expect(built.init).toEqual({ method: "GET" })
	// A void input omits `_i`, and the server reads undefined.
	expect(fnRequest(read, undefined, ROOT).url).toBe("/_flare/fn/0123456789abcdef")
	const posted = fnRequest(write, { a: 1 }, ROOT)
	expect(posted).toEqual({
		url: "/_flare/fn/fedcba9876543210",
		init: {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(toWire({ a: 1 })),
		},
	})
	expect(fnRequest(write, undefined, ROOT).init).toEqual({ method: "POST" })
})

it("cap", () => {
	expect(() => fnRequest(read, { text: "x".repeat(8200) }, ROOT)).toThrow(/8192/)
})

it("base path", () => {
	const app = { basePath: "/app", build: "" }
	expect(fnRequest(write, 1, app).url).toBe("/app/_flare/fn/fedcba9876543210")
	expect(fnRequest(read, 1, app).url).toBe(`/app/_flare/fn/0123456789abcdef?_i=${encodeGetInput(1)}`)
})

// A GET carries the client's build as `_b`, after `_i`, so a cache keyed on the URL keeps each build's answers apart.
// A POST does not, and a client with no build (dev) sends none (plan 21 8.5, BUGS.md 199).
it("build param", () => {
	const where = { basePath: "/", build: "a1b2" }
	expect(fnRequest(read, 1, where).url).toBe(`/_flare/fn/0123456789abcdef?_i=${encodeGetInput(1)}&_b=a1b2`)
	expect(fnRequest(read, undefined, where).url).toBe("/_flare/fn/0123456789abcdef?_b=a1b2")
	expect(fnRequest(write, 1, where).url).toBe("/_flare/fn/fedcba9876543210")
})
