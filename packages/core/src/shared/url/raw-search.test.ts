import { expect, it } from "vitest"
import { RAW_SEARCH } from "./raw-search.ts"

// The key is a symbol: no string key, no JSON, and no parsed payload can set it, and a serialized target drops it
// (BUGS.md 441).
it("symbol key", () => {
	expect(typeof RAW_SEARCH).toBe("symbol")
	expect(JSON.stringify({ [RAW_SEARCH]: "b=2&a=1" })).toBe("{}")
	expect(RAW_SEARCH in (JSON.parse('{"flare.rawSearch":"x"}') as object)).toBe(false)
})
