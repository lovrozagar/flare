import { expect, it } from "vitest"
import { assertRegistered } from "./home.ts"

const FN =
	'import { createServerFn } from "@lovrozagar/flare/server-fn";\nexport const echo = createServerFn().handler(h);\n'

// A server function outside src/, under the root or outside it, fails naming the file and the function; one under
// src/, and a module that only mentions the name, pass (plan 21 8.7, BUGS.md 201).
it("registered home", () => {
	const outside = "echo is a server function outside src/. Codegen registers only src/, so every call would be a 404"
	expect(() => assertRegistered("lib/fns.ts", FN)).toThrow(`lib/fns.ts: ${outside}. Move it under src/`)
	expect(() => assertRegistered("/repo/shared/fns.ts", FN)).toThrow(`/repo/shared/fns.ts: ${outside}`)
	expect(() => assertRegistered("src/fns.ts", FN)).not.toThrow()
	expect(() => assertRegistered("lib/name.ts", "export const createServerFn = 1;\n")).not.toThrow()
	expect(() => assertRegistered("lib/plain.ts", "export const a = 1;\n")).not.toThrow()
})
