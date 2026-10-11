import { expect, test, type Browser, type Page } from "@playwright/test";
import { boot, type Boot } from "./boot.ts";

let session: Boot;

test.beforeAll(async ({ browserName }, workerInfo) => {
	const name = workerInfo.project.name ?? `node-dev-${browserName}`;
	const [runtime, mode] = name.split("-");
	session = await boot({ app: "minimal", runtime: runtime ?? "node", mode: mode ?? "dev" });
});

test.afterAll(async () => {
	await session.close();
});

test("hydrate", async ({ page }: { page: Page; browser: Browser }) => {
	await page.goto(`${session.origin}/`);
	await expect(page.locator("#app")).toHaveText("Home");
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "");
});
