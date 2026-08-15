import { expect, test } from "@playwright/test";
import { loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Authorize pass (SSR)", () => {
	test("/authorize-pass with admin auth returns 200", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		await loadPage(page, "/authorize-pass");
		await expect(page.locator("[data-testid=authorize-message]")).toHaveText("Authorized");
		await expect(page.locator("[data-testid=authorize-user]")).toHaveText("admin");
	});

	test("/authorize-pass with non-admin auth returns 403", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user1" });
		const response = await page.goto("/authorize-pass", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(403);
	});

	test("/authorize-pass without auth returns 401", async ({ page }) => {
		const response = await page.goto("/authorize-pass", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(401);
	});
});

test.describe("Authorize fail (SSR)", () => {
	test("/authorize-fail with auth returns 403 (always rejects)", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		const response = await page.goto("/authorize-fail", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(403);
	});

	test("/authorize-fail without auth returns 401", async ({ page }) => {
		const response = await page.goto("/authorize-fail", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(401);
	});
});

test.describe("Authorize SSR boundary rendering", () => {
	test("403 renders unauthorizedRender boundary", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user1" });
		const response = await page.goto("/authorize-pass", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(403);
		await expect(page.locator("[data-testid=authorize-unauthorized]")).toBeVisible();
		const text = await page.locator("[data-testid=authorize-unauthorized]").textContent();
		expect(text).toContain("Forbidden");
	});

	test("403 does not render normal content", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user1" });
		await page.goto("/authorize-pass", { waitUntil: "domcontentloaded" });
		const normalContent = await page.locator("[data-testid=authorize-message]").count();
		expect(normalContent).toBe(0);
	});

	test("authorize-fail 403 renders unauthorizedRender boundary", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		const response = await page.goto("/authorize-fail", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(403);
		await expect(page.locator("[data-testid=authorize-fail-unauthorized]")).toBeVisible();
		const text = await page.locator("[data-testid=authorize-fail-error]").textContent();
		expect(text).toContain("Forbidden");
	});
});

test.describe("Authorize SPA navigation", () => {
	test("SPA nav to authorized page renders content", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		await loadPage(page, "/");
		await navigateSPA(page, "/authorize-pass");

		await expect(page.locator("[data-testid=authorize-message]")).toHaveText("Authorized");
		await expect(page.locator("[data-testid=authorize-user]")).toHaveText("admin");
		cap.assertClean();
	});

	test("SPA nav to unauthorized page changes URL", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "user1" });
		await loadPage(page, "/");

		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/authorize-pass").catch(() => {});
		});
		await page.waitForURL("**/authorize-pass", { timeout: 10_000 });

		expect(page.url()).toContain("/authorize-pass");
	});

	test("recovery: unauthorized → valid page works", async ({ page }) => {
		await page.setExtraHTTPHeaders({ "x-test-auth": "admin" });
		await loadPage(page, "/");

		/* Nav to always-failing authorize route — 403 network error expected */
		await page.evaluate(() => {
			const nav = (window as unknown as Record<string, unknown>).__flareNavigate as
				| ((to: string) => Promise<void>)
				| undefined;
			if (!nav) throw new Error("__flareNavigate not available");
			return nav("/authorize-fail").catch(() => {});
		});
		await page.waitForTimeout(1000);

		/* Navigate to valid page — should recover */
		await navigateSPA(page, "/about");
		await expect(page.locator("[data-testid=about]")).toBeVisible();
	});
});

test.describe("CallerData", () => {
	test("callerData args passed to authenticateFn", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor1" });
		await loadPage(page, "/caller-data");

		await expect(page.locator("[data-testid=caller-data-message]")).toHaveText("Caller data route");
		await expect(page.locator("[data-testid=caller-data-user]")).toHaveText("editor1");

		const callerDataText = await page.locator("[data-testid=caller-data-args]").textContent();
		const callerData = JSON.parse(callerDataText ?? "[]") as string[];
		expect(callerData).toEqual(["role:editor", "scope:write"]);

		cap.assertClean();
	});

	test("callerData available via SPA nav", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await page.setExtraHTTPHeaders({ "x-test-auth": "editor2" });
		await loadPage(page, "/");
		await navigateSPA(page, "/caller-data");

		await expect(page.locator("[data-testid=caller-data-user]")).toHaveText("editor2");
		const callerDataText = await page.locator("[data-testid=caller-data-args]").textContent();
		const callerData = JSON.parse(callerDataText ?? "[]") as string[];
		expect(callerData).toEqual(["role:editor", "scope:write"]);

		cap.assertClean();
	});

	test("callerData without auth returns 401", async ({ page }) => {
		const response = await page.goto("/caller-data", { waitUntil: "domcontentloaded" });
		expect(response?.status()).toBe(401);
	});
});
