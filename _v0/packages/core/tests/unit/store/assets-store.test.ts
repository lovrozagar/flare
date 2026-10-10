/** @vitest-environment node */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssetsStore, fileAssets } from "../../../src/store/assets.ts";
import { staticStoreKey } from "../../../src/store/index.ts";

const BASE = "/assets/_flare-static";

function page(html: string, ndjson = "", headers: Record<string, string> = {}): string {
	return JSON.stringify({ headers, html, ndjson });
}

function fetcher(files: Record<string, string>) {
	return vi.fn(async (path: string) =>
		path in files ? new Response(files[path]) : new Response(null, { status: 404 }),
	);
}

describe("createAssetsStore", () => {
	it("returns the build's prerendered artifact for a static key", async () => {
		const fetchAsset = fetcher({
			[`${BASE}/b1/about.json`]: page("<html>about</html>", '{"t":"d"}\n', { "content-type": "text/html" }),
		});
		const store = createAssetsStore(fetchAsset, { base: BASE });

		const entry = await store.get(staticStoreKey("b1", "/about"));

		expect(entry?.data).toEqual({
			headers: { "content-type": "text/html" },
			html: "<html>about</html>",
			ndjson: '{"t":"d"}\n',
		});
	});

	it("maps / to index files", async () => {
		const store = createAssetsStore(fetcher({ [`${BASE}/b1/index.json`]: page("<html>home</html>") }), { base: BASE });

		const entry = await store.get(staticStoreKey("b1", "/"));

		expect((entry?.data as { html: string } | undefined)?.html).toBe("<html>home</html>");
	});

	it("misses when the page was not prerendered, or for another build", async () => {
		const fetchAsset = fetcher({ [`${BASE}/b1/about.json`]: page("<html>about</html>") });
		const store = createAssetsStore(fetchAsset, { base: BASE });

		expect(await store.get(staticStoreKey("b1", "/nope"))).toBeNull();
		expect(await store.get(staticStoreKey("b2", "/about"))).toBeNull();
	});

	it("ignores keys that are not static page keys and paths that try to escape", async () => {
		const fetchAsset = fetcher({});
		const store = createAssetsStore(fetchAsset, { base: BASE });

		expect(await store.get("flare:_root_/x")).toBeNull();
		expect(await store.get(staticStoreKey("b1", "/%2e%2e/secret"))).toBeNull();
		expect(await store.get(staticStoreKey("../b1", "/about"))).toBeNull();
		expect(fetchAsset).not.toHaveBeenCalled();
	});

	it("treats a non-artifact answer (a dev server's HTML fallback) as a miss", async () => {
		const store = createAssetsStore(fetcher({ [`${BASE}/b1/about.json`]: "<!doctype html><html></html>" }), {
			base: BASE,
		});

		expect(await store.get(staticStoreKey("b1", "/about"))).toBeNull();
	});

	it("is read-only: writes and deletes are refused", async () => {
		const store = createAssetsStore(fetcher({}), { base: BASE });

		await expect(store.set("static:b1:/x", { data: null, storedAt: 0 })).rejects.toThrow(/read-only/);
		await expect(store.delete("static:b1:/x")).rejects.toThrow(/read-only/);
		await expect(store.deleteByTags(["t"])).rejects.toThrow(/read-only/);
	});
});

describe("fileAssets", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const d of dirs.splice(0)) rmSync(d, { force: true, recursive: true });
	});

	it("reads artifacts from a client output directory", async () => {
		const dir = mkdtempSync(join(tmpdir(), "flare-file-assets-"));
		dirs.push(dir);
		mkdirSync(join(dir, "assets/_flare-static/b1"), { recursive: true });
		writeFileSync(join(dir, "assets/_flare-static/b1/about.json"), page("<html>disk</html>"));
		const store = createAssetsStore(fileAssets(dir), { base: BASE });

		const entry = await store.get(staticStoreKey("b1", "/about"));

		expect((entry?.data as { html: string } | undefined)?.html).toBe("<html>disk</html>");
		expect(await store.get(staticStoreKey("b1", "/missing"))).toBeNull();
	});

	it("never reads outside the directory", async () => {
		const dir = mkdtempSync(join(tmpdir(), "flare-file-assets-"));
		dirs.push(dir);

		const response = await fileAssets(dir)("/../../etc/passwd");

		expect(response?.ok ?? false).toBe(false);
	});
});
