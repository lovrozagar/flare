import { describe, expectTypeOf, it } from "vitest"
import type { CacheConfig } from "../../../src/route-builder/types.ts"
import type { FlareStore, FlareStoreEntry } from "../../../src/store/index.ts"

/* ── FlareStore / FlareStoreEntry interfaces ─────────────────────────── */

describe("FlareStore interface", () => {
	it("FlareStoreEntry has data and storedAt", () => {
		expectTypeOf<FlareStoreEntry>().toHaveProperty("data")
		expectTypeOf<FlareStoreEntry>().toHaveProperty("storedAt")
		expectTypeOf<FlareStoreEntry["storedAt"]>().toBeNumber()
	})

	it("FlareStore has get/set/delete", () => {
		expectTypeOf<FlareStore>().toHaveProperty("get")
		expectTypeOf<FlareStore>().toHaveProperty("set")
		expectTypeOf<FlareStore>().toHaveProperty("delete")
	})

	it("FlareStore.get returns Promise<FlareStoreEntry | null>", () => {
		expectTypeOf<FlareStore["get"]>().returns.resolves.toEqualTypeOf<FlareStoreEntry | null>()
	})

	it("FlareStore.set accepts optional ttl", () => {
		expectTypeOf<FlareStore["set"]>().parameters.toEqualTypeOf<
			[string, FlareStoreEntry, (number | undefined)?]
		>()
	})
})

/* ── CacheConfig<TPath> has `ssg` and `isr` fields ──────────────────── */

describe("CacheConfig ssg/isr field existence", () => {
	it("CacheConfig accepts ssg property", () => {
		const config: CacheConfig<"/about"> = { ssg: true }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("CacheConfig accepts isr property", () => {
		const config: CacheConfig<"/about"> = { isr: { revalidate: 300 } }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})
})

/* ── SSG: static path accepts true or { defer } ─────────────────────── */

describe("CacheConfig ssg — no dynamic segments", () => {
	it("/about: ssg: true assignable", () => {
		const config: CacheConfig<"/about"> = { ssg: true }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("/about: ssg: { defer } assignable", () => {
		const config: CacheConfig<"/about"> = { ssg: { defer: "stream" } }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})
})

/* ── SSG: dynamic path accepts callback ──────────────────────────────── */

describe("CacheConfig ssg — single param", () => {
	it("/blog/[slug]: callback returning params assignable", () => {
		const config: CacheConfig<"/blog/[slug]"> = { ssg: () => [{ slug: "a" }] }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/blog/[slug]">>()
	})

	it("/blog/[slug]: async callback assignable", () => {
		const config: CacheConfig<"/blog/[slug]"> = {
			ssg: async () => [{ slug: "a" }],
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/blog/[slug]">>()
	})

	it("/blog/[slug]: object with params assignable", () => {
		const config: CacheConfig<"/blog/[slug]"> = {
			ssg: { defer: "stream", params: () => [{ slug: "a" }] },
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/blog/[slug]">>()
	})
})

/* ── SSG: catch-all ──────────────────────────────────────────────────── */

describe("CacheConfig ssg — catch-all", () => {
	it("/docs/[...path]: callback with string[] param", () => {
		const config: CacheConfig<"/docs/[...path]"> = {
			ssg: () => [{ path: ["a", "b"] }],
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/docs/[...path]">>()
	})
})

describe("CacheConfig ssg — optional catch-all", () => {
	it("/[[...locale]]: callback with string[] | undefined param", () => {
		const config: CacheConfig<"/[[...locale]]"> = {
			ssg: () => [{ locale: undefined }],
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/[[...locale]]">>()
	})
})

describe("CacheConfig ssg — multiple params", () => {
	it("/store/[storeId]/products/[productId]: callback with both params", () => {
		const config: CacheConfig<"/store/[storeId]/products/[productId]"> = {
			ssg: () => [{ productId: "1", storeId: "2" }],
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/store/[storeId]/products/[productId]">>()
	})
})

/* ── ISR: revalidate required ────────────────────────────────────────── */

describe("CacheConfig isr — no dynamic segments", () => {
	it("/about: isr with revalidate assignable", () => {
		const config: CacheConfig<"/about"> = { isr: { revalidate: 300 } }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("/about: isr with defer + revalidate assignable", () => {
		const config: CacheConfig<"/about"> = { isr: { defer: "stream", revalidate: 300 } }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})
})

describe("CacheConfig isr — dynamic segments", () => {
	it("/blog/[slug]: isr with params + revalidate assignable", () => {
		const config: CacheConfig<"/blog/[slug]"> = {
			isr: { params: () => [{ slug: "a" }], revalidate: 60 },
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/blog/[slug]">>()
	})

	it("/blog/[slug]: isr with dynamicParams assignable", () => {
		const config: CacheConfig<"/blog/[slug]"> = {
			isr: {
				dynamicParams: false,
				params: () => [{ slug: "a" }],
				revalidate: 60,
			},
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/blog/[slug]">>()
	})
})

/* ── ISR on-demand (isr: true) ────────────────────────────────────── */

describe("CacheConfig isr: true — on-demand mode", () => {
	it("/about: isr: true assignable (on-demand, no revalidate)", () => {
		const config: CacheConfig<"/about"> = { isr: true }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("/about: isr: {} with no revalidate assignable", () => {
		const config: CacheConfig<"/about"> = { isr: { defer: "stream" } }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("/blog/[slug]: isr with params but no revalidate assignable", () => {
		const config: CacheConfig<"/blog/[slug]"> = {
			isr: { params: () => [{ slug: "a" }] },
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/blog/[slug]">>()
	})

	it("isr: true combines with client and cdn", () => {
		const config: CacheConfig<"/about"> = {
			cdn: { maxAge: 60 },
			client: { staleTime: 5000 },
			isr: true,
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})
})

/* ── Mutual exclusivity ─────────────────────────────────────────────── */

describe("CacheConfig ssg/isr mutual exclusivity", () => {
	it("ssg + isr together is a type error", () => {
		/* @ts-expect-error ssg and isr are mutually exclusive */
		const _config: CacheConfig<"/about"> = { isr: { revalidate: 300 }, ssg: true }
		void _config
	})

	it("SSR (no ssg/isr) with client config is valid", () => {
		const config: CacheConfig<"/about"> = { client: { staleTime: 5000 } }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("ssg combines with cdn and client", () => {
		const config: CacheConfig<"/about"> = {
			cdn: { maxAge: 60 },
			client: { staleTime: 5000 },
			ssg: true,
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("isr combines with cdn and client", () => {
		const config: CacheConfig<"/about"> = {
			cdn: { maxAge: 60 },
			client: { staleTime: 5000 },
			isr: { revalidate: 300 },
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})
})

/* ── SSR cache config ─────────────────────────────────────────────── */

describe("CacheConfig ssr", () => {
	it("ssr with staleTime assignable", () => {
		const config: CacheConfig<"/about"> = { ssr: { staleTime: 30_000 } }
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("ssr with staleTime + tags + ttl assignable", () => {
		const config: CacheConfig<"/about"> = {
			ssr: { staleTime: 5000, tags: ["products"], ttl: 60 },
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})

	it("ssr combines with cdn and client", () => {
		const config: CacheConfig<"/about"> = {
			cdn: { maxAge: 120 },
			ssr: { staleTime: 30_000 },
		}
		expectTypeOf(config).toMatchTypeOf<CacheConfig<"/about">>()
	})
})

/* ── 3-way mutual exclusivity ─────────────────────────────────────── */

describe("CacheConfig 3-way mutual exclusivity", () => {
	it("ssg + ssr together is a type error", () => {
		/* @ts-expect-error ssg and ssr are mutually exclusive */
		const _config: CacheConfig<"/about"> = { ssg: true, ssr: { staleTime: 5000 } }
		void _config
	})

	it("isr + ssr together is a type error", () => {
		/* @ts-expect-error isr and ssr are mutually exclusive */
		const _config: CacheConfig<"/about"> = {
			isr: { revalidate: 60 },
			ssr: { staleTime: 5000 },
		}
		void _config
	})
})
