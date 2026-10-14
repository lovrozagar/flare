import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { expect, it } from "vitest";

type Step = { uses?: string; run?: string; with?: Record<string, unknown> };
type Workflow = { env?: Record<string, string>; jobs: Record<string, { "runs-on": string; steps: Step[] }> };

const workflow = load(
	readFileSync(new URL("../../../../.github/workflows/ci.yml", import.meta.url), "utf8"),
) as Workflow;

// B3: every CI job runs on Node 24, set right after checkout, so no job runs on the runner's own Node (BUGS.md B24).
it("ci node", () => {
	for (const [name, job] of Object.entries(workflow.jobs)) {
		const checkout = job.steps.findIndex((step) => step.uses?.startsWith("actions/checkout@") === true);
		const node = job.steps[checkout + 1];
		expect({ name, uses: node?.uses, version: node?.with?.["node-version"] }).toEqual({
			name,
			uses: "actions/setup-node@v4",
			version: 24,
		});
	}
});

// B3 covers Linux and macOS, so the unit suite runs on both (BUGS.md B27).
it("ci unit on both oses", () => {
	const runsTests = (name: string): boolean =>
		workflow.jobs[name]?.steps.some((step) => step.run === "bun run test") === true;
	expect(workflow.jobs["check"]?.["runs-on"]).toBe("ubuntu-latest");
	expect(workflow.jobs["e2e-mac"]?.["runs-on"]).toBe("macos-latest");
	expect([runsTests("check"), runsTests("e2e-mac")]).toEqual([true, true]);
});

// CI runs the Bun this repo was verified on: ci.yml's BUN_VERSION is the root manifest's packageManager (BUGS.md B48).
it("ci bun version", () => {
	const root = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as {
		packageManager?: string;
	};
	expect(`bun@${String(workflow.env?.["BUN_VERSION"])}`).toBe(root.packageManager);
});

// The check job runs the unit suite under the Bun runtime right after the Node run, so a Bun-only regression fails
// CI. Coverage is measured under Node; the Bun run carries no coverage gate (00-rules Coverage, BUGS.md B46-B48).
it("ci unit on bun", () => {
	const runs = workflow.jobs["check"]?.steps.map((step) => step.run) ?? [];
	const node = runs.indexOf("bun run test");
	expect(runs.slice(node, node + 2)).toEqual(["bun run test", "bun run test:bun"]);
});
