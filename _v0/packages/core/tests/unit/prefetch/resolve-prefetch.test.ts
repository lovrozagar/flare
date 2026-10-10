import { describe, expect, it } from "vitest";
import type { LinkProps } from "../../../src/link/index.tsx";
import {
	DEFAULT_PREFETCH,
	type PrefetchConfig,
	type ResolvedPrefetch,
	resolvePrefetch,
	type RouterPrefetchConfig,
} from "../../../src/prefetch/resolve.ts";

describe("resolvePrefetch", () => {
	it("defaults to every route's modules on idle and no data", () => {
		expect(resolvePrefetch({})).toEqual<ResolvedPrefetch>({ data: false, modules: "all" });
		expect(DEFAULT_PREFETCH).toEqual({ data: false, modules: "all" });
	});

	it("a string sets both modules and data", () => {
		expect(resolvePrefetch({ link: "intent" })).toEqual({ data: "intent", modules: "intent" });
		expect(resolvePrefetch({ link: "viewport" })).toEqual({ data: "viewport", modules: "viewport" });
		expect(resolvePrefetch({ link: false })).toEqual({ data: false, modules: false });
	});

	it("an object overrides only the fields it names", () => {
		expect(resolvePrefetch({ link: { data: "intent" } })).toEqual({ data: "intent", modules: "all" });
		expect(resolvePrefetch({ link: { modules: "viewport" }, router: { data: "intent" } })).toEqual({
			data: "intent",
			modules: "viewport",
		});
	});

	it("an explicit undefined field does not erase a lower layer", () => {
		expect(resolvePrefetch({ link: { data: undefined }, router: { data: "intent" } }).data).toBe("intent");
	});

	it("link beats route beats router, per field", () => {
		const router: RouterPrefetchConfig = { data: "viewport", modules: "render" };
		const route: PrefetchConfig = { data: "intent" };
		const link: PrefetchConfig = { modules: false };

		expect(resolvePrefetch({ router })).toEqual({ data: "viewport", modules: "render" });
		expect(resolvePrefetch({ route, router })).toEqual({ data: "intent", modules: "render" });
		expect(resolvePrefetch({ link, route, router })).toEqual({ data: "intent", modules: false });
	});

	it("legacy cache.client.prefetch strings keep their meaning: viewport/render warm modules only", () => {
		expect(resolvePrefetch({ routerLegacy: "viewport" })).toEqual({ data: false, modules: "viewport" });
		expect(resolvePrefetch({ routerLegacy: "render" })).toEqual({ data: false, modules: "render" });
		expect(resolvePrefetch({ routerLegacy: "intent" })).toEqual({ data: "intent", modules: "intent" });
		expect(resolvePrefetch({ routerLegacy: false })).toEqual({ data: false, modules: false });
		expect(resolvePrefetch({ route: "viewport" })).toEqual({ data: false, modules: "viewport" });
	});

	it("the new router option wins over the legacy one", () => {
		expect(resolvePrefetch({ router: { data: "intent" }, routerLegacy: "viewport" })).toEqual({
			data: "intent",
			modules: "viewport",
		});
	});
});

describe("prefetch types", () => {
	it('"all" is a router-wide modules setting, not a per-link one', () => {
		const ok: RouterPrefetchConfig = { modules: "all" };
		// @ts-expect-error — a link cannot load the whole app
		const link: LinkProps["prefetch"] = { modules: "all" };
		// @ts-expect-error — data cannot be "all"
		const data: RouterPrefetchConfig = { data: "all" };
		expect([ok, link, data]).toHaveLength(3);
	});
});
