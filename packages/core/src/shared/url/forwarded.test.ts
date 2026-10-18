import { expect, it } from "vitest"
import { forwardedHttps, trustedHops } from "./forwarded.ts"

// The hop count is an integer from 0 to 5, 0 when omitted, and the options hold nothing else (BUGS.md 109).
it("hops", () => {
	expect(trustedHops("createBunFetch", {})).toBe(0)
	expect(trustedHops("createBunFetch", { trustProxy: 5 })).toBe(5)
	for (const trustProxy of [-1, 1.5, 6]) {
		expect(() => trustedHops("createBunFetch", { trustProxy })).toThrow("trustProxy is an integer from 0 to 5")
	}
	// @ts-expect-error bodyLimit is a createServer option
	expect(() => trustedHops("createBunFetch", { bodyLimit: 1 })).toThrow("createBunFetch takes only trustProxy")
	// @ts-expect-error bodyLimit is a createServer option
	expect(() => trustedHops("createBunFetch", { bodyLimit: 1 }, ["trustProxy", "idleTimeout", "env"])).toThrow(
		"createBunFetch takes only trustProxy, idleTimeout, and env",
	)
})

// Only a trusted hop's `https` counts.
it("https", () => {
	expect(forwardedHttps(1, "https")).toBe(true)
	expect(forwardedHttps(0, "https")).toBe(false)
	expect(forwardedHttps(1, "http")).toBe(false)
	expect(forwardedHttps(1, null)).toBe(false)
})
