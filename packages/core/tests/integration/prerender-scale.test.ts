import { spawn } from "node:child_process"
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, expect, it } from "vitest"
import { peakText, rssMiB } from "./rss.ts"
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

// The window of pages the scale claim compares, early against late, and the most the late one may cost per page
// against the early one. Both windows run in the same build, so a slow runner slows both: a per-page cost that grows
// with the page count, such as a walk over every page done for each, reads as the ratio, whatever the runner's speed
// (BUGS.md 509).
const WINDOW = 100
const SCALE_RATIO = 3
const CONCURRENCY = 4

// Each page's loader call, as the time it ran, so the test reads the build's per-page pace. FLARE_SCALE_PLANT, for the
// row's flip only, adds work that grows with the page's id, the shape a quadratic prerender would have.
const LOADER = `import { appendFileSync } from "node:fs"
const log = process.env.FLARE_SCALE_LOG
const plant = Number(process.env.FLARE_SCALE_PLANT ?? 0)
const paced = (id) => {
	for (let index = 0; index < Number(id) * plant; index += 1) Math.sqrt(index)
	if (log !== undefined) appendFileSync(log, performance.now() + "\\n")
}`

// One SSG page over `PAGES` ids; the ids in `failing` throw in the loader.
function app(failing: readonly string[]): string {
	const params = `() => Array.from({ length: ${PAGES} }, (_, index) => ({ id: String(index) }))`
	return apps.make({
		"vite.config.mjs": `import { flare } from "@lovrozagar/flare/vite";\nexport default { logLevel: "error", plugins: [flare({ prerender: { concurrency: ${CONCURRENCY}, sitemap: {} } })] };\n`,
		"src/server.ts": SERVER,
		"src/routes/_root_/root.root-layout.tsx": rootLayout("_root_"),
		"src/routes/_root_/n/[id]/n.page.tsx": `import { createPage } from "@lovrozagar/flare"
${LOADER}
const failing = new Set(${JSON.stringify(failing)})
export const route = createPage("_root_/n/[id]")
	.cache({ ssg: ${params} })
	.loader(({ params }) => {
		paced(params.id)
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

// `vite build` as a deploy runs it, timed, with the child's peak resident memory as `ps` samples it on Linux and macOS
// alike. A build a signal ended keeps its signal, so the host's kill reads as one, not as a status of null (BUGS.md
// 500, 509).
function build(root: string, env: Record<string, string> = {}): Promise<Run> {
	const started = performance.now()
	const child = spawn(process.execPath, [VITE, "build"], {
		cwd: root,
		env: { ...process.env, ...env, NODE_ENV: "production" },
		stdio: ["ignore", "pipe", "pipe"],
	})
	let output = ""
	let peak: number | undefined
	child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
	child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
	const poll = setInterval(() => {
		const now = rssMiB(child.pid)
		if (now !== undefined) peak = Math.max(peak ?? 0, now)
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

// The late window's pace over the early one's, pages in the order their loaders ran: the first WINDOW after a warm-up
// of WINDOW, against the last WINDOW. A window's pace is its median gap, so a one-off stall on a loaded runner barely
// moves it, where a per-page cost that grows moves every gap. The prerender runs CONCURRENCY pages at once, so the gap
// is taken that many pages apart: one group's time, at every page.
function paceRatio(times: readonly number[]): number {
	const sorted = [...times].sort((a, b) => a - b)
	const pace = (from: number): number => {
		const gaps = Array.from(
			{ length: WINDOW },
			(_, index) => (sorted[from + index + CONCURRENCY] ?? 0) - (sorted[from + index] ?? 0),
		).sort((a, b) => a - b)
		return gaps[WINDOW / 2] ?? 0
	}
	return pace(sorted.length - WINDOW - CONCURRENCY) / pace(WINDOW)
}

// The wall timeout only catches a hang: one runner's build took 2.1 s and another's 10.3 s for the same code (BUGS.md
// 509). The scale claim is the pace ratio, which the same build measures against itself.
it("prerender at scale", { timeout: 60_000 }, async () => {
	const root = app([])
	const log = join(root, "pace.log")
	const run = await build(root, { FLARE_SCALE_LOG: log, FLARE_SCALE_PLANT: process.env["FLARE_SCALE_PLANT"] ?? "0" })
	const times = readFileSync(log, "utf8").trim().split("\n").map(Number)
	const ratio = paceRatio(times)
	console.log(
		`prerender at scale: ${PAGES} pages in ${run.seconds.toFixed(1)} s, pace ratio ${ratio.toFixed(2)}, ${peakText(run.peakMiB)}`,
	)
	expect([run.status, run.signal, run.status === 0 ? "" : run.output]).toEqual([0, null, ""])
	expect(times).toHaveLength(PAGES)
	expect(ratio).toBeLessThan(SCALE_RATIO)
	const client = join(root, "dist", "client")
	expect(filesUnder(client).filter((path) => path.includes("_flare-static"))).toHaveLength(PAGES)
	const sitemap = readFileSync(join(client, "sitemap.xml"), "utf8")
	expect(sitemap.match(/<loc>https:\/\/scale\.example\/n\/\d+<\/loc>/g)).toHaveLength(PAGES)
})

// Its claim is the failure's shape, not its speed: the wall timeout only catches a hang (BUGS.md 509).
it("prerender failing pages", { timeout: 60_000 }, async () => {
	const root = app(FAILING)
	const run = await build(root)
	console.log(`prerender failing pages: ${run.seconds.toFixed(1)} s, ${peakText(run.peakMiB)}`)
	expect(run.status).not.toBe(0)
	for (const id of FAILING) expect(run.output).toContain(`_root_/n/[id] {"id":"${id}"} answered 500`)
	const client = join(root, "dist", "client")
	expect(filesUnder(client).filter((path) => path.includes("_flare-static"))).toEqual([])
	expect(existsSync(join(client, "sitemap.xml"))).toBe(false)
})

// The peak reads on Linux and macOS through `ps`: this process has resident memory, a stand-in `ps` is parsed, and
// where `ps` is missing or the process is gone the peak is unknown and says so (BUGS.md 509).
it("rss by ps", () => {
	expect(rssMiB(process.pid)).toBeGreaterThan(1)
	const bin = mkdtempSync(join(tmpdir(), "flare-ps-"))
	try {
		const ps = join(bin, "ps")
		writeFileSync(ps, "#!/bin/sh\necho ' 2048'\n")
		chmodSync(ps, 0o755)
		expect(rssMiB(1, ps)).toBe(2)
		expect(peakText(rssMiB(1, ps))).toBe("peak 2 MiB")
	} finally {
		rmSync(bin, { recursive: true })
	}
	expect(rssMiB(1, join(tmpdir(), "flare-no-such-ps"))).toBeUndefined()
	expect(rssMiB(undefined)).toBeUndefined()
	expect(peakText(undefined)).toBe("peak unknown (no ps)")
})
