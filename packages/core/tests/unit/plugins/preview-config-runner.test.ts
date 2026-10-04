/** @vitest-environment node */
/*
 * `vite preview --configLoader runner` evaluates the config and its plugins in a module runner
 * that Vite closes once the config is loaded. The preview middleware imports the built server
 * bundle on the first request, so that import must not go through the (closed) runner.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { preview, type PreviewServer } from "vite";

const FIXTURES = fileURLToPath(new URL("../../fixtures/", import.meta.url));
const PLUGIN = fileURLToPath(new URL("../../../src/plugins/dev-server.ts", import.meta.url));
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
	for (const fn of cleanups.splice(0).toReversed()) await fn();
});

describe("preview server under the runner config loader", () => {
	it("serves the built server bundle", async () => {
		const app = mkdtempSync(join(FIXTURES, ".consumer-dev-"));
		cleanups.push(() => rmSync(app, { force: true, recursive: true }));
		mkdirSync(join(app, "dist/server"), { recursive: true });
		mkdirSync(join(app, "dist/client"), { recursive: true });
		writeFileSync(
			join(app, "dist/server/server.js"),
			'export const server = { fetch: () => new Response("from the server bundle") };\n',
		);
		writeFileSync(
			join(app, "vite.config.ts"),
			`import { createPreviewServerPlugin } from ${JSON.stringify(PLUGIN)};\n` +
				"export default { plugins: [createPreviewServerPlugin()] };\n",
		);
		const server: PreviewServer = await preview({
			configFile: join(app, "vite.config.ts"),
			configLoader: "runner",
			logLevel: "silent",
			preview: { host: "127.0.0.1", port: 0 },
			root: app,
		});
		cleanups.push(() => server.close());
		const { port } = server.httpServer.address() as AddressInfo;
		const response = await fetch(`http://127.0.0.1:${port}/any`);
		expect(await response.text()).toBe("from the server bundle");
	}, 60_000);
});
