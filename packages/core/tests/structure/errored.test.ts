import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, it } from "vitest"

// Solid's SSR `Errored` writes a string child as raw HTML, so every Flare boundary is `SafeErrored`, which escapes it
// first (BUGS.md 141). No other source file may reach `Errored`: neither a named import from solid-js nor a namespace
// member. Tests may, to show the raw case.

const SRC = join(import.meta.dirname, "../../src")
const ALLOWED = "shared/components/safe-errored.ts"

function sources(dir: string): string[] {
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))
		.map((path) => join(dir, path))
}

// The source files that name `Errored` as code: an import of it, or a member read off a namespace.
export function erroredUsers(files: readonly { path: string; text: string }[]): string[] {
	const named = /import\s*\{[^}]*\bErrored\b[^}]*\}\s*from\s*["']solid-js["']/
	const member = /\b\w+\.Errored\b/
	return files
		.filter(({ text }) => named.test(text) || member.test(text.replaceAll(/\/\/.*$/gm, "")))
		.map(({ path }) => path)
}

it("errored only safe", () => {
	const files = sources(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }))
	expect(erroredUsers(files)).toEqual([ALLOWED])
	// The check catches both shapes, and ignores a comment that names the boundary.
	expect(
		erroredUsers([
			{ path: "a.ts", text: 'import { createMemo, Errored } from "solid-js"' },
			{ path: "b.ts", text: "const x = solid.Errored" },
			{ path: "c.ts", text: "// the app's <Errored> did not catch" },
		]),
	).toEqual(["a.ts", "b.ts"])
})
