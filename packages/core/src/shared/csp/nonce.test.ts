import { expect, it } from "vitest"
import { nonce, withRequest } from "./nonce.ts"

function withSelf(value: object, run: () => void): void {
	const previous = Object.getOwnPropertyDescriptor(globalThis, "self")
	Object.defineProperty(globalThis, "self", { configurable: true, writable: true, value })
	try {
		run()
	} finally {
		if (previous === undefined) Reflect.deleteProperty(globalThis, "self")
		else Object.defineProperty(globalThis, "self", previous)
	}
}

it("server read", () => {
	expect(withRequest({ path: "/", nonce: "abc" }, () => nonce())).toBe("abc")
})

it("server outside", () => {
	expect(() => nonce()).toThrow("nonce")
})

it("server fn", () => {
	expect(() => withRequest({ path: "/_flare/fn/abc", nonce: "abc" }, () => nonce())).toThrow("nonce")
})

it("client", () => {
	withSelf({ flare: { nonce: "abc" } }, () => {
		expect(nonce()).toBe("abc")
	})
})

it("client absent", () => {
	withSelf({ flare: {} }, () => {
		expect(nonce()).toBe("")
	})
	withSelf({ flare: { nonce: 1 } }, () => {
		expect(nonce()).toBe("")
	})
})

it("client flare missing", () => {
	withSelf({}, () => {
		expect(() => nonce()).toThrow("nonce")
	})
	withSelf({ flare: null }, () => {
		expect(() => nonce()).toThrow("nonce")
	})
	withSelf({ flare: 1 }, () => {
		expect(() => nonce()).toThrow("nonce")
	})
})
