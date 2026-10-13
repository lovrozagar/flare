import { defineConfig, type Project } from "@playwright/test";

// Every server is crossed with all three browsers (B70). A prod project builds the app once per file and serves the
// output with that runtime's adapter.
const SERVERS = ["node-dev", "node-prod", "bun-prod", "workers-prod"];
const BROWSERS = ["chromium", "firefox", "webkit"] as const;

const all: Project[] = SERVERS.flatMap((server) =>
	BROWSERS.map((browserName) => ({ name: `${server}-${browserName}`, use: { browserName } })),
);

// Every `--project` value counts, so `--project=a --project=b` runs both.
const requested = projectArgs(process.argv);
if (process.platform !== "darwin" && [...requested].some((name) => name.includes("webkit"))) {
	throw new Error("webkit runs on macOS");
}

// A worker process loads this file again without the runner's argv, so it must know every project the runner may
// have chosen. The runner, which owns the choice, sees the filter, and tells the workers that the projects were
// named (docs.fixture.ts runs its deep specs on named projects).
const inWorker = process.env["TEST_WORKER_INDEX"] !== undefined;
if (!inWorker && requested.size > 0) process.env["FLARE_E2E_PROJECTS_CHOSEN"] = "1";

const projects = inWorker
	? all
	: requested.size > 0
		? all.filter((project) => requested.has(project.name ?? ""))
		: all.filter((project) => {
				const name = project.name ?? "";
				return process.platform === "darwin" ? name.endsWith("webkit") : !name.endsWith("webkit");
			});

export default defineConfig({
	testDir: import.meta.dirname,
	// Vitest files beside the specs: the boot helper's own tests and the golden proof from the tarball (B70, bits/14).
	testIgnore: ["**/boot.test.ts", "**/golden.test.ts"],
	fullyParallel: false,
	retries: 0,
	projects,
});

function projectArgs(argv: readonly string[]): Set<string> {
	const names = new Set<string>();
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		const next = argv[index + 1];
		if (arg === "--project" && next !== undefined) names.add(next);
		if (arg.startsWith("--project=")) names.add(arg.slice("--project=".length));
	}
	return names;
}
