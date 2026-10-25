import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { distTag, release, runChild, runRelease, shipped, type ReleaseDeps } from "./release.ts"

const VERSION: string = JSON.parse(
	readFileSync(new URL("../packages/core/package.json", import.meta.url), "utf8"),
).version
const TARBALL = `/tmp/out/lovrozagar-flare-${VERSION}.tgz`

type Call = { command: string; args: readonly string[]; env?: Record<string, string> }

// A tree, its gates, and npm, recorded. `status` answers each command line; anything unlisted succeeds.
function deps(
	answers: Record<string, { status: number; stdout?: string; signal?: string }> = {},
	env: Record<string, string> = {},
) {
	const calls: Call[] = []
	const logged: string[] = []
	const fake: ReleaseDeps = {
		run(command, args, options) {
			calls.push({ command, args, ...(options?.env && { env: options.env }) })
			const answer = answers[[command, ...args].join(" ")]
			return { status: answer?.status ?? 0, stdout: answer?.stdout ?? "", signal: answer?.signal ?? null }
		},
		pack: () => TARBALL,
		env,
		log: (line) => void logged.push(line),
	}
	const published = (): Call[] => calls.filter((call) => call.command === "npm" && call.args[0] === "publish")
	return { fake, calls, logged, published }
}

const CLEAN = { "git status --porcelain": { status: 0, stdout: "" } }
const TAGGED = { "git describe --tags --exact-match": { status: 0, stdout: `v${VERSION}\n` } }

it("refuses dirty", () => {
	const { fake, published, logged } = deps({
		"git status --porcelain": { status: 0, stdout: " M scripts/release.ts\n" },
	})
	expect(release([], fake)).not.toBe(0)
	expect(logged.join("\n")).toContain("the tree is dirty")
	expect(published()).toEqual([])
})

it("refuses red", () => {
	const failing = { "node tests/fixtures/fail.mjs": { status: 1 } }
	const { fake, calls, published, logged } = deps({ ...CLEAN, ...TAGGED, ...failing })
	expect(release(["--test-command", "node tests/fixtures/fail.mjs"], fake)).not.toBe(0)
	expect(calls.some((call) => call.command === "node" && call.args[0] === "tests/fixtures/fail.mjs")).toBe(true)
	expect(logged.join("\n")).toContain("node tests/fixtures/fail.mjs failed")
	expect(published()).toEqual([])
})

it("tag", () => {
	const { fake, calls, published } = deps({ ...CLEAN, ...TAGGED })
	expect(release([], fake)).toBe(0)
	// The gates, then the golden proof on the very tarball that ships.
	const lines = calls.map((call) => [call.command, ...call.args].join(" "))
	for (const gate of ["bun run fmt:check", "bun run lint", "bun run typecheck", "bun run test", "bun run test:e2e"]) {
		expect(lines).toContain(gate)
	}
	expect(lines).toContain("bun scripts/check-tree.ts --complete P14")
	const golden = calls.find((call) => call.args.includes("tests/e2e/golden.test.ts"))
	expect(golden?.env).toEqual({ FLARE_TARBALL: TARBALL })
	// One package, the tag's version, and a dry run outside a tag build. The first release is 1.0.0-rc.N, so the
	// manifest's version publishes under `next`, never `latest`, until the user's 1.0.0 (bits/14).
	expect(published().map((call) => call.args)).toEqual([
		["publish", TARBALL, "--access", "public", "--dry-run", "--tag", "next"],
	])
	expect(lines.some((line) => line.includes("flare-fonts"))).toBe(false)
	// A tag that is not the manifest's version is refused before anything is packed.
	const wrong = deps({ ...CLEAN, "git describe --tags --exact-match": { status: 0, stdout: "v0.9.0\n" } })
	expect(release([], wrong.fake)).not.toBe(0)
	expect(wrong.logged.join("\n")).toContain(`tag v0.9.0 is not v${VERSION}`)
	expect(wrong.published()).toEqual([])
})

// `--publish` refuses anywhere but a GitHub Actions run, and nothing reaches npm.
it("publish outside actions", () => {
	const local = deps({ ...CLEAN, ...TAGGED })
	expect(release(["--publish", "--tarball", TARBALL], local.fake)).not.toBe(0)
	expect(local.logged.join("\n")).toContain(`--publish runs only in GitHub Actions on refs/tags/v${VERSION}`)
	expect(local.published()).toEqual([])
	const branch = deps({}, { GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/main" })
	expect(release(["--publish", "--tarball", TARBALL], branch.fake)).not.toBe(0)
	expect(branch.published()).toEqual([])
})

// In Actions, only the manifest version's tag publishes, and only the tarball of that version the verify job built.
it("publish wrong tag", () => {
	const other = deps({}, { GITHUB_ACTIONS: "true", GITHUB_REF: "refs/tags/v0.0.1" })
	expect(release(["--publish", "--tarball", TARBALL], other.fake)).not.toBe(0)
	expect(other.published()).toEqual([])
	const ci = { GITHUB_ACTIONS: "true", GITHUB_REF: `refs/tags/v${VERSION}` }
	const named = deps({}, ci)
	expect(release(["--publish", "--tarball", "/tmp/out/other-1.0.0.tgz"], named.fake)).not.toBe(0)
	expect(named.logged.join("\n")).toContain(`other-1.0.0.tgz is not lovrozagar-flare-${VERSION}.tgz`)
	expect(named.published()).toEqual([])
	const bare = deps({}, ci)
	expect(release(["--publish"], bare.fake)).not.toBe(0)
	expect(bare.published()).toEqual([])
	const real = deps({}, ci)
	expect(release(["--publish", "--tarball", TARBALL], real.fake)).toBe(0)
	expect(real.published().map((call) => call.args)).toEqual([
		["publish", TARBALL, "--access", "public", "--provenance", ...distTag(VERSION)],
	])
})

// A version with a prerelease part, `1.0.0-rc.1` say, publishes under the `next` dist-tag: npm would otherwise make it
// `latest`, and npm 11 refuses a prerelease with no tag. A plain version, build metadata included, keeps `latest`
// (bits/14, flare-e4's RC request).
it("dist tag", () => {
	expect(distTag("1.0.0")).toEqual([])
	expect(distTag("1.0.0+build.7")).toEqual([])
	expect(distTag("1.0.0-rc.1")).toEqual(["--tag", "next"])
	expect(distTag("1.0.0-rc.1+build.7")).toEqual(["--tag", "next"])
})

// The staged src leaves out test code, as files.tsv kinds it: tests and their fixtures, whatever the extension
// (00-rules Dependencies).
it("fixtures dropped", () => {
	const paths = [
		"src/client/navigation/navigate.fixture.ts",
		"src/features/seo/server/google.fixture.txt",
		"src/client/navigation/navigate.test.ts",
		"src/shared/head.ssr.test.tsx",
		"src/client/navigation/navigate.ts",
		"src/features/fonts/registry.json",
	]
	expect(paths.filter(shipped)).toEqual(["src/client/navigation/navigate.ts", "src/features/fonts/registry.json"])
})

// A child a signal ended fails naming the signal and the tail of what it printed; one that exited non-zero names its
// status. The child is real: sh kills itself as the host's reaper kills a build, so the error is what execFileSync
// throws, on Node and on Bun (BUGS.md 500.4).
it("killed child named", () => {
	expect(() => runChild("sh", ["-c", "echo partial >&2; kill -9 $$"])).toThrow(/^sh -c .+ ended by SIGKILL\n.*partial/s)
	expect(() => runChild("sh", ["-c", "echo broken >&2; exit 3"])).toThrow(/^sh -c .+ exited with status 3\n.*broken/s)
	expect(runChild("sh", ["-c", "echo fine"])).toBe("fine\n")
})

// The release's own runs report the signal beside the status, which stays a number, and a gate a signal ended is
// refused naming it, as one that failed names its status (BUGS.md 500.4).
it("run reports signal", () => {
	expect(runRelease("sh", ["-c", "kill -9 $$"])).toEqual({ status: 1, stdout: "", signal: "SIGKILL" })
	expect(runRelease("sh", ["-c", "exit 2"])).toEqual({ status: 2, stdout: "", signal: null })
	const killed = deps({ ...CLEAN, ...TAGGED, "node gate.mjs": { status: 1, signal: "SIGKILL" } })
	expect(release(["--test-command", "node gate.mjs"], killed.fake)).not.toBe(0)
	expect(killed.logged.join("\n")).toContain("node gate.mjs failed: ended by SIGKILL")
	const red = deps({ ...CLEAN, ...TAGGED, "node gate.mjs": { status: 1 } })
	release(["--test-command", "node gate.mjs"], red.fake)
	expect(red.logged.join("\n")).toContain("node gate.mjs failed: exited with status 1")
})
