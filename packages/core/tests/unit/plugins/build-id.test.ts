import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildIdFromManifest, computeBuildId, DEV_BUILD_ID } from "../../../src/plugins/build-id.ts";
import { createVirtualPlugin } from "../../../src/plugins/virtual.ts";

type LoadContext = { environment?: { config?: { mode?: string; root?: string } } };
type Load = (this: LoadContext, id: string) => { code: string; moduleType: string } | null;

const ENTRIES = { client: "src/client.tsx", server: "src/server.ts" };

const MANIFEST = {
	"src/client.tsx": { css: ["assets/client-abc.css"], file: "assets/client-123.js", isEntry: true },
	"src/routes/about.tsx": { file: "assets/about-456.js", isDynamicEntry: true },
};

function virtualPlugin() {
	const plugin = createVirtualPlugin({}, ENTRIES);
	const resolveId = plugin.resolveId as (id: string) => string | null;
	const load = plugin.load as Load;
	return { load, resolveId };
}

const roots: string[] = [];
afterEach(() => {
	for (const r of roots.splice(0)) rmSync(r, { force: true, recursive: true });
});

function rootWithManifest(manifest: unknown): string {
	const root = mkdtempSync(join(tmpdir(), "flare-build-id-"));
	roots.push(root);
	mkdirSync(join(root, "dist/client/.vite"), { recursive: true });
	writeFileSync(join(root, "dist/client/.vite/manifest.json"), JSON.stringify(manifest));
	return root;
}

describe("computeBuildId", () => {
	it("is a 12-char hex hash independent of input order", () => {
		const a = computeBuildId(["/assets/a.js", "/assets/b.js"]);
		expect(a).toMatch(/^[0-9a-f]{12}$/);
		expect(computeBuildId(["/assets/b.js", "/assets/a.js"])).toBe(a);
		expect(computeBuildId(["/assets/c.js"])).not.toBe(a);
	});
});

describe("buildIdFromManifest", () => {
	it("hashes every emitted JS and CSS file", () => {
		const id = buildIdFromManifest(MANIFEST);
		expect(id).toBe(computeBuildId(["/assets/client-123.js", "/assets/client-abc.css", "/assets/about-456.js"]));
	});

	it("changes when any emitted file changes", () => {
		const changed = { ...MANIFEST, "src/routes/about.tsx": { file: "assets/about-789.js", isDynamicEntry: true } };
		expect(buildIdFromManifest(changed)).not.toBe(buildIdFromManifest(MANIFEST));
	});
});

describe("virtual:flare-build", () => {
	it("resolves the virtual id", () => {
		expect(virtualPlugin().resolveId("virtual:flare-build")).toBe("\0virtual:flare-build");
	});

	it("exports the client manifest hash in production", () => {
		const root = rootWithManifest(MANIFEST);
		const result = virtualPlugin().load.call(
			{ environment: { config: { mode: "production", root } } },
			"\0virtual:flare-build",
		);
		expect(result?.code).toBe(`export default ${JSON.stringify(buildIdFromManifest(MANIFEST))}`);
	});

	it('exports "dev" in development', () => {
		const result = virtualPlugin().load.call(
			{ environment: { config: { mode: "development", root: "/nowhere" } } },
			"\0virtual:flare-build",
		);
		expect(result?.code).toBe(`export default ${JSON.stringify(DEV_BUILD_ID)}`);
		expect(DEV_BUILD_ID).toBe("dev");
	});

	it('falls back to "dev" when no client manifest exists', () => {
		const root = mkdtempSync(join(tmpdir(), "flare-build-id-empty-"));
		roots.push(root);
		const result = virtualPlugin().load.call(
			{ environment: { config: { mode: "production", root } } },
			"\0virtual:flare-build",
		);
		expect(result?.code).toBe(`export default ${JSON.stringify(DEV_BUILD_ID)}`);
	});
});
