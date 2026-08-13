import { describe, expect, it } from "vitest"
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts"
import {
	buildFlareStateScript,
	deriveStatus,
	type FlareState,
	serializeFlareState,
} from "../../../src/ssr/index.tsx"

function makeFlareState(overrides?: Partial<FlareState>): FlareState {
	return {
		c: {},
		m: [],
		p: "/",
		r: {},
		s: {},
		...overrides,
	}
}

/* ── stripDeferredPromises advanced ── */

describe("stripDeferredPromises advanced", () => {
	it("deferred marker with extra fields → only __deferred and key retained", () => {
		const state = makeFlareState({
			m: [
				{
					d: { __deferred: true, extra: "ignored", key: "user", promise: Promise.resolve() },
					i: "m1",
					v: "/user",
				},
			],
		})
		const json = serializeFlareState(state)
		const parsed = JSON.parse(json.replace(/\\u003c/g, "<"))
		expect(parsed.m[0].d).toEqual({ __deferred: true, key: "user" })
		expect(parsed.m[0].d.promise).toBeUndefined()
		expect(parsed.m[0].d.extra).toBeUndefined()
	})

	it("array containing deferred objects → stripped correctly", () => {
		const state = makeFlareState({
			m: [
				{
					d: [{ __deferred: true, key: "a", promise: Promise.resolve() }, { normal: true }],
					i: "m1",
					v: "/test",
				},
			],
		})
		const json = serializeFlareState(state)
		const parsed = JSON.parse(json.replace(/\\u003c/g, "<"))
		expect(parsed.m[0].d[0]).toEqual({ __deferred: true, key: "a" })
		expect(parsed.m[0].d[1]).toEqual({ normal: true })
	})

	it("diamond reference (shared non-circular) → preserved in both positions", () => {
		const shared = { value: 42 }
		const state = makeFlareState({
			m: [
				{
					d: { a: shared, b: shared },
					i: "m1",
					v: "/diamond",
				},
			],
		})
		const json = serializeFlareState(state)
		const parsed = JSON.parse(json.replace(/\\u003c/g, "<"))
		expect(parsed.m[0].d.a).toEqual({ value: 42 })
		expect(parsed.m[0].d.b).toEqual({ value: 42 })
	})

	it("true circular reference → returns null at cycle point", () => {
		const obj: Record<string, unknown> = { name: "root" }
		obj.self = obj
		const state = makeFlareState({
			m: [
				{
					d: obj,
					i: "m1",
					v: "/circular",
				},
			],
		})
		const json = serializeFlareState(state)
		const parsed = JSON.parse(json.replace(/\\u003c/g, "<"))
		expect(parsed.m[0].d.name).toBe("root")
		expect(parsed.m[0].d.self).toBeNull()
	})

	it("nested circular in array → null at cycle point", () => {
		const parent: Record<string, unknown> = { items: [] }
		const child = { parent }
		;(parent.items as unknown[]).push(child)
		const state = makeFlareState({
			m: [{ d: parent, i: "m1", v: "/nested-circular" }],
		})
		const json = serializeFlareState(state)
		const parsed = JSON.parse(json.replace(/\\u003c/g, "<"))
		expect(parsed.m[0].d.items[0].parent).toBeNull()
	})

	it("null and undefined values preserved correctly", () => {
		const state = makeFlareState({
			m: [{ d: { a: null, b: undefined, c: 0, d: "" }, i: "m1", v: "/nulls" }],
		})
		const json = serializeFlareState(state)
		const parsed = JSON.parse(json.replace(/\\u003c/g, "<"))
		expect(parsed.m[0].d.a).toBeNull()
		expect(parsed.m[0].d.b).toBeUndefined()
		expect(parsed.m[0].d.c).toBe(0)
		expect(parsed.m[0].d.d).toBe("")
	})

	it("deeply nested object (10 levels) → serialized without stack overflow", () => {
		let current: Record<string, unknown> = { leaf: true }
		for (let i = 0; i < 10; i++) {
			current = { child: current }
		}
		const state = makeFlareState({
			m: [{ d: current, i: "m1", v: "/deep" }],
		})
		const json = serializeFlareState(state)
		expect(json).toContain("leaf")
	})
})

/* ── serializeFlareState XSS prevention ── */

describe("serializeFlareState XSS prevention", () => {
	it("all < chars escaped to \\u003c", () => {
		const state = makeFlareState({
			m: [{ d: { html: "<script>alert('xss')</script>" }, i: "m1", v: "/xss" }],
		})
		const json = serializeFlareState(state)
		expect(json).not.toContain("<")
		expect(json).toContain("\\u003c")
	})

	it("multiple </script> tags in data → all escaped", () => {
		const state = makeFlareState({
			m: [{ d: { a: "</script>", b: "</script>" }, i: "m1", v: "/xss" }],
		})
		const json = serializeFlareState(state)
		const matches = json.match(/\\u003c/g)
		/* Each </script> has one < char → 2 occurrences total */
		expect(matches?.length).toBeGreaterThanOrEqual(2)
	})
})

/* ── buildFlareStateScript ── */

describe("buildFlareStateScript deep", () => {
	it("nonce with special chars escaped in attribute", () => {
		const state = makeFlareState()
		const script = buildFlareStateScript(state, 'abc"def')
		/* Double quote in nonce should be escaped to &quot; */
		expect(script).toContain('nonce="abc&quot;def"')
		expect(script).not.toContain('nonce="abc"def"')
	})

	it("nonce with ampersand escaped in attribute", () => {
		const state = makeFlareState()
		const script = buildFlareStateScript(state, "abc&def")
		expect(script).toContain("abc&amp;def")
	})

	it("script contains data-flare-state marker", () => {
		const state = makeFlareState()
		const script = buildFlareStateScript(state, "nonce123")
		expect(script).toContain("data-flare-state")
	})

	it("script contains self.flare= assignment", () => {
		const state = makeFlareState({ p: "/test" })
		const script = buildFlareStateScript(state, "n")
		expect(script).toContain("self.flare=")
		expect(script).toContain("/test")
	})
})

/* ── deriveStatus priority ── */

describe("deriveStatus priority combinations", () => {
	function err(Type: new () => Error) {
		return { error: new Type() }
	}

	it("no errors → 200", () => {
		expect(deriveStatus([{}, {}])).toBe(200)
	})

	it("empty matches → 200", () => {
		expect(deriveStatus([])).toBe(200)
	})

	it("single 401 → 401 (highest priority)", () => {
		expect(deriveStatus([err(UnauthenticatedError)])).toBe(401)
	})

	it("single 403 → 403", () => {
		expect(deriveStatus([err(UnauthorizedError)])).toBe(403)
	})

	it("single 404 → 404", () => {
		expect(deriveStatus([err(NotFoundError)])).toBe(404)
	})

	it("generic error → 500", () => {
		expect(deriveStatus([{ error: new Error("boom") }])).toBe(500)
	})

	it("401 + 403 → 401 (auth trumps authz)", () => {
		expect(deriveStatus([err(UnauthorizedError), err(UnauthenticatedError)])).toBe(401)
	})

	it("403 + 404 → 403 (authz trumps not-found)", () => {
		expect(deriveStatus([err(NotFoundError), err(UnauthorizedError)])).toBe(403)
	})

	it("404 + 500 → 404 (not-found trumps generic)", () => {
		expect(deriveStatus([{ error: new Error() }, err(NotFoundError)])).toBe(404)
	})

	it("all four error types → 401 wins", () => {
		expect(
			deriveStatus([
				{ error: new Error() },
				err(NotFoundError),
				err(UnauthorizedError),
				err(UnauthenticatedError),
			]),
		).toBe(401)
	})

	it("success + error → error status", () => {
		expect(deriveStatus([{}, { error: new Error("boom") }])).toBe(500)
	})

	it("success + 404 → 404", () => {
		expect(deriveStatus([{}, err(NotFoundError)])).toBe(404)
	})
})
