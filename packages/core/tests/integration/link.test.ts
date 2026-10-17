import { createComponent } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, it } from "vitest"
import * as z from "zod"
import { Link } from "../../src/shared/components/link.tsx"
import { redirect } from "../../src/shared/errors/index.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { buildUrl } from "../../src/exports/index.ts"
import { href } from "../../src/shared/url/index.ts"
import { SITE, bodyOf, serve } from "./builder-app.ts"

// dx/link.md's Link markup, Href, and URL values through the real createServer(...).fetch (B96): pages that render
// real Links, read from the document the server sends, and the URL text read back by a route's own validators. What a
// click, the active state after a navigation, and prefetch do in a browser is link-client.test.ts.

type Props = Record<string, unknown>

// A Link, as an app writes `<Link {...props}>children</Link>`.
const link = (props: Props): unknown => createComponent(Link as never, { ...props, children: String(props["id"]) })

// A page at /<name> that renders `links`, each a fresh element per render.
function linksPage(name: string, links: () => Props[]) {
	return {
		id: `_root_/${name}`,
		path: `/${name}`,
		module: createPage(`_root_/${name}`).render(() =>
			createComponent(Dynamic, {
				component: "nav",
				get children() {
					return links().map(link)
				},
			}),
		),
	}
}

const target = (id: string, path: string) => ({
	id,
	path,
	module: createPage(id).render(() => id),
})

// A page whose loader redirects to `href`.
const away = (name: string, to: string) => ({
	id: `_root_/away-${name}`,
	path: `/away-${name}`,
	module: createPage(`_root_/away-${name}`)
		.loader(() => {
			throw redirect({ href: to })
		})
		.render(() => "away"),
})

// Reads each search value back as a route's validator does: numbers, booleans, dates, and JSON coerced. A bigint
// is written as its digits; this reader leaves it out, since a validator output must serialize into the page state.
const coerced = (value: unknown): Record<string, unknown> => {
	const raw = Object(value) as Record<string, unknown>
	return {
		n: Number(raw["n"]),
		ok: raw["ok"] === "true",
		at: new Date(String(raw["at"])),
		tag: [raw["tag"]].flat(),
		obj: JSON.parse(String(raw["obj"])) as unknown,
		text: raw["text"],
	}
}

const AT = new Date("2026-10-16T12:00:00.000Z")
const VALUES = { text: "a b&c/é", n: 3, ok: true, big: 10n, at: AT, tag: ["x", "y"], obj: { a: [1] }, none: null }

const get = serve([
	linksPage("links", () => [
		{ id: "user", to: "_root_/users/[id]", params: { id: "7" }, search: { q: "a b" }, hash: "top" },
		{ id: "files", to: "_root_/files/[...path]", params: { path: ["a", "b c"] } },
		{ id: "opt-none", to: "_root_/opt/[[id]]", params: { id: undefined } },
		{ id: "opt-set", to: "_root_/opt/[[id]]", params: { id: "9" } },
		{ id: "reserved", to: "_root_/echo", search: { _flare: "data", _flare_stale: "1", keep: "k" } },
		{ id: "values", to: "_root_/echo", search: VALUES },
		{ id: "doc", to: "_root_/feed" },
		{ id: "ext", href: "https://ext.example/x?y=1", target: "_blank" },
		{ id: "ext-rel", href: "https://ext.example/z", target: "_blank", rel: "external" },
		{ id: "path", href: "/plain" },
		{ id: "js", href: "javascript:alert(1)" },
		{ id: "data", href: "data:text/html,x" },
		{ id: "blob", href: "blob:https://x/y" },
		{ id: "vb", href: "vbscript:x" },
		{ id: "space", href: " javascript:alert(1)" },
		{ id: "control", href: "\u0001javascript:alert(1)" },
		{ id: "off", to: "_root_/echo", disabled: true },
		{ id: "attrs", to: "_root_/echo", title: "T", "data-k": "v", class: "c", style: { color: "red" }, href: "/no" },
	]),
	linksPage("active", () => [
		{ id: "here", to: "_root_/active", search: { b: "2", a: "1" }, activeClass: "on", inactiveClass: "off" },
		{ id: "here-props", to: "_root_/active", search: { a: "1", b: "2" }, activeProps: { "data-on": "1" } },
		{ id: "other", to: "_root_/echo", activeClass: "on", inactiveClass: "off", inactiveProps: { "data-off": "1" } },
		{ id: "partial", to: "_root_/active", search: { a: "1" }, activeClass: "on", inactiveClass: "off" },
		{ id: "prefix", to: "_root_/act", search: { a: "1", b: "2" }, activeClass: "on", inactiveClass: "off" },
		{
			id: "custom",
			to: "_root_/echo",
			activeClass: "on",
			isActive: (at: { pathname: string }) => at.pathname === "/active",
		},
		{
			id: "stated",
			to: "_root_/active",
			search: { a: "1", b: "2" },
			class: "base",
			activeClass: "on",
			activeProps: { class: "bold", tabindex: 0 },
		},
	]),
	linksPage("tags", () => [
		{ id: "both", to: "_root_/tags", search: { tag: ["y", "x"] }, activeClass: "on", inactiveClass: "off" },
		{ id: "one", to: "_root_/tags", search: { tag: ["x"] }, activeClass: "on", inactiveClass: "off" },
		{ id: "thrice", to: "_root_/tags", search: { tag: ["x", "x", "y"] }, activeClass: "on", inactiveClass: "off" },
	]),
	linksPage("tags/inner", () => [{ id: "parent", to: "_root_/tags", activeClass: "on", inactiveClass: "off" }]),
	linksPage("handed", () => [
		{ id: "mail", href: "mailto:a@b.example" },
		{ id: "tel", href: "tel:+1555" },
		{ id: "sms", href: "SMS:+1555" },
		{ id: "fragment", href: "#top" },
	]),
	linksPage("relative", () => [{ id: "relative", href: "about" }]),
	linksPage("empty", () => [{ id: "empty", to: "_root_/users/[id]", params: { id: "" } }]),
	linksPage("empty-optional", () => [{ id: "empty-optional", to: "_root_/opt/[[id]]", params: { id: "" } }]),
	linksPage("missing", () => [{ id: "missing", to: "_root_/users/[id]", params: {} }]),
	linksPage("fn", () => [{ id: "fn", to: "_root_/echo", search: { f: () => 1 } }]),
	linksPage("all", () => [{ id: "all", to: "_root_/echo", prefetch: { modules: "all" } }]),
	linksPage("dots", () => [{ id: "dots", to: "_root_/users/[id]", params: { id: ".." } }]),
	linksPage("emoji", () => [{ id: "emoji", to: "_root_/users/[id]", params: { id: "😀" } }]),
	linksPage("hidden", () => [
		{ id: "slash", href: "/\\evil.example" },
		{ id: "tab", href: "/\t/evil.example" },
	]),
	target("_root_/users/[id]", "/users/[id]"),
	target("_root_/files/[...path]", "/files/[...path]"),
	target("_root_/opt/[[id]]", "/opt/[[id]]"),
	target("_root_/act", "/act"),
	{
		id: "_root_/echo",
		path: "/echo",
		module: createPage("_root_/echo")
			.input({ searchParams: coerced })
			.render((props) => JSON.stringify(props.search)),
	},
	{
		id: "_root_/flag",
		path: "/flag",
		// dx/link.md's advice for a boolean read back from the URL.
		module: createPage("_root_/flag")
			.input({ searchParams: z.object({ open: z.stringbool() }) })
			.render((props) => `open:${String(props.search.open)}`),
	},
	{
		id: "_root_/feed",
		path: "/feed",
		module: createPage("_root_/feed").response(() => new Response("feed")),
	},
	away("ok", "https://ok.example/x"),
	{
		id: "_root_/moved",
		path: "/moved",
		module: createPage("_root_/moved")
			.loader(() => {
				throw redirect({ to: "_root_/echo", search: VALUES } as never)
			})
			.render(() => "moved"),
	},
	away("bad", "javascript:alert(1)"),
])

// Each anchor the page renders, by id: its attributes.
async function anchors(path: string): Promise<Record<string, Record<string, string>>> {
	const html = bodyOf((await get(path)).text)
	const out: Record<string, Record<string, string>> = {}
	for (const match of html.matchAll(/<a\b((?:[^>"]|"[^"]*")*)>([^<]*)<\/a>/g)) {
		const attrs: Record<string, string> = {}
		for (const attr of (match[1] ?? "").matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[attr[1] ?? ""] = attr[2] ?? ""
		out[match[2] ?? ""] = attrs
	}
	return out
}

const unescape = (value: string | undefined): string => (value ?? "").replaceAll("&amp;", "&")

// `to` builds the href from params, search, and hash; a catch-all joins its segments with `/`; an optional param left
// undefined drops; reserved search keys are stripped; a `.response()` page is linked like any page; `href` is the
// anchor's href as given; `_blank` gets `noopener noreferrer` unless `rel` is set; a disabled link stays an anchor with
// aria-disabled and tabindex -1; other attributes pass through, but not `href` beside `to`.
it("link markup", async () => {
	const a = await anchors("/links")
	expect(a["user"]?.["href"]).toBe("/users/7?q=a%20b#top")
	expect(a["files"]?.["href"]).toBe("/files/a/b%20c")
	expect(a["opt-none"]?.["href"]).toBe("/opt")
	expect(a["opt-set"]?.["href"]).toBe("/opt/9")
	expect(a["reserved"]?.["href"]).toBe("/echo?keep=k")
	expect(a["doc"]?.["href"]).toBe("/feed")
	expect(unescape(a["ext"]?.["href"])).toBe("https://ext.example/x?y=1")
	expect(a["ext"]).toMatchObject({ target: "_blank", rel: "noopener noreferrer" })
	expect(a["ext-rel"]?.["rel"]).toBe("external")
	expect(a["path"]?.["href"]).toBe("/plain")
	expect(a["off"]).toMatchObject({ href: "/echo", "aria-disabled": "true", tabindex: "-1" })
	expect(a["attrs"]).toMatchObject({ href: "/echo", title: "T", "data-k": "v", class: "c", style: "color:red" })
	// `modules: "all"` is the router's alone: a Link cast to it throws in dev, and the document is a 500.
	expect((await get("/all")).status).toBe(500)
})

// A rejected scheme, or one hidden behind whitespace or a control byte, renders `href="#"`; `href()` throws on each,
// accepts a path with one `/` and http(s), and rejects `//`; `buildUrl` gives the href a Link renders.
it("href", async () => {
	const a = await anchors("/links")
	for (const id of ["js", "data", "blob", "vb", "space", "control"]) expect([id, a[id]?.["href"]]).toEqual([id, "#"])
	for (const value of ["javascript:alert(1)", "data:text/html,x", "blob:https://x/y", "vbscript:x", " javascript:x"]) {
		expect(() => href(value)).toThrow(/^href$/)
	}
	expect(() => href("\u0001javascript:x")).toThrow(/^href$/)
	expect(() => href("//evil.example/x")).toThrow(/^href$/)
	expect(href("/a?b=1")).toBe("/a?b=1")
	expect(href("https://x.example/")).toBe("https://x.example/")
	expect(href("http://x.example/")).toBe("http://x.example/")
	const built = buildUrl({ to: "_root_/users/[id]", params: { id: "7" }, search: { q: "a b" }, hash: "top" } as never)
	expect(built).toBe(a["user"]?.["href"])
	expect((await get("/away-ok")).headers.get("location")).toBe("https://ok.example/x")
	expect((await get("/away-bad")).status).toBe(500)
})

// A browser drops tab, CR, and LF anywhere in a URL and reads a backslash as a slash, so `/\\evil.com` and a slash, a
// tab, and a slash are `//evil.com`, another origin: `href()` rejects them and a Link renders `#`; a backslash later in
// the path stays the app's (plan 21 7.7, BUGS.md 155).
it("hidden off-origin", async () => {
	for (const value of [
		"/\\evil.example",
		"/\t/evil.example",
		"/\n/evil.example",
		"/\r\\evil.example",
		"\\\\evil.example",
	]) {
		expect(() => href(value)).toThrow(/^href$/)
	}
	expect(href("/a\\b")).toBe("/a\\b")
	const a = await anchors("/hidden")
	expect([a["slash"]?.["href"], a["tab"]?.["href"]]).toEqual(["#", "#"])
})

// A param value that is a dot segment, `.` or `..` in any spelling a browser resolves (`%2e` too), would move the URL to
// another route: buildUrl and a Link throw on it (plan 21 7.6, BUGS.md 156).
it("dot segment params", async () => {
	for (const id of [".", "..", "%2e", "%2E%2e", ".%2E", "%2e."]) {
		expect(() => buildUrl({ to: "_root_/users/[id]", params: { id } } as never)).toThrow(/^param id$/)
	}
	expect(() => buildUrl({ to: "_root_/files/[...path]", params: { path: ["a", ".."] } } as never)).toThrow(
		/^param path$/,
	)
	expect(buildUrl({ to: "_root_/users/[id]", params: { id: "..." } } as never)).toBe("/users/...")
	expect(buildUrl({ to: "_root_/users/[id]", params: { id: "a.b" } } as never)).toBe("/users/a.b")
	expect((await get("/dots")).status).toBe(500)
})

// A param outside the BMP, an emoji, is percent-encoded as its UTF-8 bytes in the Link the server renders and in
// buildUrl, and that URL routes to the page (BUGS.md 193).
it("emoji params", async () => {
	const encoded = "/users/%F0%9F%98%80"
	expect(buildUrl({ to: "_root_/users/[id]", params: { id: "😀" } } as never)).toBe(encoded)
	const page = await get("/emoji")
	expect([page.status, page.text.includes(`href="${encoded}"`)]).toEqual([200, true])
	expect((await get(encoded)).status).toBe(200)
})

// One rule writes a value as URL text, for a Link, buildUrl, and redirect alike, and the route's validators read it
// back decoded (BUGS.md 147): a string percent-encoded; a number, boolean, and bigint as String; a Date as its ISO
// string; an array one entry per element; a plain object as JSON; null omitted. A function throws naming its key, as a
// missing required param does, and the document is a 500.
it("url values", async () => {
	const values = unescape((await anchors("/links"))["values"]?.["href"])
	const query = new URL(values, SITE).searchParams
	// The keys are sorted, so one value set is one URL text and one cache key (B31).
	expect([...query.keys()]).toEqual(["at", "big", "n", "obj", "ok", "tag", "tag", "text"])
	expect(values).toContain(`text=${encodeURIComponent("a b&c/é")}`)
	expect(query.get("at")).toBe(AT.toISOString())
	expect(query.get("obj")).toBe('{"a":[1]}')
	expect(query.get("big")).toBe("10")
	expect(buildUrl({ to: "_root_/echo", search: VALUES } as never)).toBe(values)
	expect((await get("/moved")).headers.get("location")).toBe(values)
	const read = bodyOf((await get(values)).text)
	expect(JSON.parse(read.replaceAll("&quot;", '"').replaceAll("&amp;", "&"))).toEqual({
		n: 3,
		ok: true,
		at: AT.toISOString(),
		tag: ["x", "y"],
		obj: { a: [1] },
		text: "a b&c/é",
	})
	expect((await get("/missing")).status).toBe(500)
	expect((await get("/fn")).status).toBe(500)
	expect(() => buildUrl({ to: "_root_/echo", search: { f: () => 1 } } as never)).toThrow(/f/)
	expect(() => buildUrl({ to: "_root_/echo", search: { s: Symbol("s") } } as never)).toThrow(/s/)
	expect(() => buildUrl({ to: "_root_/users/[id]", params: {} } as never)).toThrow(/id/)
})

// Active is the exact pathname and the search as a multiset of pairs, in any order; a prefix or a subset of the
// search is not; `isActive` replaces the rule. Active adds `activeClass`, `activeProps`, and aria-current; inactive
// adds `inactiveClass` and `inactiveProps`.
it("active", async () => {
	const a = await anchors("/active?a=1&b=2#hash")
	expect(a["here"]).toMatchObject({ class: "on", "aria-current": "page" })
	expect(a["here-props"]).toMatchObject({ "data-on": "1", "aria-current": "page" })
	expect(a["other"]).toMatchObject({ class: "off", "data-off": "1" })
	expect(a["other"]?.["aria-current"]).toBeUndefined()
	expect(a["partial"]?.["class"]).toBe("off")
	expect(a["prefix"]?.["class"]).toBe("off")
	expect(a["custom"]).toMatchObject({ class: "on", "aria-current": "page" })
	expect(a["stated"]).toMatchObject({ class: "base on bold", tabindex: "0", "aria-current": "page" })
})

// A repeated key must match as a multiset: the same pairs in any order are active, fewer or more are not. A parent
// path is not a prefix match.
it("active repeated keys and parent", async () => {
	const tags = await anchors("/tags?tag=x&tag=y")
	expect([tags["both"]?.["class"], tags["one"]?.["class"], tags["thrice"]?.["class"]]).toEqual(["on", "off", "off"])
	expect((await anchors("/tags/inner"))["parent"]?.["class"]).toBe("off")
})

// `mailto:`, `tel:`, `sms:` in any case, and a `#fragment` render as written; a relative href throws in dev, and the
// document is a 500 (BUGS.md 310). An empty path param is a missing one: required, a 500; optional, dropped (BUGS.md
// 307).
it("handed-off hrefs and empty params", async () => {
	const a = await anchors("/handed")
	expect(["mail", "tel", "sms", "fragment"].map((id) => a[id]?.["href"])).toEqual([
		"mailto:a@b.example",
		"tel:+1555",
		"SMS:+1555",
		"#top",
	])
	expect((await get("/relative")).status).toBe(500)
	expect((await get("/empty")).status).toBe(500)
	expect((await anchors("/empty-optional"))["empty-optional"]?.["href"]).toBe("/opt")
})

// A boolean goes into the URL as `true` or `false` and comes back the same through dx/link.md's advice, a real zod
// schema: `z.coerce.boolean()` would read `"false"` as true, since any non-empty string is truthy (plan 21 4.7).
it("boolean values", async () => {
	for (const open of [true, false]) {
		const url = buildUrl({ to: "_root_/flag", search: { open } } as never)
		expect(url).toBe(`/flag?open=${String(open)}`)
		expect(bodyOf((await get(url)).text)).toBe(`open:${String(open)}`)
	}
})
