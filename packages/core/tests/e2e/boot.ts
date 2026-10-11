import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

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
	const vite = await createServer({
		configFile: join(appDir, "vite.config.ts"),
		cacheDir,
		server: { host: "127.0.0.1", port: 0 },
	});
	await vite.listen();
	const address = vite.httpServer?.address();
	if (!address || typeof address === "string") throw new Error("port");
	return {
		origin: `http://127.0.0.1:${address.port}`,
		appDir,
		cacheDir,
		async close() {
			await vite.close();
			await rm(cacheDir, { recursive: true, force: true });
		},
	};
}
