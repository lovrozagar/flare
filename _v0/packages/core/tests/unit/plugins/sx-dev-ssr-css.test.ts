/** @vitest-environment node */
/*
 * Dev SSR must ship every class the rendered page uses in <style id="flare-sx-dev">, so the page
 * is styled before any JavaScript runs. The class pool grows as modules are transformed (a route's
 * page module is first transformed when that route is first rendered), so the SSR read must see
 * the pool as of the render, not a snapshot cached on the first request.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DevApp, startDevApp } from "../../dev-app.ts";

const apps: DevApp[] = [];

afterEach(async () => {
	for (const app of apps.splice(0)) await app.close();
});

const aboutPage = (cls: string) =>
	'import { createPage } from "@lovrozagar/flare/page";\n\n' +
	`export const route = createPage("_root_/about").render(() => <p class="${cls}">about</p>);\n`;

async function start(watch = false): Promise<DevApp> {
	const app = await startDevApp({ files: { "src/routes/about.tsx": aboutPage("grid gap-7") }, watch });
	apps.push(app);
	return app;
}

/* The SSR-inlined dev stylesheet (not the empty client placeholder). */
function devCss(html: string): string {
	return [...html.matchAll(/<style id="flare-sx-dev"[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("");
}

describe("dev SSR sx stylesheet", () => {
	it("carries a route's classes on that route's first render", async () => {
		const { get } = await start();
		const css = devCss(await get("/about"));
		expect(css).toContain(".gap-7");
		expect(css).toContain(".grid");
	}, 120_000);

	it("carries a route's classes after another route rendered first", async () => {
		const { get } = await start();
		expect(devCss(await get("/"))).toContain(".p-4");
		const css = devCss(await get("/about"));
		expect(css).toContain(".gap-7");
		expect(css).toContain(".p-4");
	}, 120_000);

	it("carries a class added by editing a page", async () => {
		const { app, get } = await start(true);
		expect(devCss(await get("/about"))).not.toContain(".gap-9");
		writeFileSync(join(app, "src/routes/about.tsx"), aboutPage("grid gap-9"));
		await vi.waitFor(async () => expect(devCss(await get("/about"))).toContain(".gap-9"), { timeout: 15_000 });
	}, 120_000);
});
