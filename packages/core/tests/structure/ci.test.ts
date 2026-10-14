import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { expect, it } from "vitest";
import { IMAGE_DIGEST } from "../../../../scripts/browser-server.ts";

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
type Job = {
	"runs-on": string;
	steps: Step[];
	container?: { image?: string; options?: string };
	strategy?: { matrix?: Record<string, unknown> };
};
type Workflow = { env?: Record<string, string>; jobs: Record<string, Job> };

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

// The Linux grid runs inside the pinned browser image, the digest the local container uses, in 3 shards; macOS runs
// the 6 webkit projects (B70, B97).
it("ci grid", () => {
	const linux = workflow.jobs["e2e-linux"];
	expect(linux?.container?.image).toBe(`mcr.microsoft.com/playwright:v1.61.1-noble@sha256:${IMAGE_DIGEST}`);
	expect(linux?.container?.options).toBe("--user 1001 --ipc=host");
	expect(linux?.strategy?.matrix?.["shard"]).toEqual([1, 2, 3]);
	expect(linux?.steps.at(-1)?.run).toBe("bun run test:e2e -- --shard=${{ matrix.shard }}/3");
	const mac = workflow.jobs["e2e-mac"]?.steps.at(-1)?.run ?? "";
	const servers = ["node-dev", "node-prod", "bun-dev", "bun-prod", "workers-dev", "workers-prod"];
	expect([...mac.matchAll(/--project (\S+)/g)].map((match) => match[1])).toEqual(
		servers.map((server) => `${server}-webkit`),
	);
});

// The browser image has no unzip, which setup-bun needs, so the Linux grid takes Bun from npm at BUN_VERSION.
it("ci grid bun", () => {
	const linux = workflow.jobs["e2e-linux"];
	expect(linux?.steps.some((step) => step.uses?.startsWith("oven-sh/setup-bun") === true)).toBe(false);
	expect(linux?.steps.find((step) => step.name === "Install Bun")?.run).toBe(
		'npm install --global --prefix "$HOME/.bun-npm" "bun@$BUN_VERSION"\necho "$HOME/.bun-npm/bin" >> "$GITHUB_PATH"\n',
	);
});
