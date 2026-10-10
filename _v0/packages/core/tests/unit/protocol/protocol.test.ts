import { describe, expect, it } from "vitest";
import {
	ATTR_HYDRATED,
	FLARE_CACHE_HEADER,
	FLARE_RENDER_HEADER,
	FORM_FN_FIELD,
	GLOBAL_DEFER,
	GLOBAL_LAZY_LOADED,
	GLOBAL_LAZY_PENDING,
	GLOBAL_QUERIES,
	HEADER_DATA,
	HEADER_FLAG,
	HEADER_ISR,
	HEADER_PRERENDER,
	HEADER_PREFETCH,
	HEADER_STALE,
	INTERNAL_PATH_PREFIX,
	isServerFnPathname,
	parseServerFnPathname,
	SERVER_FN_PREFIX,
	serverFnPath,
	STORAGE_CHUNK_RELOAD,
} from "../../../src/protocol.ts";

describe("protocol identifiers (locked)", () => {
	it("request headers are lowercase, unprefixed, spelled out", () => {
		expect(HEADER_DATA).toBe("flare-data");
		expect(HEADER_PREFETCH).toBe("flare-prefetch");
		expect(HEADER_STALE).toBe("flare-stale");
		expect(HEADER_ISR).toBe("flare-isr");
		expect(HEADER_PRERENDER).toBe("flare-prerender");
		expect(HEADER_FLAG).toBe("1");
	});

	it("response diagnostics are lowercase", () => {
		expect(FLARE_CACHE_HEADER).toBe("flare-cache");
		expect(FLARE_RENDER_HEADER).toBe("flare-render");
	});

	it("server-fn path is /_flare/server-fn/{id}/{name}", () => {
		expect(INTERNAL_PATH_PREFIX).toBe("/_flare/");
		expect(SERVER_FN_PREFIX).toBe("/_flare/server-fn");
		expect(serverFnPath("abc", "echo")).toBe("/_flare/server-fn/abc/echo");
	});

	it("HTML / form / globals are spelled", () => {
		expect(FORM_FN_FIELD).toBe("flare_fn");
		expect(ATTR_HYDRATED).toBe("data-flare-hydrated");
		expect(GLOBAL_DEFER).toBe("__flare_defer");
		expect(GLOBAL_QUERIES).toBe("__flare_queries");
		expect(GLOBAL_LAZY_PENDING).toBe("__flare_lazy_pending");
		expect(GLOBAL_LAZY_LOADED).toBe("__flare_lazy_loaded");
		expect(STORAGE_CHUNK_RELOAD).toBe("flare_chunk_reload");
	});

	it("does not use x- prefix or Title-Case response headers", () => {
		const names = [
			HEADER_DATA,
			HEADER_PREFETCH,
			HEADER_STALE,
			HEADER_ISR,
			HEADER_PRERENDER,
			FLARE_CACHE_HEADER,
			FLARE_RENDER_HEADER,
		];
		for (const name of names) {
			expect(name.startsWith("x-")).toBe(false);
			expect(name).toBe(name.toLowerCase());
		}
	});

	it("window queues keep __ so stream scripts survive self.flare = {}", () => {
		expect(GLOBAL_DEFER.startsWith("__")).toBe(true);
		expect(GLOBAL_QUERIES.startsWith("__")).toBe(true);
	});
});

describe("parseServerFnPathname", () => {
	it("parses /_flare/server-fn/{id}/{name}", () => {
		expect(parseServerFnPathname("/_flare/server-fn/abc123/myFn")).toEqual({ id: "abc123", name: "myFn" });
	});

	it("rejects the old /_fn/ prefix", () => {
		expect(parseServerFnPathname("/_fn/abc123/myFn")).toBeUndefined();
		expect(isServerFnPathname("/_fn/abc123/myFn")).toBe(false);
	});

	it("rejects incomplete paths", () => {
		expect(parseServerFnPathname("/_flare/server-fn/abc123")).toBeUndefined();
		expect(parseServerFnPathname("/_flare/server-fn/")).toBeUndefined();
		expect(parseServerFnPathname("/_flare/server-fn")).toBeUndefined();
		expect(parseServerFnPathname("/_flare/keepalive")).toBeUndefined();
	});

	it("isServerFnPathname is true for prefix and nested", () => {
		expect(isServerFnPathname("/_flare/server-fn")).toBe(true);
		expect(isServerFnPathname("/_flare/server-fn/a/b")).toBe(true);
		expect(isServerFnPathname("/_flare/keepalive")).toBe(false);
		expect(isServerFnPathname("/about")).toBe(false);
	});
});
