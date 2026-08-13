import type { RouteDefinition } from "flare/generators"
import { describe, expect, it } from "vitest"
import { resolveRoute } from "../../../src/add/route-resolver"

function makeDef(overrides: Partial<RouteDefinition> = {}): RouteDefinition {
	return {
		authenticateMode: false,
		cache: {},
		exportName: "route",
		filePath: "src/routes/test.tsx",
		hasInput: false,
		responseRoute: false,
		type: "page",
		virtualPath: "test",
		...overrides,
	}
}

describe("resolveRoute", () => {
	it("matches by exact virtualPath", () => {
		const defs = [makeDef({ virtualPath: "about" }), makeDef({ virtualPath: "contact" })]
		const result = resolveRoute("about", defs)
		expect(result?.virtualPath).toBe("about")
	})

	it("matches by virtualPath with root prefix", () => {
		const defs = [
			makeDef({ virtualPath: "[[locale]]/_root_/about" }),
			makeDef({ virtualPath: "[[locale]]/_root_/contact" }),
		]
		const result = resolveRoute("about", defs)
		expect(result?.virtualPath).toBe("[[locale]]/_root_/about")
	})

	it("matches by URL pattern", () => {
		const defs = [makeDef({ virtualPath: "[[locale]]/_root_/products/[id]" })]
		const result = resolveRoute("/products/[id]", defs)
		expect(result?.virtualPath).toBe("[[locale]]/_root_/products/[id]")
	})

	it("matches with leading slash normalization", () => {
		const defs = [makeDef({ virtualPath: "about" })]
		const result = resolveRoute("/about", defs)
		expect(result?.virtualPath).toBe("about")
	})

	it("returns null when no match", () => {
		const defs = [makeDef({ virtualPath: "about" })]
		const result = resolveRoute("nonexistent", defs)
		expect(result).toBeNull()
	})

	it("skips group segments in URL matching", () => {
		const defs = [makeDef({ virtualPath: "[[locale]]/_root_/(shop)/products" })]
		const result = resolveRoute("/products", defs)
		expect(result?.virtualPath).toBe("[[locale]]/_root_/(shop)/products")
	})

	it("matches root index route", () => {
		const defs = [makeDef({ virtualPath: "[[locale]]/_root_/" })]
		const result = resolveRoute("/", defs)
		expect(result?.virtualPath).toBe("[[locale]]/_root_/")
	})
})
