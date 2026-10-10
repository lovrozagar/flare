import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { loadPage } from "./helpers";

/** Same span the unit bundle tests use, from the vendored `labelText` pool. */
const TABLES_NEEDLE = "nest-clamp-imageabein-lrstxyskx";
const PRODUCT_DIST = fileURLToPath(new URL("../../dist", import.meta.url));

function tokens(cls: string | null): string[] {
	return (cls ?? "").split(/\s+/).filter(Boolean);
}

function classForTestId(html: string, testId: string): string | null {
	const tag = html.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`))?.[0];
	if (!tag) return null;
	return tag.match(/\bclass="([^"]*)"/)?.[1] ?? null;
}

async function assertStaticMerge(page: Page): Promise<void> {
	await loadPage(page, "/styling-cn-static");
	const pad = tokens(await page.getByTestId("cn-static-pad").getAttribute("class"));
	expect(pad).toContain("p-8");
	expect(pad).not.toContain("p-2");
	const padding = await page.getByTestId("cn-static-pad").evaluate((el) => getComputedStyle(el).paddingTop);
	expect(padding).toBe("32px");

	const keep = tokens(await page.getByTestId("cn-static-keep").getAttribute("class"));
	expect(keep).toContain("p-2");
	expect(keep).toContain("md:p-8");
}

async function assertDynamicMerge(page: Page): Promise<void> {
	await loadPage(page, "/styling-cn-dynamic");
	const pad = page.getByTestId("cn-dynamic-pad");
	expect(tokens(await pad.getAttribute("class"))).toContain("p-2");
	expect(tokens(await pad.getAttribute("class"))).not.toContain("p-8");
	const before = await pad.evaluate((el) => getComputedStyle(el).paddingTop);
	expect(before).toBe("8px");

	await page.getByTestId("cn-dynamic-toggle").click();
	await expect.poll(async () => tokens(await pad.getAttribute("class"))).toContain("p-8");
	const afterTokens = tokens(await pad.getAttribute("class"));
	expect(afterTokens).not.toContain("p-2");
	const after = await pad.evaluate((el) => getComputedStyle(el).paddingTop);
	expect(after).toBe("32px");
}

test.describe("cn tailwind merge", () => {
	test("static class conflict resolves to p-8", async ({ page }) => {
		await assertStaticMerge(page);
	});

	test("dynamic cn toggles p-2 to p-8", async ({ page }) => {
		await assertDynamicMerge(page);
	});
});

test.describe("cn tailwind merge preview @prod-only", () => {
	test("preview static class and computed padding", async ({ page }) => {
		await assertStaticMerge(page);
	});

	test("preview dynamic cn toggle", async ({ page }) => {
		await assertDynamicMerge(page);
	});

	test("built client contains the merge tables and SSR class is already merged", async ({ page }) => {
		const response = await page.goto("/styling-cn-static", { waitUntil: "commit" });
		const html = (await response?.text()) ?? "";
		const cls = tokens(classForTestId(html, "cn-static-pad"));
		expect(cls).toContain("p-8");
		expect(cls).not.toContain("p-2");

		const files = (await readdir(PRODUCT_DIST, { recursive: true }))
			.map(String)
			.filter((name) => name.endsWith(".js") || name.endsWith(".mjs"));
		expect(files.length).toBeGreaterThan(0);
		const chunks = await Promise.all(files.map((name) => readFile(join(PRODUCT_DIST, name), "utf8")));
		expect(chunks.join("\n")).toContain(TABLES_NEEDLE);
	});
});
