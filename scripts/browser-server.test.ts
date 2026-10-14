import { expect, it } from "vitest";
import { browserEndpoint, IMAGE_DIGEST, type BrowserDeps } from "./browser-server.ts";

type Run = { args: readonly string[] };

// A machine, recorded: what the env holds, whether Docker answers, which ports listen, which engines are installed.
function machine(input: { env?: Record<string, string>; docker?: boolean; installed?: boolean; up?: boolean } = {}) {
	const runs: Run[] = [];
	let listening = input.up ?? false;
	const deps: BrowserDeps = {
		env: input.env ?? {},
		docker: {
			present: () => input.docker ?? false,
			run(args) {
				runs.push({ args });
				listening = true;
				return { status: 0, stderr: "" };
			},
		},
		reachable: async () => listening,
		installed: () => input.installed ?? false,
		core: () => ({ dir: "/repo/node_modules/playwright-core", version: "1.61.1" }),
		sleep: async () => undefined,
	};
	return { deps, runs };
}

it("endpoint env", async () => {
	const { deps, runs } = machine({ env: { FLARE_BROWSER_WS: "ws://10.0.0.2:3000/" }, docker: true, installed: true });
	expect(await browserEndpoint(deps)).toBe("ws://10.0.0.2:3000/");
	expect(runs).toEqual([]);
});

// The pinned image's run-server, from the lockfile's playwright-core mounted read-only, on the host network. One that
// already listens is reused (B97).
it("container", async () => {
	const fresh = machine({ docker: true, installed: true });
	expect(await browserEndpoint(fresh.deps)).toBe("ws://127.0.0.1:3333/");
	expect(fresh.runs).toEqual([
		{
			args: [
				"run",
				"-d",
				"--rm",
				"--init",
				"--network",
				"host",
				"--name",
				"flare-browsers",
				"-v",
				"/repo/node_modules/playwright-core:/playwright-core:ro",
				`mcr.microsoft.com/playwright:v1.61.1-noble@sha256:${IMAGE_DIGEST}`,
				"node",
				"/playwright-core/cli.js",
				"run-server",
				"--port",
				"3333",
				"--host",
				"127.0.0.1",
			],
		},
	]);
	const running = machine({ docker: true, up: true });
	expect(await browserEndpoint(running.deps)).toBe("ws://127.0.0.1:3333/");
	expect(running.runs).toEqual([]);
});

// A container that cannot start, or a run-server that never answers, names the cause.
it("container fails", async () => {
	const refused = machine({ docker: true });
	refused.deps.docker.run = () => ({ status: 1, stderr: "permission denied while trying to connect" });
	await expect(browserEndpoint(refused.deps)).rejects.toThrow(
		"the browser container did not start: permission denied while trying to connect",
	);
	const named = machine({ docker: true });
	named.deps.docker.run = () => ({
		status: 125,
		stderr: 'Conflict. The container name "/flare-browsers" is already in use',
	});
	named.deps.reachable = async () => false;
	await expect(browserEndpoint(named.deps)).rejects.toThrow(
		"the browser run-server did not answer on ws://127.0.0.1:3333/",
	);
});

// The macOS runners and the CI image have no Docker and launch the installed engines themselves.
it("local engines", async () => {
	const { deps, runs } = machine({ installed: true });
	expect(await browserEndpoint(deps)).toBeUndefined();
	expect(runs).toEqual([]);
});

it("none", async () => {
	await expect(browserEndpoint(machine().deps)).rejects.toThrow(
		"No browsers: set FLARE_BROWSER_WS to a Playwright run-server, install Docker for the pinned container, or " +
			"install Playwright's engines (bunx playwright install chromium firefox webkit)",
	);
});
