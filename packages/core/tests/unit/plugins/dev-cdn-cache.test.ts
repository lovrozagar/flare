import { describe, expect, it } from "vitest";
import {
	buildCdnCacheKey,
	type CdnCacheEntry,
	cdnEntryToStoreEntry,
	checkFreshness,
	isCacheable,
	parseCacheControl,
	parseSurrogateKey,
	parseVaryHeader,
	storeEntryToCdnEntry,
} from "../../../src/plugins/dev-cdn-cache.ts";

/* ── parseCacheControl ───────────────────────────────────────────────── */

describe("parseCacheControl", () => {
	it("null → all defaults", () => {
		const result = parseCacheControl(null);
		expect(result).toEqual({
			maxAge: null,
			noStore: false,
			private: false,
			sMaxAge: null,
			staleWhileRevalidate: null,
		});
	});

	it("undefined → all defaults", () => {
		expect(parseCacheControl(undefined)).toEqual(parseCacheControl(null));
	});

	it("empty string → all defaults", () => {
		expect(parseCacheControl("")).toEqual(parseCacheControl(null));
	});

	it("max-age=60 → maxAge: 60", () => {
		const result = parseCacheControl("max-age=60");
		expect(result.maxAge).toBe(60);
		expect(result.sMaxAge).toBeNull();
	});

	it("s-maxage=300 → sMaxAge: 300", () => {
		const result = parseCacheControl("s-maxage=300");
		expect(result.sMaxAge).toBe(300);
	});

	it("s-maxage takes priority for CDN (both present)", () => {
		const result = parseCacheControl("max-age=60, s-maxage=300");
		expect(result.maxAge).toBe(60);
		expect(result.sMaxAge).toBe(300);
	});

	it("stale-while-revalidate=120", () => {
		const result = parseCacheControl("max-age=60, stale-while-revalidate=120");
		expect(result.maxAge).toBe(60);
		expect(result.staleWhileRevalidate).toBe(120);
	});

	it("no-store → noStore: true", () => {
		const result = parseCacheControl("no-store");
		expect(result.noStore).toBe(true);
	});

	it("private → private: true", () => {
		const result = parseCacheControl("private, max-age=0");
		expect(result.private).toBe(true);
		expect(result.maxAge).toBe(0);
	});

	it("handles whitespace in directives", () => {
		const result = parseCacheControl("  max-age=60 , s-maxage=300 , stale-while-revalidate=120 ");
		expect(result.maxAge).toBe(60);
		expect(result.sMaxAge).toBe(300);
		expect(result.staleWhileRevalidate).toBe(120);
	});

	it("case insensitive", () => {
		const result = parseCacheControl("Max-Age=60, S-Maxage=300, No-Store");
		expect(result.maxAge).toBe(60);
		expect(result.sMaxAge).toBe(300);
		expect(result.noStore).toBe(true);
	});

	it("invalid numeric values → null", () => {
		const result = parseCacheControl("max-age=abc, s-maxage=xyz");
		expect(result.maxAge).toBeNull();
		expect(result.sMaxAge).toBeNull();
	});

	it("complex production header", () => {
		const result = parseCacheControl("public, s-maxage=3600, max-age=0, stale-while-revalidate=86400");
		expect(result.sMaxAge).toBe(3600);
		expect(result.maxAge).toBe(0);
		expect(result.staleWhileRevalidate).toBe(86400);
		expect(result.noStore).toBe(false);
		expect(result.private).toBe(false);
	});
});

/* ── parseVaryHeader ─────────────────────────────────────────────────── */

describe("parseVaryHeader", () => {
	it("null → empty array", () => {
		expect(parseVaryHeader(null)).toEqual([]);
	});

	it("undefined → empty array", () => {
		expect(parseVaryHeader(undefined)).toEqual([]);
	});

	it("* → empty array (uncacheable)", () => {
		expect(parseVaryHeader("*")).toEqual([]);
	});

	it("single header → lowercased", () => {
		expect(parseVaryHeader("Accept-Language")).toEqual(["accept-language"]);
	});

	it("multiple headers → lowercased and trimmed", () => {
		expect(parseVaryHeader("Accept-Language, Accept-Encoding, X-Custom")).toEqual([
			"accept-language",
			"accept-encoding",
			"x-custom",
		]);
	});

	it("filters empty segments", () => {
		expect(parseVaryHeader("Accept-Language, , Accept")).toEqual(["accept-language", "accept"]);
	});

	it("handles extra whitespace", () => {
		expect(parseVaryHeader("  Accept-Language ,  Accept  ")).toEqual(["accept-language", "accept"]);
	});

	it("x-d header (Flare NDJSON protocol) parsed normally", () => {
		expect(parseVaryHeader("x-d, Accept-Language")).toEqual(["x-d", "accept-language"]);
	});
});

/* ── parseSurrogateKey ───────────────────────────────────────────────── */

describe("parseSurrogateKey", () => {
	it("null → empty array", () => {
		expect(parseSurrogateKey(null)).toEqual([]);
	});

	it("undefined → empty array", () => {
		expect(parseSurrogateKey(undefined)).toEqual([]);
	});

	it("single key", () => {
		expect(parseSurrogateKey("page-about")).toEqual(["page-about"]);
	});

	it("multiple space-separated keys", () => {
		expect(parseSurrogateKey("page-about tag-blog tag-news")).toEqual(["page-about", "tag-blog", "tag-news"]);
	});

	it("handles extra whitespace", () => {
		expect(parseSurrogateKey("  key1   key2  ")).toEqual(["key1", "key2"]);
	});
});

/* ── buildCdnCacheKey ────────────────────────────────────────────────── */

describe("buildCdnCacheKey", () => {
	it("no Vary → cdn:METHOD:pathname", () => {
		expect(buildCdnCacheKey("GET", "/about", [], {})).toBe("cdn:GET:/about");
	});

	it("root path", () => {
		expect(buildCdnCacheKey("GET", "/", [], {})).toBe("cdn:GET:/");
	});

	it("Vary: Accept-Language → appends dimension", () => {
		expect(buildCdnCacheKey("GET", "/about", ["accept-language"], { "accept-language": "en" })).toBe(
			"cdn:GET:/about:accept-language=en",
		);
	});

	it("multiple Vary headers → sorted, comma-joined", () => {
		expect(
			buildCdnCacheKey("GET", "/api/data", ["accept", "accept-language"], {
				accept: "application/json",
				"accept-language": "fr",
			}),
		).toBe("cdn:GET:/api/data:accept=application/json,accept-language=fr");
	});

	it("missing request header value → empty string", () => {
		expect(buildCdnCacheKey("GET", "/about", ["accept-language"], {})).toBe("cdn:GET:/about:accept-language=");
	});

	it("Vary headers sorted alphabetically regardless of input order", () => {
		const key1 = buildCdnCacheKey("GET", "/page", ["x-custom", "accept"], {
			accept: "text/html",
			"x-custom": "foo",
		});
		const key2 = buildCdnCacheKey("GET", "/page", ["accept", "x-custom"], {
			accept: "text/html",
			"x-custom": "foo",
		});
		expect(key1).toBe(key2);
		expect(key1).toBe("cdn:GET:/page:accept=text/html,x-custom=foo");
	});

	it("different Vary values → different cache keys", () => {
		const keyEn = buildCdnCacheKey("GET", "/about", ["accept-language"], {
			"accept-language": "en",
		});
		const keyFr = buildCdnCacheKey("GET", "/about", ["accept-language"], {
			"accept-language": "fr",
		});
		expect(keyEn).not.toBe(keyFr);
	});

	it("x-d in Vary → HTML vs NDJSON get separate cache keys", () => {
		const htmlKey = buildCdnCacheKey("GET", "/about", ["x-d"], { "x-d": undefined });
		const ndjsonKey = buildCdnCacheKey("GET", "/about", ["x-d"], { "x-d": "1" });
		expect(htmlKey).not.toBe(ndjsonKey);
		expect(htmlKey).toBe("cdn:GET:/about:x-d=");
		expect(ndjsonKey).toBe("cdn:GET:/about:x-d=1");
	});

	it("Vary: x-d, accept-language → both in key", () => {
		const key = buildCdnCacheKey("GET", "/page", ["x-d", "accept-language"], {
			"accept-language": "en",
			"x-d": "1",
		});
		expect(key).toBe("cdn:GET:/page:accept-language=en,x-d=1");
	});
});

/* ── checkFreshness ──────────────────────────────────────────────────── */

describe("checkFreshness", () => {
	function makeEntry(storedAt: number): CdnCacheEntry {
		return {
			body: "<html>test</html>",
			headers: {},
			status: 200,
			storedAt,
			surrogateKeys: [],
			varyHeaders: [],
		};
	}

	it("within max-age → fresh", () => {
		const now = 1000000;
		const entry = makeEntry(now - 30_000);
		const cc = parseCacheControl("max-age=60");
		expect(checkFreshness(entry, cc, now)).toEqual({ state: "fresh" });
	});

	it("exactly at max-age → fresh", () => {
		const now = 1000000;
		const entry = makeEntry(now - 60_000);
		const cc = parseCacheControl("max-age=60");
		expect(checkFreshness(entry, cc, now)).toEqual({ state: "fresh" });
	});

	it("past max-age, no SWR → stale-expired", () => {
		const now = 1000000;
		const entry = makeEntry(now - 61_000);
		const cc = parseCacheControl("max-age=60");
		expect(checkFreshness(entry, cc, now)).toEqual({ state: "stale-expired" });
	});

	it("past max-age, within SWR → stale-revalidate", () => {
		const now = 1000000;
		const entry = makeEntry(now - 90_000);
		const cc = parseCacheControl("max-age=60, stale-while-revalidate=120");
		expect(checkFreshness(entry, cc, now)).toEqual({ state: "stale-revalidate" });
	});

	it("past max-age + SWR → stale-expired", () => {
		const now = 1000000;
		const entry = makeEntry(now - 200_000);
		const cc = parseCacheControl("max-age=60, stale-while-revalidate=120");
		expect(checkFreshness(entry, cc, now)).toEqual({ state: "stale-expired" });
	});

	it("s-maxage preferred over max-age", () => {
		const now = 1000000;
		const entry = makeEntry(now - 50_000);
		const cc = parseCacheControl("max-age=10, s-maxage=300");
		expect(checkFreshness(entry, cc, now)).toEqual({ state: "fresh" });
	});

	it("no max-age or s-maxage → always fresh (no expiry info)", () => {
		const now = 1000000;
		const entry = makeEntry(now - 999_999);
		const cc = parseCacheControl("public");
		expect(checkFreshness(entry, cc, now)).toEqual({ state: "fresh" });
	});
});

/* ── isCacheable ─────────────────────────────────────────────────────── */

describe("isCacheable", () => {
	it("200 + max-age → cacheable", () => {
		expect(isCacheable(200, parseCacheControl("max-age=60"))).toBe(true);
	});

	it("200 + s-maxage → cacheable", () => {
		expect(isCacheable(200, parseCacheControl("s-maxage=300"))).toBe(true);
	});

	it("200 + no-store → not cacheable", () => {
		expect(isCacheable(200, parseCacheControl("no-store, max-age=60"))).toBe(false);
	});

	it("200 + private → not cacheable (CDN is shared cache)", () => {
		expect(isCacheable(200, parseCacheControl("private, max-age=60"))).toBe(false);
	});

	it("200 + no cache directives → not cacheable", () => {
		expect(isCacheable(200, parseCacheControl("public"))).toBe(false);
	});

	it("200 + null header → not cacheable", () => {
		expect(isCacheable(200, parseCacheControl(null))).toBe(false);
	});

	it("404 + max-age → not cacheable (non-2xx)", () => {
		expect(isCacheable(404, parseCacheControl("max-age=60"))).toBe(false);
	});

	it("500 + max-age → not cacheable (non-2xx)", () => {
		expect(isCacheable(500, parseCacheControl("max-age=60"))).toBe(false);
	});

	it("301 + max-age → not cacheable (non-2xx)", () => {
		expect(isCacheable(301, parseCacheControl("max-age=3600"))).toBe(false);
	});

	it("Flare typical header: public, s-maxage=3600, max-age=0 → cacheable", () => {
		expect(isCacheable(200, parseCacheControl("public, s-maxage=3600, max-age=0"))).toBe(true);
	});

	it("Flare typical header with SWR → cacheable", () => {
		expect(isCacheable(200, parseCacheControl("public, s-maxage=3600, stale-while-revalidate=86400"))).toBe(true);
	});
});

/* ── Store Entry Conversion ──────────────────────────────────────────── */

describe("cdnEntryToStoreEntry", () => {
	it("converts CdnCacheEntry to FlareStoreEntry", () => {
		const cdn: CdnCacheEntry = {
			body: "<html>test</html>",
			headers: { "content-type": "text/html" },
			status: 200,
			storedAt: 1000,
			surrogateKeys: ["page-about"],
			varyHeaders: ["accept-language"],
		};
		const store = cdnEntryToStoreEntry(cdn);
		expect(store.storedAt).toBe(1000);
		expect(store.tags).toEqual(["page-about"]);
		expect(store.data).toBe(cdn);
	});

	it("no surrogate keys → no tags", () => {
		const cdn: CdnCacheEntry = {
			body: "",
			headers: {},
			status: 200,
			storedAt: 1000,
			surrogateKeys: [],
			varyHeaders: [],
		};
		const store = cdnEntryToStoreEntry(cdn);
		expect(store.tags).toBeUndefined();
	});
});

describe("storeEntryToCdnEntry", () => {
	it("converts valid FlareStoreEntry back", () => {
		const cdn: CdnCacheEntry = {
			body: "<html>test</html>",
			headers: { "content-type": "text/html" },
			status: 200,
			storedAt: 1000,
			surrogateKeys: [],
			varyHeaders: [],
		};
		const result = storeEntryToCdnEntry({ data: cdn, storedAt: 1000 });
		expect(result).toBe(cdn);
	});

	it("invalid data → null", () => {
		expect(storeEntryToCdnEntry({ data: "not-an-entry", storedAt: 1000 })).toBeNull();
	});

	it("null data → null", () => {
		expect(storeEntryToCdnEntry({ data: null, storedAt: 1000 })).toBeNull();
	});
});
