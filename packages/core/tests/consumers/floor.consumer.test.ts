import { cpSync, existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { Miniflare } from "miniflare"
import { unstable_getMiniflareWorkerOptions } from "wrangler"
import { afterAll, beforeAll, expect, it } from "vitest"
import type { PinnedNode } from "../../../../scripts/node-at.ts"
import { modulesOf, UPLOAD_LIMIT, uploadedSize } from "../workers-modules.ts"
import {
	buildApp,
	CORE,
	copyMinimal,
	install,
	installed,
	MANIFEST,
	newestReport,
	npm,
	nodes,
	OPTIONAL,
	peerSpecs,
	project,
	run as runWith,
	serve,
	tarball,
	type PeerMode,
	type Project,
} from "./stage.ts"

// The floor cells (plan 21 5.5): the minimal app, staged with every peer at its floor, or at the newest its range admits
// with FLARE_CONSUMER_PEERS=newest, built and served as an app is.
const MODE: PeerMode = process.env["FLARE_CONSUMER_PEERS"] === "newest" ? "newest" : "floor"

// Set once before the cases: the pinned Nodes and the tarball; `node floor` records its project for the report.
const run: { floor?: PinnedNode; current?: PinnedNode; packed?: string; staged?: string } = {}
const projects: Project[] = []

beforeAll(async () => {
	const pinned = await nodes()
	run.floor = pinned.floor
	run.current = pinned.current
	const out = project("pack")
	projects.push(out)
	run.packed = tarball(pinned.current, out.dir)
})

afterAll(() => {
	for (const each of projects) each.close()
})

function pinned(which: "floor" | "current"): PinnedNode {
	const node = run[which]
	if (node === undefined) throw new Error(`floor.consumer: no ${which} Node`)
	return node
}

// A staged minimal app with `specs` installed by `node`'s npm, only those peers (`--legacy-peer-deps`), composed with
// Cloudflare's plugin when `workers`.
function staged(name: string, node: PinnedNode, app: { specs: readonly string[]; workers?: boolean }): string {
	const made = project(name)
	projects.push(made)
	copyMinimal(made.dir, { workers: app.workers === true })
	const added = install(node, { dir: made.dir, packed: run.packed ?? "", specs: app.specs, legacy: true })
	expect([added.status, added.output]).toEqual([0, expect.any(String)])
	return made.dir
}

// GET / with a sentinel the home page prints, and the about page's data request, on a served origin.
async function answers(origin: string, sentinel: string): Promise<void> {
	const home = await fetch(`${origin}/`, { headers: { "x-sentinel": sentinel } })
	expect([home.status, (await home.text()).includes(sentinel)]).toEqual([200, true])
	const data = await fetch(`${origin}/about?_flare=data`)
	const first = (await data.text()).split("\n")[0] ?? ""
	expect([data.status, Reflect.get(Object(JSON.parse(first)), "t")]).toEqual([200, "l"])
}

// The published floor, Node 22.12.0, installs, builds, serves, and runs the dev server (B3).
it("node floor", async () => {
	const node = pinned("floor")
	const dir = staged("node-floor", node, { specs: peerSpecs(MANIFEST, MODE) })
	run.staged = dir
	const built = buildApp(node, dir)
	expect([built.status, built.output]).toEqual([0, expect.any(String)])
	const served = await serve(node, { dir, args: () => ["serve.js"], timeout: 30_000 })
	try {
		await answers(served.origin, "floor-serve")
	} finally {
		await served.stop()
	}
	const vite = join(dir, "node_modules/vite/bin/vite.js")
	const dev = await serve(node, {
		dir,
		args: (port) => [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
		timeout: 60_000,
	})
	try {
		const home = await fetch(`${dev.origin}/`, { headers: { "x-sentinel": "floor-dev" } })
		const body = await home.text()
		expect([home.status, body.includes("floor-dev"), dev.output()]).toEqual([200, true, expect.any(String)])
	} finally {
		await dev.stop()
	}
})

// The documented TypeScript floor, 5.9 (README), with Node's own module resolution: the fixture pins typescript 5.9.3
// exactly, and its tsc reads the staged minimal app and `consumer strict`'s sources, every public entry, against the
// packed types with every peer installed, skipLibCheck off.
it("ts 5 nodenext", () => {
	const node = pinned("current")
	const fixture = join(CORE, "tests/consumers/fixture/ts5")
	const typescript: Record<string, string> = JSON.parse(
		readFileSync(join(fixture, "package.json"), "utf8"),
	).devDependencies
	const types = `@types/node@${MANIFEST.devDependencies?.["@types/node"] ?? ""}`
	const specs = [
		...peerSpecs(MANIFEST, MODE),
		...Object.entries(typescript).map(([name, version]) => `${name}@${version}`),
	]
	const dir = staged("ts5", node, { specs: [...specs, types] })
	cpSync(join(fixture, "tsconfig.json"), join(dir, "tsconfig.json"))
	cpSync(join(CORE, "tests/structure/consumer/src"), join(dir, "consumer"), { recursive: true })
	const flare = join(dir, "node_modules/@lovrozagar/flare/dist/vite/bin/flare.js")
	const codegen = runWith(node, { cwd: dir, args: [flare, "codegen"] })
	expect([codegen.status, codegen.output]).toEqual([0, expect.any(String)])
	const version = runWith(node, { cwd: dir, args: [join(dir, "node_modules/typescript/bin/tsc"), "--version"] })
	const tsc = runWith(node, { cwd: dir, args: [join(dir, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"] })
	expect([version.output.trim(), tsc.status, tsc.output]).toEqual(["Version 5.9.3", 0, ""])
})

// An app that uses none of i18n, image, or query installs none of their five peers, and builds and serves.
it("no optional peers", async () => {
	const node = pinned("current")
	const dir = staged("no-optional", node, { specs: peerSpecs(MANIFEST, MODE, { without: OPTIONAL }) })
	const present = OPTIONAL.filter((name) => existsSync(join(dir, "node_modules", name, "package.json")))
	expect([OPTIONAL.length, present]).toEqual([5, []])
	const built = buildApp(node, dir)
	expect([built.status, built.output]).toEqual([0, expect.any(String)])
	const served = await serve(node, { dir, args: () => ["serve.js"], timeout: 30_000 })
	try {
		await answers(served.origin, "no-optional")
	} finally {
		await served.stop()
	}
})

// A build run where NODE_ENV is `test`, as a test runner's global setup or a CI step often exports it, ships a server
// that loads and answers like any other build.
it("build under NODE_ENV=test", async () => {
	const node = pinned("current")
	const dir = staged("node-env-test", node, { specs: peerSpecs(MANIFEST, MODE) })
	const built = buildApp(node, dir, { NODE_ENV: "test" })
	expect([built.status, built.output]).toEqual([0, expect.any(String)])
	const served = await serve(node, { dir, args: () => ["serve.js"], timeout: 30_000 })
	try {
		await answers(served.origin, "node-env-test")
	} finally {
		await served.stop()
	}
})

// The Workers tools an app adds beside flare(): Cloudflare's Vite plugin and wrangler, at the repo's versions, or at
// the newest from there.
function workersTools(): string[] {
	const catalog: Record<string, string> = JSON.parse(readFileSync(join(CORE, "../../package.json"), "utf8")).workspaces
		.catalog
	return ["@cloudflare/vite-plugin", "wrangler"].map((name) =>
		MODE === "floor" ? `${name}@${catalog[name] ?? ""}` : `${name}@>=${catalog[name] ?? ""}`,
	)
}

// The minimal app composed with Cloudflare's plugin (B109): its Workers upload is under the free plan's script limit
// (plan 21 5.6), and workerd, through Miniflare as `wrangler dev` runs it, answers `/` with the sentinel.
it("workers bundle", async () => {
	const node = pinned("current")
	const dir = staged("workers", node, { specs: [...peerSpecs(MANIFEST, MODE), ...workersTools()], workers: true })
	const built = buildApp(node, dir)
	expect([built.status, built.output]).toEqual([0, expect.any(String)])
	const server = join(dir, "dist/server")
	const deploy = unstable_getMiniflareWorkerOptions(join(server, "wrangler.json"))
	const modules = modulesOf(server, resolve(server, deploy.main ?? "index.js"))
	expect(uploadedSize(modules)).toBeLessThanOrEqual(UPLOAD_LIMIT)
	const runtime = new Miniflare({ ...deploy.workerOptions, modules, modulesRoot: server })
	try {
		const home = await runtime.dispatchFetch("http://localhost/", { headers: { "x-sentinel": "workers" } })
		expect([home.status, (await home.text()).includes("workers")]).toEqual([200, true])
	} finally {
		await runtime.dispose()
	}
})

// Under FLARE_CONSUMER_PEERS=newest, each peer `node floor` installed beside the newest published version its range
// admits with pre-releases counted. npm matches a pre-release range only on its own release line, so a row that
// differs is printed for the reviewer as a range-wording question, not failed (plan 21 5.5).
it.skipIf(MODE !== "newest")("newest report", () => {
	const dir = run.staged ?? ""
	const peers = Object.keys(MANIFEST.peerDependencies ?? {})
	const published = Object.fromEntries(
		peers.map((peer) => {
			const view = npm(pinned("current"), dir, ["view", peer, "versions", "--json"])
			return [peer, JSON.parse(view.output) as string[]]
		}),
	)
	const report = newestReport(installed(dir, peers), published, MANIFEST.peerDependencies ?? {})
	for (const row of report) {
		console.log(`newest ${row.same ? "  " : "!="} ${row.name} installed ${row.installed}, range admits ${row.newest}`)
	}
	expect(report.map((row) => row.name).toSorted()).toEqual(peers.toSorted())
})
