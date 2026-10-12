import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { afterAll, expect, it } from "vitest";

const src = (path: string): string => JSON.stringify(fileURLToPath(new URL(`../../src/${path}`, import.meta.url)));

const root = join(fileURLToPath(new URL(".", import.meta.url)), ".run-cache");
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
const entry = join(root, "entry.ts");
await writeFile(
	entry,
	`import { createCacheApiStore } from ${src("adapters/stores/cache-api/store.ts")};
import { lookup } from ${src("server/cache/epoch.ts")};
import { createRevalidateFn } from ${src("server/cache/revalidate.ts")};

const store = createCacheApiStore();
const purge = createRevalidateFn(store);

export default {
	async fetch() {
		await store.set("static:b:tagged", { data: "x", storedAt: Date.now() - 10, tags: ["p"] }, 60000);
		await store.set("static:b:keyed", { data: "y", storedAt: Date.now() - 10, tags: [] }, 60000);
		const before = await lookup(store, "static:b:tagged");
		await purge({ tags: ["p"], keys: ["static:b:keyed"] });
		const tagged = await lookup(store, "static:b:tagged");
		const keyed = await store.get("static:b:keyed");
		return Response.json({ before: before?.purged, tagged: tagged?.purged, keyed });
	},
};
`,
);

const worker = join(root, "worker.js");
const built = spawnSync("bun", ["build", entry, "--outfile", worker, "--format=esm", "--target=browser"], {
	encoding: "utf8",
});
if (built.status !== 0) throw new Error(built.stderr || "workerd bundle failed");

const mf = new Miniflare({ modules: true, scriptPath: worker, compatibilityDate: "2026-07-10" });

afterAll(async () => {
	await mf.dispose();
	await rm(root, { recursive: true, force: true });
});

// Tombstones and epochs round-trip through workerd's own Cache API: a tag purge makes the next read a miss, and a
// key purge leaves the tombstone in the cache, with no key listing (dx/store.md).
it("real cache", async () => {
	const response = await mf.dispatchFetch("https://example.com/");
	expect(await response.json()).toEqual({
		before: false,
		tagged: true,
		keyed: { data: { tombstone: true }, storedAt: expect.any(Number) },
	});
}, 20000);
