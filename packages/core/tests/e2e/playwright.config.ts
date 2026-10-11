import { defineConfig, type Project } from "@playwright/test";

const all: Project[] = [
	{ name: "node-dev-chromium", use: { browserName: "chromium" } },
	{ name: "node-dev-firefox", use: { browserName: "firefox" } },
	{ name: "node-dev-webkit", use: { browserName: "webkit" } },
];

const requested = projectArg(process.argv);
if (process.platform !== "darwin" && requested?.includes("webkit")) throw new Error("webkit runs on macOS");

const projects = requested
	? all.filter((project) => project.name === requested)
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

function projectArg(argv: readonly string[]): string | undefined {
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index] ?? "";
		if (arg === "--project") return argv[index + 1];
		if (arg.startsWith("--project=")) return arg.slice("--project=".length);
	}
	return undefined;
}
