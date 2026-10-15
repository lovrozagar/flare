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

// A click calls the echo function through the booted transport, and its value lands on the page (B70, B85).
test("click", async ({ page }) => {
	await page.goto(`${session.origin}/echo`);
	await expect(page.locator("html")).toHaveAttribute("data-flare-hydrated", "");
	await page.locator("#call").click();
	await expect(page.locator("#echo")).toHaveText("pong");
});
