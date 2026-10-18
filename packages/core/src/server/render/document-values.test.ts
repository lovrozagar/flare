import { createComponent, Loading } from "solid-js"
import { expect, it } from "vitest"
import { createRouter } from "../../shared/router/create-router.ts"
import { renderDocument } from "./document.ts"
import { writeDocumentValues } from "./document-values.ts"

// A live document writes each value under its route and key through Solid's channel, a promise streamed when it
// settles; outside a render there is no channel and nothing is written (BUGS.md 375).
it("writes values", async () => {
	expect(() => writeDocumentValues([{ route: "_root_/p", key: "v", view: Promise.resolve(1) }])).not.toThrow()
	const later = Promise.withResolvers<string>()
	const body = await renderDocument({
		request: new Request("http://localhost/"),
		router: createRouter({ layouts: {}, routeTree: [] }),
		matches: [],
		render: () => {
			writeDocumentValues([
				{ route: "_root_/p", key: "now", view: Promise.resolve("five stars") },
				{ route: "_root_/p", key: "later", view: later.promise },
			])
			return createComponent(Loading, { fallback: "waiting", children: "page" })
		},
	})
	later.resolve("streamed")
	const html = await new Response(body).text()
	expect(html).toContain(JSON.stringify("flare:_root_/p\nnow"))
	expect(html).toContain(JSON.stringify("flare:_root_/p\nlater"))
	expect(html).toContain('"five stars"')
	expect(html).toContain('"streamed"')
})
