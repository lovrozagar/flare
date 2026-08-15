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

/* ── L1: No manifest → silent no-op ─────────────────────────────────── */

describe("loadPrerenderArtifacts", () => {
	it("L1: no manifest.json → silent no-op, no store.set calls", () => {
		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);
		expect(store.set).not.toHaveBeenCalled();
	});

	/* ── L2: Single static route loads all artifacts ─────────────── */

	it("L2: loads html + ndjson + headers for single route", () => {
		const manifest = [{ mode: "static", pathname: "/about" }];
		setFiles({
			"/static/about.headers.json": JSON.stringify({ "content-type": "text/html" }),
			"/static/about.html": "<h1>About</h1>",
			"/static/about.ndjson": '{"type":"init"}',
			"/static/manifest.json": JSON.stringify(manifest),
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);

		expect(store.set).toHaveBeenCalledTimes(1);
		expect(store.set).toHaveBeenCalledWith("static:/about", {
			data: {
				headers: { "content-type": "text/html" },
				html: "<h1>About</h1>",
				ndjson: '{"type":"init"}',
			},
			storedAt: expect.any(Number),
		});
	});

	/* ── L3: Root "/" maps to /index.* files ──────────────────────── */

	it("L3: root pathname '/' reads from /index.* files", () => {
		const manifest = [{ mode: "static", pathname: "/" }];
		setFiles({
			"/static/index.headers.json": JSON.stringify({ "x-custom": "yes" }),
			"/static/index.html": "<h1>Home</h1>",
			"/static/index.ndjson": "",
			"/static/manifest.json": JSON.stringify(manifest),
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);

		expect(store.set).toHaveBeenCalledWith(
			"static:/",
			expect.objectContaining({
				data: expect.objectContaining({ html: "<h1>Home</h1>" }),
			}),
		);
	});

	/* ── L4: Missing html file → skip that route ─────────────────── */

	it("L4: missing html file → skips route, no store.set", () => {
		const manifest = [{ mode: "static", pathname: "/missing" }];
		setFiles({
			"/static/manifest.json": JSON.stringify(manifest),
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);
		expect(store.set).not.toHaveBeenCalled();
	});

	/* ── L5: Missing ndjson → empty string ────────────────────────── */

	it("L5: missing ndjson file → stores empty string", () => {
		const manifest = [{ mode: "static", pathname: "/no-ndjson" }];
		setFiles({
			"/static/manifest.json": JSON.stringify(manifest),
			"/static/no-ndjson.html": "<h1>Page</h1>",
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);

		expect(store.set).toHaveBeenCalledWith(
			"static:/no-ndjson",
			expect.objectContaining({
				data: expect.objectContaining({ html: "<h1>Page</h1>", ndjson: "" }),
			}),
		);
	});

	/* ── L6: Missing headers.json → empty object ─────────────────── */

	it("L6: missing headers.json → stores empty headers object", () => {
		const manifest = [{ mode: "static", pathname: "/no-headers" }];
		setFiles({
			"/static/manifest.json": JSON.stringify(manifest),
			"/static/no-headers.html": "<p>Test</p>",
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);

		expect(store.set).toHaveBeenCalledWith(
			"static:/no-headers",
			expect.objectContaining({
				data: expect.objectContaining({ headers: {} }),
			}),
		);
	});

	/* ── L7: Multiple routes ──────────────────────────────────────── */

	it("L7: multiple routes in manifest all loaded", () => {
		const manifest = [
			{ mode: "static", pathname: "/" },
			{ mode: "isr", pathname: "/blog" },
			{ mode: "static", pathname: "/about" },
		];
		setFiles({
			"/static/about.headers.json": "{}",
			"/static/about.html": "<h1>About</h1>",
			"/static/blog.headers.json": "{}",
			"/static/blog.html": "<h1>Blog</h1>",
			"/static/index.headers.json": "{}",
			"/static/index.html": "<h1>Home</h1>",
			"/static/manifest.json": JSON.stringify(manifest),
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);
		expect(store.set).toHaveBeenCalledTimes(3);
	});

	/* ── L8: storedAt is set to current time ──────────────────────── */

	it("L8: storedAt is set to a recent timestamp", () => {
		const manifest = [{ mode: "static", pathname: "/timed" }];
		setFiles({
			"/static/manifest.json": JSON.stringify(manifest),
			"/static/timed.html": "<p>Timed</p>",
		});

		const before = Date.now();
		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);
		const after = Date.now();

		const call = (store.set as ReturnType<typeof vi.fn>).mock.calls[0];
		const storedAt = (call[1] as { storedAt: number }).storedAt;
		expect(storedAt).toBeGreaterThanOrEqual(before);
		expect(storedAt).toBeLessThanOrEqual(after);
	});

	/* ── L9: Nested path ──────────────────────────────────────────── */

	it("L9: nested pathname like /docs/api/v2 loads correctly", () => {
		const manifest = [{ mode: "static", pathname: "/docs/api/v2" }];
		setFiles({
			"/static/docs/api/v2.headers.json": "{}",
			"/static/docs/api/v2.html": "<h1>API v2</h1>",
			"/static/docs/api/v2.ndjson": "data",
			"/static/manifest.json": JSON.stringify(manifest),
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);

		expect(store.set).toHaveBeenCalledWith(
			"static:/docs/api/v2",
			expect.objectContaining({
				data: expect.objectContaining({ html: "<h1>API v2</h1>", ndjson: "data" }),
			}),
		);
	});

	/* ── L10: Empty manifest array ─────────────────────────────────── */

	it("L10: empty manifest array → no store.set calls", () => {
		setFiles({
			"/static/manifest.json": "[]",
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);
		expect(store.set).not.toHaveBeenCalled();
	});

	/* ── L11: Partial manifest — some routes have html, some don't ── */

	it("L11: mix of existing and missing html files", () => {
		const manifest = [
			{ mode: "static", pathname: "/exists" },
			{ mode: "static", pathname: "/missing" },
			{ mode: "static", pathname: "/also-exists" },
		];
		setFiles({
			"/static/also-exists.html": "<p>Also</p>",
			"/static/exists.html": "<p>Yes</p>",
			"/static/manifest.json": JSON.stringify(manifest),
		});

		const store = createMockStore();
		loadPrerenderArtifacts("/static", store);
		expect(store.set).toHaveBeenCalledTimes(2);
	});
});
