/** @vitest-environment node */
/* In dev, editing the theme stylesheet recompiles the cn tables (no server restart). */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { createSxAstPlugin } from "../../../src/plugins/sx-ast/index.ts";

const STYLES_ENTRY = fileURLToPath(new URL("../../../src/styles/index.ts", import.meta.url));
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
	for (const fn of cleanups.splice(0)) await fn();
});

/* Silences Flare's logger in these bundles, as an app's `logLevel` would (Flare's plugin
   defines the level; the logger needs nothing else). */
const silentLogger = {
	config: () => ({ define: { __FLARE_LOG_LEVEL__: JSON.stringify("silent") } }),
	name: "silent-flare-logger",
};

async function loadCn(server: ViteDevServer): Promise<(...inputs: string[]) => string> {
	const mod = (await server.ssrLoadModule(STYLES_ENTRY)) as { cn: (...inputs: string[]) => string };
	return mod.cn;
}

describe("sx plugin dev: theme edits rebuild the cn tables", () => {
	it("picks up a new radius name after the theme file changes", async () => {
		const dir = mkdtempSync(join(tmpdir(), "flare-cn-theme-dev-"));
		cleanups.push(() => rmSync(dir, { force: true, recursive: true }));
		const theme = join(dir, "theme.css");
		writeFileSync(theme, '@import "tailwindcss";\n@theme {\n\t--radius-control: 6px;\n}\n');

		const server = await createServer({
			configFile: false,
			logLevel: "silent",
			plugins: [silentLogger, createSxAstPlugin({ tw: true, twCssPath: theme })],
			root: dir,
			server: { middlewareMode: true, hmr: false },
		});
		cleanups.push(() => server.close());

		const before = await loadCn(server);
		expect(before("rounded-control", "rounded-lg")).toBe("rounded-lg");
		expect(before("rounded-island", "rounded-lg")).toBe("rounded-island rounded-lg");

		writeFileSync(theme, '@import "tailwindcss";\n@theme {\n\t--radius-control: 6px;\n\t--radius-island: 12px;\n}\n');
		server.watcher.emit("change", theme);

		/* The watcher rebuilds asynchronously; wait for the condition, not a fixed delay. */
		await vi.waitFor(async () => {
			const after = await loadCn(server);
			expect(after("rounded-island", "rounded-lg")).toBe("rounded-lg");
		});
	}, 60_000);
});
