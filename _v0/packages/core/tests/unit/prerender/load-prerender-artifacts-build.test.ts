/** @vitest-environment node */
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPrerenderArtifacts } from "../../../src/prerender/index.ts";
import type { FlareStore, FlareStoreEntry } from "../../../src/store/index.ts";

/* ── Mock node:fs ────────────────────────────────────────────────────── */

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => {
		throw new Error("ENOENT");
	}),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

function setFiles(map: Record<string, string>): void {
	mockExistsSync.mockImplementation((p) => typeof p === "string" && p in map);
	mockReadFileSync.mockImplementation((p) => {
		const path = typeof p === "string" ? p : String(p);
		if (path in map) return map[path] as string;
		throw new Error(`ENOENT: ${path}`);
	});
}

/* ── Mock store ──────────────────────────────────────────────────────── */

function createMockStore(): FlareStore & { entries: Map<string, FlareStoreEntry> } {
	const entries = new Map<string, FlareStoreEntry>();
	return {
		delete: vi.fn(async () => {}),
		deleteByTags: vi.fn(async () => {}),
		entries,
		get: vi.fn(async (key: string) => entries.get(key) ?? null),
		set: vi.fn(async (key: string, entry: FlareStoreEntry) => {
			entries.set(key, entry);
		}),
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

const ABOUT_FILES = {
	"/static/about.headers.json": JSON.stringify({ "content-type": "text/html" }),
	"/static/about.html": "<h1>About</h1>",
	"/static/about.ndjson": '{"t":"d"}',
};

describe("loadPrerenderArtifacts — build-scoped keys", () => {
	it("keys entries by the build recorded in the manifest", async () => {
		setFiles({
			...ABOUT_FILES,
			"/static/manifest.json": JSON.stringify({ buildId: "b1", routes: [{ mode: "static", pathname: "/about" }] }),
		});
		const store = createMockStore();

		await loadPrerenderArtifacts("/static", store);

		expect([...store.entries.keys()]).toEqual(["static:b1:/about"]);
	});

	it("an explicit build id wins over the manifest", async () => {
		setFiles({
			...ABOUT_FILES,
			"/static/manifest.json": JSON.stringify({ buildId: "b1", routes: [{ mode: "static", pathname: "/about" }] }),
		});
		const store = createMockStore();

		await loadPrerenderArtifacts("/static", store, "b2");

		expect([...store.entries.keys()]).toEqual(["static:b2:/about"]);
	});

	it("a legacy manifest without a build id loads nothing and warns (entries would never be read)", async () => {
		setFiles({ ...ABOUT_FILES, "/static/manifest.json": JSON.stringify([{ mode: "static", pathname: "/about" }]) });
		const store = createMockStore();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		await loadPrerenderArtifacts("/static", store);

		expect(store.set).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalled();
	});

	it("a legacy manifest loads when the caller names the build", async () => {
		setFiles({ ...ABOUT_FILES, "/static/manifest.json": JSON.stringify([{ mode: "static", pathname: "/about" }]) });
		const store = createMockStore();

		await loadPrerenderArtifacts("/static", store, "b3");

		expect([...store.entries.keys()]).toEqual(["static:b3:/about"]);
	});
});
