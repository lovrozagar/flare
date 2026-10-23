import { tmpdir } from "node:os"
import { expect, it } from "vitest"
import { newestReport, peerSpecs, run, serve } from "./stage.ts"

// A manifest shaped as packages/core/package.json: each peer's range is `>=` its exact devDependency (B79).
const MANIFEST = {
	peerDependencies: { "solid-js": ">=2.0.0-rc.17 <2.0.0-rc.18", vite: ">=8.1.4", sharp: ">=0.35.5", isbot: ">=5.2.0" },
	peerDependenciesMeta: { sharp: { optional: true }, isbot: { optional: true } },
	devDependencies: { "solid-js": "2.0.0-rc.17", vite: "8.1.4", sharp: "0.35.5", isbot: "5.2.0", vitest: "4.1.10" },
}

it("floor specs", () => {
	expect(peerSpecs(MANIFEST, "floor")).toEqual(["isbot@5.2.0", "sharp@0.35.5", "solid-js@2.0.0-rc.17", "vite@8.1.4"])
})

it("newest specs", () => {
	expect(peerSpecs(MANIFEST, "newest")).toEqual([
		"isbot@>=5.2.0",
		"sharp@>=0.35.5",
		"solid-js@>=2.0.0-rc.17 <2.0.0-rc.18",
		"vite@>=8.1.4",
	])
})

it("without optional peers", () => {
	expect(peerSpecs(MANIFEST, "floor", { without: ["sharp", "isbot"] })).toEqual(["solid-js@2.0.0-rc.17", "vite@8.1.4"])
})

it("without a required peer", () => {
	expect(() => peerSpecs(MANIFEST, "floor", { without: ["vite"] })).toThrow("stage: vite is not an optional peer")
})

it("peer without a floor", () => {
	const manifest = { ...MANIFEST, devDependencies: { vite: "8.1.4" } }
	expect(() => peerSpecs(manifest, "floor")).toThrow("stage: isbot has no exact devDependency, so no floor")
})

// The newest version a range admits, pre-releases included, beside the one npm installed: a pre-release range
// matches only its own release line in npm, so a later pre-release shows here as a mismatch.
it("newest report", () => {
	const report = newestReport(
		{ "solid-js": "2.0.0-rc.15", vite: "8.3.4" },
		{ "solid-js": ["1.9.17", "2.0.0-rc.15", "2.0.1-beta.1"], vite: ["8.1.4", "8.3.4", "9.0.0-beta.0"] },
		{ "solid-js": ">=2.0.0-rc.15", vite: ">=8.1.4" },
	)
	expect(report).toEqual([
		{ name: "solid-js", installed: "2.0.0-rc.15", newest: "2.0.1-beta.1", same: false },
		{ name: "vite", installed: "8.3.4", newest: "9.0.0-beta.0", same: false },
	])
})

it("newest report agrees", () => {
	const report = newestReport({ isbot: "5.2.2" }, { isbot: ["5.2.0", "5.2.2"] }, { isbot: ">=5.2.0" })
	expect(report).toEqual([{ name: "isbot", installed: "5.2.2", newest: "5.2.2", same: true }])
})

it("newest report, nothing admitted", () => {
	const report = newestReport({ isbot: "5.2.2" }, { isbot: ["4.0.0"] }, { isbot: ">=5.2.0" })
	expect(report).toEqual([{ name: "isbot", installed: "5.2.2", newest: "none", same: false }])
})

// A consumer step a signal ended reports the signal beside its null status, so a cell's assert names a kill rather
// than an empty failure. The child is real: the runtime running this file stands in for the pinned Node and SIGKILLs
// itself (BUGS.md 500.7).
it("killed step named", () => {
	const node = { node: process.execPath, npm: "" }
	const killed = run(node, { cwd: tmpdir(), args: ["-e", 'process.kill(process.pid, "SIGKILL")'] })
	expect(killed).toEqual({ status: null, signal: "SIGKILL", output: "" })
	const failed = run(node, { cwd: tmpdir(), args: ["-e", 'console.error("broke"); process.exit(3)'] })
	expect(failed).toEqual({ status: 3, signal: null, output: "broke\n" })
})

// A server the host kills before it answers fails the serve at once and names the signal, rather than polling to the
// deadline and then waiting on an exit that already happened. The child is real, as in `killed step named`
// (BUGS.md 500.12).
it("killed server named", async () => {
	const node = { node: process.execPath, npm: "" }
	const start = { dir: tmpdir(), args: () => ["-e", 'process.kill(process.pid, "SIGKILL")'], timeout: 30_000 }
	await expect(serve(node, start)).rejects.toThrow(/did not answer on http:\/\/127\.0\.0\.1:\d+ \(signal SIGKILL\)/)
})
