/**
 * HTML Navigation Client Unit Tests
 *
 * Tests client-side HTML nav parsing and DOM swap.
 */

import { describe, expect, it } from "vitest"
import {
	extractAppContent,
	parseFlareStateFromHtml,
	toNavState,
} from "../../../src/client/html-nav"

describe("parseFlareStateFromHtml", () => {
	it("returns null for HTML without flare state", () => {
		const html = '<html><body><div id="app">Hello</div></body></html>'
		expect(parseFlareStateFromHtml(html)).toBeNull()
	})

	it("parses self.flare assignment", () => {
		const html = `
			<html>
			<body>
				<div id="app">Content</div>
				<script>self.flare = {"c":{},"q":[],"r":{"matches":[],"params":{},"pathname":"/"},"s":null};</script>
			</body>
			</html>
		`
		const state = parseFlareStateFromHtml(html)
		expect(state).not.toBeNull()
		expect(state?.r.pathname).toBe("/")
		expect(state?.s).toBeNull()
	})

	it("parses flare state with matches", () => {
		const html = `
			<script>self.flare = {
				"c":{},
				"q":[],
				"r":{
					"matches":[{"id":"_root_","loaderData":{"user":"alice"}}],
					"params":{"id":"123"},
					"pathname":"/users/123"
				},
				"s":"abc.123"
			};</script>
		`
		const state = parseFlareStateFromHtml(html)
		expect(state?.r.matches).toHaveLength(1)
		expect(state?.r.matches[0]?.loaderData).toEqual({ user: "alice" })
		expect(state?.r.params).toEqual({ id: "123" })
		expect(state?.s).toBe("abc.123")
	})

	it("parses flare state with queries", () => {
		const html = `
			<script>self.flare = {
				"c":{},
				"q":[{"key":["user",123],"data":{"name":"Bob"},"staleTime":60000}],
				"r":{"matches":[],"params":{},"pathname":"/"},
				"s":null
			};</script>
		`
		const state = parseFlareStateFromHtml(html)
		expect(state?.q).toHaveLength(1)
		expect(state?.q[0]?.key).toEqual(["user", 123])
		expect(state?.q[0]?.data).toEqual({ name: "Bob" })
	})

	it("returns null for malformed JSON", () => {
		const html = "<script>self.flare = {invalid json};</script>"
		expect(parseFlareStateFromHtml(html)).toBeNull()
	})
})

describe("extractAppContent", () => {
	it("extracts content from id=app div", () => {
		const html = `<html><body><div id="app"><h1>Hello</h1></div><script></script></body></html>`
		const content = extractAppContent(html)
		expect(content).toBe("<h1>Hello</h1>")
	})

	it("extracts content from id=root div", () => {
		const html = `<html><body><div id="root"><p>World</p></div><script></script></body></html>`
		const content = extractAppContent(html)
		expect(content).toBe("<p>World</p>")
	})

	it("handles double quotes in id", () => {
		const html = `<div id="app">Content</div><script>`
		expect(extractAppContent(html)).toBe("Content")
	})

	it("handles single quotes in id", () => {
		const html = `<div id='app'>Content</div><script>`
		expect(extractAppContent(html)).toBe("Content")
	})

	it("falls back to body content when no app div", () => {
		const html = "<html><body><div>No id</div></body></html>"
		expect(extractAppContent(html)).toBe("<div>No id</div>")
	})

	it("returns null when no body either", () => {
		const html = "<div>No body tag</div>"
		expect(extractAppContent(html)).toBeNull()
	})
})

describe("toNavState", () => {
	it("converts parsed flare state to nav state", () => {
		const parsed = {
			c: {},
			q: [{ data: { x: 1 }, key: ["test"], staleTime: 5000 }],
			r: {
				matches: [{ id: "_root_", loaderData: { user: "test" } }],
				params: { slug: "hello" },
				pathname: "/hello",
			},
			s: null,
		}

		const navState = toNavState(parsed)

		expect(navState.pathname).toBe("/hello")
		expect(navState.params).toEqual({ slug: "hello" })
		expect(navState.matches).toHaveLength(1)
		expect(navState.matches[0]?.id).toBe("_root_")
		expect(navState.matches[0]?.loaderData).toEqual({ user: "test" })
		expect(navState.queries).toHaveLength(1)
		expect(navState.queries[0]?.key).toEqual(["test"])
	})
})
