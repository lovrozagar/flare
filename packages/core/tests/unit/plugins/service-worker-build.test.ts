/** @vitest-environment node */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServiceWorker, writeCleanupServiceWorker } from "../../../src/plugins/service-worker.ts";

const roots: string[] = [];
afterEach(() => {
	for (const r of roots.splice(0)) rmSync(r, { force: true, recursive: true });
});

const MANIFEST = {
	"src/client.tsx": { css: ["assets/client.css"], file: "assets/client-1.js", isEntry: true },
	"src/routes/about.tsx": { assets: ["assets/logo-9.png"], file: "assets/about-2.js", isDynamicEntry: true },
};

function project(withWorker: boolean): string {
	const root = mkdtempSync(join(tmpdir(), "flare-sw-"));
	roots.push(root);
	mkdirSync(join(root, "dist/client/.vite"), { recursive: true });
	writeFileSync(join(root, "dist/client/.vite/manifest.json"), JSON.stringify(MANIFEST));
	mkdirSync(join(root, "public/icons"), { recursive: true });
	writeFileSync(join(root, "public/robots.txt"), "");
	writeFileSync(join(root, "public/icons/a.png"), "");
	mkdirSync(join(root, "src"), { recursive: true });
	if (withWorker) {
		writeFileSync(
			join(root, "src/service-worker.ts"),
			[
				'import { build, files, version } from "@lovrozagar/flare/service-worker";',
				"declare const self: { __flare?: unknown; addEventListener(t: string, f: () => void): void };",
				'self.addEventListener("install", () => { self.__flare = { build, files, version }; });',
			].join("\n"),
		);
	}
	return root;
}

describe("buildServiceWorker", () => {
	it("bundles src/service-worker.ts into the client output with this build's facts", async () => {
		const root = project(true);

		const url = await buildServiceWorker({ entry: "src/service-worker.ts", root });

		expect(url).toBe("/service-worker.js");
		const code = readFileSync(join(root, "dist/client/service-worker.js"), "utf-8");
		for (const f of ["/assets/client-1.js", "/assets/client.css", "/assets/about-2.js", "/assets/logo-9.png"]) {
			expect(code).toContain(f);
		}
		expect(code).toContain("/robots.txt");
		expect(code).toContain("/icons/a.png");
		expect(code).toMatch(/[0-9a-f]{12}/);
		expect(code).not.toContain("@lovrozagar/flare/service-worker");
		expect(code).not.toMatch(/^\s*import\s/m);
	});

	it("resolves the facts module even where the package itself is installed", async () => {
		const root = project(true);
		/* A real app resolves @lovrozagar/flare through node_modules; the facts must still win. */
		const { symlinkSync } = await import("node:fs");
		mkdirSync(join(root, "node_modules/@lovrozagar"), { recursive: true });
		symlinkSync(join(import.meta.dirname, "../../.."), join(root, "node_modules/@lovrozagar/flare"), "dir");

		await buildServiceWorker({ entry: "src/service-worker.ts", root });

		expect(readFileSync(join(root, "dist/client/service-worker.js"), "utf-8")).toContain("/assets/client-1.js");
	});

	it("does nothing without a service worker file", async () => {
		const root = project(false);

		expect(await buildServiceWorker({ entry: "src/service-worker.ts", root })).toBeUndefined();
		expect(existsSync(join(root, "dist/client/service-worker.js"))).toBe(false);
	});
});

describe("writeCleanupServiceWorker", () => {
	it("replaces the old built-in worker at /sw.js with one that clears its caches and unregisters", () => {
		const root = project(false);
		const clientDir = join(root, "dist/client");

		expect(writeCleanupServiceWorker(clientDir)).toBe(true);
		const code = readFileSync(join(clientDir, "sw.js"), "utf-8");
		expect(code).toContain("flare-assets-");
		expect(code).toContain("flare-runtime-");
		expect(code).toContain("unregister");
	});

	it("leaves an app's own /sw.js alone", () => {
		const root = project(false);
		const clientDir = join(root, "dist/client");
		writeFileSync(join(clientDir, "sw.js"), "/* mine */");

		expect(writeCleanupServiceWorker(clientDir)).toBe(false);
		expect(readFileSync(join(clientDir, "sw.js"), "utf-8")).toBe("/* mine */");
	});
});

describe("serviceWorkerToRegister", () => {
	it("names the worker for the client only when it was built and registration is on", async () => {
		const { serviceWorkerToRegister } = await import("../../../src/plugins/service-worker.ts");
		const root = project(true);

		expect(serviceWorkerToRegister(root, undefined)).toBeUndefined();
		await buildServiceWorker({ entry: "src/service-worker.ts", root });

		expect(serviceWorkerToRegister(root, undefined)).toBe("/service-worker.js");
		expect(serviceWorkerToRegister(root, {})).toBe("/service-worker.js");
		expect(serviceWorkerToRegister(root, { register: false })).toBeUndefined();
		expect(serviceWorkerToRegister(root, false)).toBeUndefined();
	});
});
