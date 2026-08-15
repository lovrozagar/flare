import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("env-fn", () => {
	test("SSR: server-only and isomorphic server impl appear in HTML", async ({ request }) => {
		const res = await request.get("/env-fn-test");
		expect(res.status()).toBe(200);
		const html = await res.text();
		expect(html).toContain("server-secret-42");
		expect(html).toContain("rendered-on-server");
	});

	test("page hydrates and client impls populate", async ({ page }) => {
		await loadPage(page, "/env-fn-test");
		await expect(page.getByTestId("server-data")).toHaveText("server-secret-42");
		await expect(page.getByTestId("loader-env")).toHaveText("rendered-on-server");
		await expect(page.getByTestId("client-mark")).toHaveText("client-only-mark");
		await expect(page.getByTestId("live-env")).toHaveText("rendered-on-client");
	});
});

test.describe("CSR unknown path", () => {
	test("SPA navigate to missing path shows not-found without blanking", async ({ page }) => {
		await loadPage(page, "/about");
		const navResult = await page.evaluate(async () => {
			const nav = (window as unknown as { __flareNavigate?: (to: string) => Promise<void> }).__flareNavigate;
			if (!nav) return { error: "no-nav-fn", url: window.location.pathname };
			try {
				await nav("/does-not-exist-at-all");
				return { error: null, url: window.location.pathname };
			} catch (e: unknown) {
				return { error: e instanceof Error ? e.message : String(e), url: window.location.pathname };
			}
		});
		expect(navResult.error).toBeNull();
		expect(navResult.url).toBe("/does-not-exist-at-all");
		const bodyText = await page.evaluate(() => document.body.textContent?.trim() ?? "");
		expect(bodyText.length).toBeGreaterThan(0);
		await expect(page.getByTestId("not-found-boundary")).toBeVisible();
		await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
		await expect(page).toHaveTitle(/Not Found/);
	});

	test("SPA navigate to unknown child of a real prefix is 404 with title", async ({ page }) => {
		await loadPage(page, "/");
		await page.evaluate(() => {
			const nav = (window as unknown as { __flareNavigate: (to: string) => Promise<void> }).__flareNavigate;
			return nav("/about/not-a-child");
		});
		await expect(page.getByTestId("not-found-boundary")).toBeVisible();
		await expect(page).toHaveTitle(/Not Found/);
	});
});

test.describe("theme SSR", () => {
	test("useTheme works on SSR HTML and after hydrate", async ({ page }) => {
		const res = await page.goto("/theme-dir");
		expect(res?.status()).toBe(200);
		const html = await page.content();
		expect(html).toContain('data-testid="theme-value"');
		expect(html).toMatch(/system|light|dark/);
		await loadPage(page, "/theme-dir");
		await expect(page.getByTestId("theme-value")).toBeVisible();
		const before = await page.getByTestId("theme-resolved").textContent();
		await page.getByTestId("theme-toggle").click();
		await expect.poll(async () => page.getByTestId("theme-resolved").textContent()).not.toBe(before);
	});
});

test.describe("blocker proceed", () => {
	test("proceed continues the blocked navigation", async ({ page }) => {
		await loadPage(page, "/blocker-test");
		await page.getByTestId("toggle-dirty").click();
		await expect(page.getByTestId("dirty-state")).toHaveText("dirty");
		await page.getByTestId("nav-link").click();
		await expect(page.getByTestId("blocked-state")).toHaveText("blocked");
		expect(new URL(page.url()).pathname).toBe("/blocker-test");
		await page.getByTestId("proceed-btn").click();
		await page.waitForURL("**/about", { timeout: 10_000 });
		await expect(page.getByTestId("about")).toBeVisible();
	});

	test("reset stays on the page", async ({ page }) => {
		await loadPage(page, "/blocker-test");
		await page.getByTestId("toggle-dirty").click();
		await page.getByTestId("nav-link").click();
		await expect(page.getByTestId("blocked-state")).toHaveText("blocked");
		await page.getByTestId("reset-btn").click();
		await expect(page.getByTestId("blocked-state")).toHaveText("not-blocked");
		expect(new URL(page.url()).pathname).toBe("/blocker-test");
	});
});

test.describe("devtools markup @dev-only @node-only", () => {
	test("open overlay has no nested buttons", async ({ page }) => {
		await loadPage(page, "/");
		await page.keyboard.press("Control+Shift+D");
		await page.waitForFunction(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			return !!root?.querySelector(".overlay");
		});
		const nested = await page.evaluate(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			return root?.querySelectorAll("button button").length ?? -1;
		});
		expect(nested).toBe(0);
		await page.evaluate(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			for (const btn of root?.querySelectorAll(".tab-btn") ?? []) {
				if (btn.textContent?.includes("Pages")) (btn as HTMLButtonElement).click();
			}
		});
		await page.waitForFunction(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			return (root?.querySelectorAll(".list-item").length ?? 0) > 0;
		});
		const nestedOnPages = await page.evaluate(() => {
			const root = document.getElementById("__flare-devtools-host")?.shadowRoot;
			return root?.querySelectorAll("button button").length ?? -1;
		});
		expect(nestedOnPages).toBe(0);
	});
});

test.describe("error retry recovers", () => {
	test("retry re-runs the loader and renders success", async ({ page }) => {
		await page.request.get("/api/retry-reset");
		await page.goto("/retry-test");
		await expect(page.getByTestId("retry-error-boundary")).toBeVisible();
		await page.waitForFunction(() => document.documentElement.hasAttribute("data-hydrated"), null, {
			timeout: 15_000,
		});
		await page.getByTestId("retry-button").click();
		await expect(page.getByTestId("retry-success")).toBeVisible({ timeout: 8_000 });
		expect(Number((await page.getByTestId("attempt-count").textContent())?.replace(/\D/g, ""))).toBeGreaterThan(1);
	});

	test("retry button is present on the error boundary", async ({ page }) => {
		await page.request.get("/api/retry-reset");
		await page.goto("/retry-test");
		await expect(page.getByTestId("retry-error-boundary")).toBeVisible();
		await expect(page.getByTestId("retry-button")).toBeVisible();
	});
});
