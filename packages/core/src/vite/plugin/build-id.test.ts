import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createBuilder } from "vite"
import { afterEach, expect, it } from "vitest"
import { buildIdOf, buildIdPlugin, buildInfoSource, ID_PLACEHOLDER } from "./build-id.ts"
import { flare } from "./flare.ts"

// Inside the repo's node_modules, so a fixture's imports of the framework and Solid resolve as an app's would.
const FIXTURES = fileURLToPath(new URL("../../../../../node_modules/.flare-fixtures/", import.meta.url))

const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const MANIFEST = {
	"src/client.tsx": { file: "assets/client-a1.js", css: ["assets/style-c3.css"] },
	"src/lazy.ts": { file: "assets/b2.js" },
	"style.css": { file: "assets/style-c3.css" },
}

it("dev", () => {
	const urls = { base: "/", assetsBase: "/assets" }
	const source = buildInfoSource({ command: "serve", entry: "src/client.tsx", manifest: "", urls, devHead: "" })
	expect(source).toContain('export const buildId = "dev";')
})

// The server's build info carries devHead in dev, and an empty one otherwise (B95 (b)).
it("dev head", () => {
	const urls = { base: "/", assetsBase: "/assets" }
	const head = '<script type="module" src="/@vite/client"></script>'
	const input = { entry: "src/client.tsx", manifest: "", urls, devHead: head }
	expect(buildInfoSource({ ...input, command: "serve" })).toContain(`export const devHead = ${JSON.stringify(head)};`)
})

// sha256 over the sorted, deduped, root-relative JS and CSS URLs (`file` and `css` only), then each server chunk's
// file name and code in file-name order, first 12 hex digits (plan 21 3.1).
it("hash", () => {
	const urls = ["/assets/b2.js", "/assets/client-a1.js", "/assets/style-c3.css"]
	const chunks = [
		{ fileName: "server.js", code: "a" },
		{ fileName: "chunk.js", code: "b" },
	]
	const expected = createHash("sha256")
		.update(urls.join("\n"))
		.update("\0chunk.js\0b")
		.update("\0server.js\0a")
		.digest("hex")
		.slice(0, 12)
	expect(buildIdOf(MANIFEST, chunks)).toBe(expected)
	expect(expected).toMatch(/^[0-9a-f]{12}$/)
	const reordered = Object.fromEntries(Object.entries(MANIFEST).reverse())
	expect(buildIdOf(reordered, chunks.toReversed())).toBe(expected)
	expect(buildIdOf(MANIFEST, [chunks[0] ?? { fileName: "", code: "" }])).not.toBe(expected)
	expect(ID_PLACEHOLDER).toHaveLength(12)
})

// One generateBundle of the id plugin over a one-chunk bundle: the chunk's code after it.
function run(state: { manifest: string; buildId?: string }, name: string, command = "build"): string | undefined {
	const bundle = {
		"server.js": { type: "chunk", fileName: "server.js", code: `const id = "${ID_PLACEHOLDER}";` },
		"server.js.map": { type: "asset", fileName: "server.js.map" },
	}
	const hook = buildIdPlugin(state).generateBundle as { handler: (...args: unknown[]) => void }
	hook.handler.call({ environment: { name, config: { command } } }, {}, bundle)
	return bundle["server.js"].code
}

// The ssr build stamps the id over the placeholder in every chunk, the prerender build stamps the same id, and a
// prerender build with no ssr id before it, or a dev run, stamps nothing.
it("stamp", () => {
	const root = mkdtempSync(join(fixtures(), "id-"))
	roots.push(root)
	const manifest = join(root, "manifest.json")
	writeFileSync(manifest, JSON.stringify(MANIFEST))
	const state: { manifest: string; buildId?: string } = { manifest }
	expect(() => run(state, "flare_prerender")).toThrow("the ssr build's id")
	const stamped = run(state, "ssr")
	const id = state.buildId ?? ""
	expect(id).toBe(buildIdOf(MANIFEST, [{ fileName: "server.js", code: `const id = "${ID_PLACEHOLDER}";` }]))
	expect([stamped, run(state, "flare_prerender")]).toEqual([`const id = "${id}";`, `const id = "${id}";`])
	expect([run(state, "client"), run(state, "ssr", "serve")]).toEqual([
		`const id = "${ID_PLACEHOLDER}";`,
		`const id = "${ID_PLACEHOLDER}";`,
	])
})

it("missing", () => {
	const root = mkdtempSync(join(fixtures(), "id-"))
	roots.push(root)
	const path = join(root, ".vite/manifest.json")
	const urls = { base: "/", assetsBase: "/assets" }
	const input = { command: "build", entry: "src/client.tsx", manifest: path, urls, devHead: "" } as const
	expect(() => buildInfoSource(input)).toThrow(path)
	mkdirSync(join(root, ".vite"))
	writeFileSync(path, JSON.stringify(MANIFEST))
	expect(buildInfoSource(input)).toContain(`export const buildId = "${ID_PLACEHOLDER}";`)
})

const SERVER = `import { createPage, createRootLayout, createRouter } from "@lovrozagar/flare";
import { createServer } from "@lovrozagar/flare/server";

const root = createRootLayout("_root_").render((props) => props.children);
const home = createPage("_root_/").render(() => "home");
const router = createRouter({ layouts: { _root_: root }, routeTree: [{ id: "_root_/", path: "/", module: home }] });
export const server = createServer({ router });
`

// A real client and ssr build: the server holds the manifest's id and the hashed client entry, every pipeline response
// carries the id, and the document state names it.
it("wired", async () => {
	const root = mkdtempSync(join(fixtures(), "app-"))
	roots.push(root)
	mkdirSync(join(root, "src"))
	writeFileSync(join(root, "src/client.tsx"), "console.log(1);\n")
	writeFileSync(join(root, "src/server.ts"), SERVER)
	const app = await createBuilder({ root, configFile: false, logLevel: "silent", plugins: flare() })
	await app.buildApp()
	const built: { server: { fetch: (request: Request) => Promise<Response> } } = await import(
		pathToFileURL(join(root, "dist/server/server.js")).href
	)
	const document = await built.server.fetch(new Request("http://localhost/"))
	const html = await document.text()
	const id = document.headers.get("flare-build")
	expect(id).toMatch(/^[0-9a-f]{12}$/)
	expect(html).toContain(`"build":"${id}"`)
	expect(html).toMatch(/import\("\/assets\/client-[\w-]+\.js"\)/)
	for (const path of ["/?_flare=data", "/missing"]) {
		expect((await built.server.fetch(new Request(`http://localhost${path}`))).headers.get("flare-build")).toBe(id)
	}
}, 120_000)

// A fixture app built in a fresh directory: the id its built server answers with.
async function builtId(server: string): Promise<string> {
	const root = mkdtempSync(join(fixtures(), "app-"))
	roots.push(root)
	mkdirSync(join(root, "src"))
	writeFileSync(join(root, "src/client.tsx"), "console.log(1);\n")
	writeFileSync(join(root, "src/server.ts"), server)
	await (await createBuilder({ root, configFile: false, logLevel: "silent", plugins: flare() })).buildApp()
	const built: { server: { fetch: (request: Request) => Promise<Response> } } = await import(
		pathToFileURL(join(root, "dist/server/server.js")).href
	)
	return (await built.server.fetch(new Request("http://localhost/"))).headers.get("flare-build") ?? ""
}

// The id covers what ships and runs on both sides: the same app built in two directories has one id, and a change to
// server code alone, here a page's render, gives a new one, so a server-only deploy gets new store keys (plan 21 3.1).
it("server output", async () => {
	const [first, again] = [await builtId(SERVER), await builtId(SERVER)]
	const changed = await builtId(SERVER.replace('render(() => "home")', 'render(() => "home, changed")'))
	expect(first).toMatch(/^[0-9a-f]{12}$/)
	expect([again, changed === first]).toEqual([first, false])
}, 240_000)

function fixtures(): string {
	mkdirSync(FIXTURES, { recursive: true })
	return FIXTURES
}
