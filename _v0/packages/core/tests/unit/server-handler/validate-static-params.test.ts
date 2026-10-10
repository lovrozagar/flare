/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedRoute } from "../../../src/loader-pipeline/index.ts";
import type { CacheConfig } from "../../../src/route-builder/types.ts";
import { clearParamsCache, validateStaticParams } from "../../../src/server-handler/validate-static-params.ts";

/**
 * `validateStaticParams` inspects cache.ssg/cache.isr at runtime via
 * property checks and Record casts — it doesn't rely on the conditional
 * type branches. We type the cache field loosely to allow constructing
 * test fixtures with arbitrary params fns.
 */
interface TestCacheConfig {
	cdn?: CacheConfig["cdn"];
	client?: CacheConfig["client"];
	isr?:
		| true
		| {
				defer?: "resolve" | "stream";
				dynamicParams?: boolean;
				params?: (ctx: {
					params: Record<string, string | string[]>;
				}) => Record<string, string>[] | Promise<Record<string, string>[]>;
				revalidate?: string;
		  };
	ssg?:
		| true
		| ((ctx: {
				params: Record<string, string | string[]>;
		  }) => Record<string, string>[] | Promise<Record<string, string>[]>)
		| {
				defer?: "resolve" | "stream";
				params?: (ctx: {
					params: Record<string, string | string[]>;
				}) => Record<string, string>[] | Promise<Record<string, string>[]>;
		  };
}

function makeRoute(overrides: Omit<Partial<ResolvedRoute>, "cache"> & { cache?: TestCacheConfig } = {}): ResolvedRoute {
	return {
		_type: "render",
		variablePath: "_root_/[slug]",
		virtualPath: "_root_/[slug]",
		...overrides,
	} as ResolvedRoute;
}

describe("validateStaticParams", () => {
	beforeEach(() => {
		clearParamsCache();
	});

	it("SSG with params: allows listed value", async () => {
		const route = makeRoute({
			cache: {
				ssg: {
					params: () => [{ slug: "hello" }, { slug: "world" }],
				},
			},
		});
		const result = await validateStaticParams([route], { slug: "hello" });
		expect(result).toBe(true);
	});

	it("SSG with params: rejects unlisted value", async () => {
		const route = makeRoute({
			cache: {
				ssg: {
					params: () => [{ slug: "hello" }, { slug: "world" }],
				},
			},
		});
		const result = await validateStaticParams([route], { slug: "nonexistent" });
		expect(result).toBe(false);
	});

	it("SSG with params fn shorthand: rejects unlisted value", async () => {
		const route = makeRoute({
			cache: {
				ssg: () => [{ slug: "hello" }],
			},
		});
		const result = await validateStaticParams([route], { slug: "nope" });
		expect(result).toBe(false);
	});

	it("ISR + dynamicParams:false: rejects unlisted", async () => {
		const route = makeRoute({
			cache: {
				isr: {
					dynamicParams: false,
					params: () => [{ slug: "hello" }],
				},
			},
		});
		const result = await validateStaticParams([route], { slug: "unknown" });
		expect(result).toBe(false);
	});

	it("ISR + dynamicParams:true: allows unlisted", async () => {
		const route = makeRoute({
			cache: {
				isr: {
					dynamicParams: true,
					params: () => [{ slug: "hello" }],
				},
			},
		});
		const result = await validateStaticParams([route], { slug: "unknown" });
		expect(result).toBe(true);
	});

	it("ISR + no dynamicParams (default true): allows unlisted", async () => {
		const route = makeRoute({
			cache: {
				isr: {
					params: () => [{ slug: "hello" }],
				},
			},
		});
		const result = await validateStaticParams([route], { slug: "unknown" });
		expect(result).toBe(true);
	});

	it("no cache config: allows any value", async () => {
		const route = makeRoute({ cache: undefined });
		const result = await validateStaticParams([route], { slug: "anything" });
		expect(result).toBe(true);
	});

	it("SSG true (no params fn): allows any value", async () => {
		const route = makeRoute({
			cache: { ssg: true },
		});
		const result = await validateStaticParams([route], { slug: "anything" });
		expect(result).toBe(true);
	});

	it("multi-level: layout rejects → false even if page allows", async () => {
		const layout = makeRoute({
			_type: "layout",
			cache: {
				ssg: {
					params: () => [{ locale: "en" }, { locale: "fr" }],
				},
			},
			variablePath: "[locale]/_layout_",
			virtualPath: "[locale]/_layout_",
		});
		const page = makeRoute({
			cache: {
				ssg: {
					params: () => [{ slug: "hello" }],
				},
			},
			variablePath: "[locale]/_root_/[slug]",
			virtualPath: "[locale]/_root_/[slug]",
		});
		const result = await validateStaticParams([layout, page], { locale: "de", slug: "hello" });
		expect(result).toBe(false);
	});

	it("multi-level: both allow → true", async () => {
		const layout = makeRoute({
			_type: "layout",
			cache: {
				ssg: {
					params: () => [{ locale: "en" }],
				},
			},
			variablePath: "[locale]/_layout_",
			virtualPath: "[locale]/_layout_",
		});
		const page = makeRoute({
			cache: {
				ssg: {
					params: () => [{ slug: "hello" }],
				},
			},
		});
		const result = await validateStaticParams([layout, page], { locale: "en", slug: "hello" });
		expect(result).toBe(true);
	});

	it("caches params fn results in prod mode", async () => {
		const paramsFn = vi.fn(() => [{ slug: "hello" }]);
		const route = makeRoute({
			cache: { ssg: { params: paramsFn } },
		});

		await validateStaticParams([route], { slug: "hello" });
		await validateStaticParams([route], { slug: "hello" });

		expect(paramsFn).toHaveBeenCalledTimes(1);
	});

	it("skips cache in dev mode (fresh params fn call each time)", async () => {
		const paramsFn = vi.fn(() => [{ slug: "hello" }]);
		const route = makeRoute({
			cache: { ssg: { params: paramsFn } },
		});

		await validateStaticParams([route], { slug: "hello" }, true);
		await validateStaticParams([route], { slug: "hello" }, true);

		expect(paramsFn).toHaveBeenCalledTimes(2);
	});

	it("SSG with async params fn", async () => {
		const route = makeRoute({
			cache: {
				ssg: {
					params: async () => [{ slug: "async-ok" }],
				},
			},
		});
		expect(await validateStaticParams([route], { slug: "async-ok" })).toBe(true);
		expect(await validateStaticParams([route], { slug: "nope" })).toBe(false);
	});

	it("ISR true (no params): allows any value", async () => {
		const route = makeRoute({
			cache: { isr: true },
		});
		const result = await validateStaticParams([route], { slug: "anything" });
		expect(result).toBe(true);
	});

	it("SSR page under SSG path segment: rejects unlisted params", async () => {
		const pathSegment = makeRoute({
			_type: "layout",
			cache: {
				ssg: {
					params: () => [{ locale: "en" }, { locale: "fr" }],
				},
			},
			variablePath: "[locale]",
			virtualPath: "[locale]",
		});
		const page = makeRoute({
			_type: "render",
			cache: undefined,
			variablePath: "[locale]/_root_/dashboard",
			virtualPath: "[locale]/_root_/dashboard",
		});
		const result = await validateStaticParams([pathSegment, page], { locale: "de" });
		expect(result).toBe(false);
	});

	describe("optional params [[param]]", () => {
		it("allows when optional param is skipped (not in matchParams)", async () => {
			const pathSegment = makeRoute({
				_type: "layout",
				cache: {
					isr: {
						dynamicParams: false,
						params: () => [{ locale: "hr" }, { locale: "fr" }],
					},
				},
				variablePath: "[[locale]]",
				virtualPath: "[[locale]]",
			});
			/* locale not in matchParams at all — param was skipped */
			const result = await validateStaticParams([pathSegment], {});
			expect(result).toBe(true);
		});

		it("validates when optional param is provided and listed", async () => {
			const pathSegment = makeRoute({
				_type: "layout",
				cache: {
					isr: {
						dynamicParams: false,
						params: () => [{ locale: "hr" }, { locale: "fr" }],
					},
				},
				variablePath: "[[locale]]",
				virtualPath: "[[locale]]",
			});
			const result = await validateStaticParams([pathSegment], { locale: "fr" });
			expect(result).toBe(true);
		});

		it("rejects when optional param is provided but not listed", async () => {
			const pathSegment = makeRoute({
				_type: "layout",
				cache: {
					isr: {
						dynamicParams: false,
						params: () => [{ locale: "hr" }, { locale: "fr" }],
					},
				},
				variablePath: "[[locale]]",
				virtualPath: "[[locale]]",
			});
			const result = await validateStaticParams([pathSegment], { locale: "de" });
			expect(result).toBe(false);
		});

		it("skipped optional + valid required → true", async () => {
			const optSegment = makeRoute({
				_type: "layout",
				cache: {
					ssg: { params: () => [{ locale: "en" }, { locale: "fr" }] },
				},
				variablePath: "[[locale]]",
				virtualPath: "[[locale]]",
			});
			const page = makeRoute({
				cache: {
					ssg: { params: () => [{ slug: "hello" }] },
				},
			});
			/* locale skipped, slug provided */
			const result = await validateStaticParams([optSegment, page], { slug: "hello" });
			expect(result).toBe(true);
		});

		it("skipped optional + invalid required → false", async () => {
			const optSegment = makeRoute({
				_type: "layout",
				cache: {
					ssg: { params: () => [{ locale: "en" }] },
				},
				variablePath: "[[locale]]",
				virtualPath: "[[locale]]",
			});
			const page = makeRoute({
				cache: {
					ssg: { params: () => [{ slug: "hello" }] },
				},
			});
			const result = await validateStaticParams([optSegment, page], { slug: "nope" });
			expect(result).toBe(false);
		});
	});

	it("SSG page under SSG path segment: rejects unlisted params", async () => {
		const pathSegment = makeRoute({
			_type: "layout",
			cache: {
				ssg: {
					params: () => [{ locale: "en" }, { locale: "fr" }],
				},
			},
			variablePath: "[locale]",
			virtualPath: "[locale]",
		});
		const page = makeRoute({
			_type: "render",
			cache: { ssg: true },
			variablePath: "[locale]/_root_/about",
			virtualPath: "[locale]/_root_/about",
		});
		const result = await validateStaticParams([pathSegment, page], { locale: "de" });
		expect(result).toBe(false);
	});
});
