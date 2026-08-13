/**
 * Flare State Unit Tests
 *
 * Tests self.flare state serialization for SSR hydration.
 * State includes route data, query states, context.
 */

import { describe, expect, it } from "vitest"
import { buildFlareStateScript, serializeFlareState } from "../../../src/server/handler/flare-state"
import { createFlareState, FlareStateBuilder } from "../../utils/flare-state"

describe("serializeFlareState", () => {
	it("serializes minimal state", () => {
		const state = createFlareState()

		const json = serializeFlareState(state)
		const parsed = JSON.parse(json)

		expect(parsed.r.pathname).toBe("/")
		expect(parsed.q).toEqual([])
		expect(parsed.c).toEqual({})
	})

	it("serializes route matches", () => {
		const state = new FlareStateBuilder()
			.withPathname("/products/123")
			.withParams({ id: "123" })
			.addMatch("_root_", { user: "alice" })
			.addMatch("_root_/products/[id]", { product: { name: "Widget" } })
			.build()

		const json = serializeFlareState(state)
		const parsed = JSON.parse(json)

		expect(parsed.r.pathname).toBe("/products/123")
		expect(parsed.r.params).toEqual({ id: "123" })
		expect(parsed.r.matches).toHaveLength(2)
		expect(parsed.r.matches[0].loaderData.user).toBe("alice")
	})

	it("serializes query states", () => {
		const state = new FlareStateBuilder()
			.addQuery(["product", "123"], { name: "Widget" }, { staleTime: 60000 })
			.addQuery(["categories"], ["cat1", "cat2"])
			.build()

		const json = serializeFlareState(state)
		const parsed = JSON.parse(json)

		expect(parsed.q).toHaveLength(2)
		expect(parsed.q[0].key).toEqual(["product", "123"])
		expect(parsed.q[0].data).toEqual({ name: "Widget" })
	})

	it("serializes context", () => {
		const state = new FlareStateBuilder()
			.withContext({
				dir: "ltr",
				locale: "en-US",
				theme: "light",
			})
			.withRouterDefaults({ gcTime: 1800000, prefetchIntent: "viewport", staleTime: 30000 })
			.build()

		const json = serializeFlareState(state)
		const parsed = JSON.parse(json)

		expect(parsed.c.locale).toBe("en-US")
		expect(parsed.c.routerDefaults.staleTime).toBe(30000)
	})

	it("escapes script tags in data", () => {
		const state = new FlareStateBuilder()
			.addMatch("_root_", { html: "</script><script>alert(1)" })
			.build()

		const json = serializeFlareState(state)

		expect(json).not.toContain("</script>")
		expect(json).toContain("<\\/script>")
	})
})

describe("buildFlareStateScript", () => {
	it("builds self.flare assignment script", () => {
		const state = createFlareState()

		const script = buildFlareStateScript(state)

		expect(script).toContain("self.flare=")
	})

	it("produces valid JavaScript", () => {
		const state = new FlareStateBuilder()
			.withContext({ locale: "en" })
			.addQuery(["test"], { x: 1 })
			.build()

		const script = buildFlareStateScript(state)

		expect(() => {
			new Function(script)
		}).not.toThrow()
	})

	it("minimizes whitespace", () => {
		const state = createFlareState()

		const script = buildFlareStateScript(state)

		expect(script).not.toContain("\n")
		expect(script).not.toContain("  ")
	})
})
