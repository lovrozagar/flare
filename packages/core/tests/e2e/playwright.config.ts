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

const projects =
	requested.size > 0
		? all.filter((project) => requested.has(project.name ?? ""))
		: all.filter((project) => {
				const name = project.name ?? "";
				return process.platform === "darwin" ? name.endsWith("webkit") : !name.endsWith("webkit");
			});

export default defineConfig({
	testDir: import.meta.dirname,
	testIgnore: ["**/boot.test.ts"],
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
