import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { loadPage } from "./helpers";

test.describe("image srcset / blur", () => {
	test("loader image emits width-descriptor srcset", async ({ page }) => {
		await loadPage(page, "/image-test");
		const srcset = await page.getByTestId("img-loader-srcset").getAttribute("srcset");
		expect(srcset).toBeTruthy();
		expect(srcset).toContain("400w");
		expect(srcset).toContain("600w");
		expect(srcset).toContain("800w");
	});

	test("static import exposes blur and variants", async ({ page }) => {
		await loadPage(page, "/static-image-test");
		const raw = await page.getByTestId("static-data").textContent();
		const data = JSON.parse(raw ?? "{}") as { blurDataURL?: string; variants?: Record<string, string> };
		expect(data.blurDataURL ?? "").toMatch(/^data:image\//);
		expect(Object.keys(data.variants ?? {}).length).toBeGreaterThan(0);
		const srcset = await page.getByTestId("img-static-responsive").getAttribute("srcset");
		expect(srcset).toBeTruthy();
		expect(srcset).toContain("w");
	});

	test("placeholder=none suppresses blur background", async ({ page }) => {
		await loadPage(page, "/static-image-test");
		const style = await page.getByTestId("img-static-no-blur").getAttribute("style");
		expect(style ?? "").not.toContain("background-image");
	});
});

test.describe("server-fn stream", () => {
	test("stream chunks appear in order", async ({ page }) => {
		await loadPage(page, "/fn-stream");
		await page.getByTestId("start-stream").click();
		await expect(page.getByTestId("stream-count")).toHaveText("5", { timeout: 10_000 });
		await expect(page.getByTestId("stream-status")).toHaveText("done");
		for (let i = 0; i < 5; i++) {
			const text = await page.getByTestId(`chunk-${i}`).textContent();
			expect(JSON.parse(text ?? "{}").chunk).toBe(i + 1);
		}
	});
});

test.describe("query edges", () => {
	test("loader and suspense query both render", async ({ page }) => {
		await loadPage(page, "/query-basic");
		await expect(page.getByTestId("loader-msg")).toHaveText("from-loader");
		await expect(page.getByTestId("query-count")).toHaveText("42");
	});

	test("invalidate twice keeps changing ts", async ({ page }) => {
		await loadPage(page, "/query-invalidation");
		const first = await page.getByTestId("qi-ts").textContent();
		await page.getByTestId("qi-invalidate").click();
		await expect.poll(async () => page.getByTestId("qi-ts").textContent()).not.toBe(first);
		const second = await page.getByTestId("qi-ts").textContent();
		await page.getByTestId("qi-invalidate").click();
		await expect.poll(async () => page.getByTestId("qi-ts").textContent()).not.toBe(second);
	});
});

test.describe("axe", () => {
	for (const path of ["/", "/about", "/a11y-test", "/forms/contact"]) {
		test(`${path} has no serious WCAG 2.1 AA violations`, async ({ page }) => {
			await loadPage(page, path);
			const results = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.exclude("[data-flare-dev-overlay]")
				.analyze();
			const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
			expect(
				serious,
				`serious/critical on ${path}:\n${JSON.stringify(
					serious.map((v) => ({ help: v.help, id: v.id, nodes: v.nodes.length })),
					null,
					2,
				)}`,
			).toEqual([]);
		});
	}
});
