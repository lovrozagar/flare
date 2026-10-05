/**
 * Deploy simulation for e2e: copy an app to a sibling directory, build it with a given Flare
 * config, serve it with `vite preview` on a fixed port, and swap the server for another build on
 * the same port — what a host does on deploy. Copies live next to the apps (same depth, so the
 * tsconfig `extends` and hoisted node_modules resolve) and are removed by `dispose()`.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";

const appsRoot = join(import.meta.dirname, "apps");

export interface DeployCopy {
	dir: string;
	/** Manifest `file` for a source key, as a URL path. */
	chunk(sourceKey: string): string;
}

export interface Deployment {
	build(name: string, options: { edit?: (dir: string) => void; flare: string }): DeployCopy;
	dispose(): Promise<void>;
	origin: string;
	serve(copy: DeployCopy): Promise<void>;
	stop(): Promise<void>;
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const attempt = () => {
			const socket = connect(port, "127.0.0.1");
			socket.once("connect", () => {
				socket.end();
				resolve();
			});
			socket.once("error", () => {
				socket.destroy();
				if (Date.now() > deadline) reject(new Error(`port ${port} never opened`));
				else setTimeout(attempt, 100);
			});
		};
		attempt();
	});
}

export function createDeployment(app: string, port: number): Deployment {
	const copies: string[] = [];
	let server: ChildProcess | undefined;
	const origin = `http://127.0.0.1:${port}`;

	async function stop(): Promise<void> {
		const running = server;
		server = undefined;
		if (!running || running.exitCode !== null) return;
		await new Promise<void>((resolve) => {
			running.once("exit", () => resolve());
			running.kill("SIGTERM");
		});
	}

	return {
		build(name, options) {
			const dir = join(appsRoot, `.deploy-${app}-${name}`);
			rmSync(dir, { force: true, recursive: true });
			const source = join(appsRoot, app);
			for (const entry of ["src", "public", "package.json", "tsconfig.json"]) {
				if (existsSync(join(source, entry))) cpSync(join(source, entry), join(dir, entry), { recursive: true });
			}
			copies.push(dir);
			writeFileSync(
				join(dir, "vite.config.ts"),
				`import { defineConfig } from "vite";\nimport { flare } from "@lovrozagar/flare/plugins";\nexport default defineConfig({ plugins: [flare(${options.flare})] });\n`,
			);
			options.edit?.(dir);
			const result = spawnSync("bunx", ["vite", "build"], { cwd: dir, encoding: "utf-8" });
			if (result.status !== 0) throw new Error(`build ${name} failed:\n${result.stdout}\n${result.stderr}`);
			const manifest = JSON.parse(readFileSync(join(dir, "dist/client/.vite/manifest.json"), "utf-8")) as Record<
				string,
				{ file: string }
			>;
			return {
				chunk: (key) => {
					const file = manifest[key]?.file;
					if (!file) throw new Error(`${key} not in ${name}'s manifest`);
					return `/${file}`;
				},
				dir,
			};
		},
		async dispose() {
			await stop();
			for (const dir of copies) rmSync(dir, { force: true, recursive: true });
		},
		origin,
		async serve(copy) {
			await stop();
			server = spawn("bunx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
				cwd: copy.dir,
				stdio: "ignore",
			});
			await waitForPort(port, 30_000);
		},
		stop,
	};
}
