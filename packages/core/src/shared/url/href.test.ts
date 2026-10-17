import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { idPattern } from "../route-tree/index.ts"
import { createRouter } from "../router/create-router.ts"
import { buildUrl, href } from "./href.ts"
import { writeUrl } from "./search.ts"

const corpus = readFileSync(new URL("./href.corpus.txt", import.meta.url), "utf8")
const users = "_root_/users/[id]"

function row(name: string): string {
	const line = corpus.split("\n").find((item) => item.startsWith(`${name}\t`)) ?? ""
	return line.slice(name.length + 1).replaceAll("\\u0001", "\u0001")
}

it("relative", () => {
	expect(href(row("relative"))).toBe("/about")
	expect(href("https://ex.com/a")).toBe("https://ex.com/a")
	expect(href("http://ex.com/a")).toBe("http://ex.com/a")
	expect(() => href("//evil.com/a")).toThrow(/href/)
})

it("javascript", () => {
	expect(() => href(row("javascript"))).toThrow(/href/)
	expect(() => href("blob:hi")).toThrow(/href/)
	expect(() => href("vbscript:msg")).toThrow(/href/)
})

it("whitespace scheme", () => {
	expect(() => href(row("whitespace scheme"))).toThrow(/href/)
})

it("data", () => {
	expect(() => href(row("data"))).toThrow(/href/)
})

it("control prefix", () => {
	expect(() => href(row("control prefix"))).toThrow(/href/)
})

it("missing param", () => {
	expect(() => buildUrl({ to: users })).toThrow(/id/)
})

// An empty string is no value: a required param or a catch-all item that is "" throws naming the param, as a missing
// one does, and an empty optional param drops. Written, it would be another route's URL, `/users/` the list or
// `/users//edit` a redirect to `/users/edit` (BUGS.md 307).
it("empty param", () => {
	expect(() => buildUrl({ to: "_root_/users/[id]", params: { id: "" } })).toThrow(/^id$/)
	expect(() => buildUrl({ to: "_root_/users/[id]/edit", params: { id: "" } })).toThrow(/^id$/)
	expect(() => buildUrl({ to: "[locale]/_root_/about", params: { locale: "" } })).toThrow(/^locale$/)
	expect(() => buildUrl({ to: "_root_/files/[...path]", params: { path: ["a", ""] } })).toThrow(/^path$/)
	expect(buildUrl({ to: "_root_/opt/[[id]]", params: { id: "" } })).toBe("/opt")
	expect(buildUrl({ to: "_root_/docs/[[...rest]]", params: { rest: [""] } })).toBe("/docs")
})

it("raw slash", () => {
	expect(() => buildUrl({ to: users, params: { id: "a/b" } })).toThrow(/param/)
	expect(() => buildUrl({ to: users, params: { id: "a\\b" } })).toThrow(/param/)
})

it("bad percent", () => {
	expect(() => buildUrl({ to: users, params: { id: "%ZZ" } })).toThrow(/param/)
	expect(() => buildUrl({ to: users, params: { id: "a%" } })).toThrow(/param/)
	expect(() => buildUrl({ to: users, params: { id: "%2" } })).toThrow(/param/)
})

// A param is encoded by code point, so a character outside the BMP, an emoji, round-trips; a lone surrogate, which no
// URL can carry, is a bad param, never a URIError from the render (plan 21 8.2).
it("emoji param", () => {
	const url = buildUrl({ to: users, params: { id: "a😀b" } })
	expect(url).toBe("/users/a%F0%9F%98%80b")
	expect(decodeURIComponent(url.slice("/users/".length))).toBe("a😀b")
	expect(buildUrl({ to: users, params: { id: "%F0%9F%98%80😀" } })).toBe("/users/%F0%9F%98%80%F0%9F%98%80")
	expect(() => buildUrl({ to: users, params: { id: "a\uD83D" } })).toThrow(/param/)
})

it("no double encode", () => {
	const url = buildUrl({ to: users, params: { id: "a%2Fb" } })
	expect(url).toBe("/users/a%2Fb")
	expect(url.match(/%2F/g)).toHaveLength(1)
	const lower = buildUrl({ to: users, params: { id: "a%2fb" } })
	expect(lower).toBe("/users/a%2Fb")
	expect(lower.match(/%2F/g)).toHaveLength(1)
	expect(lower.includes("%2f")).toBe(false)
})

const ids = {
	group: "_root_/(blog)/post",
	admin: "_admin_/dashboard",
	site: "site/_root_/about",
	shop: "_shop_/cart",
	locale: "[locale]/_root_/about",
	bracket: "_root_/[_]id]",
	optional: "_root_/optional-locale/[[locale]]",
	files: "_root_/files/[...path]",
	maybeFiles: "_root_/maybe/[[...path]]",
}

it("group and root", () => {
	expect(buildUrl({ to: ids.group })).toBe("/post")
	expect(buildUrl({ to: ids.admin })).toBe("/dashboard")
	expect(buildUrl({ to: ids.site })).toBe("/about")
	expect(buildUrl({ to: ids.shop })).toBe("/cart")
	expect(buildUrl({ to: "_root_/" })).toBe("/")
	expect(buildUrl({ to: "[locale]/_root_/", params: { locale: "fr" } })).toBe("/fr")
})

it("param before root", () => {
	expect(buildUrl({ to: ids.locale, params: { locale: "en" } })).toBe("/en/about")
})

it("literal bracket", () => {
	expect(buildUrl({ to: ids.bracket })).toBe("/[id]")
})

it("optional", () => {
	expect(buildUrl({ to: ids.optional, params: { locale: "fr" } })).toBe("/optional-locale/fr")
	expect(buildUrl({ to: ids.optional })).toBe("/optional-locale")
})

it("catch-all", () => {
	expect(buildUrl({ to: ids.files, params: { path: ["a", "b c"] } })).toBe("/files/a/b%20c")
	expect(() => buildUrl({ to: ids.files, params: { path: ["a/b"] } })).toThrow(/param/)
	expect(() => buildUrl({ to: ids.files, params: { path: [] } })).toThrow(/path/)
	expect(buildUrl({ to: ids.maybeFiles, params: { path: [] } })).toBe("/maybe")
	expect(() => buildUrl({ to: users, params: { id: ["1", "2"] } })).toThrow(/id/)
})

it("round trip", () => {
	const rows: { to: string; params?: Record<string, string | string[]>; raw: Record<string, unknown> }[] = [
		{ to: ids.group, raw: {} },
		{ to: "_root_/", raw: {} },
		{ to: ids.locale, params: { locale: "en" }, raw: { locale: "en" } },
		{ to: ids.bracket, raw: {} },
		{ to: ids.optional, params: { locale: "fr" }, raw: { locale: "fr" } },
		{ to: ids.optional, raw: {} },
		{ to: ids.files, params: { path: ["a", "b c"] }, raw: { path: ["a", "b%20c"] } },
	]
	for (const row of rows) {
		const router = createRouter({ layouts: {}, routeTree: [{ id: row.to, path: idPattern(row.to), module: {} }] })
		const match = router.match(buildUrl({ to: row.to, params: row.params }))
		expect(match.id).toBe(row.to)
		expect(match.params).toEqual(row.raw)
	}
})

it("search and hash", () => {
	const search = { q: "a b" }
	expect(buildUrl({ to: users, params: { id: "7" }, search, hash: "top" })).toBe(
		writeUrl({ path: "/users/7", search, hash: "top" }),
	)
	expect(buildUrl({ to: users, params: { id: "7" }, hash: "#top" })).toBe("/users/7#top")
})

// One rule turns a validator output back into URL text (dx/link.md URL values).
it("typed values", () => {
	const search = { page: 2, on: true, big: 9n, ids: [1, 2] }
	expect(buildUrl({ to: users, params: { id: 7 }, search })).toBe("/users/7?big=9&ids=1&ids=2&on=true&page=2")
	expect(buildUrl({ to: ids.files, params: { path: [1, "b"] } })).toBe("/files/1/b")
	expect(() => buildUrl({ to: users, params: { id: () => "1" } })).toThrow(/id/)
	expect(() => buildUrl({ to: users, params: { id: "1" }, search: { q: Symbol("q") } })).toThrow(/q/)
})

it("date value", () => {
	const at = new Date(Date.UTC(2026, 0, 2, 3, 4, 5))
	expect(buildUrl({ to: users, params: { id: at }, search: { at } })).toBe(
		"/users/2026-01-02T03%3A04%3A05.000Z?at=2026-01-02T03%3A04%3A05.000Z",
	)
})

it("object value", () => {
	const filter = { tag: "a", n: 1n, at: new Date(0), nested: [[1], { b: null }] }
	const text = JSON.stringify({ tag: "a", n: "1", at: "1970-01-01T00:00:00.000Z", nested: [[1], { b: null }] })
	expect(buildUrl({ to: users, params: { id: "1" }, search: { filter } })).toBe(
		`/users/1?filter=${encodeURIComponent(text)}`,
	)
	expect(buildUrl({ to: users, params: { id: "1" }, search: { rows: [[1, 2], { a: 1 }] } })).toBe(
		`/users/1?rows=${encodeURIComponent("[1,2]")}&rows=${encodeURIComponent('{"a":1}')}`,
	)
})

it("nullish value", () => {
	const search = { a: null, b: undefined, c: ["x", null, undefined] }
	expect(buildUrl({ to: users, params: { id: "1" }, search })).toBe("/users/1?c=x")
	expect(buildUrl({ to: ids.optional, params: { locale: null } })).toBe("/optional-locale")
	expect(() => buildUrl({ to: users, params: { id: null } })).toThrow(/id/)
})
