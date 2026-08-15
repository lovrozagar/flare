import { describe, expect, it } from "vitest";
import { type CachedMatch, createMatchCache } from "../../../src/caches/index.ts";

function makeMatch(matchId: string, tags?: string[]): CachedMatch {
	return {
		data: { value: matchId },
		invalid: false,
		matchId,
		tags,
		updatedAt: Date.now(),
	};
}

describe("caches invalidate with empty tags", () => {
	it("should not skip matchId when tags is empty array", () => {
		const cache = createMatchCache();
		cache.set(makeMatch("route:1", ["a"]));
		cache.set(makeMatch("route:2", ["b"]));

		cache.invalidate({ matchId: "route:1", tags: [] });

		expect(cache.get("route:1")?.invalid).toBe(true);
		expect(cache.get("route:2")?.invalid).toBe(false);
	});

	it("should not skip routeId when tags is empty array", () => {
		const cache = createMatchCache();
		cache.set(makeMatch("home:1"));
		cache.set(makeMatch("home:2"));
		cache.set(makeMatch("about:1"));

		cache.invalidate({ routeId: "home", tags: [] });

		expect(cache.get("home:1")?.invalid).toBe(true);
		expect(cache.get("home:2")?.invalid).toBe(true);
		expect(cache.get("about:1")?.invalid).toBe(false);
	});

	it("should not skip filter when tags is empty array", () => {
		const cache = createMatchCache();
		cache.set(makeMatch("route:1"));
		cache.set(makeMatch("route:2"));

		cache.invalidate({
			filter: (m) => m.matchId === "route:2",
			tags: [],
		});

		expect(cache.get("route:1")?.invalid).toBe(false);
		expect(cache.get("route:2")?.invalid).toBe(true);
	});

	it("empty tags alone should be a no-op", () => {
		const cache = createMatchCache();
		cache.set(makeMatch("route:1", ["x"]));

		cache.invalidate({ tags: [] });

		expect(cache.get("route:1")?.invalid).toBe(false);
	});
});
