import { expect, it } from "vitest"
import { PRERENDER, prerendererOf } from "./prerender.ts"

// The key is the registry symbol, so a built server's own copy of this module and prerender's agree.
it("registry key", () => {
	expect(PRERENDER).toBe(Symbol.for("flare.prerender"))
})

// Only a value that carries a whole prerenderer under the key is one.
it("prerenderer of", () => {
	const whole = {
		site: undefined,
		pages: async () => [],
		routes: async () => [],
		params: async () => [{}],
		render: async () => ({ status: 200, path: "/" }),
	}
	expect(prerendererOf({ [PRERENDER]: whole })).toBe(whole)
	// A server built before `routes` existed is not a whole prerenderer.
	const { routes: _routes, ...older } = whole
	expect(prerendererOf({ [PRERENDER]: older })).toBeUndefined()
	expect(prerendererOf(null)).toBeUndefined()
	expect(prerendererOf("server")).toBeUndefined()
	expect(prerendererOf({})).toBeUndefined()
	expect(prerendererOf({ [PRERENDER]: null })).toBeUndefined()
	expect(prerendererOf({ [PRERENDER]: { pages() {} } })).toBeUndefined()
})
