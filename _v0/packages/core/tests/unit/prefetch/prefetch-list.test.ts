/** @vitest-environment node */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ViteManifest } from "../../../src/module-graph/index.ts";
import { createVirtualPlugin } from "../../../src/plugins/virtual.ts";
import { buildPrefetchList, writePrefetchList } from "../../../src/prefetch/list.ts";

const MANIFEST: ViteManifest = {
	"_shared.js": { css: ["assets/shared.css"], file: "assets/shared-1.js" },
	"_vendor.js": { file: "assets/vendor-1.js" },
	"src/client.tsx": { file: "assets/client-1.js", imports: ["_vendor.js"], isEntry: true },
	"src/components/heavy-editor.tsx": { file: "assets/editor-1.js", isDynamicEntry: true },
	"src/routes/_root_.tsx": { file: "assets/root-1.js", imports: ["_vendor.js"], isDynamicEntry: true },
	"src/routes/about.tsx": {
		css: ["assets/about.css"],
		dynamicImports: ["src/components/heavy-editor.tsx"],
		file: "assets/about-1.js",
		imports: ["_shared.js", "_vendor.js"],
		isDynamicEntry: true,
	},
};

const ROUTE_FILES = ["src/routes/_root_.tsx", "src/routes/about.tsx"];

describe("buildPrefetchList", () => {
	it("lists every route and layout chunk with its static imports and CSS", () => {
		const list = buildPrefetchList(MANIFEST, ROUTE_FILES);

		expect(list.js).toEqual(["/assets/about-1.js", "/assets/root-1.js", "/assets/shared-1.js"]);
		expect(list.css).toEqual(["/assets/about.css", "/assets/shared.css"]);
	});

	it("leaves out what the entry already loads and lazy components inside routes", () => {
		const list = buildPrefetchList(MANIFEST, ROUTE_FILES);

		expect(list.js).not.toContain("/assets/client-1.js");
		expect(list.js).not.toContain("/assets/vendor-1.js");
		expect(list.js).not.toContain("/assets/editor-1.js");
	});
});

const roots: string[] = [];
afterEach(() => {
	for (const r of roots.splice(0)) rmSync(r, { force: true, recursive: true });
});

function appRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "flare-prefetch-list-"));
	roots.push(root);
	mkdirSync(join(root, "dist/client/.vite"), { recursive: true });
	writeFileSync(join(root, "dist/client/.vite/manifest.json"), JSON.stringify(MANIFEST));
	mkdirSync(join(root, "src/routes"), { recursive: true });
	writeFileSync(
		join(root, "src/routes/_root_.tsx"),
		'import { createRootLayout } from "@lovrozagar/flare/root-layout";\nexport const layout = createRootLayout("_root_").render(() => null);\n',
	);
	writeFileSync(
		join(root, "src/routes/about.tsx"),
		'import { createPage } from "@lovrozagar/flare/page";\nexport const route = createPage("_root_/about").render(() => null);\n',
	);
	return root;
}

describe("writePrefetchList", () => {
	it("writes a content-hashed list into the client output and returns its URL", () => {
		const root = appRoot();
		const url = writePrefetchList({ assetsBase: "/assets", ignorePrefix: "_", root });

		expect(url).toMatch(/^\/assets\/_flare-prefetch\.[0-9a-f]{8}\.json$/);
		const file = join(root, "dist/client", url as string);
		expect(existsSync(file)).toBe(true);
		expect(JSON.parse(readFileSync(file, "utf-8")).js).toContain("/assets/about-1.js");
	});

	it("returns undefined without a client build", () => {
		const root = mkdtempSync(join(tmpdir(), "flare-prefetch-none-"));
		roots.push(root);
		expect(writePrefetchList({ assetsBase: "/assets", ignorePrefix: "_", root })).toBeUndefined();
	});
});

describe("virtual:flare-build", () => {
	type Load = (
		this: { environment?: { config?: { mode?: string; root?: string } } },
		id: string,
	) => { code: string } | null;

	it("exports the prefetch list URL in production builds", () => {
		const root = appRoot();
		const plugin = createVirtualPlugin({}, { client: "src/client.tsx", server: "src/server.ts" });
		const result = (plugin.load as Load).call(
			{ environment: { config: { mode: "production", root } } },
			"\0virtual:flare-build",
		);

		expect(result?.code).toMatch(/export const prefetchListUrl = "\/assets\/_flare-prefetch\.[0-9a-f]{8}\.json"/);
	});

	it("exports no list in development (modules load on demand)", () => {
		const plugin = createVirtualPlugin({}, { client: "src/client.tsx", server: "src/server.ts" });
		const result = (plugin.load as Load).call(
			{ environment: { config: { mode: "development", root: "/nowhere" } } },
			"\0virtual:flare-build",
		);

		expect(result?.code).toContain("export const prefetchListUrl = undefined");
	});
});
