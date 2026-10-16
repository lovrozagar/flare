import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { hasPrefix, routeHref } from "./prefix.ts"

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

// A router's base and trailing-slash rule.
function at(basePath: string, trailingSlash: "preserve" | "always" | "never" = "preserve") {
	return { basePath, trailingSlash }
}

// A route's URL as the router writes it: under the base, whose index is the base itself, and with a trailing slash under
// "always", on the path only (plan 21 3.7, 3.9).
it("route href", () => {
	expect([routeHref(at("/app"), "/about"), routeHref(at("/app"), "/"), routeHref(at("/"), "/about")]).toEqual([
		"/app/about",
		"/app",
		"/about",
	])
	expect(routeHref(at("/", "always"), "/about?q=1#h")).toBe("/about/?q=1#h")
	expect([
		routeHref(at("/", "always"), "/"),
		routeHref(at("/app", "always"), "/"),
		routeHref(at("/", "always"), "/a/"),
	]).toEqual(["/", "/app/", "/a/"])
	expect(routeHref(at("/", "never"), "/about#x")).toBe("/about#x")
})
