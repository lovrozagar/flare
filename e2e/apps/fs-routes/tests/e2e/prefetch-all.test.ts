import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type CDPSession, expect, type Page, test } from "@playwright/test";
import { loadPage } from "./helpers";

/**
 * @prod-only
 *
 * Router default prefetch is { modules: "all", data: false }: after load and idle, every route's
 * code is prefetched into the browser cache, so navigating to a never-visited route downloads no
 * JavaScript (the module is served from Blink's cache and never reaches the network stack).
 */

interface ScriptRequest {
	cached: boolean;
	status?: number;
	url: string;
}

/** Every script request with whether it was answered from a cache instead of the network. */
async function recordScriptRequests(cdp: CDPSession): Promise<ScriptRequest[]> {
	const byId = new Map<string, ScriptRequest>();
	const ordered: ScriptRequest[] = [];
	await cdp.send("Network.enable");
	cdp.on("Network.requestWillBeSent", (e) => {
		if (e.type !== "Script") return;
		const req = { cached: false, url: new URL(e.request.url).pathname };
		byId.set(e.requestId, req);
		ordered.push(req);
	});
	cdp.on("Network.requestServedFromCache", (e) => {
		const req = byId.get(e.requestId);
		if (req) req.cached = true;
	});
	cdp.on("Network.responseReceived", (e) => {
		const req = byId.get(e.requestId);
		const r = e.response;
		if (req) req.status = r.status;
		if (req && (r.fromDiskCache || r.fromPrefetchCache || r.fromMemoryCache)) req.cached = true;
	});
	return ordered;
}

/* The /about page's own chunk, from the client build manifest (tests run after the build). */
const aboutChunk = `/${
	(
		JSON.parse(readFileSync(join(import.meta.dirname, "../../dist/client/.vite/manifest.json"), "utf-8")) as Record<
			string,
			{ file: string }
		>
	)["src/routes/_root_/about/about.page.tsx"]?.file
}`;

function prefetchHrefs(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.head.querySelectorAll('link[rel="prefetch"]')].map((l) => l.getAttribute("href") ?? ""),
	);
}

async function clickAbout(page: Page): Promise<void> {
	await page.evaluate(() => (document.querySelector('a[href="/about"]') as HTMLAnchorElement).click());
	await expect(page).toHaveURL(/\/about$/);
	await expect(page.getByTestId("about")).toHaveText("About");
	await page.waitForLoadState("networkidle");
}

test.describe("@prod-only app-wide module prefetch", () => {
	test("prefetches every route's chunks once the page is idle, and never their data", async ({ page }) => {
		const dataRequests: string[] = [];
		page.on("request", (r) => {
			if (r.headers()["flare-data"] === "1") dataRequests.push(r.url());
		});

		await loadPage(page, "/");
		await expect.poll(() => prefetchHrefs(page).then((h) => h.length)).toBeGreaterThan(3);

		const hrefs = await prefetchHrefs(page);
		expect(hrefs.every((h) => h.startsWith("/assets/"))).toBe(true);
		expect(dataRequests).toEqual([]);
	});

	test("navigating to a never-visited route requests no JavaScript", async ({ page, browserName }) => {
		test.skip(browserName !== "chromium", "uses the Chrome DevTools Protocol");
		const cdp = await page.context().newCDPSession(page);
		const scripts = await recordScriptRequests(cdp);

		await loadPage(page, "/");
		await expect.poll(() => prefetchHrefs(page).then((h) => h.length)).toBeGreaterThan(3);
		await page.waitForLoadState("networkidle");
		const before = scripts.length;

		await clickAbout(page);

		await page.waitForTimeout(200);
		const navigation = scripts.slice(before);
		expect(navigation.map((r) => r.url)).toContain(aboutChunk);
		expect(navigation.filter((r) => !r.cached)).toEqual([]);
	});

	test("control: with nothing prefetched, the same navigation downloads its route chunk", async ({
		page,
		browserName,
	}) => {
		test.skip(browserName !== "chromium", "uses the Chrome DevTools Protocol");
		/* No list → no app-wide prefetch; on a normal connection links leave modules to it. */
		await page.route("**/_flare-prefetch.*.json", (route) => route.fulfill({ status: 404 }));
		const cdp = await page.context().newCDPSession(page);
		const scripts = await recordScriptRequests(cdp);

		await loadPage(page, "/");
		await page.waitForLoadState("networkidle");
		expect(await prefetchHrefs(page)).toEqual([]);
		const before = scripts.length;

		await clickAbout(page);
		await page.waitForTimeout(200);

		const navigation = scripts.slice(before);
		expect(navigation.filter((r) => r.url === aboutChunk && !r.cached)).toHaveLength(1);
	});

	test("on Data Saver nothing is prefetched app-wide and no data is fetched", async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
		});
		const listRequests: string[] = [];
		const dataRequests: string[] = [];
		page.on("request", (r) => {
			if (r.url().includes("_flare-prefetch.")) listRequests.push(r.url());
			if (r.headers()["flare-data"] === "1") dataRequests.push(r.url());
		});

		await loadPage(page, "/");
		await page.waitForLoadState("networkidle");

		expect(listRequests).toEqual([]);
		expect(await prefetchHrefs(page)).toEqual([]);
		expect(dataRequests).toEqual([]);
	});
});
