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

// The same page with a thousand rows, and its navigation data request over Solid's render of the same tree (plan 21
// 15.6): each budget is its ratio measured on 2026-10-21 with the same 1.6x room as above, so a per-row cost or a
// per-request cost in the data answer fails.
const ROWS_BUDGET = 2.5
const DATA_BUDGET = 0.5

const items = (length: number) =>
	Array.from({ length }, (_, index) => ({ id: index, title: `Item ${index}`, body: `Body ${index}` }))
const ITEMS = items(200)
const ROWS = items(1000)

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

// Solid's own stream of the document of `rows`, read to its end.
async function plain(rows: typeof ITEMS): Promise<string> {
	let text = ""
	const sink = new WritableStream<unknown>({
		write(chunk) {
			text += typeof chunk === "string" ? chunk : decoder.decode(chunk as Uint8Array, { stream: true })
		},
	})
	await renderToStream(() => documentOf(() => body(rows))).pipeTo(sink)
	return text
}

const root = createRootLayout("_root_").render((props) => documentOf(() => props.children))
const pageOf = (id: "_root_/" | "_root_/rows", rows: typeof ITEMS) =>
	createPage(id)
		.loader(() => rows)
		.render((props) => body(props.loaderData as typeof ITEMS))
const routeTree = [
	{ id: "_root_/", path: "/", module: pageOf("_root_/", ITEMS) },
	{ id: "_root_/rows", path: "/rows", module: pageOf("_root_/rows", ROWS) },
]
const server = createServer({ router: createRouter({ layouts: { _root_: root }, routeTree }) })

async function flare(path: string): Promise<string> {
	return (await server.fetch(new Request(`http://localhost${path}`))).text()
}

async function timed(run: () => Promise<string>): Promise<number> {
	const start = performance.now()
	await run()
	return performance.now() - start
}

function median(times: number[]): number {
	return times.sort((left, right) => left - right)[Math.floor(times.length / 2)] ?? Number.NaN
}

// Flare's run over Solid's, as the median of alternating rounds after a warm-up: a pause or a frequency change on the
// machine falls on both sides.
async function ratio(
	sides: { flare: () => Promise<string>; plain: () => Promise<string> },
	rounds = 200,
): Promise<number> {
	for (let warm = 0; warm < 30; warm++) await Promise.all([sides.plain(), sides.flare()])
	const times = { plain: [] as number[], flare: [] as number[] }
	for (let round = 0; round < rounds; round++) {
		times.plain.push(await timed(sides.plain))
		times.flare.push(await timed(sides.flare))
	}
	return median(times.flare) / median(times.plain)
}

it("ssr ratio", async () => {
	expect(await flare("/")).toContain('id="item-199"')
	expect(await plain(ITEMS)).toContain('id="item-199"')
	expect(await ratio({ flare: () => flare("/"), plain: () => plain(ITEMS) })).toBeLessThanOrEqual(RATIO_BUDGET)
}, 120_000)

// A thousand rows: a cost Flare adds per row grows past the ratio a page of two hundred holds.
it("ssr ratio, a thousand rows", async () => {
	expect(await flare("/rows")).toContain('id="item-999"')
	const measured = await ratio({ flare: () => flare("/rows"), plain: () => plain(ROWS) }, 60)
	expect(measured).toBeLessThanOrEqual(ROWS_BUDGET)
}, 120_000)

// The navigation's data request, routed, loaded, and written as NDJSON, over Solid's render of the same tree: the data
// answer must stay cheaper than a document, and a per-request cost in it shows.
it("data ratio", async () => {
	expect(await flare("/?_flare=data")).toContain("Item 199")
	const measured = await ratio({ flare: () => flare("/?_flare=data"), plain: () => plain(ITEMS) })
	expect(measured).toBeLessThanOrEqual(DATA_BUDGET)
}, 120_000)
