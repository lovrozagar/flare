import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { canonicalPath, type CanonicalOptions } from "./canonical.ts"

const corpus = readFileSync(new URL("./canonical.corpus.txt", import.meta.url), "utf8")

function row(name: string): string {
	const line = corpus.split("\n").find((item) => item.startsWith(`${name}\t`)) ?? ""
	return line.slice(name.length + 1).replaceAll("\\u0000", "\u0000")
}

function path(name: string, options?: CanonicalOptions): string {
	const result = canonicalPath(row(name), options)
	if ("hostile" in result) throw new Error(name)
	return result.path
}

it("empty segments", () => {
	expect(path("empty segments")).toBe("/a/b")
})

it("trailing slash preserve", () => {
	expect(path("trailing slash preserve", { trailingSlash: "preserve" })).toBe("/a/")
	expect(canonicalPath("/", { trailingSlash: "preserve" })).toEqual({ path: "/" })
})

it("trailing slash never", () => {
	expect(path("trailing slash never", { trailingSlash: "never" })).toBe("/a")
	expect(canonicalPath("/", { trailingSlash: "never" })).toEqual({ path: "/" })
	expect(canonicalPath("/a", { trailingSlash: "never" })).toEqual({ path: "/a" })
})

// canonicalPath alone does not fold case. The fold uses the matched route (canonical-redirect.test.ts).
it("case fold", () => {
	expect(path("case fold")).toBe("/About")
	expect(canonicalPath("/%C4%8D/About/")).toEqual({ path: "/%C4%8D/About/" })
})

it("scheme-relative", () => {
	expect(canonicalPath(row("scheme-relative"))).toEqual({ hostile: true })
})

it("backslash", () => {
	expect(canonicalPath(row("backslash"))).toEqual({ hostile: true })
})

it("encoded slashes", () => {
	expect(canonicalPath(row("encoded slashes"))).toEqual({ hostile: true })
})

it("dot dot", () => {
	expect(path("dot dot")).toBe("/b")
	expect(canonicalPath(row("dot dot encoded"))).toEqual({ hostile: true })
})

it("control and NUL", () => {
	expect(canonicalPath(row("control and NUL"))).toEqual({ hostile: true })
	expect(canonicalPath("/a\u001f")).toEqual({ hostile: true })
})

it("base path", () => {
	expect(path("base path", { basePath: "/app" })).toBe("/")
	expect(canonicalPath("/app", { basePath: "/app", trailingSlash: "always" })).toEqual({ path: "/" })
	expect(canonicalPath("/app/about", { basePath: "/app" })).toEqual({ path: "/app/about" })
})

// RFC 3986 6.2.2: an escape of an unreserved character is that character, and every other escape's hex is uppercase,
// so `/docs/%72outing` is `/docs/routing`. An escaped dot segment stays hostile (plan 21 13.7, BUGS.md 210).
it("escapes", () => {
	expect(canonicalPath("/docs/%72outing")).toEqual({ path: "/docs/routing" })
	expect(canonicalPath("/a/%7Euser/%2D%5F%2e")).toEqual({ path: "/a/~user/-_." })
	expect(canonicalPath("/caf%c3%a9/%20x")).toEqual({ path: "/caf%C3%A9/%20x" })
	expect(canonicalPath("/a/%2e%2e/b")).toEqual({ hostile: true })
	expect(canonicalPath("/a/.%2e/b")).toEqual({ hostile: true })
	expect(canonicalPath("/a/%2E/b")).toEqual({ hostile: true })
})

// An encoded slash is hostile in either case, so `/files/a%2Fb` never reaches a param as `a/b` (plan 21 10.4).
it("encoded slash any case", () => {
	expect(canonicalPath("/files/a%2Fb")).toEqual({ hostile: true })
	expect(canonicalPath("/files/a%2fb")).toEqual({ hostile: true })
})
