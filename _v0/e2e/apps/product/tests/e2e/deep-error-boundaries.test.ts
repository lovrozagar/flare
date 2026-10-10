import { expect, test } from "@playwright/test";
import { loadPage, setNavMarker } from "./helpers";

function parseNDJSON(body: string): Array<Record<string, unknown>> {
	return body
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

/**
 * SPA navigate to an error route where __flareNavigate may reject.
 * Sets nav marker before and waits for URL change.
 */
async function spaNavToErrorRoute(page: import("@playwright/test").Page, path: string): Promise<void> {
	await setNavMarker(page);
	await page.evaluate((p) => {
		const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
			| ((to: string) => Promise<void>)
			| undefined;
		if (!nav) throw new Error("__flareNavigate not available");
		return nav(p).catch(() => {});
	}, path);
	await page.waitForURL(`**${path}`, { timeout: 10_000 });
}

test.describe("SSR error type boundaries", () => {
	test("/throw-not-found returns 404 and renders not-found boundary", async ({ page }) => {
		const response = await page.goto("/throw-not-found", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(404);
		await expect(page.locator("[data-testid=not-found-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=not-found-boundary]")).toContainText("404");
	});

	test("/throw-unauthorized returns 403 and renders unauthorized boundary", async ({ page }) => {
		const response = await page.goto("/throw-unauthorized", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(403);
		await expect(page.locator("[data-testid=unauthorized-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=unauthorized-error]")).toBeVisible();
	});

	test("/throw-unauthenticated returns 401 and renders unauthenticated boundary", async ({ page }) => {
		const response = await page.goto("/throw-unauthenticated", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(401);
		await expect(page.locator("[data-testid=unauthenticated-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=unauthenticated-boundary]")).toContainText("Please log in");
	});

	test("/broken returns 500 and renders error boundary with message", async ({ page }) => {
		const response = await page.goto("/broken", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);
		await expect(page.locator("[data-testid=error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=error-message]")).toContainText("Intentional loader error");
	});

	test("/error-string returns 500 and renders error boundary for thrown string", async ({ page }) => {
		const response = await page.goto("/error-string", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(500);
		await expect(page.locator("[data-testid=error-string-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=error-string-message]")).toContainText("plain string error");
	});

	test("error-string boundary receives wrapped Error (pipeline normalizes thrown strings)", async ({ page }) => {
		await page.goto("/error-string", { waitUntil: "domcontentloaded" });
		const errType = await page.locator("[data-testid=error-string-type]").textContent();
		/* Pipeline wraps non-Error throws into Error objects */
		expect(errType).toBe("object");
	});
});

test.describe("SPA navigation to error routes", () => {
	test("SPA nav to /broken renders error boundary", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/broken");

		await expect(page.locator("[data-testid=error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=error-message]")).toContainText("Intentional loader error");
	});

	test("SPA nav to /throw-not-found renders not-found boundary", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/throw-not-found");

		await expect(page.locator("[data-testid=not-found-boundary]")).toBeVisible();
	});

	test("SPA nav to /throw-unauthorized renders unauthorized boundary", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/throw-unauthorized");

		await expect(page.locator("[data-testid=unauthorized-boundary]")).toBeVisible();
	});

	test("SPA nav to /throw-unauthenticated renders unauthenticated boundary", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/throw-unauthenticated");

		await expect(page.locator("[data-testid=unauthenticated-boundary]")).toBeVisible();
	});

	test("SPA nav to /error-string renders string error boundary", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/error-string");

		await expect(page.locator("[data-testid=error-string-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=error-string-message]")).toContainText("plain string error");
	});

	test("recovery: SPA nav from error route back to valid page", async ({ page }) => {
		await loadPage(page, "/");
		await spaNavToErrorRoute(page, "/broken");
		await expect(page.locator("[data-testid=error-boundary]")).toBeVisible();

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about-content]")).toBeVisible();
	});

	test("recovery: sequential error routes then valid page", async ({ page }) => {
		await loadPage(page, "/");

		await spaNavToErrorRoute(page, "/broken");
		await expect(page.locator("[data-testid=error-boundary]")).toBeVisible();

		await spaNavToErrorRoute(page, "/throw-unauthorized");
		await expect(page.locator("[data-testid=unauthorized-boundary]")).toBeVisible();

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/about");
		});
		await page.waitForURL("**/about", { timeout: 10_000 });
		await expect(page.locator("[data-testid=about-content]")).toBeVisible();
	});
});

test.describe("Layout errorRender catches child errors", () => {
	test("/layout-catches-child renders safe page inside layout wrapper", async ({ page }) => {
		await loadPage(page, "/layout-catches-child");
		await expect(page.locator("[data-testid=layout-catches-wrapper]")).toBeVisible();
		await expect(page.locator("[data-testid=layout-catches-safe]")).toBeVisible();
		await expect(page.locator("[data-testid=layout-catches-safe]")).toContainText("Safe");
	});

	test("/layout-catches-child/broken-child shows layout error boundary", async ({ page }) => {
		const response = await page.goto("/layout-catches-child/broken-child", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.status()).toBe(500);
		await expect(page.locator("[data-testid=layout-error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=layout-error-message]")).toContainText("Child broke");
	});

	test("SPA nav from safe child to broken child shows layout error boundary", async ({ page }) => {
		await loadPage(page, "/layout-catches-child");
		await expect(page.locator("[data-testid=layout-catches-safe]")).toBeVisible();

		await spaNavToErrorRoute(page, "/layout-catches-child/broken-child");
		await expect(page.locator("[data-testid=layout-error-boundary]")).toBeVisible();
		await expect(page.locator("[data-testid=layout-error-message]")).toContainText("Child broke");
	});

	test("recovery: broken child back to safe child via SPA nav", async ({ page }) => {
		await loadPage(page, "/layout-catches-child");
		await spaNavToErrorRoute(page, "/layout-catches-child/broken-child");
		await expect(page.locator("[data-testid=layout-error-boundary]")).toBeVisible();

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/layout-catches-child");
		});
		await page.waitForURL("**/layout-catches-child", { timeout: 10_000 });
		await expect(page.locator("[data-testid=layout-catches-safe]")).toBeVisible();
	});
});

test.describe("Error boundary walk-up", () => {
	test("/broken stops at page-level errorRender (not root)", async ({ page }) => {
		await page.goto("/broken", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-testid=error-boundary]")).toBeVisible();
		const rootBoundary = await page.locator("[data-testid=root-error-boundary]").count();
		expect(rootBoundary).toBe(0);
	});

	test("/layout-catches-child/broken-child stops at layout errorRender (not root)", async ({ page }) => {
		await page.goto("/layout-catches-child/broken-child", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-testid=layout-error-boundary]")).toBeVisible();
		const rootBoundary = await page.locator("[data-testid=root-error-boundary]").count();
		expect(rootBoundary).toBe(0);
	});

	test("/throw-not-found walks up to root notFoundRender", async ({ page }) => {
		await page.goto("/throw-not-found", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-testid=not-found-boundary]")).toBeVisible();
	});

	test("unknown URL returns 404 status", async ({ page }) => {
		const response = await page.goto("/completely-unknown-path-xyz");
		expect(response?.status()).toBe(404);
		/* No route matches → server-handler returns raw 404 HTML, not root layout boundary */
		await expect(page.locator("h1")).toContainText("404");
	});
});

test.describe("NDJSON error responses", () => {
	test("NDJSON /broken returns error message (t:e) with correct matchId and message", async ({ page }) => {
		const response = await page.request.get("/broken", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(500);
		expect(response.headers()["content-type"]).toContain("application/x-ndjson");

		const msgs = parseNDJSON(await response.text());
		const errors = msgs.filter((m) => m.t === "e");
		expect(errors.length).toBeGreaterThan(0);

		const err = errors[0];
		expect(err?.m).toBeDefined();
		expect(typeof err?.m).toBe("string");
		const errData = err?.e as { message: string } | undefined;
		expect(errData?.message).toContain("Intentional loader error");
	});

	test("NDJSON /error-string returns error message for thrown string", async ({ page }) => {
		const response = await page.request.get("/error-string", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(500);

		const msgs = parseNDJSON(await response.text());
		const errors = msgs.filter((m) => m.t === "e");
		expect(errors.length).toBeGreaterThan(0);

		const errLine = errors[0];
		const body = await response.text();
		const hasStringRef = JSON.stringify(errLine).includes("plain string error") || body.includes("plain string error");
		expect(hasStringRef).toBe(true);
	});

	test("NDJSON /throw-not-found returns not-found error type", async ({ page }) => {
		const response = await page.request.get("/throw-not-found", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const hasErrorOrNotFound = msgs.some((m) => m.t === "e" || m.t === "nf");
		expect(hasErrorOrNotFound).toBe(true);
	});

	test("NDJSON /throw-unauthorized returns auth error type", async ({ page }) => {
		const response = await page.request.get("/throw-unauthorized", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		const hasAuthError = msgs.some((m) => m.t === "e" || m.t === "ua" || m.t === "nf");
		expect(hasAuthError).toBe(true);
	});

	test("NDJSON /layout-catches-child/broken-child returns child error", async ({ page }) => {
		const response = await page.request.get("/layout-catches-child/broken-child", {
			headers: { "flare-data": "1" },
		});
		expect(response.status()).toBe(500);

		const msgs = parseNDJSON(await response.text());
		const errors = msgs.filter((m) => m.t === "e");
		expect(errors.length).toBeGreaterThan(0);

		const errData = errors[0]?.e as { message: string } | undefined;
		expect(errData?.message).toBe("Child broke");
	});

	test("NDJSON error response still ends with done message (t:d)", async ({ page }) => {
		const response = await page.request.get("/broken", {
			headers: { "flare-data": "1" },
		});
		const msgs = parseNDJSON(await response.text());
		expect(msgs.length).toBeGreaterThan(0);
		expect(msgs[msgs.length - 1]?.t).toBe("d");
	});
});
