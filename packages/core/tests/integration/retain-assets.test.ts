/**
 * @vitest-environment node
 *
 * Retaining previous assets: before a deploy replaces the site, the build copies recently used
 * hashed files from the live site into its own output, so pages from the previous build (open
 * tabs, CDN-cached HTML) keep finding their chunks.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AssetHistory, retainPreviousAssets } from "../../src/plugins/retain-assets.ts";

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

const servers: Server[] = [];
const roots: string[] = [];
afterEach(async () => {
	for (const s of servers.splice(0)) await new Promise((r) => s.close(r));
	for (const r of roots.splice(0)) rmSync(r, { force: true, recursive: true });
	vi.restoreAllMocks();
});

/** The live site: serves files from a map; anything else is 404. */
async function liveSite(files: Record<string, string>): Promise<{ origin: string; requests: string[] }> {
	const requests: string[] = [];
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? "/", "http://x").pathname;
		requests.push(req.url ?? "");
		if (path in files) {
			res.writeHead(200);
			res.end(files[path]);
		} else {
			res.writeHead(404);
			res.end();
		}
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	servers.push(server);
	return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

/** A fresh client build output with the new build's files. */
function newBuild(files: string[]): string {
	const root = mkdtempSync(join(tmpdir(), "flare-retain-"));
	roots.push(root);
	const manifest: Record<string, { file: string; isEntry?: boolean }> = {};
	mkdirSync(join(root, "dist/client/.vite"), { recursive: true });
	mkdirSync(join(root, "dist/client/assets"), { recursive: true });
	for (const [i, f] of files.entries()) {
		manifest[`src/m${i}.ts`] = { file: f.slice(1), isEntry: i === 0 };
		writeFileSync(join(root, "dist/client", f), `/* new ${f} */`);
	}
	writeFileSync(join(root, "dist/client/.vite/manifest.json"), JSON.stringify(manifest));
	return root;
}

const PREVIOUS: AssetHistory = {
	current: { at: NOW - DAY, id: "old" },
	files: {
		"/assets/gone-old.js": { at: NOW - DAY, build: "old" },
		"/assets/older-than-window.js": { at: NOW - 30 * DAY, build: "older" },
		"/assets/shared.js": { at: NOW - DAY, build: "old" },
	},
	v: 1,
};

function readHistory(root: string): AssetHistory {
	return JSON.parse(readFileSync(join(root, "dist/client/assets/_flare-asset-history.json"), "utf-8"));
}

describe("retainPreviousAssets", () => {
	it("copies the replaced build's missing files from the live site and writes the new history", async () => {
		const site = await liveSite({
			"/assets/_flare-asset-history.json": JSON.stringify(PREVIOUS),
			"/assets/gone-old.js": "/* old chunk */",
			"/assets/older-than-window.js": "/* very old */",
		});
		const root = newBuild(["/assets/client-new.js", "/assets/shared.js"]);

		const result = await retainPreviousAssets({
			assetsBase: "/assets",
			now: NOW,
			root,
			site: site.origin,
			windowMs: 0,
		});

		expect(readFileSync(join(root, "dist/client/assets/gone-old.js"), "utf-8")).toBe("/* old chunk */");
		expect(existsSync(join(root, "dist/client/assets/older-than-window.js"))).toBe(false);
		expect(readFileSync(join(root, "dist/client/assets/shared.js"), "utf-8")).toContain("new");
		expect(result).toMatchObject({ failed: 0, retained: 1 });

		const history = readHistory(root);
		expect(Object.keys(history.files).sort()).toEqual([
			"/assets/client-new.js",
			"/assets/gone-old.js",
			"/assets/shared.js",
		]);
		expect(history.files["/assets/gone-old.js"]).toEqual({ at: NOW - DAY, build: "old" });
	});

	it("fetches the history uncached, so a CDN never hands back a stale list", async () => {
		const site = await liveSite({ "/assets/_flare-asset-history.json": JSON.stringify(PREVIOUS) });
		const root = newBuild(["/assets/client-new.js"]);

		await retainPreviousAssets({ assetsBase: "/assets", now: NOW, root, site: site.origin, windowMs: 0 });

		const historyRequest = site.requests.find((r) => r.startsWith("/assets/_flare-asset-history.json"));
		expect(historyRequest).toMatch(/\?/);
	});

	it("first deploy (no history on the site): starts fresh", async () => {
		const site = await liveSite({});
		const root = newBuild(["/assets/client-new.js"]);
		const info = vi.spyOn(console, "log").mockImplementation(() => {});

		const result = await retainPreviousAssets({
			assetsBase: "/assets",
			now: NOW,
			root,
			site: site.origin,
			windowMs: 0,
		});

		expect(result).toMatchObject({ retained: 0 });
		expect(Object.keys(readHistory(root).files)).toEqual(["/assets/client-new.js"]);
		expect(info.mock.calls.flat().join(" ")).toMatch(/no previous asset history/i);
	});

	it("site unreachable: warns, writes a fresh history, never fails the build", async () => {
		const root = newBuild(["/assets/client-new.js"]);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await retainPreviousAssets({
			assetsBase: "/assets",
			now: NOW,
			root,
			site: "http://127.0.0.1:1",
			windowMs: 0,
		});

		expect(result).toMatchObject({ retained: 0 });
		expect(warn).toHaveBeenCalled();
		expect(Object.keys(readHistory(root).files)).toEqual(["/assets/client-new.js"]);
	});

	it("one missing file: warns and copies the rest", async () => {
		const site = await liveSite({
			"/assets/_flare-asset-history.json": JSON.stringify({
				...PREVIOUS,
				files: { ...PREVIOUS.files, "/assets/also-old.js": { at: NOW - DAY, build: "old" } },
			}),
			"/assets/gone-old.js": "/* old chunk */",
		});
		const root = newBuild(["/assets/client-new.js", "/assets/shared.js"]);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await retainPreviousAssets({
			assetsBase: "/assets",
			now: NOW,
			root,
			site: site.origin,
			windowMs: 0,
		});

		expect(result).toMatchObject({ failed: 1, retained: 1 });
		expect(existsSync(join(root, "dist/client/assets/gone-old.js"))).toBe(true);
		expect(warn.mock.calls.flat().join(" ")).toContain("also-old.js");
		expect(readHistory(root).files["/assets/also-old.js"]).toBeUndefined();
	});

	it("never writes outside the client output, whatever the history says", async () => {
		const site = await liveSite({
			"/assets/_flare-asset-history.json": JSON.stringify({
				...PREVIOUS,
				files: {
					"/assets/../../escape.js": { at: NOW, build: "old" },
					"https://evil.test/x.js": { at: NOW, build: "old" },
				},
			}),
		});
		const root = newBuild(["/assets/client-new.js"]);
		vi.spyOn(console, "warn").mockImplementation(() => {});

		await retainPreviousAssets({ assetsBase: "/assets", now: NOW, root, site: site.origin, windowMs: 0 });

		expect(existsSync(join(root, "escape.js"))).toBe(false);
		expect(existsSync(join(root, "dist/escape.js"))).toBe(false);
	});
});

describe("retained files stay out of this build's own lists", () => {
	it("manifest, build id and prefetch list are unchanged by retained files", async () => {
		const { buildIdFromManifest } = await import("../../src/plugins/build-id.ts");
		const { buildPrefetchList } = await import("../../src/prefetch/list.ts");
		const site = await liveSite({
			"/assets/_flare-asset-history.json": JSON.stringify(PREVIOUS),
			"/assets/gone-old.js": "/* old chunk */",
		});
		const root = newBuild(["/assets/client-new.js", "/assets/shared.js"]);
		const manifestPath = join(root, "dist/client/.vite/manifest.json");
		const before = readFileSync(manifestPath, "utf-8");

		await retainPreviousAssets({ assetsBase: "/assets", now: NOW, root, site: site.origin, windowMs: 0 });

		const after = readFileSync(manifestPath, "utf-8");
		expect(after).toBe(before);
		expect(buildIdFromManifest(JSON.parse(after))).toBe(buildIdFromManifest(JSON.parse(before)));
		const list = buildPrefetchList(JSON.parse(after), Object.keys(JSON.parse(after)));
		expect(list.js).not.toContain("/assets/gone-old.js");
	});
});

describe("plugin option", () => {
	it("retainPreviousAssets without site is a configuration error", async () => {
		const { flare } = await import("../../src/plugins/index.ts");

		expect(() => flare({ retainPreviousAssets: true } as Parameters<typeof flare>[0])).toThrow(/site/);
	});
});

describe("site option", () => {
	it("is the sitemap origin when the sitemap names none", async () => {
		const { createPrerenderPlugin } = await import("../../src/plugins/prerender-plugin.ts");
		const root = mkdtempSync(join(tmpdir(), "flare-site-"));
		roots.push(root);
		mkdirSync(join(root, "src/routes"), { recursive: true });
		writeFileSync(
			join(root, "src/routes/about.tsx"),
			'import { createPage } from "@lovrozagar/flare/page";\nexport const route = createPage("_root_/about").render(() => null);\n',
		);
		vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const plugin = createPrerenderPlugin({ prerender: { sitemap: {} }, site: "https://example.test" });

		await (plugin.closeBundle as (this: unknown) => Promise<void>).call({
			environment: { config: { root }, name: "ssr" },
		});

		expect(readFileSync(join(root, "dist/static/sitemap.xml"), "utf-8")).toContain("https://example.test/about");
	});
});
