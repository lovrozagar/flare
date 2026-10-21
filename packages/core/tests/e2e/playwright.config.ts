import { defineConfig, type PlaywrightTestOptions, type PlaywrightWorkerOptions, type Project } from "@playwright/test"
import type { FloorOptions } from "./crash.ts"
import { machineWorkers } from "./workers.ts"

type FlareProject = Project<PlaywrightTestOptions, PlaywrightWorkerOptions & FloorOptions>

// Every server is crossed with all three browsers (B70): 18 projects on any machine, since the browsers come from the
// pinned image, not the OS (B97), and the browser floor is the 19th (B123). A prod project builds the app once per file and serves the output with that
// runtime's adapter.
const SERVERS = ["node-dev", "node-prod", "bun-dev", "bun-prod", "workers-dev", "workers-prod"]
const BROWSERS = ["chromium", "firefox", "webkit"] as const

// The global setup puts the run-server's endpoint in the env before any worker starts, and a worker loads this file
// again, so every project connects to it. Without one, the projects launch Playwright's installed engines (B97).
const endpoint = process.env["FLARE_BROWSER_WS"]
const connect = endpoint === undefined ? {} : { connectOptions: { wsEndpoint: endpoint, timeout: 60_000 } }

const grid: FlareProject[] = SERVERS.flatMap((server) =>
	BROWSERS.map((browserName) => ({ name: `${server}-${browserName}`, use: { browserName, ...connect } })),
)

// The browser floor (decision B123): the production client in Chromium with every API newer than Chrome 111, Firefox
// 114, and Safari 16.4 deleted before the page runs (floor.ts). It runs the specs that drive the client: boot,
// navigation, data, and streams.
const floor: FlareProject = {
	name: "node-prod-floor",
	testMatch: ["docs-smoke.test.ts", "docs-navigation.test.ts", "docs-data.test.ts"],
	use: { browserName: "chromium", floor: true, ...connect },
}

const all = [...grid, floor]

// Every `--project` value counts, so `--project=a --project=b` runs both.
const requested = projectArgs(process.argv)

// A worker process loads this file again without the runner's argv, so it must know every project the runner may
// have chosen. The runner, which owns the choice, sees the filter, and tells the workers that the projects were
// named (docs.fixture.ts runs its deep specs on named projects).
const inWorker = process.env["TEST_WORKER_INDEX"] !== undefined
if (!inWorker && requested.size > 0) process.env["FLARE_E2E_PROJECTS_CHOSEN"] = "1"

const projects = inWorker || requested.size === 0 ? all : all.filter((project) => requested.has(project.name ?? ""))

// Sized to the memory free at the start, so the grid stays inside it (workers.ts, BUGS.md 128). The runner logs the
// count once; a worker loads this file again and runs none of its own.
const sized = machineWorkers(process.env)
if (!inWorker) console.log(sized.line)

export default defineConfig<object, FloorOptions>({
	testDir: import.meta.dirname,
	// Vitest files beside the specs: the boot helper's and its child helpers' own tests, and the golden proof from the
	// tarball (B70, bits/14).
	testIgnore: [
		"**/boot.test.ts",
		"**/child.test.ts",
		"**/copy-boot.test.ts",
		"**/flush.test.ts",
		"**/golden.test.ts",
		"**/shared-cache.test.ts",
		"**/server-log.test.ts",
		"**/trace.test.ts",
	],
	globalSetup: "./global-setup.ts",
	fullyParallel: false,
	retries: 0,
	...(sized.workers !== undefined && { workers: sized.workers }),
	projects,
})

function projectArgs(argv: readonly string[]): Set<string> {
	const names = new Set<string>()
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? ""
		const next = argv[index + 1]
		if (arg === "--project" && next !== undefined) names.add(next)
		if (arg.startsWith("--project=")) names.add(arg.slice("--project=".length))
	}
	return names
}
