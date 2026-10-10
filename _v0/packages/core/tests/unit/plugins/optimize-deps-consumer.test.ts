/** @vitest-environment node */
/*
 * Flare ships TSX source. Installed from npm it sits in the consumer's node_modules, where Vite's
 * dependency optimizer would pre-bundle it without the Solid JSX transform ("React is not defined"
 * at hydration). Workspace links never hit this; this test installs a real copy like npm does.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { flare } from "../../../src/plugins/index.ts";

const CORE = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURES = join(CORE, "tests/fixtures");

let app = "";
let server: ViteDevServer;

beforeAll(async () => {
	/* Inside the repo so solid-js and friends resolve from the workspace root. */
	app = mkdtempSync(join(FIXTURES, ".consumer-dev-"));
	cpSync(join(FIXTURES, "cn-bundle/static-app"), app, { recursive: true });
	/* Its own package scope: without it, Node's self-reference resolves @lovrozagar/flare to this repo. */
	writeFileSync(
		join(app, "package.json"),
		JSON.stringify({ name: "flare-consumer-fixture", private: true, type: "module" }),
	);
	const installed = join(app, "node_modules/@lovrozagar/flare");
	mkdirSync(installed, { recursive: true });
	cpSync(join(CORE, "src"), join(installed, "src"), { recursive: true });
	cpSync(join(CORE, "package.json"), join(installed, "package.json"));

	/* Plugin from this repo (Node can't type-strip TS under node_modules); app imports resolve to the copy. */
	server = await createServer({
		configFile: false,
		plugins: flare({ codegen: { fsVirtualPaths: false }, dev: false, prerender: false }),
		logLevel: "silent",
		root: app,
		server: { hmr: false, middlewareMode: true, watch: null },
	});
}, 120_000);

afterAll(async () => {
	try {
		await server?.close();
	} finally {
		rmSync(app, { force: true, recursive: true });
	}
}, 60_000);

describe("flare installed in node_modules (dev)", () => {
	it("serves flare as source instead of a pre-bundled optimizer chunk", async () => {
		const result = await server.transformRequest("/src/client.tsx");
		const code = result?.code ?? "";
		expect(code).toMatch(/from\s*["']\/node_modules\/@lovrozagar\/flare\/src\/client\/index\.ts/);
		expect(code).not.toContain(".vite/deps/@lovrozagar_flare");
	}, 120_000);
});
