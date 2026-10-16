import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import { builtServer, fixtureApps, page, rootLayout, type Server } from "./vite-app.ts"

// dx/cache.md's build-time modes through a real `vite build` with prerender, and the built server (B96): which pages
// become seeds under `_flare-static`, and what the server answers from them. The server reads the seeds through
// `createAssetsStore(fileAssets(dist/client))`, and stores live renders in memory.

const apps = fixtureApps()
let root = ""
let server: Server

const SERVER = `import { createAssetsStore, createMemoryStore, createServer } from "@lovrozagar/flare/server"
import { fileAssets } from "@lovrozagar/flare/stores/fs"
import { fileURLToPath } from "node:url"
import { router } from "./router.ts"
const client = fileURLToPath(new URL("../client", import.meta.url))
export const server = createServer({
	router,
	site: "https://example.com",
	store: createMemoryStore(),
	static: createAssetsStore(fileAssets(client)),
})
`

// A page whose loader defers a value; the render prints it once settled.
const DEFERRED = `import { createPage, useDeferred } from "@lovrozagar/flare"
import { Loading } from "solid-js"
export const route = createPage("_root_/deferred")
	.cache({ ssg: { defer: "resolve" } })
	.loader(({ defer }) => ({ late: defer(() => Promise.resolve("settled at build")) }))
	.render((props) => {
		const late = useDeferred(() => props.loaderData.late)
		return <p id="page"><Loading fallback="wait">{late()}</Loading></p>
	})
`

beforeAll(async () => {
	root = apps.make({
		"vite.config.mjs":
			'import { flare } from "@lovrozagar/flare/vite";\nexport default { logLevel: "error", plugins: [flare({ prerender: true })] };\n',
		"src/server.ts": SERVER,
		"src/routes/_root_/root.root-layout.tsx": rootLayout("_root_"),
		"src/routes/_root_/one/one.page.tsx": page("_root_/one", ".cache({ ssg: true })"),
		"src/routes/_root_/deferred/deferred.page.tsx": DEFERRED,
		"src/routes/_root_/posts/[slug]/post.page.tsx": page(
			"_root_/posts/[slug]",
			'.cache({ ssg: () => [{ slug: "a" }, { slug: "b" }] })',
		),
		"src/routes/_root_/docs/[slug]/doc.page.tsx": page(
			"_root_/docs/[slug]",
			'.cache({ ssg: { params: () => [{ slug: "x" }], defer: "resolve" } })',
		),
		"src/routes/_root_/items/[id]/item.page.tsx": page(
			"_root_/items/[id]",
			'.cache({ isr: { params: () => [{ id: "1" }], revalidate: "1h" } })',
		),
		"src/routes/_root_/lazy/lazy.page.tsx": page("_root_/lazy", ".cache({ isr: true })"),
	})
	server = await builtServer(root)
}, 180_000)

afterAll(() => apps.removeAll())

// Every seed the build wrote under `_flare-static`, as text.
function seedTexts(): string[] {
	const dir = join(root, "dist", "client")
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((path) => path.includes("_flare-static") && statSync(join(dir, path)).isFile())
		.map((path) => readFileSync(join(dir, path), "utf8"))
}

// The store key of every seed, without its build id: `<routeId>` or `<routeId>:<params>`.
function seededKeys(): string[] {
	return seedTexts()
		.map((text) => String(JSON.parse(text).key).replace(/^static:[^:]+:/, ""))
		.toSorted()
}

// The seed for one key.
function seedOf(key: string): string | undefined {
	return seedTexts().find((text) => String(JSON.parse(text).key).endsWith(`:${key}`))
}

async function get(path: string): Promise<{ status: number; cache: string | null; text: string }> {
	const response = await server.fetch(new Request(`https://example.com${path}`))
	return { status: response.status, cache: response.headers.get("flare-cache"), text: await response.text() }
}

// Every ssg form is built: `true` and `{ defer }` once, a params function and `{ params, defer }` once per slug. An
// isr page with `params` is built for each; `isr: true` is not.
it("build seeds", () => {
	expect(seededKeys()).toEqual([
		"_root_/deferred",
		"_root_/docs/[slug]:x",
		"_root_/items/[id]:1",
		"_root_/one",
		"_root_/posts/[slug]:a",
		"_root_/posts/[slug]:b",
	])
	expect(seedOf("_root_/deferred")).toContain("settled at build")
})

// A seeded page is served from its seed; an ssg slug its params did not list is 404; an isr slug outside its build
// params renders live, as does an on-demand isr page.
it("seeded answers", async () => {
	for (const path of ["/one", "/deferred", "/posts/a", "/posts/b", "/docs/x", "/items/1"]) {
		expect(await get(path)).toMatchObject({ status: 200, cache: "hit" })
	}
	expect((await get("/deferred")).text).toContain("settled at build")
	expect((await get("/posts/c")).status).toBe(404)
	expect(await get("/items/2")).toMatchObject({ status: 200, cache: "miss" })
	expect(await get("/lazy")).toMatchObject({ status: 200, cache: "miss" })
})
