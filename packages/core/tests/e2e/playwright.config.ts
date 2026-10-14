import { defineConfig, type Project } from "@playwright/test";

// Every server is crossed with all three browsers (B70): 18 projects on any machine, since the browsers come from the
// pinned image, not the OS (B97). A prod project builds the app once per file and serves the output with that
// runtime's adapter.
const SERVERS = ["node-dev", "node-prod", "bun-dev", "bun-prod", "workers-dev", "workers-prod"];
const BROWSERS = ["chromium", "firefox", "webkit"] as const;

// The global setup puts the run-server's endpoint in the env before any worker starts, and a worker loads this file
// again, so every project connects to it. Without one, the projects launch Playwright's installed engines (B97).
const endpoint = process.env["FLARE_BROWSER_WS"];
const connect = endpoint === undefined ? {} : { connectOptions: { wsEndpoint: endpoint, timeout: 60_000 } };

const all: Project[] = SERVERS.flatMap((server) =>
	BROWSERS.map((browserName) => ({ name: `${server}-${browserName}`, use: { browserName, ...connect } })),
);

// Every `--project` value counts, so `--project=a --project=b` runs both.
const requested = projectArgs(process.argv);

// A worker process loads this file again without the runner's argv, so it must know every project the runner may
// have chosen. The runner, which owns the choice, sees the filter, and tells the workers that the projects were
// named (docs.fixture.ts runs its deep specs on named projects).
const inWorker = process.env["TEST_WORKER_INDEX"] !== undefined;
if (!inWorker && requested.size > 0) process.env["FLARE_E2E_PROJECTS_CHOSEN"] = "1";

const projects = inWorker || requested.size === 0 ? all : all.filter((project) => requested.has(project.name ?? ""));

export default defineConfig({
	testDir: import.meta.dirname,
	// Vitest files beside the specs: the boot helper's own tests and the golden proof from the tarball (B70, bits/14).
	testIgnore: ["**/boot.test.ts", "**/golden.test.ts"],
	globalSetup: "./global-setup.ts",
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
