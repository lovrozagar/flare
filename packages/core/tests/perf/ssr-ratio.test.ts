import { createComponent } from "solid-js"
import { Dynamic, renderToStream, type JSX } from "@solidjs/web"
import { expect, it } from "vitest"
import { createServer } from "../../src/server/lifecycle/create.ts"
import { createPage } from "../../src/shared/route-builder/page.ts"
import { createRootLayout } from "../../src/shared/route-builder/root-layout.ts"
import { createRouter } from "../../src/shared/router/create-router.ts"

// What a Flare document costs over plain Solid on the server, tracked as a ratio, which a slower or faster machine
// moves on both sides alike (plan 21 15.5). The plain side is Solid's own stream of the same tree; the Flare side
// is `createServer(...).fetch` of a page whose loader returns the list, so it also routes, runs the loader, writes the
// security headers, and serializes the data into the state script the client hydrates from. Before plan 21 15.1 to
// 15.4 the audit measured 3.5x; on 2026-10-17 this page measured 1.6x. The budget leaves room for a slower runner's
// noise and still fails on a per-request regression of the kind those fixed.
const RATIO_BUDGET = 2.5

const ITEMS = Array.from({ length: 200 }, (_, index) => ({ id: index, title: `Item ${index}`, body: `Body ${index}` }))

// An element, as JSX compiles one for the server.
function h(component: string, children: () => JSX.Element, props: Record<string, unknown> = {}): JSX.Element {
	return createComponent(Dynamic, {
		component,
		...props,
		get children() {
			return children()
		},
	})
}

// The page body both sides render: a heading and a list of two hundred items.
function body(items: typeof ITEMS): JSX.Element {
	const item = (entry: (typeof ITEMS)[number]) =>
		h("li", () => [h("h2", () => entry.title), h("p", () => entry.body)], { id: `item-${entry.id}` })
	return h("main", () => [h("h1", () => "Catalog"), h("ul", () => items.map(item))])
}

function documentOf(children: () => JSX.Element): JSX.Element {
	return h("html", () => [h("head", () => h("title", () => "Catalog")), h("body", children)])
}

const decoder = new TextDecoder()

// Solid's own stream of the document, read to its end.
async function plain(): Promise<string> {
	let text = ""
	const sink = new WritableStream<unknown>({
		write(chunk) {
			text += typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array, { stream: true })
		},
	})
	await renderToStream(() => documentOf(() => body(ITEMS))).pipeTo(sink)
	return text
}

const root = createRootLayout("_root_").render((props) => documentOf(() => props.children))
const page = createPage("_root_/")
	.loader(() => ITEMS)
	.render((props) => body(props.loaderData as typeof ITEMS))
const routeTree = [{ id: "_root_/", path: "/", module: page }]
const server = createServer({ router: createRouter({ layouts: { _root_: root }, routeTree }) })

async function flare(): Promise<string> {
	return (await server.fetch(new Request("http://localhost/"))).text()
}

async function timed(run: () => Promise<string>): Promise<number> {
	const start = performance.now()
	await run()
	return performance.now() - start
}

function median(times: number[]): number {
	return times.sort((left, right) => left - right)[Math.floor(times.length / 2)] ?? Number.NaN
}

// The rounds alternate the two sides, so a pause or a frequency change on the machine falls on both.
it("ssr ratio", async () => {
	const rendered = await flare()
	expect(rendered).toContain('id="item-199"')
	expect(await plain()).toContain('id="item-199"')
	for (let warm = 0; warm < 30; warm++) await Promise.all([plain(), flare()])
	const sides = { plain: [] as number[], flare: [] as number[] }
	for (let round = 0; round < 200; round++) {
		sides.plain.push(await timed(plain))
		sides.flare.push(await timed(flare))
	}
	const ratio = median(sides.flare) / median(sides.plain)
	expect(ratio).toBeLessThanOrEqual(RATIO_BUDGET)
}, 120_000)
