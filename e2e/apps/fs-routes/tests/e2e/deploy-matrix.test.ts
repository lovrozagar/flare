import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { createDeployment } from "../../../../deploy-harness";
import { assertHydrated } from "./helpers";

/**
 * @prod-only @node-only
 *
 * Every combination of retained assets, an app service worker and module prefetch, through a
 * real deploy: build A is live with an open tab, build B (with a changed route) replaces it, the
 * old tab navigates and a new tab loads. Nothing may end broken: an old tab recovers onto the new
 * build, and with retention on, no chunk it asks for is missing.
 */

const PORT = 4196;
const ABOUT = "src/routes/_root_/about/about.page.tsx";

const WORKER = `import { build, version } from "@lovrozagar/flare/service-worker";
declare const self: any;
const CACHE = "fs-" + version;
self.addEventListener("install", (e: any) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(build)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e: any) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e: any) => {
	const path = new URL(e.request.url).pathname;
	if (build.includes(path)) e.respondWith(caches.match(path).then((r) => r ?? fetch(e.request)));
});
`;

interface Combo {
	modules: "all" | "viewport";
	retain: boolean;
	worker: boolean;
}

const combos: Combo[] = [];
for (const retain of [true, false])
	for (const worker of [true, false])
		for (const modules of ["all", "viewport"] as const) combos.push({ modules, retain, worker });

function flareConfig(c: Combo): string {
	return `{ codegen: { fsVirtualPaths: true }, site: "http://127.0.0.1:${PORT}"${c.retain ? ", retainPreviousAssets: true" : ""}${c.worker ? "" : ", serviceWorker: false"} }`;
}

function prepare(c: Combo, version: 1 | 2) {
	return (dir: string) => {
		if (c.worker) writeFileSync(join(dir, "src/service-worker.ts"), WORKER);
		if (c.modules === "viewport") {
			const router = join(dir, "src/router.ts");
			writeFileSync(
				router,
				readFileSync(router, "utf-8").replace("routeTree,", 'prefetch: { modules: "viewport" },\n\trouteTree,'),
			);
		}
		if (version === 2) {
			const about = join(dir, ABOUT);
			writeFileSync(about, readFileSync(about, "utf-8").replace("About</main>", "About (v2)</main>"));
		}
	};
}

async function settle(page: Page): Promise<void> {
	await assertHydrated(page);
	await page.waitForLoadState("networkidle");
}

test.describe.serial("@prod-only @node-only deploy matrix", () => {
	test.setTimeout(300_000);

	for (const c of combos) {
		const name = `retain ${c.retain ? "on" : "off"}, app worker ${c.worker ? "on" : "off"}, modules ${c.modules}`;
		test(name, async ({ browser }) => {
			const deploy = createDeployment("fs-routes", PORT);
			const context = await browser.newContext();
			try {
				await deploy.serve(deploy.build("a", { edit: prepare(c, 1), flare: flareConfig(c) }));
				const oldTab = await context.newPage();
				await oldTab.goto(`${deploy.origin}/`, { waitUntil: "domcontentloaded" });
				await settle(oldTab);

				await deploy.serve(deploy.build("b", { edit: prepare(c, 2), flare: flareConfig(c) }));

				const missing: string[] = [];
				oldTab.on("response", (res) => {
					const path = new URL(res.url()).pathname;
					if (path.startsWith("/assets/") && res.status() === 404) missing.push(path);
				});
				await oldTab.evaluate(() => (document.querySelector('a[href="/about"]') as HTMLAnchorElement).click());
				await expect(oldTab).toHaveURL(/\/about$/);
				await expect(oldTab.getByTestId("about")).toHaveText("About (v2)");
				if (c.retain) expect(missing).toEqual([]);

				const newTab = await context.newPage();
				const errors: string[] = [];
				newTab.on("pageerror", (e) => errors.push(e.message));
				await newTab.goto(`${deploy.origin}/`, { waitUntil: "domcontentloaded" });
				await settle(newTab);
				await newTab.evaluate(() => {
					(window as unknown as { __marker: number }).__marker = 1;
				});
				await newTab.evaluate(() => (document.querySelector('a[href="/about"]') as HTMLAnchorElement).click());
				await expect(newTab.getByTestId("about")).toHaveText("About (v2)");
				expect(await newTab.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
				expect(errors).toEqual([]);
			} finally {
				await context.close();
				await deploy.dispose();
			}
		});
	}
});
