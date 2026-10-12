import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const apps = fileURLToPath(new URL("./apps/", import.meta.url));

export type Boot = {
	origin: string;
	appDir: string;
	cacheDir: string;
	close: () => Promise<void>;
};

export async function boot(input: { app: string; runtime: string; mode: string }): Promise<Boot> {
	if (input.app !== "minimal" && input.app !== "basepath") throw new Error(input.app);
	if (input.runtime !== "node") throw new Error(input.runtime);
	if (input.mode !== "dev") throw new Error(input.mode);
	const appDir = join(apps, input.app);
	const cacheDir = await mkdtemp(join(tmpdir(), "flare-vite-"));
	// A child process, so the app's Vite and the framework it loads stay out of the test process.
	return bootChild(appDir, cacheDir);
}

const viteBin = fileURLToPath(new URL("../../../../node_modules/.bin/vite", import.meta.url));

function bootChild(appDir: string, cacheDir: string): Promise<Boot> {
	const child = spawn(viteBin, ["--host", "127.0.0.1", "--port", "0"], {
		cwd: appDir,
		// Playwright sets FORCE_COLOR. A colored URL would never match readOrigin, and NO_COLOR wins over it.
		env: { ...process.env, FLARE_VITE_CACHE: cacheDir, NO_COLOR: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const origin = readOrigin(child);
	return origin.then((url) => ({
		origin: url,
		appDir,
		cacheDir,
		async close() {
			child.kill("SIGTERM");
			await exited(child);
			await rm(cacheDir, { recursive: true, force: true });
		},
	}));
}

function readOrigin(child: ChildProcess): Promise<string> {
	return new Promise((resolve, reject) => {
		let text = "";
		const onData = (chunk: Buffer) => {
			text += chunk.toString();
			const found = text.match(/http:\/\/127\.0\.0\.1:\d+/);
			if (!found) return;
			resolve(found[0]);
		};
		child.stdout?.on("data", onData);
		child.stderr?.on("data", onData);
		child.once("exit", () => reject(new Error(text || "vite exited")));
	});
}

function exited(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) return Promise.resolve();
	return new Promise((resolve) => {
		child.once("exit", () => resolve());
	});
}
