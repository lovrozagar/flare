import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { dirname } from "node:path";
import { chromium, firefox, webkit } from "@playwright/test";

// The pinned image every machine runs the browsers from (B70, B97). Its tag is the lockfile's Playwright version, and
// an upgrade changes the digest with it.
export const IMAGE_DIGEST = "5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48";
const PORT = 3333;
const CONTAINER = "flare-browsers";

// What the browser source reads of the machine. The native one is the real machine; a test passes its own.
export type BrowserDeps = {
	env: Readonly<Record<string, string | undefined>>;
	docker: { run: (args: readonly string[]) => { status: number | null; stdout: string; stderr: string } };
	reachable: (port: number) => Promise<boolean>;
	installed: () => boolean;
	core: () => { dir: string; version: string };
	sleep: (ms: number) => Promise<void>;
};

// Where the engines come from (B97): `FLARE_BROWSER_WS`, else the pinned container's run-server when Docker answers,
// else Playwright's installed engines, as on the macOS runners and inside the CI image, which have no Docker. The
// endpoint, or undefined for the installed engines. With none of the three, one error names all three.
export async function browserEndpoint(deps: BrowserDeps = NATIVE): Promise<string | undefined> {
	const set = deps.env["FLARE_BROWSER_WS"];
	if (set !== undefined) return set;
	if (daemon(deps)) return browserServer(deps);
	if (deps.installed()) return undefined;
	throw new Error(
		"No browsers: set FLARE_BROWSER_WS to a Playwright run-server, install Docker for the pinned container, or " +
			"install Playwright's engines (bunx playwright install chromium firefox webkit)",
	);
}

// Docker counts only when its daemon answers this shell: a binary on PATH whose daemon is down, or refuses a user
// outside the `docker` group, falls through to the installed engines.
function daemon(deps: BrowserDeps): boolean {
	return deps.docker.run(["version", "--format", "{{.Server.Version}}"]).status === 0;
}

// A run-server on 127.0.0.1 from the pinned image, on the host network and the host's IPC namespace (Chromium's shared
// memory, which Docker caps at 64 MB by default, plan 14 leaf 4.6). A `flare-browsers` container that already is that
// is reused; any other is replaced, since only this script creates it. The server is the lockfile's own
// playwright-core, mounted read-only, so the container downloads nothing and its version is the one the image's
// browsers were built for.
async function browserServer(deps: BrowserDeps): Promise<string> {
	const endpoint = `ws://127.0.0.1:${PORT}/`;
	const core = deps.core();
	const image = `mcr.microsoft.com/playwright:v${core.version}-noble@sha256:${IMAGE_DIGEST}`;
	const found = deps.docker.run(["inspect", "--format", "{{.Config.Image}}|{{.HostConfig.IpcMode}}", CONTAINER]);
	const current = found.status === 0 ? found.stdout.trim() : undefined;
	if (current !== undefined && current !== `${image}|host`) deps.docker.run(["rm", "-f", CONTAINER]);
	if (current !== `${image}|host`) {
		const run = ["run", "-d", "--rm", "--init", "--ipc=host", "--network", "host", "--name", CONTAINER];
		const mount = ["-v", `${core.dir}:/playwright-core:ro`, image];
		const serve = ["node", "/playwright-core/cli.js", "run-server", "--port", String(PORT), "--host", "127.0.0.1"];
		const started = deps.docker.run([...run, ...mount, ...serve]);
		// A container of that name may be starting already, for another process of the same run.
		if (started.status !== 0 && !started.stderr.includes("already in use")) {
			throw new Error(`the browser container did not start: ${started.stderr}`);
		}
	}
	for (let waited = 0; waited < 120; waited += 1) {
		if (await deps.reachable(PORT)) return endpoint;
		await deps.sleep(250);
	}
	throw new Error(`the browser run-server did not answer on ${endpoint}`);
}

const DOCKER = process.env["FLARE_DOCKER"] ?? "docker";

const NATIVE: BrowserDeps = {
	env: process.env,
	docker: {
		run(args) {
			const done = spawnSync(DOCKER, args, { encoding: "utf8" });
			return { status: done.status, stdout: done.stdout ?? "", stderr: done.stderr || String(done.error ?? "") };
		},
	},
	reachable: (port) =>
		new Promise((resolve) => {
			const socket = connect(port, "127.0.0.1");
			socket.once("connect", () => {
				socket.destroy();
				resolve(true);
			});
			socket.once("error", () => resolve(false));
		}),
	installed: () => [chromium, firefox, webkit].every((type) => existsSync(type.executablePath())),
	core() {
		const test = createRequire(import.meta.url).resolve("@playwright/test/package.json");
		const manifest = createRequire(test).resolve("playwright-core/package.json");
		const version = Reflect.get(Object(JSON.parse(readFileSync(manifest, "utf8"))), "version");
		if (typeof version !== "string") throw new Error("playwright-core has no version");
		return { dir: dirname(manifest), version };
	},
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
