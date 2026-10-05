import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createDeployment } from "../../../../deploy-harness";
import { assertHydrated } from "./helpers";

/**
 * @prod-only @node-only
 *
 * Two real deploys of this app on one port. A tab opened on build A navigates after build B
 * replaced it and asks B's server for A's chunk of the changed route. With retainPreviousAssets,
 * B was built with A's chunks copied in, so the request succeeds; without it, it 404s.
 */

/* Not on the fetch "bad ports" list (4190 is, as ManageSieve). */
const PORT = 4195;
const ABOUT = "src/routes/_root_/about/about.page.tsx";

function flareConfig(retain: boolean): string {
	return `{ codegen: { fsVirtualPaths: true }, site: "http://127.0.0.1:${PORT}"${retain ? ", retainPreviousAssets: true" : ""} }`;
}

function changeAbout(dir: string): void {
	const file = join(dir, ABOUT);
	writeFileSync(file, readFileSync(file, "utf-8").replace("About</main>", "About (v2)</main>"));
}

async function openOn(page: Page, origin: string): Promise<void> {
	/* No app-wide prefetch: the old tab must not already hold the chunk. Routing also bypasses the
	   browser cache, so every chunk request reaches the server. */
	await page.route("**/_flare-prefetch.*.json", (route) => route.fulfill({ status: 404 }));
	await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
	await assertHydrated(page);
}

test.describe.serial("@prod-only @node-only a deploy keeps the previous build's chunks", () => {
	test.setTimeout(300_000);

	for (const retain of [true, false]) {
		test(
			retain ? "retained: the old tab still loads its chunk from the new deploy" : "control: without retention it 404s",
			async ({ page }) => {
				const deploy = createDeployment("fs-routes", PORT);
				try {
					const a = deploy.build("a", { flare: flareConfig(retain) });
					await deploy.serve(a);
					await openOn(page, deploy.origin);

					const b = deploy.build("b", { edit: changeAbout, flare: flareConfig(retain) });
					const oldChunk = a.chunk(ABOUT);
					expect(b.chunk(ABOUT)).not.toBe(oldChunk);
					expect(existsSync(join(b.dir, "dist/client", oldChunk))).toBe(retain);
					await deploy.serve(b);

					const statuses: number[] = [];
					page.on("response", (res) => {
						if (new URL(res.url()).pathname === oldChunk) statuses.push(res.status());
					});
					await page.evaluate(() => (document.querySelector('a[href="/about"]') as HTMLAnchorElement).click());
					await expect(page).toHaveURL(/\/about$/);
					await expect(page.getByTestId("about")).toBeVisible();

					expect(statuses.length).toBeGreaterThan(0);
					if (retain) expect(statuses.every((s) => s === 200)).toBe(true);
					else expect(statuses.some((s) => s === 404)).toBe(true);

					if (retain) {
						const history = JSON.parse(
							readFileSync(join(b.dir, "dist/client/assets/_flare-asset-history.json"), "utf-8"),
						) as { files: Record<string, { build: string }> };
						expect(history.files[oldChunk]).toBeDefined();
						expect(history.files[b.chunk(ABOUT)]).toBeDefined();
					}
				} finally {
					await deploy.dispose();
				}
			},
		);
	}
});
