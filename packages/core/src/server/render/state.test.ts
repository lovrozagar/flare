import { expect, it } from "vitest"
import { createRouter } from "../../shared/router/create-router.ts"
import { renderDocument } from "./document.ts"
import { insertState, stateScript } from "./state.ts"

it("one script", async () => {
	const body = await renderDocument({
		request: new Request("http://localhost/"),
		router: createRouter({ layouts: {}, routeTree: [] }),
		matches: [{ id: "_root_", params: {}, search: {}, data: { n: 1 }, preloader: {}, head: null, error: null }],
		render: () => "page",
	})
	const html = await new Response(body).text()
	expect(html.match(/self\.flare/g)).toHaveLength(1)
	const start = html.indexOf("self.flare=")
	const source = html.slice(start, html.indexOf("</script>", start))
	const value = Function(`const self = {}; ${source}; return self.flare;`)() as {
		matches: Array<Record<string, unknown> & { data: { n: number } }>
	}
	expect(value.matches[0]?.data.n).toBe(1)
	expect(Object.keys(value.matches[0] ?? {}).sort()).toEqual([
		"data",
		"error",
		"head",
		"id",
		"params",
		"preloader",
		"search",
	])
})

it("nonce field", async () => {
	const html = await new Response(
		await renderDocument({
			request: new Request("http://localhost/"),
			router: createRouter({ layouts: {}, routeTree: [] }),
			matches: [],
			nonce: "abc",
			render: () => "page",
		}),
	).text()
	expect(html).toContain('"nonce":"abc"')
})

it("empty nonce", async () => {
	const html = await new Response(
		await renderDocument({
			request: new Request("http://localhost/"),
			router: createRouter({ layouts: {}, routeTree: [] }),
			matches: [],
			nonce: "",
			render: () => "page",
		}),
	).text()
	expect(html).toContain('"nonce":""')
})

it("insertion", () => {
	const script = '<script id="flare-state">self.flare=1</script>'
	const html = insertState("<body>hi</body>", script)
	expect(html.indexOf(script)).toBeGreaterThan(-1)
	expect(html.indexOf(script)).toBeLessThan(html.indexOf("</body>"))
})

// A render that left a `"stream"` hole says so, so the client sends one fill after hydrate. Without a hole the field
// is absent. `build` is the id `flare-build` carries.
it("fill flag", () => {
	expect(stateScript({ matches: [], nonce: "", build: "b", at: 5, fill: true })).toBe(
		'<script id="flare-state">self.flare={"matches":[],"nonce":"","build":"b","at":5,"fill":true}</script>',
	)
	expect(stateScript({ matches: [], nonce: "", build: "b", at: 5 })).toBe(
		'<script id="flare-state">self.flare={"matches":[],"nonce":"","build":"b","at":5}</script>',
	)
})

// The state's `field` for a document whose stream writes `shell`, or for the plain render without one.
async function stateField(shell: string | undefined, field = "head"): Promise<unknown> {
	const html = await new Response(
		await renderDocument({
			request: new Request("http://localhost/"),
			router: createRouter({ layouts: {}, routeTree: [] }),
			matches: [],
			render: () => "x",
			...(shell === undefined
				? {}
				: {
						stream: () => ({ pipeTo: (writable) => new Response(shell).body?.pipeTo(writable) ?? Promise.resolve() }),
					}),
		}),
	).text()
	const start = html.indexOf("self.flare=")
	const source = html.slice(start, html.indexOf("</script>", start))
	return Reflect.get(Function(`const self = {}; ${source}; return self.flare;`)(), field)
}

// The state carries the final shell's head sequence, the capture script and its `xs` marker Flare adds included, for
// the client's guard (B120). A shell with no head carries an empty one.
it("head sequence", async () => {
	const shell = "<html><head><title>T</title><!--$--><meta name=a><!--/--></head><body>x</body></html>"
	expect(await stateField(shell)).toEqual(["title", "!$", "meta", "!/", "script", "!xs"])
	expect(await stateField(undefined)).toEqual([])
})

// The state carries the render's time, so a stored or CDN copy tells the client how old its data is (BUGS.md 139).
it("render time", async () => {
	const before = Date.now()
	const at = await stateField(undefined, "at")
	expect(at).toBeGreaterThanOrEqual(before)
	expect(at).toBeLessThanOrEqual(Date.now())
})
