import { describe, expect, it } from "vitest"
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts"
import {
	buildFlareStateScript,
	deriveStatus,
	type FlareState,
	serializeFlareState,
} from "../../../src/ssr/index.tsx"

function makeState(overrides?: Partial<FlareState>): FlareState {
	return {
		c: {},
		m: [],
		p: "/",
		r: {},
		s: {},
		...overrides,
	}
}

/* ── serializeFlareState edge cases ──────────────────────────────── */

describe("serializeFlareState edge cases", () => {
	it("escapes all < in nested string values", () => {
		const state = makeState({
			m: [{ d: { html: "<script>alert(1)</script>" }, i: "m1", v: "_root_" }],
		})
		const json = serializeFlareState(state)
		expect(json).not.toContain("<")
		expect(json).toContain("\\u003c")
	})

	it("escapes < in keys too", () => {
		const state = makeState({
			m: [{ d: { "<evil>": "value" }, i: "m1", v: "_root_" }],
		})
		const json = serializeFlareState(state)
		expect(json).not.toContain("<")
	})

	it("handles null loader data", () => {
		const state = makeState({
			m: [{ d: null, i: "m1", v: "_root_" }],
		})
		const json = serializeFlareState(state)
		expect(json).toContain('"d":null')
	})

	it("handles undefined loader data (becomes null in JSON)", () => {
		const state = makeState({
			m: [{ d: undefined, i: "m1", v: "_root_" }],
		})
		const json = serializeFlareState(state)
		/* JSON.stringify drops undefined values from objects */
		expect(() => JSON.parse(json.replace(/\\u003c/g, "<"))).not.toThrow()
	})

	it("strips deferred promise from markers", () => {
		const state = makeState({
			m: [
				{
					d: {
						review: {
							__deferred: true,
							key: "d0",
							promise: Promise.resolve("should-be-stripped"),
						},
					},
					i: "m1",
					v: "_root_",
				},
			],
		})
		const json = serializeFlareState(state)
		expect(json).not.toContain("promise")
		expect(json).toContain("__deferred")
		expect(json).toContain('"key":"d0"')
	})

	it("handles circular reference (converted to null)", () => {
		const obj: Record<string, unknown> = { name: "test" }
		obj.self = obj
		const state = makeState({
			m: [{ d: obj, i: "m1", v: "_root_" }],
		})
		/* Should not throw — cycle is converted to null */
		const json = serializeFlareState(state)
		expect(json).toContain("null")
	})

	it("handles diamond reference (shared ref NOT converted to null)", () => {
		const shared = { value: "shared" }
		const state = makeState({
			m: [{ d: { a: shared, b: shared }, i: "m1", v: "_root_" }],
		})
		const json = serializeFlareState(state)
		/* Both references to shared should be serialized */
		const parsed: unknown = JSON.parse(json.replace(/\\u003c/g, "<"))
		const data = (parsed as Record<string, unknown>).m as Array<Record<string, unknown>>
		const d = data[0]?.d as Record<string, Record<string, unknown>>
		expect(d.a.value).toBe("shared")
		expect(d.b.value).toBe("shared")
	})

	it("handles deeply nested data without stack overflow", () => {
		let data: Record<string, unknown> = { value: "leaf" }
		for (let i = 0; i < 100; i++) {
			data = { child: data }
		}
		const state = makeState({
			m: [{ d: data, i: "m1", v: "_root_" }],
		})
		expect(() => serializeFlareState(state)).not.toThrow()
	})

	it("empty state produces valid JSON", () => {
		const state = makeState()
		const json = serializeFlareState(state)
		expect(() => JSON.parse(json)).not.toThrow()
	})

	it("multiple closing script tags in data", () => {
		const state = makeState({
			m: [{ d: { x: "</script></script></SCRIPT>" }, i: "m1", v: "_root_" }],
		})
		const json = serializeFlareState(state)
		expect(json).not.toContain("</script>")
		expect(json).not.toContain("</SCRIPT>")
	})
})

/* ── buildFlareStateScript ───────────────────────────────────────── */

describe("buildFlareStateScript", () => {
	it("includes nonce attribute", () => {
		const state = makeState()
		const html = buildFlareStateScript(state, "abc123")
		expect(html).toContain('nonce="abc123"')
	})

	it("escapes nonce with quotes", () => {
		const state = makeState()
		const html = buildFlareStateScript(state, 'abc"def')
		expect(html).toContain('nonce="abc&quot;def"')
		expect(html).not.toContain('nonce="abc"def"')
	})

	it("escapes nonce with ampersand", () => {
		const state = makeState()
		const html = buildFlareStateScript(state, "a&b")
		expect(html).toContain('nonce="a&amp;b"')
	})

	it("includes data-flare-state marker", () => {
		const state = makeState()
		const html = buildFlareStateScript(state, "nonce")
		expect(html).toContain("data-flare-state")
	})

	it("assigns to self.flare", () => {
		const state = makeState()
		const html = buildFlareStateScript(state, "nonce")
		expect(html).toContain("self.flare=")
	})

	it('empty nonce produces nonce=""', () => {
		const state = makeState()
		const html = buildFlareStateScript(state, "")
		expect(html).toContain('nonce=""')
	})
})

/* ── deriveStatus edge cases ─────────────────────────────────────── */

describe("deriveStatus edge cases", () => {
	it("empty matches → 200", () => {
		expect(deriveStatus([])).toBe(200)
	})

	it("no errors → 200", () => {
		expect(deriveStatus([{}, {}, {}])).toBe(200)
	})

	it("single generic error → 500", () => {
		expect(deriveStatus([{ error: new Error("boom") }])).toBe(500)
	})

	it("UnauthenticatedError → 401", () => {
		expect(deriveStatus([{ error: new UnauthenticatedError("login") }])).toBe(401)
	})

	it("UnauthorizedError → 403", () => {
		expect(deriveStatus([{ error: new UnauthorizedError("nope") }])).toBe(403)
	})

	it("NotFoundError → 404", () => {
		expect(deriveStatus([{ error: new NotFoundError("missing") }])).toBe(404)
	})

	it("401 wins over 403", () => {
		expect(
			deriveStatus([
				{ error: new UnauthorizedError("no") },
				{ error: new UnauthenticatedError("login") },
			]),
		).toBe(401)
	})

	it("401 wins over 404", () => {
		expect(
			deriveStatus([
				{ error: new NotFoundError("gone") },
				{ error: new UnauthenticatedError("login") },
			]),
		).toBe(401)
	})

	it("401 wins over 500", () => {
		expect(
			deriveStatus([{ error: new Error("crash") }, { error: new UnauthenticatedError("login") }]),
		).toBe(401)
	})

	it("403 wins over 404", () => {
		expect(
			deriveStatus([{ error: new NotFoundError("gone") }, { error: new UnauthorizedError("no") }]),
		).toBe(403)
	})

	it("403 wins over 500", () => {
		expect(
			deriveStatus([{ error: new Error("crash") }, { error: new UnauthorizedError("no") }]),
		).toBe(403)
	})

	it("404 wins over 500", () => {
		expect(
			deriveStatus([{ error: new Error("crash") }, { error: new NotFoundError("gone") }]),
		).toBe(404)
	})

	it("mixed errors and non-errors: highest priority error wins", () => {
		expect(
			deriveStatus([
				{},
				{ error: new Error("crash") },
				{},
				{ error: new NotFoundError("gone") },
				{},
			]),
		).toBe(404)
	})

	it("all four error types: 401 wins", () => {
		expect(
			deriveStatus([
				{ error: new Error("crash") },
				{ error: new NotFoundError("gone") },
				{ error: new UnauthorizedError("no") },
				{ error: new UnauthenticatedError("login") },
			]),
		).toBe(401)
	})

	it("multiple 500-class errors still returns 500", () => {
		expect(
			deriveStatus([
				{ error: new Error("a") },
				{ error: new Error("b") },
				{ error: new Error("c") },
			]),
		).toBe(500)
	})

	it("single match with error=undefined → 200", () => {
		expect(deriveStatus([{ error: undefined }])).toBe(200)
	})
})
