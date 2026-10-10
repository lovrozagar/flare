import { expect, test } from "@playwright/test";
import { BASE, loadPage, navigateSPA, setupConsoleCapture } from "./helpers";

test.describe("Lazy styles: SSR", () => {
	test("page-level styles present in SSR HTML", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-lazy`);
		const html = await response.text();
		expect(html).toContain('data-c="lazy-page-box"');
		expect(html).toContain('[data-c="lazy-page-box"]');
	});

	test("lazy component shows pending state in SSR", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-lazy`);
		const html = await response.text();
		expect(html).toContain('data-testid="lazy-styled-pending"');
	});

	test("clientLazy component shows pending state in SSR", async ({ page }) => {
		const response = await page.request.get(`${BASE}/styling-lazy`);
		const html = await response.text();
		expect(html).toContain('data-testid="client-lazy-pending"');
	});
});

test.describe("Lazy styles: page-level computed", () => {
	test("page-level scoped styles applied after hydration", async ({ page }) => {
		await loadPage(page, "/styling-lazy");
		const box = page.getByTestId("lazy-page-box");
		await expect(box).toBeVisible();

		const computed = await box.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { background: cs.backgroundColor, padding: cs.padding };
		});
		expect(computed.padding).toBe("8px");
		expect(computed.background).toBe("rgb(245, 245, 245)");
	});
});

test.describe("Lazy styles: lazy() component", () => {
	test("lazy component renders with correct styles after hydration", async ({ page }) => {
		await loadPage(page, "/styling-lazy");
		const lazyBox = page.getByTestId("lazy-styled-box");
		await expect(lazyBox).toBeVisible({ timeout: 10_000 });

		const dataC = await lazyBox.getAttribute("data-c");
		expect(dataC).toBe("lazy-styled-box");

		const computed = await lazyBox.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { color: cs.color, padding: cs.padding };
		});
		expect(computed.color).toBe("rgb(0, 100, 200)");
		expect(computed.padding).toBe("16px");
	});
});

test.describe("Lazy styles: clientLazy() component", () => {
	test("clientLazy component renders with correct styles after hydration", async ({ page }) => {
		await loadPage(page, "/styling-lazy");
		const clientBox = page.getByTestId("client-lazy-box");
		await expect(clientBox).toBeVisible({ timeout: 10_000 });

		const dataC = await clientBox.getAttribute("data-c");
		expect(dataC).toBe("client-lazy-box");

		const computed = await clientBox.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { background: cs.backgroundColor, color: cs.color, fontSize: cs.fontSize };
		});
		expect(computed.color).toBe("rgb(200, 0, 100)");
		expect(computed.fontSize).toBe("18px");
		expect(computed.background).toBe("rgb(255, 240, 245)");
	});
});

test.describe("Lazy styles: page + lazy isolation", () => {
	test("page, lazy, and clientLazy have different data-c values", async ({ page }) => {
		await loadPage(page, "/styling-lazy");
		const pageBox = page.getByTestId("lazy-page-box");
		const lazyBox = page.getByTestId("lazy-styled-box");
		const clientBox = page.getByTestId("client-lazy-box");

		await expect(lazyBox).toBeVisible({ timeout: 10_000 });
		await expect(clientBox).toBeVisible({ timeout: 10_000 });

		const pageC = await pageBox.getAttribute("data-c");
		const lazyC = await lazyBox.getAttribute("data-c");
		const clientC = await clientBox.getAttribute("data-c");

		expect(pageC).toBe("lazy-page-box");
		expect(lazyC).toBe("lazy-styled-box");
		expect(clientC).toBe("client-lazy-box");
	});
});

test.describe("Lazy styles: SPA round-trip", () => {
	test("lazy styles survive SPA navigation", async ({ page }) => {
		await loadPage(page, "/styling-lazy");
		await page.getByTestId("lazy-styled-box").waitFor({ state: "visible", timeout: 10_000 });
		await navigateSPA(page, "/about");
		await navigateSPA(page, "/styling-lazy");

		const lazyBox = page.getByTestId("lazy-styled-box");
		await expect(lazyBox).toBeVisible({ timeout: 10_000 });

		await expect
			.poll(async () => lazyBox.evaluate((el) => getComputedStyle(el).color), { timeout: 10_000 })
			.toBe("rgb(0, 100, 200)");
	});
});

test.describe("Lazy styles: console clean", () => {
	test("no console errors on lazy styles page", async ({ page }) => {
		const cap = setupConsoleCapture(page);
		await loadPage(page, "/styling-lazy");
		await page.getByTestId("lazy-styled-box").waitFor({ state: "visible", timeout: 10_000 });
		await page.getByTestId("client-lazy-box").waitFor({ state: "visible", timeout: 10_000 });
		cap.assertClean();
	});
});
