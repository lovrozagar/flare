import { readdirSync, readFileSync } from "node:fs"
import { load } from "js-yaml"
import { expect, it } from "vitest"
import { IMAGE_DIGEST } from "../../../../scripts/browser-server.ts"

type Step = { name?: string; if?: string; uses?: string; run?: string; with?: Record<string, unknown> }
type Job = {
	"runs-on": string
	steps: Step[]
	container?: { image?: string; options?: string }
	strategy?: { "fail-fast"?: boolean; matrix?: Record<string, unknown> }
}
type Workflow = { env?: Record<string, string>; jobs: Record<string, Job> }

function workflowOf(file: string): Workflow {
	return load(readFileSync(new URL(`../../../../.github/workflows/${file}`, import.meta.url), "utf8")) as Workflow
}

const workflow = workflowOf("ci.yml")
// Every workflow file, so a new one is held to the same pins.
const workflows = new Map(
	readdirSync(new URL("../../../../.github/workflows/", import.meta.url))
		.filter((file) => file.endsWith(".yml"))
		.map((file) => [file, workflowOf(file)] as const),
)

// B3: every CI job runs on Node 24, set right after checkout, so no job runs on the runner's own Node (BUGS.md B24).
it("ci node", () => {
	for (const [name, job] of Object.entries(workflow.jobs)) {
		const checkout = job.steps.findIndex((step) => step.uses?.startsWith("actions/checkout@") === true)
		const node = job.steps[checkout + 1]
		expect({ name, uses: node?.uses, version: node?.with?.["node-version"] }).toEqual({
			name,
			uses: "actions/setup-node@v4",
			version: 24,
		})
	}
})

// B3 covers Linux and macOS, so the unit suite runs on both (BUGS.md B27).
it("ci unit on both oses", () => {
	const runsTests = (name: string): boolean =>
		workflow.jobs[name]?.steps.some((step) => step.run === "bun run test") === true
	expect(workflow.jobs["check"]?.["runs-on"]).toBe("ubuntu-latest")
	expect(workflow.jobs["e2e-mac"]?.["runs-on"]).toBe("macos-latest")
	expect([runsTests("check"), runsTests("e2e-mac")]).toEqual([true, true])
})

// Every workflow runs the Bun this repo was verified on: its BUN_VERSION is the root manifest's packageManager, and
// every setup-bun step takes it from there (BUGS.md B48). The release workflow once kept v0's 1.3.11 after CI moved
// on, so a v1 tag would have verified on a Bun nothing else ran (BUGS.md 115).
it("ci bun version", () => {
	const root = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as {
		packageManager?: string
	}
	for (const [file, flow] of workflows) {
		expect([file, `bun@${String(flow.env?.["BUN_VERSION"])}`]).toEqual([file, root.packageManager])
		const pins = Object.values(flow.jobs).flatMap((job) =>
			job.steps.filter((step) => step.uses?.startsWith("oven-sh/setup-bun") === true).map((step) => step.with),
		)
		expect([file, pins.every((pin) => pin?.["bun-version"] === "${{ env.BUN_VERSION }}")]).toEqual([file, true])
	}
})

// The release workflow's jobs that run Bun set Node 24 right after checkout, as every CI job does: the runner's own
// Node is older than the 22.18 the repo needs (BUGS.md 115).
it("release node", () => {
	const release = workflows.get("release.yml")
	for (const [name, job] of Object.entries(release?.jobs ?? {})) {
		if (!job.steps.some((step) => step.uses?.startsWith("oven-sh/setup-bun") === true)) continue
		const checkout = job.steps.findIndex((step) => step.uses?.startsWith("actions/checkout@") === true)
		const node = job.steps[checkout + 1]
		expect({ name, uses: node?.uses, version: node?.with?.["node-version"] }).toEqual({
			name,
			uses: "actions/setup-node@v4",
			version: 24,
		})
	}
})

// The check job runs the unit suite under the Bun runtime right after the Node run, so a Bun-only regression fails
// CI. Coverage is measured under Node; the Bun run carries no coverage gate (00-rules Coverage, BUGS.md B46-B48).
it("ci unit on bun", () => {
	const runs = workflow.jobs["check"]?.steps.map((step) => step.run) ?? []
	const node = runs.indexOf("bun run test")
	expect(runs.slice(node, node + 2)).toEqual(["bun run test", "bun run test:bun"])
})

// The Linux grid runs inside the pinned browser image, the digest the local container uses, in 3 shards (B70, B97).
it("ci grid", () => {
	const linux = workflow.jobs["e2e-linux"]
	expect(linux?.container?.image).toBe(`mcr.microsoft.com/playwright:v1.64.1-noble@sha256:${IMAGE_DIGEST}`)
	expect(linux?.container?.options).toBe("--user 1001 --ipc=host")
	expect(linux?.strategy?.matrix?.["shard"]).toEqual([1, 2, 3])
	expect(e2eRun(linux)).toBe("bun run test:e2e -- --shard=${{ matrix.shard }}/3")
})

// One shard's failure never cancels another's evidence: every e2e matrix runs to the end.
it("ci shards independent", () => {
	expect(["e2e-linux", "e2e-mac"].map((name) => workflow.jobs[name]?.strategy?.["fail-fast"])).toEqual([false, false])
})

// The step that runs the grid.
function e2eRun(job: Job | undefined): string {
	return job?.steps.find((step) => step.run?.startsWith("bun run test:e2e") === true)?.run ?? ""
}

// macOS runs the 6 webkit projects with every deep spec in 3 shards, and its unit run once, in the first (B97). Each
// shard fits its 20 minutes: with 2, the first ran the unit suite and half the grid for 20.5 and timed out (BUGS.md 100).
it("ci mac shards", () => {
	const mac = workflow.jobs["e2e-mac"]
	expect(mac?.strategy?.matrix?.["shard"]).toEqual([1, 2, 3])
	const run = e2eRun(mac)
	const servers = ["node-dev", "node-prod", "bun-dev", "bun-prod", "workers-dev", "workers-prod"]
	expect([...run.matchAll(/--project (\S+)/g)].map((match) => match[1])).toEqual(
		servers.map((server) => `${server}-webkit`),
	)
	expect(run).toContain("--shard=${{ matrix.shard }}/3")
	expect(mac?.steps.filter((step) => step.run === "bun run test").map((step) => step.if)).toEqual(["matrix.shard == 1"])
})

// A failed grid uploads its test results, each failing case's error context, server logs, and navigation log (tracing is
// off, B34), as the last step of both jobs, so a failure only CI hits can be read (BUGS.md 93). A pass uploads nothing:
// `stream` no longer times anything (BUGS.md 100).
it("ci failure artifacts", () => {
	for (const [name, when] of [
		["e2e-linux", "failure()"],
		["e2e-mac", "failure()"],
	] as const) {
		const last = workflow.jobs[name]?.steps.at(-1)
		expect({ if: last?.if, uses: last?.uses, with: last?.with }).toEqual({
			if: when,
			uses: "actions/upload-artifact@v4",
			with: { name: `${name}-\${{ matrix.shard }}`, path: "packages/core/test-results", "retention-days": 7 },
		})
	}
})

// The browser image has no unzip, which setup-bun needs, so the Linux grid takes Bun from npm at BUN_VERSION.
it("ci grid bun", () => {
	const linux = workflow.jobs["e2e-linux"]
	expect(linux?.steps.some((step) => step.uses?.startsWith("oven-sh/setup-bun") === true)).toBe(false)
	expect(linux?.steps.find((step) => step.name === "Install Bun")?.run).toBe(
		'npm install --global --prefix "$HOME/.bun-npm" "bun@$BUN_VERSION"\necho "$HOME/.bun-npm/bin" >> "$GITHUB_PATH"\n',
	)
})
