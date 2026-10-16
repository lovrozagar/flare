import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { hasPrefix, underBase } from "./prefix.ts"

const corpus = readFileSync(new URL("./prefix.corpus.txt", import.meta.url), "utf8")

function row(name: string): [string, string] {
	const line = corpus.split("\n").find((item) => item.startsWith(`${name}\t`)) ?? ""
	const [, prefix, path] = line.split("\t")
	return [prefix ?? "", path ?? ""]
}

it("boundary", () => {
	const [prefix, path] = row("boundary")
	expect(hasPrefix(prefix, path)).toBe(true)
})

it("not a prefix", () => {
	const [prefix, path] = row("not a prefix")
	expect(hasPrefix(prefix, path)).toBe(false)
})

it("not a prefix slash-slash", () => {
	const [prefix, path] = row("not a prefix slash-slash")
	expect(hasPrefix(prefix, path)).toBe(false)
})

it("case fold", () => {
	const [prefix, path] = row("case fold")
	expect(hasPrefix(prefix, path, { caseSensitive: false })).toBe(true)
	expect(hasPrefix(prefix, path, { caseSensitive: true })).toBe(false)
})

// A route's path under the router's base; the index is the base itself, and a base of `/` adds nothing (plan 21 3.7).
it("under base", () => {
	expect([underBase("/app", "/about"), underBase("/app", "/"), underBase("/", "/about")]).toEqual([
		"/app/about",
		"/app",
		"/about",
	])
})
