import { expect, it } from "vitest"
import { langOf } from "./lang.ts"

// The grammar oxc parses a module with, by its extension: TypeScript for `.ts`, `.mts`, and `.cts`, TSX for `.tsx`,
// and JavaScript or JSX for theirs. Anything else, a virtual id, keeps TSX (plan 21 8.1).
it("lang by extension", () => {
	const files = [
		"a.ts",
		"a.mts",
		"a.cts",
		"a.tsx",
		"a.js",
		"a.mjs",
		"a.cjs",
		"a.jsx",
		"a.page.ts",
		"\0virtual",
		"a.ts?x=1",
	]
	expect(files.map(langOf)).toEqual(["ts", "ts", "ts", "tsx", "js", "js", "js", "jsx", "ts", "tsx", "ts"])
})
