/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { buildVaryHeader, computeEtag, weakMatch } from "../../../src/server-handler/etag.ts";

describe("computeEtag", () => {
	it("returns weak ETag format", async () => {
		const etag = await computeEtag("hello world");
		expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
	});

	it("is deterministic (same content = same ETag)", async () => {
		const a = await computeEtag("<html><body>test</body></html>");
		const b = await computeEtag("<html><body>test</body></html>");
		expect(a).toBe(b);
	});

	it("differs for different content", async () => {
		const a = await computeEtag("page one");
		const b = await computeEtag("page two");
		expect(a).not.toBe(b);
	});
});

describe("weakMatch", () => {
	it("matches identical weak ETags", () => {
		expect(weakMatch(`W/"abc123"`, `W/"abc123"`)).toBe(true);
	});

	it("matches weak against strong with same opaque tag", () => {
		expect(weakMatch(`W/"abc123"`, `"abc123"`)).toBe(true);
	});

	it("matches strong against weak with same opaque tag", () => {
		expect(weakMatch(`"abc123"`, `W/"abc123"`)).toBe(true);
	});

	it("rejects different opaque tags", () => {
		expect(weakMatch(`W/"aaa"`, `W/"bbb"`)).toBe(false);
	});

	it("handles If-None-Match with multiple values", () => {
		expect(weakMatch(`W/"aaa", W/"bbb", "ccc"`, `W/"bbb"`)).toBe(true);
	});

	it("rejects when none match", () => {
		expect(weakMatch(`W/"aaa", W/"bbb"`, `W/"ccc"`)).toBe(false);
	});

	it("handles wildcard *", () => {
		expect(weakMatch("*", `W/"anything"`)).toBe(true);
	});
});

describe("buildVaryHeader", () => {
	it("returns flare-data with no additional values", () => {
		expect(buildVaryHeader()).toBe("flare-data");
	});

	it("appends additional values", () => {
		expect(buildVaryHeader(["Accept-Language", "Cookie"])).toBe("flare-data, Accept-Language, Cookie");
	});

	it("deduplicates flare-data if user includes it", () => {
		expect(buildVaryHeader(["flare-data", "Accept-Language"])).toBe("flare-data, Accept-Language");
	});

	it("deduplicates case-insensitively", () => {
		expect(buildVaryHeader(["FLARE-DATA", "Accept-Language"])).toBe("flare-data, Accept-Language");
	});

	it("returns flare-data for empty array", () => {
		expect(buildVaryHeader([])).toBe("flare-data");
	});
});
