import { expect, test, type APIRequestContext } from "@playwright/test";
import { clickAndAssertSPA, loadPage, navigateSPA, setNavMarker, setupConsoleCapture } from "./helpers";

const SECRET = "e2e-test-secret";
const REVALIDATE_URL = "/_flare/revalidate";

function parseNDJSON(body: string): Array<Record<string, unknown>> {
	return body
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

function extractTs(html: string, testId: string): string | null {
	const match = html.match(new RegExp(`data-testid="${testId}">(\\d+)<`));
	return match?.[1] ?? null;
}

async function revalidateTags(request: APIRequestContext, tags: string[]) {
	return request.post(REVALIDATE_URL, {
		data: { tags, tiers: ["ssr"] },
		headers: {
			"content-type": "application/json",
			"x-revalidation-secret": SECRET,
		},
	});
}

/** Bust then populate so tag-isolation assertions are not racing layout staleTime. */
async function freshStoreSnapshot(request: APIRequestContext) {
	await revalidateTags(request, ["dc-l1", "dc-l3", "dc-p3"]);
	const html = await (await request.get("/deep-cache/store-page")).text();
	return {
		l1: extractTs(html, "dc-l1-ts"),
		l3: extractTs(html, "dc-l3-ts"),
		p3: extractTs(html, "dc-p3-ts"),
	};
}

/* ──────────────────────────── SSR rendering ──────────────────────────── */

test.describe("Deep cache nesting: SSR rendering", () => {
	test("all 5 layers render in HTML with correct nesting order", async ({ request }) => {
		const res = await request.get("/deep-cache");
		const html = await res.text();
		const layers = ["dc-l1", "dc-l2", "dc-l3", "dc-l4", "dc-p1"];
		for (const id of layers) {
			expect(html).toContain(`data-testid="${id}"`);
		}

		/* Verify nesting order: L1 appears before L2, L2 before L3, etc. */
		let prevIdx = -1;
		for (const id of layers) {
			const idx = html.indexOf(`data-testid="${id}"`);
			expect(idx).toBeGreaterThan(prevIdx);
			prevIdx = idx;
		}
	});

	test("each layer has correct identifier", async ({ request }) => {
		const res = await request.get("/deep-cache");
		const html = await res.text();
		expect(html).toContain('data-testid="dc-l1-layer">L1<');
		expect(html).toContain('data-testid="dc-l2-layer">L2<');
		expect(html).toContain('data-testid="dc-l3-layer">L3<');
		expect(html).toContain('data-testid="dc-l4-layer">L4<');
		expect(html).toContain('data-testid="dc-p1-layer">P1-isr<');
	});

	test("P2 and P3 pages also render all 4 layouts", async ({ request }) => {
		for (const path of ["/deep-cache/uncached", "/deep-cache/store-page"]) {
			const res = await request.get(path);
			const html = await res.text();
			for (const id of ["dc-l1", "dc-l2", "dc-l3", "dc-l4"]) {
				expect(html).toContain(`data-testid="${id}"`);
			}
		}
	});
});

/* ──────────────────────────── Hydration ──────────────────────────── */

test.describe("Deep cache nesting: Hydration", () => {
	test("all layers visible after hydration", async ({ page }) => {
		await loadPage(page, "/deep-cache");
		for (const id of ["dc-l1", "dc-l2", "dc-l3", "dc-l4", "dc-p1"]) {
			await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
		}
	});

	test("FlareState has matches for all layers", async ({ page }) => {
		await loadPage(page, "/deep-cache");
		const matches = await page.evaluate(() => {
			const state = (self as unknown as { flare?: { m: unknown[] } }).flare;
			return state?.m?.length ?? 0;
		});
		/* root + 4 layouts + page = 6 matches */
		expect(matches).toBeGreaterThanOrEqual(6);
	});

	test("no console errors during hydration", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/deep-cache");
		await page.waitForTimeout(200);
		cap.assertClean();
	});
});

/* ──────────────────────── Cache independence — timestamps ──────────────────────── */

test.describe("Deep cache nesting: Cache independence", () => {
	test("L1 (store-cached): same timestamp across 2 SSR requests", async ({ request }) => {
		const html1 = await (await request.get("/deep-cache/uncached")).text();
		const html2 = await (await request.get("/deep-cache/uncached")).text();
		const ts1 = extractTs(html1, "dc-l1-ts");
		const ts2 = extractTs(html2, "dc-l1-ts");
		expect(ts1).not.toBeNull();
		expect(ts1).toBe(ts2);
	});

	test("L2 (non-cached): different timestamp each request", async ({ request }) => {
		const html1 = await (await request.get("/deep-cache/uncached")).text();
		await new Promise((r) => setTimeout(r, 50));
		const html2 = await (await request.get("/deep-cache/uncached")).text();
		const ts1 = extractTs(html1, "dc-l2-ts");
		const ts2 = extractTs(html2, "dc-l2-ts");
		expect(ts1).not.toBeNull();
		expect(ts1).not.toBe(ts2);
	});

	test("L3 (store-cached): same timestamp across 2 SSR requests", async ({ request }) => {
		const html1 = await (await request.get("/deep-cache/uncached")).text();
		const html2 = await (await request.get("/deep-cache/uncached")).text();
		const ts1 = extractTs(html1, "dc-l3-ts");
		const ts2 = extractTs(html2, "dc-l3-ts");
		expect(ts1).not.toBeNull();
		expect(ts1).toBe(ts2);
	});

	test("L4 (non-cached): different timestamp each request", async ({ request }) => {
		const html1 = await (await request.get("/deep-cache/uncached")).text();
		await new Promise((r) => setTimeout(r, 50));
		const html2 = await (await request.get("/deep-cache/uncached")).text();
		const ts1 = extractTs(html1, "dc-l4-ts");
		const ts2 = extractTs(html2, "dc-l4-ts");
		expect(ts1).not.toBeNull();
		expect(ts1).not.toBe(ts2);
	});

	test("P3 (store-cached): same timestamp across 2 SSR requests", async ({ request }) => {
		const html1 = await (await request.get("/deep-cache/store-page")).text();
		const html2 = await (await request.get("/deep-cache/store-page")).text();
		const ts1 = extractTs(html1, "dc-p3-ts");
		const ts2 = extractTs(html2, "dc-p3-ts");
		expect(ts1).not.toBeNull();
		expect(ts1).toBe(ts2);
	});
});

/* ──────────────────────── ISR page P1 ──────────────────────── */

test.describe("Deep cache nesting: ISR page P1", () => {
	test("first request returns blocking SSR fallback", async ({ request }) => {
		const res = await request.get("/deep-cache");
		expect(res.status()).toBe(200);
		const html = await res.text();
		expect(html).toContain('data-testid="dc-p1-layer">P1-isr<');
		expect(extractTs(html, "dc-p1-ts")).not.toBeNull();
	});

	test("static store populated after background render", async ({ request }) => {
		/* First request triggers ISR background save */
		await request.get("/deep-cache");
		/* Small delay for background task */
		await new Promise((r) => setTimeout(r, 500));
		/* Second request should come from store */
		const res2 = await request.get("/deep-cache");
		expect(res2.status()).toBe(200);
		const html2 = await res2.text();
		expect(html2).toContain('data-testid="dc-p1"');
	});

	test("no nonce placeholder in stored response", async ({ request }) => {
		await request.get("/deep-cache");
		await new Promise((r) => setTimeout(r, 500));
		const res = await request.get("/deep-cache");
		const html = await res.text();
		/* ISR stored HTML should have real nonces, not placeholders */
		expect(html).not.toContain("__FLARE_NONCE_PLACEHOLDER__");
	});
});

/* ──────────────────────── SPA navigation between siblings ──────────────────────── */

test.describe("Deep cache nesting: SPA navigation", () => {
	test("P1 → P2: layouts stay, only page changes", async ({ page }) => {
		await loadPage(page, "/deep-cache");

		/* All 4 layouts visible before nav */
		for (const id of ["dc-l1", "dc-l2", "dc-l3", "dc-l4"]) {
			await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
		}

		await clickAndAssertSPA(page, '[data-testid="dc-nav-p2"]', "/deep-cache/uncached");
		await expect(page.locator('[data-testid="dc-p2"]')).toBeVisible();
		/* P1 should be gone */
		await expect(page.locator('[data-testid="dc-p1"]')).not.toBeVisible();
		/* All 4 layouts should still be in the DOM */
		for (const id of ["dc-l1", "dc-l2", "dc-l3", "dc-l4"]) {
			await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
		}
	});

	test("P2 → P3: store-cached page data loads", async ({ page }) => {
		await loadPage(page, "/deep-cache/uncached");
		await clickAndAssertSPA(page, '[data-testid="dc-nav-p3"]', "/deep-cache/store-page");
		await expect(page.locator('[data-testid="dc-p3"]')).toBeVisible();
		await expect(page.locator('[data-testid="dc-p3-layer"]')).toHaveText("P3-store");
	});

	test("P3 → P1: ISR content loads", async ({ page }) => {
		await loadPage(page, "/deep-cache/store-page");
		await clickAndAssertSPA(page, '[data-testid="dc-nav-p1"]', "/deep-cache");
		await expect(page.locator('[data-testid="dc-p1"]')).toBeVisible();
		await expect(page.locator('[data-testid="dc-p1-layer"]')).toHaveText("P1-isr");
	});

	test("full P1→P2→P3→P1 cycle: all layouts persist throughout", async ({ page }) => {
		await loadPage(page, "/deep-cache");

		/* P1 → P2 */
		await clickAndAssertSPA(page, '[data-testid="dc-nav-p2"]', "/deep-cache/uncached");
		await expect(page.locator('[data-testid="dc-p2"]')).toBeVisible();
		for (const id of ["dc-l1", "dc-l2", "dc-l3", "dc-l4"]) {
			await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
		}

		/* P2 → P3 */
		await clickAndAssertSPA(page, '[data-testid="dc-nav-p3"]', "/deep-cache/store-page");
		await expect(page.locator('[data-testid="dc-p3"]')).toBeVisible();
		for (const id of ["dc-l1", "dc-l2", "dc-l3", "dc-l4"]) {
			await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
		}

		/* P3 → P1 */
		await clickAndAssertSPA(page, '[data-testid="dc-nav-p1"]', "/deep-cache");
		await expect(page.locator('[data-testid="dc-p1"]')).toBeVisible();
		for (const id of ["dc-l1", "dc-l2", "dc-l3", "dc-l4"]) {
			await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
		}
	});

	test("no full page reloads during sibling navigation", async ({ page }) => {
		await loadPage(page, "/deep-cache");
		await setNavMarker(page);

		await page.click('[data-testid="dc-nav-p2"]');
		await page.waitForURL("**/deep-cache/uncached", { timeout: 10_000 });

		await page.click('[data-testid="dc-nav-p3"]');
		await page.waitForURL("**/deep-cache/store-page", { timeout: 10_000 });

		await page.click('[data-testid="dc-nav-p1"]');
		await page.waitForURL("**/deep-cache", { timeout: 10_000 });

		/* Nav marker should survive all 3 transitions */
		const markerSurvived = await page.evaluate(
			() => typeof (window as unknown as Record<string, unknown>).__FLARE_NAV_MARKER__ === "number",
		);
		expect(markerSurvived).toBe(true);
	});
});

/* ──────────────────────── Tag-based revalidation ──────────────────────── */

test.describe("Deep cache nesting: Tag-based revalidation", () => {
	test("revalidate dc-l1: only L1 refreshes, L3/P3 untouched", async ({ request }) => {
		const before = await freshStoreSnapshot(request);

		const revalRes = await revalidateTags(request, ["dc-l1"]);
		expect(revalRes.status()).toBe(200);

		const after = await (await request.get("/deep-cache/store-page")).text();
		expect(extractTs(after, "dc-l1-ts")).not.toBe(before.l1);
		expect(extractTs(after, "dc-l3-ts")).toBe(before.l3);
		expect(extractTs(after, "dc-p3-ts")).toBe(before.p3);
	});

	test("revalidate dc-l3: only L3 refreshes, L1/P3 untouched", async ({ request }) => {
		const before = await freshStoreSnapshot(request);

		const revalRes = await revalidateTags(request, ["dc-l3"]);
		expect(revalRes.status()).toBe(200);

		const after = await (await request.get("/deep-cache/store-page")).text();
		expect(extractTs(after, "dc-l1-ts")).toBe(before.l1);
		expect(extractTs(after, "dc-l3-ts")).not.toBe(before.l3);
		expect(extractTs(after, "dc-p3-ts")).toBe(before.p3);
	});

	test("revalidate dc-p3: only P3 refreshes, L1/L3 untouched", async ({ request }) => {
		const before = await freshStoreSnapshot(request);

		const revalRes = await revalidateTags(request, ["dc-p3"]);
		expect(revalRes.status()).toBe(200);

		const after = await (await request.get("/deep-cache/store-page")).text();
		expect(extractTs(after, "dc-l1-ts")).toBe(before.l1);
		expect(extractTs(after, "dc-l3-ts")).toBe(before.l3);
		expect(extractTs(after, "dc-p3-ts")).not.toBe(before.p3);
	});
});

/* ──────────────────────── StaleTime differential ──────────────────────── */

test.describe("Deep cache nesting: StaleTime differential", () => {
	test("wait 3500ms: P3 (3000ms) expires, L1 (5000ms) still fresh", async ({ request }) => {
		/* Clear all dc tags to ensure clean slate */
		await request.post(REVALIDATE_URL, {
			data: { tags: ["dc-l1", "dc-p3"], tiers: ["ssr"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": SECRET,
			},
		});

		/* Populate all caches */
		await request.get("/deep-cache/store-page");
		const before = await (await request.get("/deep-cache/store-page")).text();
		const l1Before = extractTs(before, "dc-l1-ts");
		const p3Before = extractTs(before, "dc-p3-ts");

		await new Promise((r) => setTimeout(r, 3500));

		const after = await (await request.get("/deep-cache/store-page")).text();
		const l1After = extractTs(after, "dc-l1-ts");
		const p3After = extractTs(after, "dc-p3-ts");

		/* L1 (5000ms staleTime) should still be cached */
		expect(l1After).toBe(l1Before);
		/* P3 (3000ms staleTime) should have expired */
		expect(p3After).not.toBe(p3Before);
	});

	test("wait 5500ms: L1 (5000ms) expires, L3 (8000ms) still fresh", async ({ request }) => {
		/* Clear all dc tags to ensure clean slate */
		await request.post(REVALIDATE_URL, {
			data: { tags: ["dc-l1", "dc-l3"], tiers: ["ssr"] },
			headers: {
				"content-type": "application/json",
				"x-revalidation-secret": SECRET,
			},
		});

		/* Populate caches fresh */
		await request.get("/deep-cache/uncached");
		const before = await (await request.get("/deep-cache/uncached")).text();
		const l1Before = extractTs(before, "dc-l1-ts");
		const l3Before = extractTs(before, "dc-l3-ts");

		await new Promise((r) => setTimeout(r, 5500));

		const after = await (await request.get("/deep-cache/uncached")).text();
		const l1After = extractTs(after, "dc-l1-ts");
		const l3After = extractTs(after, "dc-l3-ts");

		/* L1 (5000ms staleTime) should have expired */
		expect(l1After).not.toBe(l1Before);
		/* L3 (8000ms staleTime) should still be cached */
		expect(l3After).toBe(l3Before);
	});
});

/* ──────────────────────── NDJSON protocol ──────────────────────── */

test.describe("Deep cache nesting: NDJSON protocol", () => {
	test("data request has loader messages for all 6 layers", async ({ page }) => {
		const response = await page.request.get("/deep-cache/uncached", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");

		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");

		/* root + L1 + L2 + L3 + L4 + P2 = 6 loader messages */
		expect(loaders.length).toBeGreaterThanOrEqual(6);
	});

	test("loader ordering matches nesting depth", async ({ page }) => {
		const response = await page.request.get("/deep-cache/uncached", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");

		/* Verify loader matchIds contain the expected virtualPaths in order */
		const matchIds = loaders.map((l) => l.m as string);

		/* L1 should appear before L2, L2 before L3, etc. */
		const l1Idx = matchIds.findIndex((m) => m.includes("dc-l1"));
		const l2Idx = matchIds.findIndex((m) => m.includes("dc-l2"));
		const l3Idx = matchIds.findIndex((m) => m.includes("dc-l3"));
		const l4Idx = matchIds.findIndex((m) => m.includes("dc-l4"));

		expect(l1Idx).toBeGreaterThanOrEqual(0);
		expect(l2Idx).toBeGreaterThan(l1Idx);
		expect(l3Idx).toBeGreaterThan(l2Idx);
		expect(l4Idx).toBeGreaterThan(l3Idx);
	});

	test("cached layer data matches store-served data", async ({ page }) => {
		/* First hit populates caches, second should serve from store */
		await page.request.get("/deep-cache/store-page", {
			headers: { "flare-data": "1" },
		});

		const response = await page.request.get("/deep-cache/store-page", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const loaders = msgs.filter((m) => m.t === "l");

		/* Find L1 loader message */
		const l1Loader = loaders.find((l) => (l.m as string).includes("dc-l1"));
		expect(l1Loader).toBeDefined();
		const l1Data = l1Loader?.d as { layer: string; ts: number };
		expect(l1Data.layer).toBe("L1");
		expect(l1Data.ts).toBeGreaterThan(0);
	});
});

/* ──────────────────────── Console cleanliness ──────────────────────── */

test.describe("Deep cache nesting: Console cleanliness", () => {
	test("SSR → hydrate → SPA nav round trip clean", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/deep-cache");

		await navigateSPA(page, "/deep-cache/uncached");
		await expect(page.locator('[data-testid="dc-p2"]')).toBeVisible();

		await navigateSPA(page, "/deep-cache/store-page");
		await expect(page.locator('[data-testid="dc-p3"]')).toBeVisible();

		await navigateSPA(page, "/deep-cache");
		await expect(page.locator('[data-testid="dc-p1"]')).toBeVisible();

		await page.waitForTimeout(200);
		cap.assertClean();
	});

	test("rapid sibling navigation clean", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/deep-cache");

		/* Rapid fire SPA navigations */
		for (let i = 0; i < 3; i++) {
			await navigateSPA(page, "/deep-cache/uncached");
			await navigateSPA(page, "/deep-cache/store-page");
			await navigateSPA(page, "/deep-cache");
		}

		await page.waitForTimeout(200);
		cap.assertClean();
	});
});
