import { expect, it } from "vitest"
import { classify, redirect } from "./target.ts"

it("internal", () => {
	expect(classify("/about?x=1")).toBe("/about?x=1")
})

it("scheme-relative before URL", () => {
	let constructed = false
	const Real = globalThis.URL
	function Spy(this: URL, url: string | URL, base?: string | URL) {
		constructed = true
		return new Real(url, base)
	}
	Spy.prototype = Real.prototype
	globalThis.URL = Spy as unknown as typeof URL
	try {
		expect(() => classify("//evil/x")).toThrow(/target/)
		expect(constructed).toBe(false)
	} finally {
		globalThis.URL = Real
	}
})

it("backslash", () => {
	expect(() => classify("/\\evil")).toThrow(/target/)
})

it("absolute", () => {
	expect(() => redirect({ to: "https://evil/" })).toThrow(/to/)
})

it("href https", () => {
	const result = redirect({ href: "https://example.com/a" })
	expect(result.document).toBe("https://example.com/a")
	expect(result.data).toEqual({ status: 200, x: { u: "https://example.com/a", s: 303, r: true } })
	expect(redirect({ href: "http://example.com/a" }).document).toBe("http://example.com/a")
})

it("href bad", () => {
	expect(() => redirect({ href: "javascript:alert(1)" })).toThrow(/href/)
})

it("status", () => {
	expect(() => redirect({ to: "_root_", status: 300 })).toThrow(/300/)
	for (const status of [301, 302, 303, 307, 308]) {
		expect(redirect({ to: "_root_", status }).status).toBe(status)
	}
})

it("control", () => {
	expect(() => classify("\u0001/about")).toThrow(/target/)
})

it("replace default", () => {
	expect(redirect({ to: "_root_" }).replace).toBe(true)
	expect(redirect({ to: "_root_", replace: false }).replace).toBe(false)
})
