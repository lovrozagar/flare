import { describe, expect, it } from "vitest";
import type { RouteDefinition } from "../../../src/generators/index.ts";
import {
	type AssetHistory,
	nextAssetHistory,
	retentionWindow,
	selectRetainedAssets,
} from "../../../src/plugins/retain-assets.ts";

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

const HISTORY: AssetHistory = {
	current: { at: NOW - 2 * DAY, id: "b2" },
	files: {
		"/assets/a-1.js": { at: NOW - 2 * DAY, build: "b2" },
		"/assets/old-0.js": { at: NOW - 10 * DAY, build: "b0" },
		"/assets/recent-1.js": { at: NOW - 3 * DAY, build: "b1" },
		"/assets/shared.js": { at: NOW - 2 * DAY, build: "b2" },
	},
	v: 1,
};

describe("selectRetainedAssets", () => {
	it("always keeps every file of the build being replaced, whatever its age", () => {
		const kept = selectRetainedAssets({ currentFiles: ["/assets/shared.js"], history: HISTORY, now: NOW, windowMs: 0 });

		expect(kept).toEqual(["/assets/a-1.js"]);
	});

	it("also keeps older builds' files within the window", () => {
		const kept = selectRetainedAssets({
			currentFiles: ["/assets/shared.js"],
			history: HISTORY,
			now: NOW,
			windowMs: 4 * DAY,
		});

		expect(kept.sort()).toEqual(["/assets/a-1.js", "/assets/recent-1.js"]);
	});

	it("never carries a file the new build produces", () => {
		const kept = selectRetainedAssets({
			currentFiles: ["/assets/a-1.js", "/assets/shared.js"],
			history: HISTORY,
			now: NOW,
			windowMs: 100 * DAY,
		});

		expect(kept).not.toContain("/assets/a-1.js");
		expect(kept).not.toContain("/assets/shared.js");
	});
});

describe("nextAssetHistory", () => {
	it("records the new build's files now and keeps retained files' original age", () => {
		const next = nextAssetHistory({
			buildId: "b3",
			currentFiles: ["/assets/new-3.js", "/assets/shared.js"],
			history: HISTORY,
			now: NOW,
			retained: ["/assets/a-1.js"],
		});

		expect(next).toEqual({
			current: { at: NOW, id: "b3" },
			files: {
				"/assets/a-1.js": { at: NOW - 2 * DAY, build: "b2" },
				"/assets/new-3.js": { at: NOW, build: "b3" },
				"/assets/shared.js": { at: NOW, build: "b3" },
			},
			v: 1,
		});
	});

	it("starts fresh without a previous history", () => {
		const next = nextAssetHistory({ buildId: "b1", currentFiles: ["/assets/x.js"], now: NOW, retained: [] });

		expect(next.files).toEqual({ "/assets/x.js": { at: NOW, build: "b1" } });
	});
});

function route(cache: RouteDefinition["cache"], virtualPath = "_root_/x"): RouteDefinition {
	return {
		authenticateMode: false,
		cache,
		exportName: "route",
		filePath: "src/routes/x.tsx",
		hasInput: false,
		responseRoute: false,
		type: "page",
		virtualPath,
	};
}

describe("retentionWindow", () => {
	it("true: the longest HTML lifetime any route declares", () => {
		const w = retentionWindow([route({ cdnLifetime: 3_600 }), route({ cdnLifetime: 90_000 }), route({})], true);

		expect(w.windowMs).toBe(90_000_000);
		expect(w.unknown).toEqual([]);
	});

	it("true: routes whose lifetime cannot be read are reported, and do not widen the window", () => {
		const w = retentionWindow([route({ cdnLifetimeUnknown: true }, "_root_/dyn"), route({ cdnLifetime: 60 })], true);

		expect(w.windowMs).toBe(60_000);
		expect(w.unknown).toEqual(["_root_/dyn"]);
	});

	it("a duration sets the window and silences unknowns", () => {
		const w = retentionWindow([route({ cdnLifetimeUnknown: true })], "3d");

		expect(w.windowMs).toBe(3 * DAY);
		expect(w.unknown).toEqual([]);
	});
});
