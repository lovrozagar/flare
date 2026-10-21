import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import type { PinnedNode } from "../../../../scripts/node-at.ts"
import { installCommand, readme } from "../structure/readme.ts"
import { buildApp, copyMinimal, install, nodes, project, serve, shellEnv, tarball, type Project } from "./stage.ts"

// The README's own install, as a reader runs it, with each package manager's default peer resolution: no ERESOLVE
// between the peers' own peer ranges, and a pre-release floor each resolver accepts (plan 21 5.5). Each project then
// builds and serves the minimal app.
// Set once before the cases: the pinned Node 24 and the tarball it packed.
const run: { current?: PinnedNode; packed?: string } = {}
const projects: Project[] = []

beforeAll(async () => {
	run.current = (await nodes()).current
	const out = project("pack")
	projects.push(out)
	run.packed = tarball(run.current, out.dir)
})

function current(): PinnedNode {
	if (run.current === undefined) throw new Error("readme.consumer: no pinned Node")
	return run.current
}

afterAll(() => {
	for (const each of projects) each.close()
})

// The README's package list with the packed tarball in place of the package's name.
function readmePackages(): string[] {
	const [name, ...peers] = installCommand(readme)
	expect(name).toBe("@lovrozagar/flare")
	return [run.packed ?? "", ...peers]
}

// The Solid pair and its Vite plugin stay at the release the package is tested on, its devDependency: the README's own
// install resolves to it, never a newer pre-release (BUGS.md 426, 490).
const SOLID = ["solid-js", "@solidjs/web", "@solidjs/vite-plugin"]

function manifestAt(path: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
}

function versions(dir: string, field: "installed" | "tested"): Record<string, string | undefined> {
	const tested = manifestAt(join(import.meta.dirname, "../../package.json"))["devDependencies"] as Record<
		string,
		string
	>
	const installed = (name: string) => manifestAt(join(dir, "node_modules", name, "package.json"))["version"] as string
	return Object.fromEntries(SOLID.map((name) => [name, field === "tested" ? tested[name] : installed(name)]))
}

async function buildsAndServes(dir: string, sentinel: string): Promise<void> {
	const built = buildApp(current(), dir)
	expect([built.status, built.output]).toEqual([0, expect.any(String)])
	const served = await serve(current(), { dir, args: () => ["serve.js"], timeout: 30_000 })
	try {
		const response = await fetch(`${served.origin}/`, { headers: { "x-sentinel": sentinel } })
		const body = await response.text()
		expect([response.status, body.includes(sentinel), served.output()]).toEqual([200, true, expect.any(String)])
	} finally {
		await served.stop()
	}
}

it("readme install, bun", async () => {
	const app = project("readme-bun")
	projects.push(app)
	copyMinimal(app.dir)
	const added = spawnSync("bun", ["add", ...readmePackages()], { cwd: app.dir, encoding: "utf8", env: shellEnv() })
	const output = `${added.stdout}${added.stderr}`
	expect([added.status, output.includes("ERESOLVE"), output]).toEqual([0, false, expect.any(String)])
	expect(versions(app.dir, "installed")).toEqual(versions(app.dir, "tested"))
	await buildsAndServes(app.dir, "readme-bun")
})

it("readme install, npm", async () => {
	const app = project("readme-npm")
	projects.push(app)
	copyMinimal(app.dir)
	const [tgz = "", ...peers] = readmePackages()
	const added = install(current(), { dir: app.dir, packed: tgz, specs: peers, legacy: false })
	expect([added.status, added.output.includes("ERESOLVE"), added.output]).toEqual([0, false, expect.any(String)])
	expect(versions(app.dir, "installed")).toEqual(versions(app.dir, "tested"))
	await buildsAndServes(app.dir, "readme-npm")
})
