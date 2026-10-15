import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./crash.ts";
import { boot, type Boot } from "./boot.ts";

let session: Boot;

test.beforeAll(async ({ browserName }, workerInfo) => {
	const name = workerInfo.project.name ?? `node-dev-${browserName}`;
	const [runtime, mode] = name.split("-");
	session = await boot({ app: "minimal", runtime: runtime ?? "node", mode: mode ?? "dev" });
});

test.afterAll(async () => {
	await session?.close();
});

test("hydrate", async ({ page }: { page: Page; browser: Browser }) => {
	await page.goto(`${session.origin}/`);
	await expect(page.locator("#app")).toHaveText("Home");
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "");
});

test.describe("basepath", () => {
	let base: Boot;

	test.beforeAll(async ({ browserName }, workerInfo) => {
		const name = workerInfo.project.name ?? `node-dev-${browserName}`;
		const [runtime, mode] = name.split("-");
		base = await boot({ app: "basepath", runtime: runtime ?? "node", mode: mode ?? "dev" });
	});

	test.afterAll(async () => {
		await base?.close();
	});

	test("base path serves /app", async ({ page }: { page: Page; browser: Browser }) => {
		const home = await page.goto(`${base.origin}/app`);
		expect(home?.status()).toBe(200);
		await expect(page.locator("#app")).toHaveText("Home");
		const root = await page.goto(`${base.origin}/`);
		expect(root?.status()).toBe(404);
	});
});
