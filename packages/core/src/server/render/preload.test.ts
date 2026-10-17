import { expect, it } from "vitest"
import { createRouter } from "../../shared/router/create-router.ts"
import { renderDocument, type DocumentInput } from "./document.ts"
import { preloadLinks } from "./preload.ts"

const table = {
	entry: ["/assets/client.js", "/assets/runtime.js"],
	routes: {
		"/src/routes/_root_/root.root-layout.tsx": ["/assets/root.js", "/assets/runtime.js"],
		"/src/routes/_root_/about/about.page.tsx": ["/assets/about.js"],
	},
}
const chunks = {
	_root_: "/src/routes/_root_/root.root-layout.tsx",
	"_root_/about": "/src/routes/_root_/about/about.page.tsx",
	"_root_/listed": ["/assets/listed.js"],
}

// The client entry's modules, then each matched route's, once each, as modulepreload links with the request's nonce, so
// the browser fetches the whole chain while it parses the head (plan 21 15.3). A route the table does not hold, one the
// map names by a list, or an id with no chunk adds nothing; a build with no table, dev, writes no link.
it("chain links", () => {
	expect(preloadLinks({ ids: ["_root_", "_root_/about"], chunks, nonce: "n", table })).toBe(
		'<link rel="modulepreload" href="/assets/client.js" nonce="n">' +
			'<link rel="modulepreload" href="/assets/runtime.js" nonce="n">' +
			'<link rel="modulepreload" href="/assets/root.js" nonce="n">' +
			'<link rel="modulepreload" href="/assets/about.js" nonce="n">',
	)
	expect(preloadLinks({ ids: ["_root_/listed", "_root_/none"], chunks, nonce: "", table })).toBe(
		'<link rel="modulepreload" href="/assets/client.js">' + '<link rel="modulepreload" href="/assets/runtime.js">',
	)
	expect(preloadLinks({ ids: ["_root_"], chunks, nonce: "n", table: { entry: [], routes: {} } })).toBe("")
	expect(preloadLinks({ ids: [], chunks, nonce: "", table: { entry: ['/a"b.js'], routes: {} } })).toBe(
		'<link rel="modulepreload" href="/a&quot;b.js">',
	)
})

// A stand-in for renderToStream that writes one shell.
const shell: DocumentInput["stream"] = () => ({
	async pipeTo(writable) {
		const writer = writable.getWriter()
		await writer.write("<html><head><title>T</title></head><body>x</body></html>")
		await writer.close()
	},
})

// The document writes the matched chain's links in its head, from the deploy's table (plan 21 15.3).
it("document head", async () => {
	const router = createRouter({ layouts: {}, routeTree: [], chunks })
	const match = { id: "_root_/about", params: {}, search: {}, data: null, preloader: {}, head: null, error: null }
	const input = {
		request: new Request("http://localhost/"),
		router,
		matches: [match],
		render: () => "x",
		stream: shell,
	}
	const html = await new Response(await renderDocument({ ...input, nonce: "n", preloads: table })).text()
	const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"))
	expect(head).toContain('<link rel="modulepreload" href="/assets/client.js" nonce="n">')
	expect(head).toContain('<link rel="modulepreload" href="/assets/about.js" nonce="n">')
	expect(await new Response(await renderDocument(input)).text()).not.toContain("modulepreload")
})
