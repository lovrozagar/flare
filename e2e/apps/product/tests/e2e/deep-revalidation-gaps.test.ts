import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const SECRET = "e2e-test-secret";
const REVALIDATE_URL = "/_flare/revalidate";

type Fixtures = Parameters<Parameters<typeof test>[2]>[0];
type Req = Fixtures["request"];

function extractTs(html: string, testId: string): string | null {
	const match = html.match(new RegExp(`data-testid="${testId}">(\\d+)<`));
	return match?.[1] ?? null;
}

function revalidate(request: Req, body: Record<string, unknown>) {
	return request.post(REVALIDATE_URL, {
		data: JSON.stringify(body),
		headers: {
			"content-type": "application/json",
			"x-revalidation-secret": SECRET,
		},
	});
}

function clearCdnLog(request: Req) {
	return request.delete("/api/cdn-purge-log");
}

async function getCdnLog(request: Req): Promise<string[]> {
	const res = await request.get("/api/cdn-purge-log");
	const json = (await res.json()) as { purged: string[] };
	return json.purged;
}

/* ── Section 1: Key-based revalidation via POST endpoint ──────────── */

test.describe("Key-based revalidation", () => {
	test("revalidate by key purges only matching entry", async ({ request }) => {
		/* Populate /kv-param-test/alpha and /kv-param-test/beta */
		await request.get("/kv-param-test/alpha");
		const alphaRes1 = await request.get("/kv-param-test/alpha");
		const alphaHtml1 = await alphaRes1.text();
		const alphaTs1 = extractTs(alphaHtml1, "kv-param-timestamp");
		expect(alphaTs1).not.toBeNull();

		await request.get("/kv-param-test/beta");
		const betaRes1 = await request.get("/kv-param-test/beta");
		const betaHtml1 = await betaRes1.text();
		const betaTs1 = extractTs(betaHtml1, "kv-param-timestamp");
		expect(betaTs1).not.toBeNull();

		/* Revalidate only alpha by key */
		const revalRes = await revalidate(request, {
			keys: ["kv-param:alpha"],
			tiers: ["ssr"],
		});
		expect(revalRes.status()).toBe(200);
		const revalJson = await revalRes.json();
		expect(revalJson.revalidated).toBe(true);
		expect(revalJson.keys).toEqual(["kv-param:alpha"]);

		/* Alpha should be fresh */
		const alphaRes2 = await request.get("/kv-param-test/alpha");
		const alphaHtml2 = await alphaRes2.text();
		const alphaTs2 = extractTs(alphaHtml2, "kv-param-timestamp");
		expect(alphaTs2).not.toBe(alphaTs1);

		/* Beta should still be cached */
		const betaRes2 = await request.get("/kv-param-test/beta");
		const betaHtml2 = await betaRes2.text();
		const betaTs2 = extractTs(betaHtml2, "kv-param-timestamp");
		expect(betaTs2).toBe(betaTs1);
	});
});

/* ── Section 2: Dynamic tag function — param isolation ────────────── */

test.describe("Dynamic tag function", () => {
	test("revalidate by param-specific tag purges only that param", async ({ request }) => {
		/* Populate both */
		await request.get("/dynamic-tags/foo");
		const fooRes1 = await request.get("/dynamic-tags/foo");
		const fooHtml1 = await fooRes1.text();
		const fooTs1 = extractTs(fooHtml1, "dtag-timestamp");
		expect(fooTs1).not.toBeNull();

		await request.get("/dynamic-tags/bar");
		const barRes1 = await request.get("/dynamic-tags/bar");
		const barHtml1 = await barRes1.text();
		const barTs1 = extractTs(barHtml1, "dtag-timestamp");
		expect(barTs1).not.toBeNull();

		/* Revalidate only foo */
		const revalRes = await revalidate(request, {
			tags: ["dtag:foo"],
			tiers: ["ssr"],
		});
		expect(revalRes.status()).toBe(200);

		/* Foo should be fresh */
		const fooRes2 = await request.get("/dynamic-tags/foo");
		const fooHtml2 = await fooRes2.text();
		const fooTs2 = extractTs(fooHtml2, "dtag-timestamp");
		expect(fooTs2).not.toBe(fooTs1);

		/* Bar should still be cached */
		const barRes2 = await request.get("/dynamic-tags/bar");
		const barHtml2 = await barRes2.text();
		const barTs2 = extractTs(barHtml2, "dtag-timestamp");
		expect(barTs2).toBe(barTs1);
	});

	test("revalidate by parent tag purges all params", async ({ request }) => {
		/* Populate both */
		await request.get("/dynamic-tags/foo");
		const fooRes1 = await request.get("/dynamic-tags/foo");
		const fooHtml1 = await fooRes1.text();
		const fooTs1 = extractTs(fooHtml1, "dtag-timestamp");

		await request.get("/dynamic-tags/bar");
		const barRes1 = await request.get("/dynamic-tags/bar");
		const barHtml1 = await barRes1.text();
		const barTs1 = extractTs(barHtml1, "dtag-timestamp");

		/* Revalidate parent tag — both should be purged */
		await revalidate(request, { tags: ["dtag"], tiers: ["ssr"] });

		const fooRes2 = await request.get("/dynamic-tags/foo");
		const fooTs2 = extractTs(await fooRes2.text(), "dtag-timestamp");
		expect(fooTs2).not.toBe(fooTs1);

		const barRes2 = await request.get("/dynamic-tags/bar");
		const barTs2 = extractTs(await barRes2.text(), "dtag-timestamp");
		expect(barTs2).not.toBe(barTs1);
	});
});

/* ── Section 3: SSR + CDN combo — independent tier revalidation ───── */

test.describe("SSR + CDN combo", () => {
	test("SSR-only revalidation does not trigger CDN purge", async ({ request }) => {
		await clearCdnLog(request);

		/* Populate */
		await request.get("/ssr-cdn-combo");
		const res1 = await request.get("/ssr-cdn-combo");
		const html1 = await res1.text();
		const ts1 = extractTs(html1, "combo-timestamp");
		expect(ts1).not.toBeNull();

		/* SSR-only revalidation */
		await revalidate(request, { tags: ["combo-ssr"], tiers: ["ssr"] });

		/* SSR should be fresh */
		const res2 = await request.get("/ssr-cdn-combo");
		const ts2 = extractTs(await res2.text(), "combo-timestamp");
		expect(ts2).not.toBe(ts1);

		/* CDN log should be empty */
		const cdnLog = await getCdnLog(request);
		expect(cdnLog).toEqual([]);
	});

	test("CDN-only revalidation does not purge SSR store", async ({ request }) => {
		await clearCdnLog(request);

		/* Populate SSR */
		await request.get("/ssr-cdn-combo");
		const res1 = await request.get("/ssr-cdn-combo");
		const html1 = await res1.text();
		const ts1 = extractTs(html1, "combo-timestamp");

		/* CDN-only revalidation */
		await revalidate(request, { tags: ["combo-cdn"], tiers: ["cdn"] });

		/* SSR should still be cached */
		const res2 = await request.get("/ssr-cdn-combo");
		const ts2 = extractTs(await res2.text(), "combo-timestamp");
		expect(ts2).toBe(ts1);

		/* CDN log should have the tag */
		const cdnLog = await getCdnLog(request);
		expect(cdnLog).toContain("combo-cdn");
	});

	test("shared tag revalidation purges both SSR and CDN", async ({ request }) => {
		await clearCdnLog(request);

		/* Populate */
		await request.get("/ssr-cdn-combo");
		const res1 = await request.get("/ssr-cdn-combo");
		const ts1 = extractTs(await res1.text(), "combo-timestamp");

		/* Both tiers */
		await revalidate(request, {
			tags: ["combo-shared"],
			tiers: ["ssr", "cdn"],
		});

		/* SSR should be fresh */
		const res2 = await request.get("/ssr-cdn-combo");
		const ts2 = extractTs(await res2.text(), "combo-timestamp");
		expect(ts2).not.toBe(ts1);

		/* CDN log should have the tag */
		const cdnLog = await getCdnLog(request);
		expect(cdnLog).toContain("combo-shared");
	});

	test("Cache-Control and Surrogate-Key headers present", async ({ request }) => {
		const res = await request.get("/ssr-cdn-combo");
		const headers = res.headers();

		expect(headers["cache-control"]).toContain("max-age=600");
		expect(headers["cache-control"]).toContain("stale-while-revalidate=120");
		expect(headers["surrogate-key"]).toContain("combo-cdn");
		expect(headers["surrogate-key"]).toContain("combo-shared");
	});
});

/* ── Section 4: CDN-only revalidation ─────────────────────────────── */

test.describe("CDN-only revalidation", () => {
	test("CDN purge by tags records tags in adapter", async ({ request }) => {
		await clearCdnLog(request);

		const res = await revalidate(request, {
			tags: ["page"],
			tiers: ["cdn"],
		});
		expect(res.status()).toBe(200);

		const cdnLog = await getCdnLog(request);
		expect(cdnLog).toContain("page");
	});

	test("CDN purge by keys records key: prefix in adapter", async ({ request }) => {
		await clearCdnLog(request);

		const res = await revalidate(request, {
			keys: ["some-key"],
			tiers: ["cdn"],
		});
		expect(res.status()).toBe(200);

		const cdnLog = await getCdnLog(request);
		expect(cdnLog).toContain("key:some-key");
	});
});

/* ── Section 5: ISR on-demand revalidation via keys ───────────────── */

test.describe("ISR on-demand revalidation via keys", () => {
	test("revalidating ISR store key forces fresh SSR", async ({ request }) => {
		/* Prime, then take two consecutive hits. 5s ISR + 16 workers can expire
		   a 1s wait; tight consecutive GETs are the store-hit signal. */
		await request.get("/isr-test");
		const readTs = async () => {
			const html = await (await request.get("/isr-test")).text();
			return html.match(/data-testid="isr-rendered-at">(\d+)</)?.[1];
		};
		let ts1 = await readTs();
		let ts2 = await readTs();
		for (let i = 0; i < 8 && (ts1 == null || ts1 !== ts2); i++) {
			ts1 = ts2;
			ts2 = await readTs();
		}
		expect(ts1).toBeTruthy();
		expect(ts2).toBe(ts1);

		/* Revalidate ISR key */
		const revalRes = await revalidate(request, {
			keys: ["static:/isr-test"],
			tiers: ["ssr"],
		});
		expect(revalRes.status()).toBe(200);

		/* Next load should be fresh */
		const res3 = await request.get("/isr-test");
		const html3 = await res3.text();
		const ts3 = html3.match(/data-testid="isr-rendered-at">(\d+)</);
		expect(ts3).not.toBeNull();
		expect(ts3?.[1]).not.toBe(ts1);
	});
});

/* ── Section 6: GET revalidation rejected (secret leak prevention) ── */

test.describe("GET revalidation rejected", () => {
	test("GET revalidate by keys returns 405", async ({ request }) => {
		const revalRes = await request.get(`${REVALIDATE_URL}?secret=${SECRET}&keys=kv-param:getkey&tiers=ssr`);
		expect(revalRes.status()).toBe(405);
	});
});

/* ── Section 7: Shared tag — layout + page purged together ────────── */

test.describe("Shared tag layout + page", () => {
	test("revalidating shared tag purges both layout and page", async ({ request }) => {
		/* Populate — 2 requests to get cache hits */
		await request.get("/shared-tag");
		const res1 = await request.get("/shared-tag");
		const html1 = await res1.text();
		const layoutTs1 = extractTs(html1, "stag-layout-ts");
		const pageTs1 = extractTs(html1, "stag-page-ts");
		expect(layoutTs1).not.toBeNull();
		expect(pageTs1).not.toBeNull();

		/* Revalidate shared tag */
		await revalidate(request, { tags: ["shared-tag"], tiers: ["ssr"] });

		/* Both should be fresh */
		const res2 = await request.get("/shared-tag");
		const html2 = await res2.text();
		const layoutTs2 = extractTs(html2, "stag-layout-ts");
		const pageTs2 = extractTs(html2, "stag-page-ts");
		expect(layoutTs2).not.toBe(layoutTs1);
		expect(pageTs2).not.toBe(pageTs1);
	});

	test("revalidating page-only tag preserves layout cache", async ({ request }) => {
		/* Populate */
		await request.get("/shared-tag");
		const res1 = await request.get("/shared-tag");
		const html1 = await res1.text();
		const layoutTs1 = extractTs(html1, "stag-layout-ts");
		const pageTs1 = extractTs(html1, "stag-page-ts");

		/* Revalidate page-only tag */
		await revalidate(request, { tags: ["stag-page"], tiers: ["ssr"] });

		/* Page should be fresh, layout should be cached */
		const res2 = await request.get("/shared-tag");
		const html2 = await res2.text();
		const layoutTs2 = extractTs(html2, "stag-layout-ts");
		const pageTs2 = extractTs(html2, "stag-page-ts");
		expect(pageTs2).not.toBe(pageTs1);
		expect(layoutTs2).toBe(layoutTs1);
	});
});

/* ── Section 8: flare-cache + CDN headers coexistence ─────────────── */

test.describe("flare-cache + CDN headers coexistence", () => {
	test("first request has flare-render SSR + CDN headers", async ({ request }) => {
		/* Purge to ensure fresh */
		await revalidate(request, { tags: ["combo-ssr", "combo-shared"], tiers: ["ssr"] });

		const res = await request.get("/ssr-cdn-combo");
		const headers = res.headers();

		expect(headers["flare-render"]).toBe("SSR");
		expect(headers["cache-control"]).toBeDefined();
		expect(headers["surrogate-key"]).toBeDefined();
	});

	test("cache HIT still includes CDN headers", async ({ request }) => {
		/* Populate */
		await request.get("/ssr-cdn-combo");
		const res = await request.get("/ssr-cdn-combo");
		const headers = res.headers();

		expect(["HIT", "STALE"]).toContain(headers["flare-cache"]);
		expect(headers["cache-control"]).toContain("max-age=600");
		expect(headers["surrogate-key"]).toBeDefined();
	});

	test("NDJSON data request includes Surrogate-Key", async ({ request }) => {
		const res = await request.get("/ssr-cdn-combo", {
			headers: { "flare-data": "1" },
		});
		const headers = res.headers();

		expect(headers["surrogate-key"]).toBeDefined();
	});
});
