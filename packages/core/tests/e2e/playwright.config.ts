import { defineConfig, type PlaywrightTestOptions, type PlaywrightWorkerOptions, type Project } from "@playwright/test"
import type { FloorOptions } from "./crash.ts"
import { machineWorkers } from "./workers.ts"

type FlareProject = Project<PlaywrightTestOptions, PlaywrightWorkerOptions & FloorOptions>

// Every server is crossed with all three browsers (B70): 18 projects on any machine, since the browsers come from the
// pinned image, not the OS (B97), and the browser floor is the 19th (B123). A prod project builds the app once per file and serves the output with that
// runtime's adapter.
const SERVERS = ["node-dev", "node-prod", "bun-dev", "bun-prod", "workers-dev", "workers-prod"]
const BROWSERS = ["chromium", "firefox", "webkit"] as const

// The global setup puts the run-servers' endpoints in the env before any worker starts, and a worker loads this file
// again, so every project connects to its engine's: Chromium's own, with the headers that route it through the
// loopback proxy (BUGS.md 484), and the shared one for Firefox and WebKit. Without them, the projects launch
// Playwright's installed engines (B97).
function connect(browserName: (typeof BROWSERS)[number]) {
	const chromium = browserName === "chromium"
	const endpoint = (chromium ? process.env["FLARE_CHROMIUM_WS"] : undefined) ?? process.env["FLARE_BROWSER_WS"]
	if (endpoint === undefined) return {}
	const headers: Record<string, string> = chromium ? JSON.parse(process.env["FLARE_CHROMIUM_HEADERS"] ?? "{}") : {}
	return { connectOptions: { wsEndpoint: endpoint, timeout: 60_000, headers } }
}

const grid: FlareProject[] = SERVERS.flatMap((server) =>
	BROWSERS.map((browserName) => ({ name: `${server}-${browserName}`, use: { browserName, ...connect(browserName) } })),
)

// The browser floor (decision B123): the production client in Chromium with every API newer than Chrome 111, Firefox
// 114, and Safari 16.4 deleted before the page runs (floor.ts). It runs the specs that drive the client: boot,
// navigation, data, and streams.
const floor: FlareProject = {
	name: "node-prod-floor",
	testMatch: ["docs-smoke.test.ts", "docs-navigation.test.ts", "docs-data.test.ts"],
	use: { browserName: "chromium", floor: true, ...connect("chromium") },
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
		"**/boot-port.test.ts",
		"**/child.test.ts",
		"**/copy-boot.test.ts",
		"**/flush.test.ts",
		"**/golden.test.ts",
		"**/shared-cache.test.ts",
		"**/server-log.test.ts",
		"**/timing.test.ts",
		"**/trace.test.ts",
	],
	// On GitHub, each spec file's time goes to the job summary beside the default dot output, so a green run shows what
	// each file costs (timing.ts, BUGS.md 489).
	...(process.env["GITHUB_STEP_SUMMARY"] !== undefined && { reporter: [["dot"], ["./timing.ts"]] }),
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
