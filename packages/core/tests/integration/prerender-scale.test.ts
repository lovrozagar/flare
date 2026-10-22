import { spawn } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, expect, it } from "vitest"
import { fixtureApps, rootLayout } from "./vite-app.ts"

// Prerender at scale through a real `vite build` (plan 21 5.3, plan 28): one SSG route over 1000 params at
// concurrency 4 writes every seed and a sitemap listing every page; with 3 of them failing, the build exits non-zero,
// names each failing page, and writes no seed and no sitemap (dx/plugin.md prerender, vite/prerender/run.ts).

const PAGES = 1000
const FAILING = ["0", "500", "999"]

const VITE = fileURLToPath(new URL("../../../../node_modules/vite/bin/vite.js", import.meta.url))

const apps = fixtureApps()

afterAll(() => apps.removeAll())

const SERVER = `import { createAssetsStore, createMemoryStore, createServer } from "@lovrozagar/flare/server"
import { fileAssets } from "@lovrozagar/flare/stores/fs"
import { fileURLToPath } from "node:url"
import { router } from "./router.ts"
const client = fileURLToPath(new URL("../client", import.meta.url))
export const server = createServer({
	router,
	site: "https://scale.example",
	store: createMemoryStore(),
	static: createAssetsStore(fileAssets(client)),
})
`

// One SSG page over `PAGES` ids; the ids in `failing` throw in the loader.
function app(failing: readonly string[]): string {
	const params = `() => Array.from({ length: ${PAGES} }, (_, index) => ({ id: String(index) }))`
	return apps.make({
		"vite.config.mjs":
			'import { flare } from "@lovrozagar/flare/vite";\nexport default { logLevel: "error", plugins: [flare({ prerender: { concurrency: 4, sitemap: {} } })] };\n',
		"src/server.ts": SERVER,
		"src/routes/_root_/root.root-layout.tsx": rootLayout("_root_"),
		"src/routes/_root_/n/[id]/n.page.tsx": `import { createPage } from "@lovrozagar/flare"
const failing = new Set(${JSON.stringify(failing)})
export const route = createPage("_root_/n/[id]")
	.cache({ ssg: ${params} })
	.loader(({ params }) => {
		if (failing.has(params.id)) throw new Error("page " + params.id + " is down")
		return { id: params.id }
	})
	.render((props) => <p id="page">page {props.loaderData.id}</p>)
`,
	})
}

type Run = {
	status: number | null
	signal: NodeJS.Signals | null
	output: string
	seconds: number
	peakMiB: number | undefined
}

// `vite build` as a deploy runs it, timed, with the child's peak resident memory where Linux reports it. A build a
// signal ended keeps its signal, so the host's kill reads as one, not as a status of null (BUGS.md 500).
function build(root: string): Promise<Run> {
	const started = performance.now()
	const child = spawn(process.execPath, [VITE, "build"], {
		cwd: root,
		env: { ...process.env, NODE_ENV: "production" },
		stdio: ["ignore", "pipe", "pipe"],
	})
	let output = ""
	let peak: number | undefined
	child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
	child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
	const poll = setInterval(() => {
		const status = `/proc/${child.pid}/status`
		if (!existsSync(status)) return
		const kib = /VmHWM:\s+(\d+)/.exec(readFileSync(status, "utf8"))?.[1]
		if (kib !== undefined) peak = Math.max(peak ?? 0, Number(kib) / 1024)
	}, 100)
	return new Promise((done) =>
		child.on("close", (status, signal) => {
			clearInterval(poll)
			done({ status, signal, output, seconds: (performance.now() - started) / 1000, peakMiB: peak })
		}),
	)
}

function filesUnder(dir: string): string[] {
	return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((path) => statSync(join(dir, path)).isFile())
}

// About 0.8 s here (1000 pages, peak about 750 MiB): ten times that is the CI margin.
it("prerender at scale", { timeout: 10_000 }, async () => {
	const root = app([])
	const run = await build(root)
	console.log(`prerender at scale: ${PAGES} pages in ${run.seconds.toFixed(1)} s, peak ${run.peakMiB?.toFixed(0)} MiB`)
	expect([run.status, run.signal, run.status === 0 ? "" : run.output]).toEqual([0, null, ""])
	const client = join(root, "dist", "client")
	expect(filesUnder(client).filter((path) => path.includes("_flare-static"))).toHaveLength(PAGES)
	const sitemap = readFileSync(join(client, "sitemap.xml"), "utf8")
	expect(sitemap.match(/<loc>https:\/\/scale\.example\/n\/\d+<\/loc>/g)).toHaveLength(PAGES)
})

it("prerender failing pages", { timeout: 10_000 }, async () => {
	const root = app(FAILING)
	const run = await build(root)
	console.log(`prerender failing pages: ${run.seconds.toFixed(1)} s, peak ${run.peakMiB?.toFixed(0)} MiB`)
	expect(run.status).not.toBe(0)
	for (const id of FAILING) expect(run.output).toContain(`_root_/n/[id] {"id":"${id}"} answered 500`)
	const client = join(root, "dist", "client")
	expect(filesUnder(client).filter((path) => path.includes("_flare-static"))).toEqual([])
	expect(existsSync(join(client, "sitemap.xml"))).toBe(false)
})
